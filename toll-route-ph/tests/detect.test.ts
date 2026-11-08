import { describe, expect, it } from 'vitest';
import { detectTollSegments, labelRoute } from '../src/core/detect.ts';
import { fixtureRoutes, plazas, summarize } from './helpers.ts';
import type { Route } from '../src/core/types.ts';

describe('detectTollSegments on recorded routes', () => {
  it('Cubao → Baguio: NLEX/SCTEX then TPLEX', () => {
    const [route] = fixtureRoutes('qc_baguio');
    expect(summarize(route)).toEqual(['nlex: Balintawak -> Tarlac', 'tplex: La Paz -> Rosario/Baguio']);
    const segs = detectTollSegments(route, plazas);
    expect(segs[0].expressways).toEqual(['nlex', 'sctex']);
    expect(segs.map((s) => s.rfid)).toEqual(['easytrip', 'autosweep']);
  });

  it('Makati → Batangas: SLEX then STAR, split at Calamba', () => {
    const [route] = fixtureRoutes('makati_batangas');
    expect(summarize(route)).toEqual(['slex: Magallanes -> Calamba', 'star-tollway: Calamba -> Lipa']);
  });

  it('Quezon Ave → Angeles: NLEX only', () => {
    const [route] = fixtureRoutes('quezonave_angeles');
    expect(summarize(route)).toEqual(['nlex: Balintawak -> Angeles']);
  });

  it('Subic → Clark: SCTEX from Tipo, priced on the NLEX matrix', () => {
    const [route] = fixtureRoutes('subic_clark');
    expect(summarize(route)).toEqual(['nlex: Tipo/Subic -> Clark South']);
    expect(detectTollSegments(route, plazas)[0].expressways).toEqual(['sctex']);
  });

  it('Valenzuela → Port Area: NLEX Harbor Link', () => {
    const [route] = fixtureRoutes('valenzuela_portarea');
    expect(summarize(route)).toEqual(['harbor-link: Karuhatan/Valenzuela -> R-10/Port of Manila']);
  });

  it('Makati → Kawit: CAVITEX from the Parañaque plaza', () => {
    const [route] = fixtureRoutes('makati_kawit');
    expect(summarize(route)).toEqual(['cavitex: Parañaque -> Kawit']);
  });

  it('Sta. Rosa → Silang: CALAX', () => {
    const [route] = fixtureRoutes('starosa_silang');
    expect(summarize(route)).toEqual(['calax: Laguna Blvd. -> Silang East']);
  });

  it('Balintawak → Buendia → Alabang: Skyway 3, then elevated Skyway on the SLEX matrix', () => {
    const [route] = fixtureRoutes('skyway_corridor');
    // This recorded route leaves the Skyway at Sucat and rejoins SLEX at-grade,
    // which really is two SLEX-system transactions.
    expect(summarize(route)).toEqual([
      'skyway-stage-3: Balintawak -> Buendia',
      'slex: Buendia -> Sucat',
      'slex: Sucat -> Alabang',
    ]);
    const segs = detectTollSegments(route, plazas);
    expect(segs[0].entry?.expressways).toEqual(['skyway-stage-3']);
    expect(segs[1].expressways).toEqual(['skyway']);
  });

  it('Alabang → Dasmariñas: SLEX to MCX, MCX has no fare data', () => {
    const [route] = fixtureRoutes('alabang_dasma');
    expect(summarize(route)).toEqual(['slex: Filinvest -> MCX', 'mcx: ? -> ?']);
    expect(detectTollSegments(route, plazas)[1].fareSystem).toBeNull();
  });

  it('short hops on the free part of SLEX give no toll', () => {
    const [route] = fixtureRoutes('makati_naia3');
    expect(summarize(route)).toEqual([]);
  });

  it('every alternative route is analysable', () => {
    for (const name of ['qc_baguio', 'makati_batangas', 'subic_clark', 'valenzuela_portarea', 'alabang_dasma']) {
      for (const route of fixtureRoutes(name)) {
        for (const s of detectTollSegments(route, plazas)) {
          expect(s.endOffset).toBeGreaterThan(s.startOffset);
          expect(s.coordinates.length).toBeGreaterThan(1);
        }
      }
    }
  });
});

describe('labelRoute', () => {
  const step = (name: string, coords: [number, number][]) => ({
    name,
    distance: 0,
    coordinates: coords,
    maneuver: 'continue',
  });
  const route = (steps: ReturnType<typeof step>[]): Route => ({
    distance: 0,
    duration: 0,
    coordinates: steps.flatMap((s) => s.coordinates),
    steps,
  });

  it('splits "Skyway" into Stage 3 north of Buendia and elevated Skyway south of it', () => {
    const pts = labelRoute(route([step('Skyway', [[121.0, 14.6], [121.003, 14.566], [121.02, 14.53]])]));
    expect(pts.map((p) => p.expressway?.id)).toEqual(['skyway-stage-3', 'skyway', 'skyway']);
  });

  it('bridges an unnamed ramp between NLEX and SCTEX', () => {
    const pts = labelRoute(
      route([
        step('North Luzon Expressway', [[120.6, 15.17], [120.59, 15.19]]),
        step('', [[120.59, 15.19], [120.585, 15.195]]),
        step('Subic–Clark–Tarlac Expressway', [[120.585, 15.195], [120.57, 15.2]]),
      ]),
    );
    expect(pts.every((p) => p.expressway)).toBe(true);
  });

  it('does not bridge a long local-road gap', () => {
    const pts = labelRoute(
      route([
        step('North Luzon Expressway', [[120.6, 15.1], [120.6, 15.11]]),
        step('MacArthur Highway', [[120.6, 15.11], [120.6, 15.2]]),
        step('North Luzon Expressway', [[120.6, 15.2], [120.6, 15.21]]),
      ]),
    );
    expect(pts.some((p) => !p.expressway)).toBe(true);
  });
});
