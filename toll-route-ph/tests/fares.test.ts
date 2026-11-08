import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpresswayPhFareProvider, priceSegments, type FareProvider } from '../src/core/fares.ts';
import type { PlazaRecord, TollSegment } from '../src/core/types.ts';

const plaza = (name: string): PlazaRecord => ({ name, expressways: ['nlex'], lat: 0, lng: 0, source: 'test' });
const seg = (fareSystem: string | null, entry: string | null, exit: string | null, rfid: 'easytrip' | 'autosweep'): TollSegment => ({
  fareSystem,
  expressways: ['nlex'],
  rfid,
  entry: entry ? plaza(entry) : null,
  exit: exit ? plaza(exit) : null,
  startOffset: 0,
  endOffset: 1000,
  coordinates: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('priceSegments', () => {
  const table: Record<string, number> = { 'nlex|Balintawak|Dau': 411, 'tplex|La Paz|Rosario/Baguio': 311 };
  const provider: FareProvider = {
    async quote(fs, a, b) {
      const fee = table[`${fs}|${a}|${b}`];
      return fee == null ? { fee: null, note: 'none' } : { fee };
    },
  };

  it('sums fees and splits by RFID wallet', async () => {
    const p = await priceSegments(
      [seg('nlex', 'Balintawak', 'Dau', 'easytrip'), seg('tplex', 'La Paz', 'Rosario/Baguio', 'autosweep')],
      provider,
      1,
    );
    expect(p.total).toBe(722);
    expect(p.byRfid).toEqual({ easytrip: 411, autosweep: 311 });
    expect(p.incomplete).toBe(false);
  });

  it('marks the trip incomplete when a segment has no fare system or plaza', async () => {
    const p = await priceSegments([seg(null, null, null, 'easytrip'), seg('nlex', 'Balintawak', null, 'easytrip')], provider, 1);
    expect(p.total).toBe(0);
    expect(p.incomplete).toBe(true);
    expect(p.segments.map((s) => s.fee)).toEqual([null, null]);
  });
});

describe('ExpresswayPhFareProvider', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('returns the total when the API prices the trip on the same fare system', async () => {
    const fetchMock = vi.fn(async () =>
      ok({ totalToll: 411, segments: [{ expresswaySlug: 'nlex', entryPlaza: 'Balintawak', exitPlaza: 'Dau', toll: 411 }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const p = new ExpresswayPhFareProvider();
    expect(await p.quote('nlex', 'Balintawak', 'Dau', 1)).toEqual({ fee: 411 });
    await p.quote('nlex', 'Balintawak', 'Dau', 1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // memoised
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('origin')).toBe('Balintawak');
    expect(url.searchParams.get('dest')).toBe('Dau');
    expect(url.searchParams.get('class')).toBe('1');
  });

  it('counts only the matching fare system when the API detours', async () => {
    vi.stubGlobal('fetch', async () =>
      ok({
        totalToll: 283,
        segments: [
          { expresswaySlug: 'nlex-connector', entryPlaza: 'España', exitPlaza: 'C-3 Road/5th Ave.', toll: 119 },
          { expresswaySlug: 'harbor-link', entryPlaza: 'C-3 Road/5th Ave.', exitPlaza: 'Karuhatan/Valenzuela', toll: 79 },
        ],
      }),
    );
    const q = await new ExpresswayPhFareProvider().quote('harbor-link', 'C-3 Road/5th Ave.', 'Karuhatan/Valenzuela', 1);
    expect(q.fee).toBe(79);
    expect(q.note).toMatch(/another expressway/);
  });

  it('treats an empty answer as unpriced, not free', async () => {
    vi.stubGlobal('fetch', async () => ok({ totalToll: 0, segments: [] }));
    expect((await new ExpresswayPhFareProvider().quote('tplex', 'Tarlac', 'La Paz', 1)).fee).toBeNull();
  });

  it('reports rate limiting clearly and does not cache the failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(ok({ totalToll: 86, segments: [{ expresswaySlug: 'star-tollway', entryPlaza: 'Calamba', exitPlaza: 'Lipa', toll: 86 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new ExpresswayPhFareProvider();
    await expect(p.quote('star-tollway', 'Calamba', 'Lipa', 1)).rejects.toThrow(/rate limited/);
    expect(await p.quote('star-tollway', 'Calamba', 'Lipa', 1)).toEqual({ fee: 86 });
  });

  it('serves repeat lookups from the persistent store for 24 h', async () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const fetchMock = vi.fn(async () =>
      ok({ totalToll: 40, segments: [{ expresswaySlug: 'nlex', entryPlaza: 'Dau', exitPlaza: 'Clark South', toll: 40 }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await new ExpresswayPhFareProvider(undefined, store).quote('nlex', 'Dau', 'Clark South', 1);
    const again = await new ExpresswayPhFareProvider(undefined, store).quote('nlex', 'Dau', 'Clark South', 1);
    expect(again).toEqual({ fee: 40 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
