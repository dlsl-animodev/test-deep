import { describe, expect, it } from 'vitest';
import { classifyRoad } from '../src/core/expressways.ts';

describe('classifyRoad', () => {
  it.each([
    ['North Luzon Expressway', 'E1', 'nlex'],
    ['Subic-Clark-Tarlac Expressway', 'E1', 'sctex'],
    ['Subic–Clark–Tarlac Expressway', 'E4', 'sctex'],
    ['Tarlac-Pangasinan-La Union Expressway', 'E1', 'tplex'],
    ['NLEX Harbor Link Segment 10', 'E5', 'harbor-link'],
    ['NLEX Connector', undefined, 'nlex-connector'],
    ['South Luzon Expressway', 'E2', 'slex'],
    ['Skyway', 'E2', 'skyway'],
    ['Skyway Stage 3', undefined, 'skyway-stage-3'],
    ['NAIA Expressway', undefined, 'naiax'],
    ['Southern Tagalog Arterial Road', 'E2', 'star'],
    ['Manila–Cavite Expressway', 'E3', 'cavitex'],
    ['CAVITEX–C-5 Link', undefined, 'cavitex-c5'],
    ['Cavite–Laguna Expressway', 'E3', 'calax'],
    ['Muntinlupa-Cavite Expressway', 'E2', 'mcx'],
  ])('%s (%s) → %s', (name, ref, id) => {
    expect(classifyRoad(name, ref)?.id).toBe(id);
  });

  it.each([['EDSA'], ['East Service Road'], ['Dau Access Road'], ['CAVITEX–CALAX Link Road 1'], ['Osmeña Highway'], ['']])(
    '%s is not a toll road',
    (name) => {
      expect(classifyRoad(name, null)).toBeNull();
    },
  );

  it('does not treat the free Osmeña Highway (ref E2) as SLEX', () => {
    expect(classifyRoad('Osmeña Highway', 'E2')).toBeNull();
  });
});
