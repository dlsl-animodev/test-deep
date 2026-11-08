/**
 * Master list of toll plazas, keyed by the exact plaza name the fare API expects.
 *
 * `expressways` says which physical road(s) the plaza sits on (used to pick the
 * entry/exit plaza for a stretch of route). `geocode` is the search string used
 * by scripts/geocode-plazas.ts to find the interchange on OpenStreetMap.
 *
 * Names follow the Expressway.PH toll matrices (which follow TRB matrices).
 */
import type { ExpresswayId } from '../src/core/expressways.ts';

export interface PlazaSeed {
  name: string;
  expressways: ExpresswayId[];
  geocode?: string;
}

/** Plaza names repeat across expressways (e.g. Balintawak), so key by name + roads. */
export const plazaKey = (p: { name: string; expressways: readonly string[] }) => `${p.name}|${p.expressways.join(',')}`;

const p = (name: string, expressways: ExpresswayId[], geocode?: string): PlazaSeed => ({
  name,
  expressways,
  geocode,
});

export const PLAZA_SEEDS: PlazaSeed[] = [
  // NLEX (Balintawak – Sta. Ines)
  p('Balintawak', ['nlex']),
  p('Mindanao Ave.', ['nlex'], 'Mindanao Avenue'),
  p('Karuhatan', ['nlex']),
  p('Valenzuela', ['nlex']),
  p('Meycauayan', ['nlex']),
  p('Marilao', ['nlex']),
  p('Ciudad de Victoria', ['nlex']),
  p('Bocaue', ['nlex']),
  p('Tambubong', ['nlex']),
  p('Balagtas', ['nlex']),
  p('Tabang', ['nlex']),
  p('Sta. Rita', ['nlex'], 'Santa Rita'),
  p('Pulilan', ['nlex']),
  p('San Simon', ['nlex']),
  p('San Fernando', ['nlex']),
  p('Mexico', ['nlex']),
  p('Angeles', ['nlex']),
  p('Dau', ['nlex']),
  p('Sta. Ines', ['nlex'], 'Santa Ines'),
  p('Mabalacat (Mabiga)', ['nlex', 'sctex'], 'Mabiga'),
  // SCTEX (priced on the NLEX matrix)
  p('Tipo/Subic', ['sctex'], 'Tipo'),
  p('Dinalupihan', ['sctex']),
  p('Floridablanca', ['sctex']),
  p('Porac', ['sctex']),
  p('Clark South', ['sctex']),
  p('Clark North', ['sctex']),
  p('Dolores', ['sctex']),
  p('Bamban/New Clark City', ['sctex'], 'New Clark City'),
  p('Concepcion', ['sctex']),
  p('Hacienda Luisita', ['sctex'], 'Luisita'),
  p('Tarlac', ['sctex']),
  // TPLEX
  p('La Paz', ['tplex']),
  p('Victoria', ['tplex']),
  p('Gerona', ['tplex']),
  p('Paniqui', ['tplex']),
  p('Moncada', ['tplex']),
  p('Carmen', ['tplex']),
  p('Urdaneta', ['tplex']),
  p('Binalonan', ['tplex']),
  p('Pozorrubbio', ['tplex'], 'Pozorrubio'),
  p('Sison', ['tplex']),
  p('Rosario/Baguio', ['tplex'], 'Rosario'),
  // NLEX Connector
  p('España', ['nlex-connector'], 'Espana'),
  p('Magsaysay', ['nlex-connector']),
  p('C-3 Road/5th Ave.', ['nlex-connector', 'harbor-link'], '5th Avenue'),
  // NLEX Harbor Link
  p('Karuhatan/Valenzuela', ['harbor-link'], 'Karuhatan'),
  p('Malabon/Dagat-Dagatan', ['harbor-link'], 'Dagat-Dagatan'),
  p('R-10/Port of Manila', ['harbor-link'], 'R-10'),
  p('Harbor Link Interchange', ['harbor-link', 'nlex'], 'Harbor Link'),
  // Skyway Stage 3
  // Skyway 3's Balintawak entry is at A. Bonifacio Ave., ~3 km south of the NLEX Balintawak plaza.
  p('Balintawak', ['skyway-stage-3'], 'A. Bonifacio'),
  p('Buendia', ['skyway-stage-3', 'skyway']),
  p('Quirino', ['skyway-stage-3']),
  p('Plaza Dilao', ['skyway-stage-3']),
  p('Nagtahan', ['skyway-stage-3']),
  p('E. Rodriguez', ['skyway-stage-3']),
  p('Quezon Ave.', ['skyway-stage-3'], 'Quezon Avenue'),
  // SLEX + elevated Skyway (one fare system)
  p('Magallanes', ['slex']),
  p('Magallanes (Skyway)', ['skyway'], 'Magallanes'),
  p('C-5', ['slex', 'skyway'], 'C-5'),
  p('Amorsolo', ['skyway']),
  p('Bicutan', ['slex', 'skyway']),
  p('NAIAX', ['slex', 'skyway'], 'NAIA Expressway'),
  p('Sucat', ['slex', 'skyway']),
  p('Alabang', ['slex', 'skyway']),
  p('Filinvest', ['slex']),
  p('MCX', ['slex'], 'Muntinlupa-Cavite Expressway'),
  p('Susana Heights', ['slex']),
  p('San Pedro', ['slex']),
  p('Southwoods', ['slex']),
  p('Carmona', ['slex']),
  p('Mamplasan', ['slex']),
  p('Sta. Rosa', ['slex'], 'Santa Rosa'),
  p('ABI/Greenfield', ['slex'], 'Eton City'),
  p('Cabuyao', ['slex']),
  p('Silangan', ['slex']),
  p('Calamba', ['slex', 'star']),
  p('Merville', ['skyway']),
  p('Don Bosco', ['skyway']),
  // STAR Tollway
  p('Sto. Tomas', ['star'], 'Santo Tomas'),
  p('Tanauan', ['star']),
  p('Malvar', ['star']),
  p('Sto. Toribio', ['star'], 'Santo Toribio'),
  p('Lipa', ['star']),
  p('Ibaan', ['star']),
  p('Batangas', ['star']),
  // NAIAX
  p('Skyway', ['naiax']),
  p('Andrews Ave./Terminal 3', ['naiax'], 'Andrews Avenue'),
  p('Aurora Blvd. (Tramo)', ['naiax'], 'Tramo'),
  p('NAIA Terminal 1', ['naiax'], 'Terminal 1'),
  p('NAIA Terminal 2', ['naiax'], 'Terminal 2'),
  p('NAIA Terminal 3', ['naiax'], 'Terminal 3'),
  p('Entertainment City', ['naiax']),
  p('Macapagal Blvd.', ['naiax'], 'Macapagal'),
  p('CAVITEX', ['naiax']),
  // CAVITEX
  p('Parañaque', ['cavitex'], 'Paranaque'),
  p('Bacoor/Zapote', ['cavitex'], 'Zapote'),
  p('Kawit', ['cavitex']),
  p('Sucat Rd./Dr. A. Santos Ave.', ['cavitex-c5'], 'Dr. A. Santos'),
  p('C5 Rd. Ext./C.P. Garcia', ['cavitex-c5'], 'C.P. Garcia'),
  // CALAX
  p('Greenfield', ['calax']),
  p('Technopark', ['calax']),
  p('Laguna Blvd.', ['calax'], 'Laguna Boulevard'),
  p('Sta. Rosa/Tagaytay', ['calax'], 'Santa Rosa-Tagaytay'),
  p('Silang East', ['calax']),
  p('Silang Interchange', ['calax'], 'Silang'),
];
