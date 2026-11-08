/**
 * Toll fare lookup.
 *
 * FareProvider is the seam: today fares come from the free Expressway.PH API
 * (unofficial, compiled from TRB matrices; "free for any use", CORS enabled,
 * 24h cacheable). You can swap in a provider backed by your own TRB-sourced
 * matrices without touching the route/plaza detection.
 */
import type { PricedSegment, TollSegment, VehicleClass } from './types.ts';

export interface FareQuote {
  fee: number | null;
  note?: string;
}

export interface FareProvider {
  quote(fareSystem: string, entry: string, exit: string, vehicleClass: VehicleClass): Promise<FareQuote>;
}

interface ApiSegment {
  expresswaySlug: string;
  entryPlaza: string;
  exitPlaza: string;
  toll: number;
}

/** Minimal Storage subset, so the cache works with localStorage or a test double. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class ExpresswayPhFareProvider implements FareProvider {
  private cache = new Map<string, Promise<FareQuote>>();

  /**
   * @param store optional persistent cache (e.g. localStorage). The API asks
   *   clients to cache for 24 h and rate-limits bursts, so this matters.
   */
  constructor(
    private baseUrl = 'https://www.expressway.ph/api/toll-calculator',
    private store?: KeyValueStore,
  ) {}

  quote(fareSystem: string, entry: string, exit: string, vehicleClass: VehicleClass): Promise<FareQuote> {
    if (entry === exit) return Promise.resolve({ fee: 0, note: 'Entry and exit are the same plaza' });
    const key = `fare:v1:${fareSystem}|${entry}|${exit}|${vehicleClass}`;
    let p = this.cache.get(key);
    if (p) return p;
    const stored = this.readStore(key);
    if (stored) {
      p = Promise.resolve(stored);
    } else {
      p = this.fetchQuote(fareSystem, entry, exit, vehicleClass).then((q) => {
        this.writeStore(key, q);
        return q;
      });
      p.catch(() => this.cache.delete(key));
    }
    this.cache.set(key, p);
    return p;
  }

  private readStore(key: string): FareQuote | null {
    try {
      const raw = this.store?.getItem(key);
      if (!raw) return null;
      const { at, quote } = JSON.parse(raw) as { at: number; quote: FareQuote };
      return Date.now() - at < DAY_MS ? quote : null;
    } catch {
      return null;
    }
  }

  private writeStore(key: string, quote: FareQuote): void {
    try {
      this.store?.setItem(key, JSON.stringify({ at: Date.now(), quote }));
    } catch {
      /* storage full or unavailable: memory cache still works */
    }
  }

  private async fetchQuote(fareSystem: string, entry: string, exit: string, vehicleClass: VehicleClass): Promise<FareQuote> {
    const u = new URL(this.baseUrl);
    u.searchParams.set('origin', entry);
    u.searchParams.set('dest', exit);
    u.searchParams.set('class', String(vehicleClass));
    const res = await fetch(u.toString());
    if (res.status === 404) return { fee: null, note: `No fare published for ${entry} → ${exit}` };
    if (res.status === 429) throw new Error('Fare service is busy (rate limited). Try again in a minute.');
    if (!res.ok) throw new Error(`Fare lookup failed (HTTP ${res.status})`);
    const json = (await res.json()) as { totalToll: number; segments: ApiSegment[] };
    const mine = json.segments.filter((s) => s.expresswaySlug === fareSystem);
    if (mine.length && mine.length === json.segments.length) return { fee: json.totalToll };
    if (mine.length) {
      return {
        fee: mine.reduce((a, s) => a + s.toll, 0),
        note: 'Fare API routed part of this trip over another expressway; only the matching part is counted',
      };
    }
    return { fee: null, note: `Fare API has no ${fareSystem} fare for ${entry} → ${exit}` };
  }
}

export interface TripPrice {
  segments: PricedSegment[];
  total: number;
  /** Sum per RFID wallet (Easytrip / Autosweep). */
  byRfid: Record<string, number>;
  /** True if any segment could not be priced. */
  incomplete: boolean;
}

export async function priceSegments(
  segments: TollSegment[],
  provider: FareProvider,
  vehicleClass: VehicleClass,
): Promise<TripPrice> {
  const priced = await Promise.all(
    segments.map(async (s): Promise<PricedSegment> => {
      if (!s.fareSystem) return { ...s, fee: null, note: 'No fare data for this expressway yet' };
      if (!s.entry || !s.exit) return { ...s, fee: null, note: 'Could not identify the entry or exit plaza' };
      try {
        const q = await provider.quote(s.fareSystem, s.entry.name, s.exit.name, vehicleClass);
        return { ...s, fee: q.fee, note: q.note };
      } catch (e) {
        return { ...s, fee: null, note: (e as Error).message };
      }
    }),
  );
  const byRfid: Record<string, number> = {};
  let total = 0;
  for (const s of priced) {
    if (s.fee == null) continue;
    total += s.fee;
    byRfid[s.rfid] = (byRfid[s.rfid] ?? 0) + s.fee;
  }
  return { segments: priced, total, byRfid, incomplete: priced.some((s) => s.fee == null) };
}
