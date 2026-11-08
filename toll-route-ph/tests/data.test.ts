import { describe, expect, it } from 'vitest';
import { EXPRESSWAY_BY_ID } from '../src/core/expressways.ts';
import { PLAZA_SEEDS, plazaKey } from '../scripts/plaza-list.ts';
import { plazas } from './helpers.ts';

describe('plaza data', () => {
  it('has a position for every plaza in the master list', () => {
    const have = new Set(plazas.map(plazaKey));
    expect(PLAZA_SEEDS.filter((s) => !have.has(plazaKey(s))).map((s) => s.name)).toEqual([]);
    expect(plazas.length).toBe(PLAZA_SEEDS.length);
  });

  it('references known expressways and sits in Luzon', () => {
    for (const p of plazas) {
      expect(p.expressways.length).toBeGreaterThan(0);
      for (const id of p.expressways) expect(EXPRESSWAY_BY_ID[id], `${p.name}: ${id}`).toBeDefined();
      expect(p.lat).toBeGreaterThan(13.5);
      expect(p.lat).toBeLessThan(16.5);
      expect(p.lng).toBeGreaterThan(120);
      expect(p.lng).toBeLessThan(121.5);
    }
  });

  it('never has two plazas with the same name on the same expressway', () => {
    const seen = new Set<string>();
    for (const p of plazas)
      for (const id of p.expressways) {
        const k = `${id}|${p.name}`;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      }
  });
});
