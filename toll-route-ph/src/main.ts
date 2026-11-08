import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

import plazaData from './data/plazas.json';
import { EXPRESSWAY_BY_ID, type RfidSystem } from './core/expressways.ts';
import { detectTollSegments } from './core/detect.ts';
import { ExpresswayPhFareProvider, priceSegments, type KeyValueStore, type TripPrice } from './core/fares.ts';
import { fetchRoutes } from './core/routing.ts';
import { searchPlaces, type Place } from './core/geocode.ts';
import { deductTrip, loadGarage, saveGarage, tripCoverage, type Vehicle } from './core/garage.ts';
import type { LatLng, PlazaRecord, Route, TollSegment, VehicleClass } from './core/types.ts';
import { $, ago, duration, h, icon, ICONS, km, peso } from './ui/dom.ts';
import { createSheet, isWide } from './ui/sheet.ts';
import { renderGarage } from './ui/garage.ts';

const plazas = plazaData as PlazaRecord[];
const APPROX_SOURCES = new Set(['approx-snapped', 'manual-approx']);
const RFID_NAME: Record<RfidSystem, string> = { easytrip: 'Easytrip', autosweep: 'Autosweep' };

let storage: KeyValueStore | undefined;
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
  vehicleId: null as string | null,
  garage: loadGarage(storage),
  routes: [] as AnalyzedRoute[],
  selected: 0,
  request: 0,
};

const vehicle = (): Vehicle | undefined => state.garage.find((v) => v.id === state.vehicleId);

// ---------- elements ----------

const fromInput = $<HTMLInputElement>('#from');
const toInput = $<HTMLInputElement>('#to');
const suggestionsEl = $<HTMLUListElement>('#suggestions');
const statusEl = $('#status');
const routesEl = $('#routes');
const resultEl = $('#result');
const vehicleSelect = $<HTMLSelectElement>('#vehicle');
const sheet = createSheet($('#sheet'), $('#sheet-handle'));

function setStatus(msg: string, kind: 'info' | 'error' | 'busy' = 'info') {
  statusEl.textContent = msg;
  statusEl.className = `status ${kind}`;
}

// ---------- map ----------

const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([14.95, 120.9], 9);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const plazaLayer = L.layerGroup();
for (const p of plazas) {
  const e = EXPRESSWAY_BY_ID[p.expressways[0]];
  L.circleMarker([p.lat, p.lng], { radius: 3, color: e.color, weight: 1, fillOpacity: 0.8 })
    .bindTooltip(`${p.name} (${p.expressways.map((id) => EXPRESSWAY_BY_ID[id].shortName).join(', ')})`)
    .addTo(plazaLayer);
}
map.on('zoomend', () => (map.getZoom() >= 12 ? plazaLayer.addTo(map) : plazaLayer.remove()));

const routeLayer = L.layerGroup().addTo(map);
const endpointLayer = L.layerGroup().addTo(map);
const toLL = (c: [number, number][]) => c.map(([lng, lat]) => [lat, lng] as [number, number]);
const pin = (cls: string, text: string) =>
  L.divIcon({ className: '', html: `<div class="pin ${cls}">${text}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

function fitTo(bounds: L.LatLngBounds) {
  const c = sheet.coverage();
  map.fitBounds(bounds, {
    paddingTopLeft: [c.left + 24, 48],
    paddingBottomRight: [48, c.bottom + 24],
    maxZoom: 15,
  });
}

function drawEndpoints() {
  endpointLayer.clearLayers();
  if (state.from) L.marker(state.from, { icon: pin('pin-from', ''), keyboard: false }).addTo(endpointLayer);
  if (state.to) L.marker(state.to, { icon: pin('pin-to', ''), keyboard: false }).addTo(endpointLayer);
}

function drawRoutes(fit = true) {
  routeLayer.clearLayers();
  state.routes.forEach((r, i) => {
    if (i !== state.selected)
      L.polyline(toLL(r.route.coordinates), { color: '#8E8E93', weight: 6, opacity: 0.55 })
        .on('click', () => selectRoute(i))
        .addTo(routeLayer);
  });
  const sel = state.routes[state.selected];
  if (!sel) return;
  const line = L.polyline(toLL(sel.route.coordinates), { color: '#007AFF', weight: 7 }).addTo(routeLayer);
  sel.segments.forEach((s, idx) => {
    L.polyline(toLL(s.coordinates), { color: EXPRESSWAY_BY_ID[s.expressways[0]].color, weight: 7 }).addTo(routeLayer);
    const n = String(idx + 1);
    if (s.entry) L.marker([s.entry.lat, s.entry.lng], { icon: pin('pin-entry', n) }).bindTooltip(`Enter ${s.entry.name}`).addTo(routeLayer);
    if (s.exit) L.marker([s.exit.lat, s.exit.lng], { icon: pin('pin-exit', n) }).bindTooltip(`Exit ${s.exit.name}`).addTo(routeLayer);
  });
  if (fit) fitTo(line.getBounds());
}

// ---------- trip rendering ----------

function renderRouteChips() {
  routesEl.replaceChildren();
  if (state.routes.length < 2) return;
  state.routes.forEach((r, i) => {
    const toll = r.price ? peso(r.price.total) + (r.price.incomplete ? '+' : '') : r.segments.length ? '…' : peso(0);
    routesEl.append(
      h(
        'button',
        { type: 'button', role: 'tab', class: 'route-chip', 'aria-selected': String(i === state.selected), onclick: () => selectRoute(i) },
        h('span', { class: 't' }, duration(r.route.duration)),
        h('span', { class: 'm' }, `${km(r.route.distance)} · ${toll} toll`),
      ),
    );
  });
}

function renderCoverage(price: TripPrice): HTMLElement | null {
  const v = vehicle();
  if (!v || !Object.keys(price.byRfid).length) return null;
  const rows = tripCoverage(price.byRfid, v);
  const stack = h('div', { class: 'stack coverage' });
  for (const c of rows) {
    const name = RFID_NAME[c.system];
    let kind: 'ok' | 'low' | 'unknown';
    let title: string;
    let sub: string;
    if (c.noAccount) {
      kind = 'low';
      title = `No ${name} on ${v.name || v.plate}`;
      sub = `This trip needs ${peso(c.needed)} on ${name}.`;
    } else if (!c.balance) {
      kind = 'unknown';
      title = `${name} needs ${peso(c.needed)}`;
      sub = 'Balance unknown. Check it in RFID.';
    } else if (c.after! < 0) {
      kind = 'low';
      title = `Reload ${name}: ${peso(-c.after!)} short`;
      sub = `Balance ${peso(c.balance.amount)}, updated ${ago(c.balance.at)}`;
    } else {
      kind = 'ok';
      title = `${name} covers it`;
      sub = `${peso(c.after!)} left after this trip`;
    }
    stack.append(
      h(
        'div',
        { class: 'row' },
        h('span', { class: `badge ${kind}` }, icon(kind === 'ok' ? ICONS.check : kind === 'low' ? ICONS.warn : ICONS.question, 18)),
        h('div', { class: 'lines' }, h('span', { class: 'title' }, title), h('small', {}, sub)),
      ),
    );
  }
  if (rows.some((c) => c.balance)) {
    stack.append(
      h(
        'button',
        {
          type: 'button',
          class: 'row link',
          onclick: () => {
            if (!confirm(`Deduct ${peso(price.total)} for this trip from ${v.name || v.plate}?`)) return;
            saveVehicle(deductTrip(v, price.byRfid));
          },
        },
        h('span', { class: 'grow' }, 'Drove it? Deduct the tolls'),
      ),
    );
  }
  return stack;
}

function renderResult() {
  resultEl.replaceChildren();
  const sel = state.routes[state.selected];
  if (!sel) return;
  const { route, segments, price, priceError } = sel;
  const view = h('div', { class: 'view' });

  const total = segments.length === 0 ? peso(0) : price ? peso(price.total) + (price.incomplete ? '+' : '') : '…';
  const summary = h(
    'div',
    { class: 'platter summary' },
    h('div', { class: 'eyebrow' }, `Class ${state.vclass} toll`),
    h('div', { class: 'total' }, total),
    h('div', { class: 'meta' }, `${duration(route.duration)} · ${km(route.distance)}`),
  );
  if (price && Object.keys(price.byRfid).length) {
    summary.append(
      h(
        'div',
        { class: 'wallet-split' },
        ...(Object.entries(price.byRfid) as [RfidSystem, number][]).map(([s, v]) =>
          h('span', { class: `chip ${s}` }, h('span', { class: `rfid-dot ${s}` }), RFID_NAME[s], h('b', {}, peso(v))),
        ),
      ),
    );
  }
  view.append(summary);

  if (priceError) view.append(h('p', { class: 'status error' }, priceError));
  if (price?.incomplete) view.append(h('p', { class: 'section-foot' }, 'Some stretches have no published fare, so this is a minimum.'));
  if (price) {
    const cov = renderCoverage(price);
    if (cov) view.append(cov);
  }

  if (!segments.length) {
    view.append(h('div', { class: 'platter' }, h('p', { class: 'empty' }, 'No toll roads on this route.')));
    resultEl.append(view);
    return;
  }

  view.append(h('div', { class: 'section-title' }, segments.length === 1 ? '1 toll stretch' : `${segments.length} toll stretches`));
  const stack = h('div', { class: 'stack' });
  segments.forEach((s, idx) => {
    const priced = price?.segments[idx];
    const roads = s.expressways.map((id) => EXPRESSWAY_BY_ID[id]);
    const approx = [s.entry, s.exit].some((p) => p && APPROX_SOURCES.has(p.source));
    const feeText = priced ? (priced.fee != null ? peso(priced.fee) : 'No fare') : '…';
    const stop = (kind: 'in' | 'out', label: string, name: string) =>
      h(
        'div',
        { class: 'stop' },
        h('span', { class: `stop-ico ${kind}` }, icon(kind === 'in' ? ICONS.arrowIn : ICONS.arrowOut, 15)),
        h('div', { class: 'lines' }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, name)),
      );
    stack.append(
      h(
        'div',
        {
          class: 'row segment',
          role: 'button',
          tabindex: '0',
          'style:--road': roads[0].color,
          onclick: () => fitTo(L.latLngBounds(toLL(s.coordinates))),
        },
        h(
          'div',
          { class: 'seg-top' },
          h('span', { class: 'road' }, roads.map((r) => r.shortName).join(' · ')),
          h('span', { class: 'grow' }),
          h('span', { class: `seg-fee${priced && priced.fee == null ? ' missing' : ''}` }, feeText),
        ),
        h('div', { class: 'stops' }, stop('in', 'Enter', s.entry?.name ?? 'Unknown'), stop('out', 'Exit', s.exit?.name ?? 'Unknown')),
        h(
          'div',
          { class: 'seg-foot' },
          h('span', { class: `rfid-dot ${s.rfid}` }),
          h('span', {}, `${RFID_NAME[s.rfid]} · ${km(s.endOffset - s.startOffset)}`),
        ),
        priced?.note ? h('div', { class: 'seg-note' }, priced.note) : null,
        approx ? h('div', { class: 'seg-note' }, 'Plaza location is approximate') : null,
      ),
    );
  });
  view.append(stack);
  resultEl.append(view);
}

function render() {
  renderRouteChips();
  renderResult();
}

function selectRoute(i: number) {
  state.selected = i;
  drawRoutes();
  render();
}

// ---------- vehicles ----------

function renderVehicles() {
  vehicleSelect.hidden = state.garage.length === 0;
  vehicleSelect.replaceChildren(
    h('option', { value: '' }, 'Any vehicle'),
    ...state.garage.map((v) => h('option', { value: v.id, selected: v.id === state.vehicleId }, v.name || v.plate || 'Vehicle')),
  );
  renderGarage($('#garage'), state.garage, { save: saveVehicle, remove: removeVehicle });
}

function saveVehicle(v: Vehicle) {
  const i = state.garage.findIndex((x) => x.id === v.id);
  if (i >= 0) state.garage[i] = v;
  else state.garage.push(v);
  saveGarage(state.garage, storage);
  if (!state.vehicleId || state.vehicleId === v.id) selectVehicle(v.id);
  else renderVehicles();
  render();
}

function removeVehicle(id: string) {
  state.garage = state.garage.filter((v) => v.id !== id);
  saveGarage(state.garage, storage);
  if (state.vehicleId === id) state.vehicleId = null;
  renderVehicles();
  render();
}

function selectVehicle(id: string | null) {
  state.vehicleId = id;
  const v = vehicle();
  renderVehicles();
  if (v && v.vclass !== state.vclass) setClass(v.vclass);
  else render();
}

vehicleSelect.addEventListener('change', () => selectVehicle(vehicleSelect.value || null));

// ---------- class ----------

function setClass(c: VehicleClass) {
  state.vclass = c;
  document.querySelectorAll<HTMLButtonElement>('#vclass button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.class) === c)));
  syncUrl();
  reprice();
}
document.querySelectorAll<HTMLButtonElement>('#vclass button').forEach((b) =>
  b.addEventListener('click', () => setClass(Number(b.dataset.class) as VehicleClass)),
);

// ---------- views ----------

document.querySelectorAll<HTMLButtonElement>('.tabbar [data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    const view = b.dataset.view!;
    document.querySelectorAll('.tabbar [data-view]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#view-trip').hidden = view !== 'trip';
    $('#view-rfid').hidden = view !== 'rfid';
    if (sheet.snap() === 'peek') sheet.setSnap('half');
  }),
);

// ---------- flow ----------

function syncUrl() {
  const q = new URLSearchParams();
  if (state.from) q.set('from', `${state.from.lat.toFixed(5)},${state.from.lng.toFixed(5)}`);
  if (state.to) q.set('to', `${state.to.lat.toFixed(5)},${state.to.lng.toFixed(5)}`);
  if (state.vclass !== 1) q.set('class', String(state.vclass));
  history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
}

async function priceAll(req: number) {
  // One at a time: the fare API rate-limits bursts. Cached pairs return instantly.
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
  setStatus('Finding routes', 'busy');
  try {
    const routes = await fetchRoutes(state.from, state.to);
    if (req !== state.request) return;
    state.routes = routes.map((route) => ({ route, segments: detectTollSegments(route, plazas) }));
    state.selected = 0;
    setStatus('');
    if (sheet.snap() === 'full' && !isWide()) sheet.setSnap('half');
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
  if (!state.routes.length) return render();
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

// ---------- search ----------

let searchFor: 'from' | 'to' = 'from';
let results: Place[] = [];
let active = -1;
let timer: number | undefined;
let ctrl: AbortController | undefined;

function closeSuggestions() {
  suggestionsEl.hidden = true;
  active = -1;
}

function paintSuggestions() {
  suggestionsEl.replaceChildren(
    ...results.map((p, i) =>
      h(
        'li',
        {
          role: 'option',
          'aria-selected': String(i === active),
          onmousedown: (ev: Event) => {
            ev.preventDefault();
            choose(p);
          },
        },
        h('span', { class: 'sug-label' }, p.label),
        p.detail ? h('span', { class: 'sug-detail' }, p.detail) : null,
      ),
    ),
  );
  suggestionsEl.hidden = results.length === 0;
}

function choose(p: Place) {
  closeSuggestions();
  (searchFor === 'from' ? fromInput : toInput).blur();
  setEndpoint(searchFor, { lat: p.lat, lng: p.lng, label: p.label });
}

for (const [input, which] of [
  [fromInput, 'from'],
  [toInput, 'to'],
] as const) {
  input.addEventListener('focus', () => {
    searchFor = which;
    if (!isWide()) sheet.setSnap('full');
  });
  input.addEventListener('input', () => {
    searchFor = which;
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) return closeSuggestions();
    timer = window.setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        results = await searchPlaces(q, state.from ?? state.to ?? undefined, ctrl.signal);
        active = -1;
        paintSuggestions();
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus((e as Error).message, 'error');
      }
    }, 300);
  });
  input.addEventListener('keydown', (ev) => {
    if (suggestionsEl.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paintSuggestions();
    } else if (ev.key === 'Enter' && results.length) {
      ev.preventDefault();
      choose(results[Math.max(active, 0)]);
    } else if (ev.key === 'Escape') closeSuggestions();
  });
  input.addEventListener('blur', () => window.setTimeout(closeSuggestions, 150));
}

$('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) return setStatus('Location is not available in this browser.', 'error');
  setStatus('Locating', 'busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setStatus('');
      setEndpoint('from', { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'My Location' });
      if (!state.to) map.setView([pos.coords.latitude, pos.coords.longitude], 13);
    },
    (err) => setStatus(`Could not get your location. ${err.message}`, 'error'),
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

$('#swap').addEventListener('click', () => {
  [state.from, state.to] = [state.to, state.from];
  fromInput.value = state.from?.label ?? '';
  toInput.value = state.to?.label ?? '';
  plan();
});

map.on('click', (ev: L.LeafletMouseEvent) => {
  const p = { lat: ev.latlng.lat, lng: ev.latlng.lng, label: 'Dropped Pin' };
  // First tap sets the start; later taps set (or move) the destination.
  setEndpoint(state.from ? 'to' : 'from', p);
});

// ---------- start ----------

function parsePoint(s: string | null, label: string): Endpoint | null {
  const m = s?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  return m ? { lat: +m[1], lng: +m[2], label } : null;
}

const params = new URLSearchParams(location.search);
state.from = parsePoint(params.get('from'), 'Shared Start');
state.to = parsePoint(params.get('to'), 'Shared Destination');
const cls = Number(params.get('class'));
if (state.garage.length) {
  state.vehicleId = state.garage[0].id;
  if (!cls) state.vclass = state.garage[0].vclass;
}
if (cls === 2 || cls === 3) state.vclass = cls;
document.querySelectorAll<HTMLButtonElement>('#vclass button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.class) === state.vclass)));
fromInput.value = state.from?.label ?? '';
toInput.value = state.to?.label ?? '';
renderVehicles();
if (state.from && state.to) plan();
else {
  drawEndpoints();
  setStatus('Search for a place or tap the map.');
}
