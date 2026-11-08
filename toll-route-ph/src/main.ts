import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

import plazaData from './data/plazas.json';
import { EXPRESSWAY_BY_ID } from './core/expressways.ts';
import { detectTollSegments } from './core/detect.ts';
import { ExpresswayPhFareProvider, priceSegments, type TripPrice } from './core/fares.ts';
import { fetchRoutes } from './core/routing.ts';
import { searchPlaces, type Place } from './core/geocode.ts';
import type { LatLng, PlazaRecord, Route, TollSegment, VehicleClass } from './core/types.ts';

const plazas = plazaData as PlazaRecord[];
const APPROX_SOURCES = new Set(['approx-snapped', 'manual-approx']);

let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  storage = undefined;
}
const fares = new ExpresswayPhFareProvider(undefined, storage);

// ---------- state ----------

type Endpoint = LatLng & { label: string };

interface AnalyzedRoute {
  route: Route;
  segments: TollSegment[];
  price?: TripPrice;
  priceError?: string;
}

const state = {
  from: null as Endpoint | null,
  to: null as Endpoint | null,
  vclass: 1 as VehicleClass,
  routes: [] as AnalyzedRoute[],
  selected: 0,
  request: 0,
};

// ---------- DOM helpers ----------

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fromInput = $<HTMLInputElement>('#from');
const toInput = $<HTMLInputElement>('#to');
const statusEl = $('#status');
const routesEl = $('#routes');
const resultEl = $('#result');

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('style:')) el.style.setProperty(k.slice(6), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
const km = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
function duration(s: number): string {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function setStatus(msg: string, kind: 'info' | 'error' | 'busy' = 'info') {
  statusEl.textContent = msg;
  statusEl.className = msg ? `status ${kind}` : '';
}

// ---------- map ----------

const map = L.map('map', { zoomControl: false }).setView([14.95, 120.9], 9);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const plazaLayer = L.layerGroup();
for (const p of plazas) {
  const e = EXPRESSWAY_BY_ID[p.expressways[0]];
  L.circleMarker([p.lat, p.lng], { radius: 3, color: e.color, weight: 1, fillOpacity: 0.7 })
    .bindTooltip(`${p.name} · ${p.expressways.map((id) => EXPRESSWAY_BY_ID[id].shortName).join(' / ')}`)
    .addTo(plazaLayer);
}
map.on('zoomend', () => {
  if (map.getZoom() >= 11) plazaLayer.addTo(map);
  else plazaLayer.remove();
});

const routeLayer = L.layerGroup().addTo(map);
const endpointLayer = L.layerGroup().addTo(map);

const pin = (cls: string, text: string) =>
  L.divIcon({ className: '', html: `<div class="pin ${cls}">${text}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

function drawEndpoints() {
  endpointLayer.clearLayers();
  if (state.from) L.marker(state.from, { icon: pin('pin-from', 'A'), keyboard: false }).addTo(endpointLayer);
  if (state.to) L.marker(state.to, { icon: pin('pin-to', 'B'), keyboard: false }).addTo(endpointLayer);
}

function drawRoutes() {
  routeLayer.clearLayers();
  state.routes.forEach((r, i) => {
    if (i === state.selected) return;
    L.polyline(r.route.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), {
      color: '#94A3B8',
      weight: 5,
      opacity: 0.7,
    })
      .on('click', () => selectRoute(i))
      .addTo(routeLayer);
  });
  const sel = state.routes[state.selected];
  if (!sel) return;
  const line = L.polyline(sel.route.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), {
    color: '#475569',
    weight: 6,
  }).addTo(routeLayer);
  sel.segments.forEach((s, idx) => {
    const color = EXPRESSWAY_BY_ID[s.expressways[0]].color;
    L.polyline(s.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), { color, weight: 8 }).addTo(routeLayer);
    const label = `${idx + 1}`;
    if (s.entry)
      L.marker([s.entry.lat, s.entry.lng], { icon: pin('pin-entry', label) })
        .bindTooltip(`Enter ${s.entry.name}`, { direction: 'top' })
        .addTo(routeLayer);
    if (s.exit)
      L.marker([s.exit.lat, s.exit.lng], { icon: pin('pin-exit', label) })
        .bindTooltip(`Exit ${s.exit.name}`, { direction: 'top' })
        .addTo(routeLayer);
  });
  map.fitBounds(line.getBounds(), { padding: [40, 40] });
}

// ---------- rendering ----------

function renderRouteTabs() {
  routesEl.replaceChildren();
  if (state.routes.length < 2) return;
  const tabs = h('div', { class: 'route-tabs', role: 'tablist' });
  state.routes.forEach((r, i) => {
    const toll = r.price ? peso(r.price.total) + (r.price.incomplete ? '+' : '') : r.segments.length ? '…' : peso(0);
    const btn = h(
      'button',
      { type: 'button', role: 'tab', 'aria-selected': String(i === state.selected), class: 'route-tab' },
      h('span', { class: 'tab-title' }, `Route ${String.fromCharCode(65 + i)}`),
      h('span', { class: 'tab-meta' }, `${duration(r.route.duration)} · ${km(r.route.distance)}`),
      h('span', { class: 'tab-toll' }, toll),
    );
    btn.addEventListener('click', () => selectRoute(i));
    tabs.append(btn);
  });
  routesEl.append(tabs);
}

function rfidName(r: string) {
  return r === 'easytrip' ? 'Easytrip' : 'Autosweep';
}

function renderResult() {
  resultEl.replaceChildren();
  const sel = state.routes[state.selected];
  if (!sel) return;
  const { route, segments, price, priceError } = sel;

  const summary = h(
    'div',
    { class: 'summary' },
    h(
      'div',
      { class: 'summary-main' },
      h('span', { class: 'summary-label' }, 'Total toll'),
      h(
        'span',
        { class: 'summary-total' },
        segments.length === 0 ? peso(0) : price ? peso(price.total) + (price.incomplete ? '+' : '') : '…',
      ),
    ),
    h('div', { class: 'summary-meta' }, `${duration(route.duration)} · ${km(route.distance)}`),
  );
  if (price && Object.keys(price.byRfid).length) {
    const chips = h('div', { class: 'rfid-totals' });
    for (const [r, v] of Object.entries(price.byRfid)) {
      chips.append(h('span', { class: `rfid rfid-${r}` }, `${rfidName(r)} ${peso(v)}`));
    }
    summary.append(chips);
  }
  resultEl.append(summary);

  if (priceError) resultEl.append(h('p', { class: 'warn' }, priceError));
  if (price?.incomplete) resultEl.append(h('p', { class: 'warn' }, 'Some segments could not be priced; the total is a minimum.'));

  if (!segments.length) {
    resultEl.append(h('p', { class: 'empty' }, 'No tolled expressways on this route.'));
    return;
  }

  const list = h('ol', { class: 'segments' });
  segments.forEach((s, idx) => {
    const priced = price?.segments[idx];
    const roads = s.expressways.map((id) => EXPRESSWAY_BY_ID[id]);
    const color = roads[0].color;
    const approx = [s.entry, s.exit].some((p) => p && APPROX_SOURCES.has(p.source));
    const fee = priced ? (priced.fee != null ? peso(priced.fee) : '—') : '…';
    const li = h(
      'li',
      { class: 'segment', 'style:--road': color },
      h(
        'div',
        { class: 'seg-head' },
        h('span', { class: 'seg-num' }, String(idx + 1)),
        h('span', { class: 'seg-road' }, roads.map((r) => r.shortName).join(' → ')),
        h('span', { class: `rfid rfid-${s.rfid}` }, rfidName(s.rfid)),
        h('span', { class: 'seg-fee' }, fee),
      ),
      h(
        'div',
        { class: 'seg-plazas' },
        h('div', {}, h('span', { class: 'tag tag-in' }, 'Enter'), s.entry?.name ?? 'Unknown plaza'),
        h('div', {}, h('span', { class: 'tag tag-out' }, 'Exit'), s.exit?.name ?? 'Unknown plaza'),
      ),
      h('div', { class: 'seg-meta' }, `${km(s.endOffset - s.startOffset)} on ${roads.map((r) => r.name).join(', ')}`),
      priced?.note ? h('div', { class: 'seg-note' }, priced.note) : null,
      approx ? h('div', { class: 'seg-note' }, 'Plaza position is approximate; check the entry/exit shown.') : null,
    );
    li.addEventListener('click', () => {
      const b = L.latLngBounds(s.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]));
      map.fitBounds(b, { padding: [60, 60] });
    });
    list.append(li);
  });
  resultEl.append(list);
}

function render() {
  renderRouteTabs();
  renderResult();
}

function selectRoute(i: number) {
  state.selected = i;
  drawRoutes();
  render();
}

// ---------- flow ----------

function syncUrl() {
  const q = new URLSearchParams();
  if (state.from) q.set('from', `${state.from.lat.toFixed(5)},${state.from.lng.toFixed(5)}`);
  if (state.to) q.set('to', `${state.to.lat.toFixed(5)},${state.to.lng.toFixed(5)}`);
  if (state.vclass !== 1) q.set('class', String(state.vclass));
  history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
}

async function priceAll(req: number) {
  // Sequential on purpose: the fare API rate-limits bursts. Cached pairs return instantly.
  for (const r of state.routes) {
    if (req !== state.request) return;
    try {
      r.price = await priceSegments(r.segments, fares, state.vclass);
      r.priceError = undefined;
    } catch (e) {
      r.priceError = (e as Error).message;
    }
    if (req === state.request) render();
  }
}

async function plan() {
  syncUrl();
  drawEndpoints();
  if (!state.from || !state.to) return;
  const req = ++state.request;
  setStatus('Finding routes…', 'busy');
  try {
    const routes = await fetchRoutes(state.from, state.to);
    if (req !== state.request) return;
    state.routes = routes.map((route) => ({ route, segments: detectTollSegments(route, plazas) }));
    state.selected = 0;
    setStatus('');
    drawRoutes();
    render();
    await priceAll(req);
  } catch (e) {
    if (req !== state.request) return;
    state.routes = [];
    routeLayer.clearLayers();
    render();
    setStatus((e as Error).message, 'error');
  }
}

async function reprice() {
  if (!state.routes.length) return;
  const req = ++state.request;
  for (const r of state.routes) r.price = undefined;
  render();
  await priceAll(req);
}

function setEndpoint(which: 'from' | 'to', p: Endpoint) {
  state[which] = p;
  (which === 'from' ? fromInput : toInput).value = p.label;
  plan();
}

// ---------- inputs ----------

function attachSearch(input: HTMLInputElement, list: HTMLUListElement, which: 'from' | 'to') {
  let timer: number | undefined;
  let ctrl: AbortController | undefined;
  let results: Place[] = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    active = -1;
  };
  const choose = (p: Place) => {
    close();
    setEndpoint(which, { lat: p.lat, lng: p.lng, label: p.label });
  };
  const paint = () => {
    list.replaceChildren(
      ...results.map((p, i) => {
        const li = h(
          'li',
          { role: 'option', 'aria-selected': String(i === active) },
          h('span', { class: 'sug-label' }, p.label),
          h('span', { class: 'sug-detail' }, p.detail),
        );
        li.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          choose(p);
        });
        return li;
      }),
    );
    list.hidden = results.length === 0;
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) return close();
    timer = window.setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        results = await searchPlaces(q, state.from ?? state.to ?? undefined, ctrl.signal);
        active = -1;
        paint();
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus((e as Error).message, 'error');
      }
    }, 300);
  });
  input.addEventListener('keydown', (ev) => {
    if (list.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paint();
    } else if (ev.key === 'Enter' && results.length) {
      ev.preventDefault();
      choose(results[Math.max(active, 0)]);
    } else if (ev.key === 'Escape') close();
  });
  input.addEventListener('blur', () => window.setTimeout(close, 150));
}

attachSearch(fromInput, $('#from-suggestions'), 'from');
attachSearch(toInput, $('#to-suggestions'), 'to');

$('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) return setStatus('Location is not available in this browser.', 'error');
  setStatus('Getting your location…', 'busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setStatus('');
      setEndpoint('from', { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'My location' });
      if (!state.to) map.setView([pos.coords.latitude, pos.coords.longitude], 13);
    },
    (err) => setStatus(`Could not get your location: ${err.message}`, 'error'),
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

$('#swap').addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  fromInput.value = state.from?.label ?? '';
  toInput.value = state.to?.label ?? '';
  plan();
});

document.querySelectorAll<HTMLInputElement>('input[name=vclass]').forEach((r) =>
  r.addEventListener('change', () => {
    state.vclass = Number(r.value) as VehicleClass;
    syncUrl();
    reprice();
  }),
);

map.on('click', (ev: L.LeafletMouseEvent) => {
  const p = { lat: ev.latlng.lat, lng: ev.latlng.lng, label: `${ev.latlng.lat.toFixed(5)}, ${ev.latlng.lng.toFixed(5)}` };
  // First tap sets the start; later taps set (or move) the destination.
  setEndpoint(state.from ? 'to' : 'from', p);
});

// ---------- restore from URL ----------

function parsePoint(s: string | null): Endpoint | null {
  const m = s?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  return m ? { lat: +m[1], lng: +m[2], label: `${(+m[1]).toFixed(5)}, ${(+m[2]).toFixed(5)}` } : null;
}

const params = new URLSearchParams(location.search);
state.from = parsePoint(params.get('from'));
state.to = parsePoint(params.get('to'));
const cls = Number(params.get('class'));
if (cls === 2 || cls === 3) {
  state.vclass = cls;
  document.querySelector<HTMLInputElement>(`input[name=vclass][value="${cls}"]`)!.checked = true;
}
fromInput.value = state.from?.label ?? '';
toInput.value = state.to?.label ?? '';
if (state.from && state.to) plan();
else {
  drawEndpoints();
  setStatus('Tap the map or search to set where you start and where you are going.');
}
