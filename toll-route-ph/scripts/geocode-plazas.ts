/**
 * Finds a map position for every toll plaza in plaza-list.ts using the Photon
 * geocoder (OpenStreetMap data), and writes src/data/plazas.json.
 *
 *   node scripts/geocode-plazas.ts            # geocode plazas missing from plazas.json
 *   node scripts/geocode-plazas.ts --all      # re-geocode everything
 *
 * Entries with a "manual…" source in plazas.json are never overwritten, so
 * hand-corrected coordinates survive re-runs.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PLAZA_SEEDS, plazaKey, type PlazaSeed } from './plaza-list.ts';
import { classifyRoad, EXPRESSWAY_BY_ID } from '../src/core/expressways.ts';
import type { PlazaRecord } from '../src/core/types.ts';

const OUT = new URL('../src/data/plazas.json', import.meta.url);
const LUZON_BBOX = '119.5,13.4,122.3,16.8';
const UA = 'toll-route-ph/0.1 (plaza geocoding script)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

async function photon(q: string, osmTag?: string): Promise<PhotonFeature[]> {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '15');
  u.searchParams.set('bbox', LUZON_BBOX);
  if (osmTag) u.searchParams.set('osm_tag', osmTag);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const json = (await res.json()) as { features: PhotonFeature[] };
      await sleep(700);
      return json.features;
    }
    if (attempt >= 4) throw new Error(`photon ${res.status} for ${q}`);
    await sleep(2000 * 2 ** attempt);
  }
}

const fold = (s = '') =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** The feature's name must mention the plaza (first word of the search string). */
function nameMatches(f: PhotonFeature, q: string): boolean {
  const want = fold(q).replace(/^(santa|santo|sta|sto) /, '').split(' ')[0];
  return fold(f.properties.name).split(' ').includes(want) || fold(f.properties.name).includes(fold(q));
}

function onExpressway(f: PhotonFeature, seed: PlazaSeed): boolean {
  const pr = f.properties;
  for (const text of [pr.street, pr.name]) {
    const e = classifyRoad(text);
    if (e && seed.expressways.includes(e.id)) return true;
  }
  return false;
}

async function geocode(seed: PlazaSeed): Promise<PlazaRecord | null> {
  const q = seed.geocode ?? seed.name;
  const attempts: Array<[string, string | undefined, string]> = [
    [q, 'highway:motorway_junction', 'osm-junction'],
    [q, 'barrier:toll_booth', 'osm-toll-booth'],
    [`${q} toll plaza`, undefined, 'osm-search'],
    [`${q} interchange`, undefined, 'osm-search'],
  ];
  for (const [query, tag, source] of attempts) {
    const feats = await photon(query, tag);
    const hit = feats.find((f) => onExpressway(f, seed) && nameMatches(f, q));
    if (hit) {
      const [lng, lat] = hit.geometry.coordinates;
      return {
        name: seed.name,
        expressways: seed.expressways,
        lat: +lat.toFixed(6),
        lng: +lng.toFixed(6),
        source,
        osmName: hit.properties.name,
      };
    }
  }
  return null;
}

async function main() {
  const all = process.argv.includes('--all');
  const existing: PlazaRecord[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const byKey = new Map(existing.map((r) => [plazaKey(r), r]));
  const out: PlazaRecord[] = [];
  const missing: string[] = [];

  for (const seed of PLAZA_SEEDS) {
    const prev = byKey.get(plazaKey(seed));
    if (prev && (prev.source.startsWith('manual') || !all)) {
      out.push({ ...prev, expressways: seed.expressways });
      continue;
    }
    const rec = await geocode(seed);
    if (rec) {
      const roads = seed.expressways.map((id) => EXPRESSWAY_BY_ID[id].shortName).join('/');
      console.log(`ok   ${seed.name.padEnd(30)} ${roads.padEnd(18)} ${rec.lat},${rec.lng}  [${rec.source}: ${rec.osmName}]`);
      out.push(rec);
      writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    } else {
      console.log(`MISS ${seed.name}`);
      missing.push(seed.name);
    }
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${out.length} plazas; ${missing.length} missing: ${missing.join(', ')}`);
}

main();
