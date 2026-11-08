/**
 * Second pass for plazas the Photon geocoder could not place.
 *
 *   node scripts/fill-missing.ts
 *
 * 1. Try Nominatim for a motorway junction / toll booth on the right expressway.
 * 2. Otherwise geocode a nearby locality and snap it onto the expressway's
 *    geometry (taken from OSRM routes along each corridor). These get
 *    source "approx-snapped" and should be checked by hand.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PLAZA_SEEDS, plazaKey } from './plaza-list.ts';
import { classifyRoad, type ExpresswayId } from '../src/core/expressways.ts';
import { labelRoute } from '../src/core/detect.ts';
import { nearestPointOnLine } from '../src/core/geo.ts';
import { parseOsrmRoute } from '../src/core/routing.ts';
import type { PlazaRecord } from '../src/core/types.ts';

const OUT = new URL('../src/data/plazas.json', import.meta.url);
const CACHE = new URL('./cache/', import.meta.url);
const UA = 'toll-route-ph/0.1 (plaza geocoding script)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Corridors (lng,lat;lng,lat...) used to trace each expressway's geometry. */
const CORRIDORS: Record<string, string> = {
  nlex: '121.0004,14.6786;120.5872,15.2234',
  tplex: '120.6779,15.4744;120.4984,16.2175',
  'harbor-link': '120.9793,14.6944;120.9560,14.6300',
  'nlex-connector': '120.9850,14.6560;120.9921,14.6174;121.0056,14.6035',
  skyway: '121.0004,14.6786;121.0033,14.5655;121.0450,14.4200',
  naiax: '121.0240,14.5170;120.9890,14.5250',
  star: '121.1410,14.1934;121.0600,13.7600',
  cavitex: '120.9823,14.4882;120.9111,14.4359',
  calax: '120.9710,14.2535;121.0767,14.3051',
  slex: '121.0221,14.5305;121.1410,14.1934',
};

/** Locality to snap onto the expressway when no junction is found. */
const SNAP_HINTS: Record<string, [string, ExpresswayId]> = {
  Karuhatan: ['Karuhatan, Valenzuela', 'nlex'],
  Valenzuela: ['Paso de Blas, Valenzuela', 'nlex'],
  'Ciudad de Victoria': ['Philippine Arena, Bocaue', 'nlex'],
  Tabang: ['Tabang, Guiguinto', 'nlex'],
  'La Paz': ['La Paz, Tarlac', 'tplex'],
  Gerona: ['Gerona, Tarlac', 'tplex'],
  Paniqui: ['Paniqui, Tarlac', 'tplex'],
  Moncada: ['Moncada, Tarlac', 'tplex'],
  'C-3 Road/5th Ave.': ['5th Avenue, Caloocan', 'harbor-link'],
  'Malabon/Dagat-Dagatan': ['Dagat-Dagatan, Caloocan', 'harbor-link'],
  'R-10/Port of Manila': ['Navotas Fish Port', 'harbor-link'],
  Quirino: ['Quirino Avenue, Paco, Manila', 'skyway-stage-3'],
  'Plaza Dilao': ['Plaza Dilao, Paco, Manila', 'skyway-stage-3'],
  Nagtahan: ['Nagtahan Bridge, Manila', 'skyway-stage-3'],
  'E. Rodriguez': ['E. Rodriguez Sr. Avenue, Quezon City', 'skyway-stage-3'],
  'Quezon Ave.': ['Quezon Avenue, Santa Mesa Heights, Quezon City', 'skyway-stage-3'],
  NLEX: ['Balintawak, Quezon City', 'skyway-stage-3'],
  NAIAX: ['Villamor Air Base, Pasay', 'skyway'],
  Alabang: ['Alabang, Muntinlupa', 'slex'],
  MCX: ['Ayala Alabang, Muntinlupa', 'slex'],
  'Susana Heights': ['Susana Heights, Muntinlupa', 'slex'],
  Merville: ['Merville, Parañaque', 'skyway'],
  Batangas: ['Balagtas, Batangas City', 'star'],
  Skyway: ['Sales Interchange, Pasay', 'naiax'],
  'Andrews Ave./Terminal 3': ['Andrews Avenue, Pasay', 'naiax'],
  'Aurora Blvd. (Tramo)': ['Tramo, Pasay', 'naiax'],
  'NAIA Terminal 1': ['NAIA Terminal 1, Parañaque', 'naiax'],
  'NAIA Terminal 2': ['NAIA Terminal 2, Pasay', 'naiax'],
  'Entertainment City': ['Okada Manila, Parañaque', 'naiax'],
  'Macapagal Blvd.': ['Diosdado Macapagal Boulevard, Parañaque', 'naiax'],
  CAVITEX: ['Coastal Road, Parañaque', 'naiax'],
  'Bacoor/Zapote': ['Zapote, Bacoor', 'cavitex'],
  'Sucat Rd./Dr. A. Santos Ave.': ['Dr. A. Santos Avenue, Parañaque', 'cavitex'],
  Greenfield: ['Greenfield City, Biñan', 'calax'],
};

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (attempt >= 4) throw new Error(`${res.status} for ${url}`);
    await sleep(2000 * 2 ** attempt);
  }
}

async function nominatim(q: string): Promise<any[]> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '8');
  u.searchParams.set('countrycodes', 'ph');
  const r = await getJson(u.toString());
  await sleep(1100); // Nominatim usage policy: max 1 request/second
  return r;
}

/** Coordinates of one expressway, traced from an OSRM route along its corridor. */
const geometryCache = new Map<string, [number, number][]>();
async function expresswayGeometry(id: ExpresswayId): Promise<[number, number][]> {
  const corridorKey = id === 'skyway-stage-3' ? 'skyway' : id;
  const key = `${corridorKey}->${id}`;
  if (geometryCache.has(key)) return geometryCache.get(key)!;
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const file = new URL(`osrm-${corridorKey}.json`, CACHE);
  let raw: any;
  if (existsSync(file)) raw = JSON.parse(readFileSync(file, 'utf8'));
  else {
    raw = await getJson(
      `https://router.project-osrm.org/route/v1/driving/${CORRIDORS[corridorKey]}?overview=full&geometries=geojson&steps=true`,
    );
    writeFileSync(file, JSON.stringify(raw));
    await sleep(1000);
  }
  const route = parseOsrmRoute(raw.routes[0]);
  const pts = labelRoute(route)
    .filter((p) => p.expressway?.id === id)
    .map((p) => p.coord);
  geometryCache.set(key, pts);
  return pts;
}

async function main() {
  const plazas: PlazaRecord[] = JSON.parse(readFileSync(OUT, 'utf8'));
  const have = new Set(plazas.map(plazaKey));

  for (const seed of PLAZA_SEEDS) {
    if (have.has(plazaKey(seed))) continue;
    let rec: PlazaRecord | null = null;

    // 1. Nominatim junction / toll booth on the expressway.
    const q = seed.geocode ?? seed.name;
    for (const hit of await nominatim(q)) {
      const okType =
        (hit.category === 'highway' && hit.type === 'motorway_junction') ||
        (hit.category === 'barrier' && hit.type === 'toll_booth');
      const road = String(hit.display_name).split(',')[1] ?? '';
      const e = classifyRoad(road);
      const onRoad = e && (seed.expressways.includes(e.id) || (e.id === 'skyway' && seed.expressways.includes('skyway-stage-3')));
      if (okType && onRoad) {
        rec = { name: seed.name, expressways: seed.expressways, lat: +(+hit.lat).toFixed(6), lng: +(+hit.lon).toFixed(6), source: 'osm-junction', osmName: hit.name };
        break;
      }
    }

    // 2. Locality snapped onto the expressway geometry.
    if (!rec && SNAP_HINTS[seed.name]) {
      const [locality, road] = SNAP_HINTS[seed.name];
      const hits = await nominatim(locality);
      const geom = await expresswayGeometry(road);
      if (hits.length && geom.length > 1) {
        const snapped = nearestPointOnLine({ lat: +hits[0].lat, lng: +hits[0].lon }, geom);
        rec = {
          name: seed.name,
          expressways: seed.expressways,
          lat: +snapped.point.lat.toFixed(6),
          lng: +snapped.point.lng.toFixed(6),
          source: 'approx-snapped',
          osmName: `${locality} (${Math.round(snapped.distance)} m from road)`,
        };
      } else {
        console.log(`  (no geometry for ${road}: ${geom.length} pts, or locality not found)`);
      }
    }

    if (rec) {
      console.log(`ok   ${seed.name.padEnd(30)} ${rec.lat},${rec.lng} [${rec.source}: ${rec.osmName}]`);
      plazas.push(rec);
      writeFileSync(OUT, JSON.stringify(plazas, null, 2) + '\n');
    } else console.log(`MISS ${seed.name}`);
  }

  // Keep the file in the same order as plaza-list.ts.
  const order = new Map(PLAZA_SEEDS.map((s, i) => [plazaKey(s), i]));
  plazas.sort((a, b) => (order.get(plazaKey(a)) ?? 999) - (order.get(plazaKey(b)) ?? 999));
  writeFileSync(OUT, JSON.stringify(plazas, null, 2) + '\n');
}

main();
