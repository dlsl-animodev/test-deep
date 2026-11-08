import type { LatLng } from './types.ts';

const R = 6371008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const toLatLng = ([lng, lat]: [number, number]): LatLng => ({ lat, lng });

/** Cumulative distance (metres) at each vertex of a [lng, lat] polyline. */
export function cumulativeDistances(coords: [number, number][]): number[] {
  const out = new Array<number>(coords.length);
  let acc = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) acc += haversine(toLatLng(coords[i - 1]), toLatLng(coords[i]));
    out[i] = acc;
  }
  return out;
}

export interface NearestResult {
  point: LatLng;
  /** Distance from the query point to the line, metres. */
  distance: number;
  /** Index of the segment start vertex. */
  index: number;
  /** Distance along the line from its first vertex, metres. */
  along: number;
}

/**
 * Closest point on a [lng, lat] polyline. Uses a local equirectangular
 * projection per segment, which is accurate to well under a metre at the
 * scale of road segments.
 */
export function nearestPointOnLine(p: LatLng, coords: [number, number][]): NearestResult {
  let best: NearestResult = { point: toLatLng(coords[0]), distance: Infinity, index: 0, along: 0 };
  let acc = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = toLatLng(coords[i]);
    const b = toLatLng(coords[i + 1]);
    const kx = Math.cos(rad((a.lat + b.lat) / 2)) * rad(1) * R;
    const ky = rad(1) * R;
    const bx = (b.lng - a.lng) * kx;
    const by = (b.lat - a.lat) * ky;
    const px = (p.lng - a.lng) * kx;
    const py = (p.lat - a.lat) * ky;
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const dx = px - t * bx;
    const dy = py - t * by;
    const d = Math.sqrt(dx * dx + dy * dy);
    const segLen = Math.sqrt(len2);
    if (d < best.distance) {
      best = {
        point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) },
        distance: d,
        index: i,
        along: acc + t * segLen,
      };
    }
    acc += segLen;
  }
  if (coords.length === 1) best.distance = haversine(p, best.point);
  return best;
}
