/**
 * Philippine toll expressways.
 *
 * An *expressway* is a physical road we recognise in the router's step names.
 * A *fare system* is the unit the fare matrix is published for: one entry
 * plaza and one exit plaza inside the same fare system give one toll charge.
 * Several expressways can share a fare system (NLEX and SCTEX are priced on one
 * integrated matrix; the elevated Skyway shares the SLEX matrix).
 */

export type RfidSystem = 'easytrip' | 'autosweep';

export type ExpresswayId =
  | 'nlex'
  | 'sctex'
  | 'tplex'
  | 'nlex-connector'
  | 'harbor-link'
  | 'skyway'
  | 'skyway-stage-3'
  | 'slex'
  | 'star'
  | 'naiax'
  | 'cavitex'
  | 'cavitex-c5'
  | 'calax'
  | 'mcx'
  | 'cllex';

export interface Expressway {
  id: ExpresswayId;
  name: string;
  shortName: string;
  operator: string;
  rfid: RfidSystem;
  /** Fare system id (matches the Expressway.PH API `expresswaySlug`), or null when no fare data is available. */
  fareSystem: string | null;
  /** Map colour. */
  color: string;
  /** Matched against normalised router step names / refs. */
  namePatterns: RegExp[];
}

// Order matters: more specific patterns must come before broader ones
// (e.g. "NLEX Harbor Link" before "NLEX", "Skyway Stage 3" before "Skyway").
export const EXPRESSWAYS: Expressway[] = [
  {
    id: 'harbor-link',
    name: 'NLEX Harbor Link',
    shortName: 'Harbor Link',
    operator: 'NLEX Corporation (MPTC)',
    rfid: 'easytrip',
    fareSystem: 'harbor-link',
    color: '#0EA5E9',
    namePatterns: [/harbou?r link/],
  },
  {
    id: 'nlex-connector',
    name: 'NLEX Connector',
    shortName: 'NLEX Connector',
    operator: 'NLEX Corporation (MPTC)',
    rfid: 'easytrip',
    fareSystem: 'nlex-connector',
    color: '#6366F1',
    namePatterns: [/nlex[- ]?(slex )?connector/, /north luzon expressway connector/],
  },
  {
    id: 'sctex',
    name: 'Subic–Clark–Tarlac Expressway',
    shortName: 'SCTEX',
    operator: 'NLEX Corporation (MPTC)',
    rfid: 'easytrip',
    fareSystem: 'nlex',
    color: '#1D4ED8',
    namePatterns: [/subic-clark-tarlac/, /\bsctex\b/, /subic-tipo/, /clark spur/],
  },
  {
    id: 'tplex',
    name: 'Tarlac–Pangasinan–La Union Expressway',
    shortName: 'TPLEX',
    operator: 'Private Infra Dev Corp (SMC)',
    rfid: 'autosweep',
    fareSystem: 'tplex',
    color: '#F59E0B',
    namePatterns: [/tarlac-pangasinan-la union/, /\btplex\b/],
  },
  {
    id: 'cllex',
    name: 'Central Luzon Link Expressway',
    shortName: 'CLLEX',
    operator: 'DPWH',
    rfid: 'easytrip',
    fareSystem: null,
    color: '#64748B',
    namePatterns: [/central luzon link/, /\bcllex\b/],
  },
  {
    id: 'nlex',
    name: 'North Luzon Expressway',
    shortName: 'NLEX',
    operator: 'NLEX Corporation (MPTC)',
    rfid: 'easytrip',
    fareSystem: 'nlex',
    color: '#2563EB',
    namePatterns: [/north luzon expressway/, /\bnlex\b/],
  },
  {
    id: 'skyway-stage-3',
    name: 'Skyway Stage 3',
    shortName: 'Skyway 3',
    operator: 'SMC Tollways',
    rfid: 'autosweep',
    fareSystem: 'skyway-stage-3',
    color: '#8B5CF6',
    namePatterns: [/skyway (stage )?(3|iii)\b/],
  },
  {
    id: 'naiax',
    name: 'NAIA Expressway',
    shortName: 'NAIAX',
    operator: 'SMC Tollways',
    rfid: 'autosweep',
    fareSystem: 'naiax',
    color: '#EC4899',
    namePatterns: [/naia expressway/, /\bnaiax\b/],
  },
  {
    id: 'skyway',
    name: 'Metro Manila Skyway',
    shortName: 'Skyway',
    operator: 'SMC Tollways',
    rfid: 'autosweep',
    // The elevated Skyway (Stages 1 & 2) is priced on the SLEX matrix
    // ("Magallanes (Skyway)", "Buendia", ...).
    fareSystem: 'slex',
    color: '#A855F7',
    namePatterns: [/skyway/],
  },
  {
    id: 'mcx',
    name: 'Muntinlupa–Cavite Expressway',
    shortName: 'MCX',
    operator: 'Ayala Corp / MPTC',
    rfid: 'easytrip',
    fareSystem: null,
    color: '#64748B',
    namePatterns: [/muntinlupa-cavite/, /\bmcx\b/],
  },
  {
    id: 'slex',
    name: 'South Luzon Expressway',
    shortName: 'SLEX',
    operator: 'SMC Tollways',
    rfid: 'autosweep',
    fareSystem: 'slex',
    color: '#16A34A',
    namePatterns: [/south luzon expressway/, /\bslex\b/],
  },
  {
    id: 'star',
    name: 'STAR Tollway',
    shortName: 'STAR',
    operator: 'SMC Tollways',
    rfid: 'autosweep',
    fareSystem: 'star-tollway',
    color: '#DC2626',
    namePatterns: [/southern tagalog arterial/, /\bstar tollway\b/],
  },
  {
    id: 'cavitex-c5',
    name: 'CAVITEX–C5 Link',
    shortName: 'C5 Link',
    operator: 'CAVITEX Infrastructure Corp (MPTC)',
    rfid: 'easytrip',
    fareSystem: 'cavitex',
    color: '#14B8A6',
    namePatterns: [/c-?5 (south ?)?link/],
  },
  {
    id: 'cavitex',
    name: 'Manila–Cavite Expressway',
    shortName: 'CAVITEX',
    operator: 'CAVITEX Infrastructure Corp (MPTC)',
    rfid: 'easytrip',
    fareSystem: 'cavitex',
    color: '#0D9488',
    namePatterns: [/manila-cavite expressway/, /\bcavitex\b/],
  },
  {
    id: 'calax',
    name: 'Cavite–Laguna Expressway',
    shortName: 'CALAX',
    operator: 'MPCALA Holdings (MPTC)',
    rfid: 'easytrip',
    fareSystem: 'calax',
    color: '#EA580C',
    namePatterns: [/cavite-laguna expressway/, /\bcalax\b/],
  },
];

export const EXPRESSWAY_BY_ID: Record<ExpresswayId, Expressway> = Object.fromEntries(
  EXPRESSWAYS.map((e) => [e.id, e]),
) as Record<ExpresswayId, Expressway>;

/** Lower-case, unify the various dashes, collapse whitespace. */
export function normaliseRoadName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Which expressway (if any) a router step's road name belongs to. */
export function classifyRoad(name?: string | null, ref?: string | null): Expressway | null {
  const text = normaliseRoadName([name, ref].filter(Boolean).join(' '));
  if (!text) return null;
  // Service roads, access roads and link roads run beside expressways but are not tolled.
  if (/service road|access road|link road|frontage/.test(text)) return null;
  for (const e of EXPRESSWAYS) {
    if (e.namePatterns.some((p) => p.test(text))) return e;
  }
  return null;
}
