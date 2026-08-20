# AEGIS

Adaptive Emergency Geospatial Intelligence & Simulation — a map-first emergency digital twin and single-operator decision-support system for CodeFusion 2K26.

AEGIS combines a rotating 3D world view, source-labelled incident intelligence, deterministic hazard simulation, time-specific consequence layers, evacuation and resource planning, what-if comparison, reverse-cascade intervention ranking, recovery/re-entry screening, and decision receipts. The active targets are the responsive web command center and Windows desktop wrapper. The phone app is documentation-only for now.

## Live deployment

- **AEGIS command center:** https://aegis-codefusion-2k26.guptashivaani233.workers.dev
- **Dedicated Agent Ledger:** https://aegis-agent-ledger-codefusion-2k26.guptashivaani233.workers.dev/agent-ledger
- **Main Worker version:** `e0b147fe-0219-4193-ad09-b402aa498170`
- **Ledger Worker version:** `4a840328-2982-4761-940b-95cb127c583b`

Cloudflare D1 is migrated and live for immutable Agent Ledger receipt revisions. Cross-deployment `GET`, `POST` and human-review `PATCH` were verified. D1 is the ledger store only; scenario history remains browser-local unless the separate FastAPI operations service is deployed.

## Zero-cost stack

- OpenFreeMap is the primary live MapLibre globe; CARTO Dark Matter is the independent automatic fallback.
- OpenStreetMap supplies world context, Overpass footprint imports, Nominatim search and OSRM road geometry.
- Public Terrarium/SRTM-derived Terrain-RGB tiles supply global terrain where available.
- NASA EONET, USGS, GDACS and Google News RSS provide current/recent source-labelled incident context.
- Open-Meteo provides weather-model context and a Copernicus GLO-90 elevation grid; it is not a campus survey.
- Wikimedia Commons provides keyless open-media search when relevant; publisher, official and search links remain available when it has no suitable result.
- The operations brief is deterministic and reads the current twin state. Cloudflare Workers AI can add a grounded narrative through the zero-secret `AI` binding using [`@cf/meta/llama-3.2-3b-instruct`](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/); compatible-provider and Groq paths are optional fallbacks.
- No paid model, card or API key is required for the core workflow. Cloudflare’s current [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) includes a daily free allocation, but external quotas and terms can change.

Public upstreams can throttle, revise or become unavailable. AEGIS exposes their status and never relabels a simulation, dated report, search link or ordinary video as a live sensor/camera.

## Development verification

Use Node.js 22 or newer from `E:\CodeFusion EIT Hackathon\AEGIS`:

```powershell
npm ci
npm run verify
npm run demo
```

This command is for a developer-owned local verification session. The published judge build is the HTTPS deployment above; no local server was used for the final public release handoff.

## Full local operations stack

Docker Compose packages the web frontend, FastAPI operations service, PostgreSQL/PostGIS, Redis and nginx:

```powershell
Copy-Item deployment\.env.example deployment\.env
# Replace every CHANGE_ME value in deployment\.env.
docker compose --env-file deployment\.env up --build -d
```

The backend provides versioned records, revisions, a hash-linked audit chain, PostGIS spatial assets, Redis response caching, health telemetry and replayable WebSocket events. The web app continues with local browser scenario history if the durable service is not running.

## Real EIT data

The site view uses the official contact-page map reference plus a bundled OpenStreetMap footprint subset. It is not a surveyed EIT BIM. At runtime, a public Copernicus GLO-90 grid supplies regional elevation context when available; it is not a surveyed campus DEM. Unknown building functions, heights without OSM levels, fine surface levels, drainage, occupancy and infrastructure dependencies remain estimated.

Open **Workspace → Campus data** to import a validated campus JSON file. The schema and provenance rules are in [docs/EIT_DATA_IMPORT.md](docs/EIT_DATA_IMPORT.md); a downloadable template is served at `/api/campus/eit/template`. AEGIS deliberately will not fabricate an exact college boundary, BIM, gates, drains or occupancy from missing records.

## Implemented hazard and decision capabilities

- Five executable plugins: flagship surface-water flood plus earthquake, wildfire, cyclone/surge and chemical-plume screening models.
- A shared deterministic seed, 120-minute timeline and reproducible what-if branches.
- Flood depth, arrival, rise/recession, velocity, surface, waterlines, internal-depth and affected-floor screens.
- Building, road, bridge, critical-facility, utility and population consequences by selected minute.
- Debris, contamination, sewage-overflow, erosion, smoke/surface-water and utility-failure secondary screens where applicable.
- Uncertainty envelopes, confidence layer, recovery priorities, re-entry holds and restoration actions.
- Time- and mode-specific passability for pedestrian, car, bus, ambulance and heavy rescue.
- Capacity-aware evacuation origins/destinations, alternatives, staged departures, resources, shelters, coverage gaps and human approval receipts.
- Imported OSRM candidates screened against active simulated consequence polygons before route styling.
- Scenario save/load/version history, bookmarks, annotations, named layouts, replay, JSON/CSV/print exports, measurement, layer search/presets/solo/threshold, comparison layouts, alerts, command palette and local audit history.

All hazard consequences and evacuation outcomes are prototype planning estimates. They are not observed damage, engineering certification, official closures, casualty predictions or evacuation orders. Casualty and economic-damage values remain disabled until authoritative methods and inputs are provided.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Judge brief](docs/JUDGE_BRIEF.md)
- [Agent Ledger](docs/AI_AGENT_LEDGER.md)
- [API and providers](docs/API_AND_PROVIDERS.md)
- [Data provenance](docs/DATA_PROVENANCE.md)
- [EIT authoritative-data import](docs/EIT_DATA_IMPORT.md)
- [Demo runbook](docs/DEMO_RUNBOOK.md)
- [Deployment handoff](docs/DEPLOYMENT_HANDOFF.md)
- [Windows and deferred mobile builds](docs/PLATFORM_BUILDS.md)
- [Completion ledger](COMPLETION.txt)

## Release verification snapshot

- Five deployed hazard requests returned HTTP 200 in `100–420 ms`, each with 25 timeline frames. Flood returned 41 route candidates in the accepted sample; other hazards can truthfully return zero routes when no destination remains feasible.
- A unique cold live-intelligence query completed in `4,559 ms` with three live sources, one degraded source and nine incidents; its immediate cached repeat completed in `169 ms`.
- Workers AI returned a grounded narrative in approximately `1.94 s`; D1 preserved the human-approved revision 2 and its receipt chain verified across the main and dedicated-ledger deployments.
- Backend tests passed `7/7`; opt-in public-feed tests passed `6/6`; `npm audit` reported zero vulnerabilities.
- Final canonical `npm run verify`: 64 tests total, 63 passed, zero failed and one intentional optional-network skip. Typecheck, lint and production build passed; the build reports only the documented large-chunk performance advisory.
- Source, unit, API and deployed HTTP acceptance are complete. The browser-control extension was unavailable, so the complete public visual judge flow at 1366 × 768 remains a manual Chrome/Lenovo LOQ check.

## Oracle Free Tier expansion

Deployment assets are ready under `deployment/`: nginx HTTP/HTTPS templates, Oracle Ubuntu bootstrap, Compose services, firewall baseline, health check, backup, update and rollback scripts. The live Cloudflare release does not include FastAPI, PostGIS, Redis or WebSocket replay. Creating that full durable Oracle stack, its public IP, DNS record and TLS certificate still requires the owner’s Oracle and domain access; no source code can substitute for those external credentials.
