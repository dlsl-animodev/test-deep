# Toll Route PH

Pick a start and a destination (search, tap the map, or use your location). The app routes the drive, lists every **toll entry and exit plaza** on the route, and prices each expressway stretch for Class 1, 2 or 3 vehicles. It covers NLEX, SCTEX, TPLEX, Skyway (elevated and Stage 3), SLEX, STAR, NAIAX, CAVITEX (incl. C5 Link), CALAX, NLEX Connector and NLEX Harbor Link. MCX and CLLEX are detected but have no fare data yet.

Example, Cubao → Baguio, Class 1:

| # | Expressway | RFID | Enter | Exit | Fee |
|---|---|---|---|---|---|
| 1 | NLEX → SCTEX | Easytrip | Balintawak | Tarlac | ₱670 |
| 2 | TPLEX | Autosweep | La Paz | Rosario/Baguio | ₱311 |
| | | | | **Total** | **₱981** (Easytrip ₱670, Autosweep ₱311) |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests on recorded routes, no network needed
npm run build      # static site in dist/, deploy anywhere (Netlify, Vercel, GitHub Pages)
```

Routes can be shared by URL: `?from=14.6195,121.0537&to=16.4023,120.5960&class=2`.

## How it works

```
from/to ──► router (OSRM) ──► route + road name per step
                                    │
                 src/core/detect.ts │ 1. label each point with its expressway (by road name)
                                    │ 2. bridge unnamed ramps inside one fare system (NLEX→SCTEX at Mabiga)
                                    │ 3. split into runs, one per fare system
                                    │ 4. entry = nearest plaza to where the run starts,
                                    │    exit  = nearest plaza to where it ends
                                    ▼
                  toll segments: [NLEX+SCTEX Balintawak→Tarlac] [TPLEX La Paz→Rosario]
                                    │
                  src/core/fares.ts │ fare per segment (Expressway.PH API, cached 24 h)
                                    ▼
                  total, per-segment fee, Easytrip vs Autosweep subtotals
```

A **fare system** is one fare matrix, so each segment is one toll charge. NLEX and SCTEX share one matrix, and so do the elevated Skyway and SLEX. Skyway Stage 3, STAR, TPLEX and the rest each have their own.

OpenStreetMap quirks the detector handles:

- **"Skyway" covers two systems.** OSM calls both the elevated Skyway and Skyway Stage 3 just "Skyway". Points north of the Buendia junction are treated as Stage 3.
- **Calamba to Sto. Tomas.** OSM labels this stretch SLEX, but it is charged on the STAR matrix (Calamba → Sto. Tomas is a ₱34 STAR fare). It is counted as STAR.
- **No plaza near the merge point.** This happens with the Subic–Tipo road before Tipo and with SLEX past Calamba. The detector then uses the first or last plaza the route actually drives past.
- **Same plaza in and out.** A stretch whose entry and exit are the same plaza is dropped, since no toll is charged.

## Project layout

| Path | What |
|---|---|
| `src/main.ts`, `src/style.css`, `index.html` | UI: Leaflet map, search, route tabs, toll breakdown |
| `src/core/expressways.ts` | Expressways, operators, RFID system, fare system, road-name patterns |
| `src/core/detect.ts` | Route → toll segments (entry/exit plazas) |
| `src/core/fares.ts` | `FareProvider` interface + Expressway.PH implementation, pricing |
| `src/core/routing.ts`, `geocode.ts`, `geo.ts` | OSRM client, Photon place search, geometry helpers |
| `src/data/plazas.json` | 105 toll plaza records with coordinates |
| `scripts/plaza-list.ts` | Master plaza list (names must match the fare matrix exactly) |
| `scripts/geocode-plazas.ts`, `fill-missing.ts` | Rebuild plaza coordinates from OpenStreetMap |
| `scripts/check-plaza-names.ts` | Check every plaza name against the fare API (`npm run check-names`) |
| `tests/` | Vitest suites; `tests/fixtures/` are recorded OSRM routes |

## Data sources and their limits

| Need | Source | Caveat |
|---|---|---|
| Fares | [Expressway.PH API](https://www.expressway.ph/developers), free, CORS, no key | Unofficial (one developer, compiled from TRB matrices, no SLA). Rate-limits bursts even though the docs say "no rate limits", so fares are cached 24 h in `localStorage` and fetched one by one. |
| Official fares | [Toll Regulatory Board](https://trb.gov.ph) matrices | Web pages only, no API, and they block automated access. |
| Routing | [OSRM public demo server](https://project-osrm.org) | Fine for development only (fair-use policy, no uptime guarantee). It tends to avoid Skyway Stage 3, where a local driver might take it. |
| Search | [Photon](https://photon.komoot.io) (OpenStreetMap) | Free public instance, fair use. |
| Plaza positions | OpenStreetMap interchanges | 75 of 105 come from OSM junction, toll-plaza or route data. **30 are approximate** (`source: approx-snapped` / `manual-approx` in `plazas.json`; the UI flags them), mostly TPLEX middle exits, Harbor Link, NAIAX and CAVITEX. |

There is no official toll API from NLEX/MPTC (Easytrip), SMC Tollways (Autosweep) or the TRB. "One RFID" is a payment arrangement and exposes no API. Google's Routes API does not price Philippine tolls (it has no PH toll passes).

## Before you rely on it

1. **Fix the approximate plazas.** Open `src/data/plazas.json`, correct `lat`/`lng`, and set `"source": "manual"` so the scripts never overwrite it. Then run `npm test` and `npm run check-names`.
2. **Own the fare data.** Implement `FareProvider` over your own TRB-sourced matrices (`{fareSystem: {entry: {exit: [c1, c2, c3]}}}`), and keep Expressway.PH as a fallback or a cross-check. Rates change at least yearly (NLEX 20 Jan 2026, SLEX/Skyway 15 Jan 2026).
3. **Use a production router.** Self-host OSRM or GraphHopper with the Philippines extract from Geofabrik, or use a commercial router that returns road names per step. Only `routing.ts` changes.
4. **Phone app.** The UI already works as a mobile web app. Wrap it with Capacitor, or port `src/core/` (plain TypeScript, no DOM) into React Native.

## Known gaps

- MCX and CLLEX have no fare data.
- Some plazas are exit-only in one direction in the fare data (e.g. Merville, NAIA Terminal 3). The app shows "No fare published" for those pairs.
- Entry detection uses the point where the route merges onto the expressway, so two plazas a few hundred metres apart (Bocaue/Tambubong) can be confused.
- Discounts, promos and RFID-only lanes are not modelled. Fees are the published cash/RFID rates.
