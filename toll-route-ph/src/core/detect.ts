/**
 * Turns a driving route into the list of toll transactions it implies:
 * which tolled expressways it uses, where it enters and leaves each fare
 * system, and the nearest named toll plaza at each of those points.
 *
 * Approach
 *  1. Label every route vertex with the expressway its step is on, from the
 *     router's road names (classifyRoad). Unnamed ramp steps get no label.
 *  2. Close short unlabelled gaps between two stretches of the same fare
 *     system (interchange ramps such as NLEX → SCTEX at Mabiga).
 *  3. Split the route into runs of one fare system. The run's first vertex is
 *     where the route merges onto the expressway; its last vertex is where it
 *     diverges onto the exit ramp (or hands over to the next fare system).
 *  4. Entry plaza = plaza on that expressway nearest to the run's start;
 *     exit plaza = plaza nearest to the run's end. If none is close (the
 *     expressway continues past the last published plaza, e.g. SLEX beyond
 *     Calamba, or the Subic–Tipo road before Tipo), fall back to the first /
 *     last plaza the run actually drives past.
 *  5. Runs whose entry and exit are the same plaza are dropped: no toll.
 */
import { classifyRoad, EXPRESSWAY_BY_ID, type Expressway, type ExpresswayId } from './expressways.ts';
import { haversine, nearestPointOnLine, toLatLng } from './geo.ts';
import type { PlazaRecord, Route, TollSegment } from './types.ts';

export interface LabeledPoint {
  coord: [number, number];
  /** Metres from the route origin. */
  along: number;
  /** Expressway of the route segment that starts at this vertex. */
  expressway: Expressway | null;
  /** True when the step has no road name (ramps, links). */
  ramp: boolean;
}

/**
 * OpenStreetMap names both the elevated Skyway (Stages 1–2, Buendia → Alabang)
 * and Skyway Stage 3 (Buendia → Balintawak) just "Skyway". Stage 3 is the part
 * north of the Buendia junction.
 */
export const SKYWAY_STAGE3_MIN_LAT = 14.5665;

/**
 * OSM names the Calamba → Sto. Tomas stretch "South Luzon Expressway", but its
 * toll is charged on the STAR matrix (Calamba → Sto. Tomas is a STAR fare).
 * Treat SLEX south of the Calamba interchange as STAR.
 */
export const SLEX_CALAMBA_LAT = 14.19;

/** Max length of an unlabelled ramp gap inside one fare system that we bridge. */
const MAX_GAP_M = 3000;
/** Runs shorter than this are ignored (router noise at junctions). */
const MIN_RUN_M = 300;
/** A plaza this close to the entry/exit point is taken as the entry/exit. */
const NEAR_PLAZA_M = 2500;
/** A plaza this close to the run's line counts as "driven past". */
const PASSED_PLAZA_M = 1000;
/** Plazas further than this from the entry/exit point are not trusted. */
const MAX_PLAZA_DISTANCE_M = 5000;

function refine(e: Expressway | null, coord: [number, number]): Expressway | null {
  if (e?.id === 'skyway' && coord[1] > SKYWAY_STAGE3_MIN_LAT) return EXPRESSWAY_BY_ID['skyway-stage-3'];
  if (e?.id === 'slex' && coord[1] < SLEX_CALAMBA_LAT) return EXPRESSWAY_BY_ID.star;
  return e;
}

const fareKey = (e: Expressway | null) => (e ? (e.fareSystem ?? `none:${e.id}`) : null);

export function labelRoute(route: Route): LabeledPoint[] {
  const pts: LabeledPoint[] = [];
  let along = 0;
  for (const step of route.steps) {
    const stepRoad = classifyRoad(step.name, step.ref);
    const ramp = !step.name && !step.ref;
    for (const c of step.coordinates) {
      const last = pts[pts.length - 1];
      const e = refine(stepRoad, c);
      if (last && last.coord[0] === c[0] && last.coord[1] === c[1]) {
        // Steps share their boundary vertex; it starts the new step's segment.
        last.expressway = e;
        last.ramp = ramp;
        continue;
      }
      if (last) along += haversine(toLatLng(last.coord), toLatLng(c));
      pts.push({ coord: c, along, expressway: e, ramp });
    }
  }
  bridgeGaps(pts);
  return pts;
}

/** Label short unnamed gaps between two stretches of the same fare system. */
function bridgeGaps(pts: LabeledPoint[]): void {
  let i = 0;
  while (i < pts.length) {
    if (pts[i].expressway || i === 0 || !pts[i - 1].expressway) {
      i++;
      continue;
    }
    const before = pts[i - 1].expressway!;
    let j = i;
    while (j < pts.length && !pts[j].expressway) j++;
    if (j < pts.length) {
      const after = pts[j].expressway!;
      const gap = pts[j].along - pts[i].along;
      const allRamps = pts.slice(i, j).every((p) => p.ramp);
      if (fareKey(before) === fareKey(after) && gap <= MAX_GAP_M && (allRamps || gap < 1000)) {
        for (let k = i; k < j; k++) pts[k].expressway = before;
      }
    }
    i = j;
  }
}

interface PlazaPick {
  plaza: PlazaRecord;
  /** Distance from the entry/exit point to the plaza, metres. */
  distance: number;
}

function pickPlaza(
  kind: 'entry' | 'exit',
  at: [number, number],
  runCoords: [number, number][],
  expressway: ExpresswayId,
  plazas: PlazaRecord[],
): PlazaPick | null {
  const candidates = plazas.filter((p) => p.expressways.includes(expressway));
  let nearest: PlazaPick | null = null;
  for (const p of candidates) {
    const d = haversine(toLatLng(at), p);
    if (!nearest || d < nearest.distance) nearest = { plaza: p, distance: d };
  }
  if (nearest && nearest.distance <= NEAR_PLAZA_M) return nearest;

  if (runCoords.length > 1) {
    const passed = candidates
      .map((p) => ({ p, n: nearestPointOnLine(p, runCoords) }))
      .filter((x) => x.n.distance <= PASSED_PLAZA_M)
      .sort((a, b) => a.n.along - b.n.along);
    const hit = kind === 'entry' ? passed[0] : passed[passed.length - 1];
    if (hit) return { plaza: hit.p, distance: haversine(toLatLng(at), hit.p) };
  }
  return nearest && nearest.distance <= MAX_PLAZA_DISTANCE_M ? nearest : null;
}

export function detectTollSegments(route: Route, plazas: PlazaRecord[]): TollSegment[] {
  const pts = labelRoute(route);
  const segments: TollSegment[] = [];

  let i = 0;
  while (i < pts.length) {
    const key = fareKey(pts[i].expressway);
    if (!key) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < pts.length && fareKey(pts[j + 1].expressway) === key) j++;
    // The run covers the segments starting at i..j, so it ends at vertex j+1.
    const end = Math.min(j + 1, pts.length - 1);
    const length = pts[end].along - pts[i].along;

    if (length >= MIN_RUN_M) {
      const roads: ExpresswayId[] = [];
      for (let k = i; k <= j; k++) {
        const id = pts[k].expressway!.id;
        if (roads[roads.length - 1] !== id) roads.push(id);
      }
      const firstRoad = pts[i].expressway!;
      const lastRoad = pts[j].expressway!;
      const coords = pts.slice(i, end + 1).map((p) => p.coord);
      const entry = pickPlaza('entry', pts[i].coord, coords, firstRoad.id, plazas);
      const exit = pickPlaza('exit', pts[end].coord, coords, lastRoad.id, plazas);
      const sameplaza = entry && exit && entry.plaza.name === exit.plaza.name;
      if (!sameplaza) segments.push({
        fareSystem: firstRoad.fareSystem,
        expressways: roads,
        rfid: firstRoad.rfid,
        entry: entry?.plaza ?? null,
        exit: exit?.plaza ?? null,
        entryDistance: entry?.distance,
        exitDistance: exit?.distance,
        startOffset: pts[i].along,
        endOffset: pts[end].along,
        coordinates: coords,
      });
    }
    i = j + 1;
  }
  return segments;
}
