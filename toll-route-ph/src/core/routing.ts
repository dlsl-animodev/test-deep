import type { LatLng, Route, RouteStep } from './types.ts';

/**
 * Driving routes from an OSRM server.
 *
 * The default is the public OSRM demo server, which is fine for development
 * but has no uptime guarantee and a strict fair-use policy. For production,
 * host OSRM yourself (with Philippines OSM data) or swap in another router
 * that returns road names per step.
 */
export const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';

interface OsrmStep {
  name?: string;
  ref?: string;
  distance: number;
  geometry: { coordinates: [number, number][] };
  maneuver: { type: string };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
}

export function parseOsrmRoute(r: OsrmRoute): Route {
  const steps: RouteStep[] = r.legs.flatMap((leg) =>
    leg.steps.map((s) => ({
      name: s.name ?? '',
      ref: s.ref,
      distance: s.distance,
      coordinates: s.geometry.coordinates,
      maneuver: s.maneuver.type,
    })),
  );
  return { distance: r.distance, duration: r.duration, coordinates: r.geometry.coordinates, steps };
}

export async function fetchRoutes(
  from: LatLng,
  to: LatLng,
  opts: { baseUrl?: string; alternatives?: boolean; signal?: AbortSignal } = {},
): Promise<Route[]> {
  const base = opts.baseUrl ?? DEFAULT_OSRM_URL;
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url =
    `${base}/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&steps=true&alternatives=${opts.alternatives ?? true}`;
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Routing failed (HTTP ${res.status})`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error(json.message || 'No route found');
  return (json.routes as OsrmRoute[]).map(parseOsrmRoute);
}
