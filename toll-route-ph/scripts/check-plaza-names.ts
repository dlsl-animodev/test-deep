/**
 * Checks that every plaza name in src/data/plazas.json is accepted by the
 * fare API, by quoting a fare from each plaza to another plaza of the same
 * fare system. Run after editing plaza data:
 *
 *   node scripts/check-plaza-names.ts            # all fare systems
 *   node scripts/check-plaza-names.ts slex calax # just these
 *
 * The API rate-limits bursts, so this paces itself (~2 s per request).
 */
import { readFileSync } from 'node:fs';
import { EXPRESSWAY_BY_ID } from '../src/core/expressways.ts';
import type { PlazaRecord } from '../src/core/types.ts';

const plazas: PlazaRecord[] = JSON.parse(readFileSync(new URL('../src/data/plazas.json', import.meta.url), 'utf8'));
const API = 'https://www.expressway.ph/api/toll-calculator';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const bySystem = new Map<string, PlazaRecord[]>();
for (const p of plazas) {
  for (const id of p.expressways) {
    const fs = EXPRESSWAY_BY_ID[id].fareSystem;
    if (!fs) continue;
    const list = bySystem.get(fs) ?? [];
    if (!list.some((q) => q.name === p.name)) list.push(p);
    bySystem.set(fs, list);
  }
}

const only = process.argv.slice(2).length ? process.argv.slice(2) : null;
let bad = 0;
for (const [system, list] of bySystem) {
  if (only && !only.includes(system)) continue;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const b = list[i === 0 ? 1 : 0];
    const u = new URL(API);
    u.searchParams.set('origin', a.name);
    u.searchParams.set('dest', b.name);
    u.searchParams.set('class', '1');
    let res = await fetch(u);
    for (let wait = 5000; res.status === 429 && wait <= 80000; wait *= 2) {
      console.log(`  rate limited, waiting ${wait / 1000}s`);
      await sleep(wait);
      res = await fetch(u);
    }
    const json: any = await res.json();
    const seg = json.segments?.find((s: any) => s.expresswaySlug === system);
    const ok = res.ok && seg;
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${system.padEnd(15)} ${a.name} → ${b.name}: ${ok ? `₱${json.totalToll}` : JSON.stringify(json).slice(0, 160)}`);
    await sleep(2000);
  }
}
console.log(bad ? `\n${bad} problem(s)` : '\nall plaza names accepted');
process.exitCode = bad ? 1 : 0;
