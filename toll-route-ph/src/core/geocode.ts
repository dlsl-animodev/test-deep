import type { LatLng } from './types.ts';

/** Place search via Photon (OpenStreetMap data), biased to the Philippines. */
export interface Place extends LatLng {
  label: string;
  detail: string;
}

const PH_BBOX = '116.9,4.5,126.6,21.2';

export async function searchPlaces(query: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', query);
  u.searchParams.set('limit', '6');
  u.searchParams.set('bbox', PH_BBOX);
  if (near) {
    u.searchParams.set('lat', String(near.lat));
    u.searchParams.set('lon', String(near.lng));
  }
  const res = await fetch(u.toString(), { signal });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const json = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
  };
  return json.features.map((f) => {
    const p = f.properties;
    const detail = [p.street, p.district, p.city, p.state].filter(Boolean).join(', ');
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: p.name ?? detail, detail };
  });
}
