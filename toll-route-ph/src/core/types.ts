import type { ExpresswayId, RfidSystem } from './expressways.ts';

export type LatLng = { lat: number; lng: number };

/** A toll plaza / interchange with a known map position. */
export interface PlazaRecord {
  /** Exact plaza name used by the fare matrix / fare API. */
  name: string;
  expressways: ExpresswayId[];
  lat: number;
  lng: number;
  /** Where the coordinates came from: osm-junction, osm-toll-booth, osm-search, manual. */
  source: string;
  osmName?: string;
}

export type VehicleClass = 1 | 2 | 3;

/** One step of a driving route, as returned by the router. */
export interface RouteStep {
  name: string;
  ref?: string;
  distance: number;
  /** [lng, lat] pairs, GeoJSON order. */
  coordinates: [number, number][];
  maneuver: string;
}

export interface Route {
  distance: number;
  duration: number;
  coordinates: [number, number][];
  steps: RouteStep[];
}

/** A stretch of the route that is charged as one toll transaction. */
export interface TollSegment {
  fareSystem: string | null;
  /** Expressways driven within this segment, in order, e.g. ['nlex', 'sctex']. */
  expressways: ExpresswayId[];
  rfid: RfidSystem;
  entry: PlazaRecord | null;
  exit: PlazaRecord | null;
  /** Where on the route the segment starts and ends (metres from origin). */
  startOffset: number;
  endOffset: number;
  /** Route coordinates of the segment, [lng, lat]. */
  coordinates: [number, number][];
  /** Distance from the route point to the chosen plaza (metres), for confidence. */
  entryDistance?: number;
  exitDistance?: number;
}

export interface PricedSegment extends TollSegment {
  fee: number | null;
  /** Why a fee is missing, when it is. */
  note?: string;
}
