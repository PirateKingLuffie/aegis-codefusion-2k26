# Data provenance and truth policy

Every visible AEGIS fact is classified as **OBSERVED**, **IMPORTED**, **ESTIMATED** or **SIMULATED**. “Retrieved now” does not mean “happening live,” and a current basemap is not live imagery.

| Source | Use | Key | Limitation |
|---|---|---|---|
| OpenFreeMap / CARTO / OpenStreetMap | World base context and available vector buildings | None | Map data can be incomplete or old |
| EOX Sentinel-2 cloudless 2020 | Low-zoom cloudless Earth imagery context | None | Dated composite imagery; not a live satellite view; attribution/licence remains visible |
| NASA EOSDIS GIBS Blue Marble | Low-zoom Earth imagery fallback/context | None | Dated visual context; not a live satellite view |
| Public Terrarium / SRTM-derived tiles | Global terrain relief | None | Not survey-grade terrain; source resolution and age vary |
| Overpass / Nominatim / OSRM | Footprints, search and road candidates | None | Public services can throttle; OSRM geometry is screened by AEGIS before route styling |
| Open-Meteo Forecast | Weather-model context | None | Not an on-site sensor observation |
| Open-Meteo Elevation API / Copernicus GLO-90 | A 7 x 7 public elevation context grid around the selected EIT reference | None | Approximately 90 m source resolution; point samples are not a surveyed campus DEM, floor level, drain survey or engineering grade |
| NASA EONET | Natural-event records | None | Cadence and coverage vary |
| USGS | Significant earthquake feed | None | Event parameters may be revised |
| GDACS | Official multi-hazard alert/event geometry | None | Early-warning alert levels are not confirmed local damage |
| Google News RSS | Publisher-indexed headline metadata | None | Open the underlying report and verify it |
| Wikimedia Commons | Keyless open-media search | None | Open media is not a verified live camera; confirm date, place, uploader and licence |
| Official/publisher/search links | Evidence discovery | None | A link is not authenticated footage |

ReliefWeb and YouTube Data adapters remain optional source code but are not required or shown as missing in the zero-cost UI. Without their account-bound identifiers, AEGIS uses official feeds, open-media results and safe links.

The separate Agent Ledger may use an optional hosted language model for a constrained narrative. The deterministic AEGIS finding remains the numerical source; hosted text is logged as model-authored, every provider attempt is visible, and operator-supplied evidence remains unverified unless independently confirmed. A SHA-256 receipt detects record changes but does not establish that an external claim is true.

## EIT

The institute name, address, reported campus area and contact-page map reference are documented in `datasets/faridabad/eit-authoritative-manifest.json`. The active geometry is a nearby OSM footprint subset; it does not establish a complete campus boundary or building ownership. When the public elevation request succeeds, AEGIS replaces its bundled terrain fallback with a 7 x 7 Copernicus GLO-90 context grid around that reference. The samples remain imported regional elevation context, not a surveyed campus DEM. Building heights without OSM levels, unknown functions, fine surface slopes, drains, occupancy and dependencies remain estimated. See `docs/EIT_DATA_IMPORT.md` for the verified replacement path.

## Simulation

Hazard depth/intensity, damaged-building state, road passability, utility effects, exposed population, evacuation coverage, secondary consequences, intervention benefit and recovery timing are deterministic prototype results. They are not measurements, structural inspections, official closures, confirmed casualties or forecasts.

Observed casualty counts are `null` for a rehearsal. AEGIS never derives them from exposure. Economic damage is `null` until verified asset values and validated damage curves exist.

## Media verification

Before treating any footage as operational evidence, verify the original publisher/owner, capture time, geolocation and direction, whether it is actually live, edits, reuse/embedding rights and independent/official corroboration. Otherwise display it only as contextual open media or a source link.

## Provider status

- **LIVE:** fresh metadata retrieval succeeded; it does not certify a currently occurring camera view.
- **CACHED:** a dated source-backed response with original timestamps.
- **DEGRADED/UNAVAILABLE:** the upstream failed, throttled or timed out.
- **IMPORTED:** external context brought into AEGIS with provenance.
- **ESTIMATED:** an inferred input with stated confidence/limits.
- **SIMULATED:** deterministic AEGIS output for explicit assumptions and seed.
