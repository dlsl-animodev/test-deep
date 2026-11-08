import { readFileSync } from 'node:fs';
import { parseOsrmRoute } from '../src/core/routing.ts';
import { detectTollSegments } from '../src/core/detect.ts';
import type { PlazaRecord, Route } from '../src/core/types.ts';

export const plazas: PlazaRecord[] = JSON.parse(
  readFileSync(new URL('../src/data/plazas.json', import.meta.url), 'utf8'),
);

/** Recorded OSRM responses (router.project-osrm.org, Nov 2026). */
export function fixtureRoutes(name: string): Route[] {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
  return raw.routes.map(parseOsrmRoute);
}

/** Compact view of detected segments: "fareSystem: Entry -> Exit". */
export function summarize(route: Route): string[] {
  return detectTollSegments(route, plazas).map(
    (s) => `${s.fareSystem ?? s.expressways.join('+')}: ${s.entry?.name ?? '?'} -> ${s.exit?.name ?? '?'}`,
  );
}
