# AEGIS API and provider reference

This reference separates three surfaces: the web application API, the durable operations API, and external public providers. It documents the source tree as implemented; it does not claim that an upstream is always available.

## Web application API

All routes below are relative to the deployed AEGIS origin.

| Method | Route | Purpose | Truth/availability boundary |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Web health, operating mode, provider summary and durable-service status | A successful response does not probe every upstream |
| `GET` | `/api/providers` | Configuration readiness for keyless services and persistence | Readiness is configuration state, not an uptime guarantee |
| `GET` | `/api/map-config` | Zero-cost map configuration | Contains no browser API secret |
| `GET` | `/api/geocode?q=...` | World search through Nominatim, direct coordinates and bounded fallback gazetteer | Public service may throttle; fallback results are labelled |
| `GET` | `/api/weather?lat=...&lon=...` | Open-Meteo current weather-model context | Not an on-site sensor observation |
| `GET` | `/api/terrain?lat=...&lon=...` | 7 × 7 Copernicus GLO-90 elevation context grid | Approximately 90 m regional context; not a surveyed DEM |
| `GET` | `/api/buildings?lat=...&lon=...&radius=...` | Bounded OSM building-footprint import through Overpass | Footprints/tags may be incomplete; unknown heights remain estimated |
| `GET` | `/api/routing?origin=lon,lat&destination=lon,lat&mode=...` | OSRM candidate road geometry | AEGIS performs separate time/mode hazard screening |
| `GET` | `/api/live` | Aggregated and normalised incident intelligence | Each record carries provider/source timestamps and status |
| `GET` | `/api/live/media?q=...&limit=...` | Open-media and source-link discovery | Results are contextual, not authenticated live cameras |
| `GET` | `/api/campus/eit` | EIT reference, current fidelity and missing authoritative inputs | Explicitly reports the non-BIM prototype boundary |
| `GET` | `/api/campus/eit/template` | Downloadable validated campus-import contract | Import requires provenance per record |
| `GET` | `/api/simulation/catalog` | Active/coming-soon hazard catalogue and model metadata | Active models are prototype planning tools |
| `POST` | `/api/simulation` | Validated deterministic scenario execution with optional evacuation, map layers and impact timeline | No hosted model call; responses are simulated |
| `POST` | `/api/evacuation` | Validated route, capacity, resource and staged-departure plan | Advisory only; no autonomous dispatch |
| `POST` | `/api/simulation/interventions` | Deterministic reverse-cascade intervention comparison | Benefit is comparative under supplied assumptions |
| `POST` | `/api/operations` | Structured operations brief grounded in supplied state | Current core source is `deterministic-engine` |
| `GET` | `/api/agent-activity?limit=...` | Agent activity records, storage state and provider readiness | No seeded records; list reflects actual executions available to this service |
| `POST` | `/api/agent-activity` | Grounded agent execution with attempt log, evidence and SHA-256 receipt | Deterministic first; hosted narrative optional; human approval pending by default |
| `PATCH` | `/api/agent-activity` | Approve/reject an existing receipt and create its next hash-linked revision | Records a human decision; it does not dispatch a real action |
| `GET/POST` | `/api/persistence` | Safe proxy to durable record, event and health routes | Returns a visible degraded state if the service is absent |

Simulation and operations bodies are size-bounded and schema-validated. Invalid input returns a structured 4xx response rather than being silently coerced into an operational result.

Agent Ledger persistence follows this order: Cloudflare D1 through `AEGIS_LEDGER_DB`, the versioned FastAPI operations store when configured, then a bounded runtime ledger. D1 stores immutable receipt-revision rows only; it is not the scenario database, PostGIS store, Redis cache or WebSocket event store. D1 reads recompute retained receipt digests and `previousDigest` links before reporting a chain as verified. A verified hash detects record modification; it is not a digital signature or proof that the evidence is true.

## Durable FastAPI operations API

The durable service is intended to sit behind nginx, not to be exposed as an unrestricted public development port.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health/live` | Process liveness |
| `GET` | `/health` | Database, cache, spatial and record health |
| `GET` | `/api/v1/records` | List versioned operational records by kind |
| `POST` | `/api/v1/records` | Create a validated operational record |
| `GET` | `/api/v1/records/{id}` | Retrieve a record |
| `PUT` | `/api/v1/records/{id}` | Update with version-conflict protection |
| `GET` | `/api/v1/records/{id}/versions` | Revision history |
| `GET` | `/api/v1/spatial-assets` | Bounded PostGIS asset query with optional WGS84 bounding box |
| `POST` | `/api/v1/spatial-assets` | Validate and upsert a geospatial asset |
| `GET` | `/api/v1/events` | Ordered audit events with sequence cursor |
| `GET` | `/api/v1/audit/receipt` | SHA-256 linked audit receipt |
| `WS` | `/api/v1/stream?after=...` | Snapshot, reconnect replay and live event stream |

Implemented service protections include strict validation, bounded payloads, request IDs, per-client rate limiting, structured errors, restricted CORS origins, WebSocket origin checks, replay limits and optimistic version conflicts. PostgreSQL/PostGIS is the deployment system of record; Redis is a disposable bounded cache. SQLite/no-cache remains a development fallback only.

## Active keyless providers

| Provider | Capability | Role in AEGIS | Important limitation |
| --- | --- | --- | --- |
| OpenFreeMap / OpenStreetMap | Primary vector basemap | Interactive world and local street/building context | Public tiles and source data can be incomplete, old or unavailable |
| CARTO Dark Matter | Independent basemap fallback | Automatic second provider | Also uses OSM-derived context; it is not satellite imagery |
| NASA Blue Marble / GIBS context | Low-zoom Earth imagery | Global visual context where configured by the renderer | Dated imagery, not live satellite |
| EOX Sentinel-2 cloudless | Low-zoom cloudless imagery context | Higher-detail Earth context under provider vectors | Composite imagery, not a current live view; attribution must remain visible |
| Public Terrarium elevation tiles | MapLibre terrain/hillshade | Global relief where available | Not survey-grade |
| Open-Meteo Elevation / Copernicus GLO-90 | Local elevation context | 7 × 7 regional grid for selected site | Approx. 90 m; not campus micro-topography |
| Nominatim | Geocoding | Search world places | Public usage policy and throttling apply |
| Overpass | OSM building import | Bounded local footprint query | Coverage/tags vary |
| OSRM | Candidate road geometry | Start/end road alternatives | AEGIS—not OSRM—screens hazard and capacity |
| Open-Meteo Forecast | Weather-model context | Temperature, precipitation and wind context | Not an on-site instrument |
| NASA EONET | Natural events | Source-labelled global incident context | Coverage and cadence vary |
| USGS | Earthquakes | Source-labelled earthquake parameters | Records may be revised |
| GDACS | Multi-hazard alerts | Source-labelled alerts and geometry | Alert level is not confirmed local damage |
| Google News RSS | Publisher-indexed headlines | Discovery of recent reporting | Verify the underlying publisher report |
| Wikimedia Commons | Keyless open media | Contextual image/video discovery | Verify date, place, uploader and licence |

## Optional adapters

- **ReliefWeb:** source code is present, but an account-bound application name is optional and not required by the zero-cost demo path.
- **YouTube Data API:** source code is present, but a key is optional. The UI must not show it as a required missing dependency.
- **Cloudflare Workers AI:** on the Cloudflare deployment, the bound `AI` service tries Cloudflare’s fast [`@cf/meta/llama-3.2-3b-instruct`](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/) first without an API key. Cloudflare’s current [Workers AI pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/) lists a 10,000-Neuron daily free allocation; quotas and terms can change, so the application logs failure and continues instead of treating this allocation as guaranteed.
- **Other external language models:** after Workers AI, the Agent Ledger can try one configured OpenAI-compatible provider and one independent Groq provider before returning the deterministic-only result. Hosted text is an optional explanatory layer only. Keep keys server-side and out of browser bundles, logs, Git history and exported workspaces. The deterministic simulation, evacuation and operations brief remain the numerical source of truth.

See `AI_AGENT_LEDGER.md` for the exact provider sequence, environment variables, receipt fields and judge flow.

## Evidence classes

| Class | Meaning | Example |
| --- | --- | --- |
| `OBSERVED` | Direct authoritative measurement or confirmed record with provenance | A provider-issued earthquake magnitude record |
| `IMPORTED` | External context brought into AEGIS | OSM footprint, GLO-90 elevation sample, publisher headline |
| `ESTIMATED` | Inferred or assumed planning input | Unknown building height, occupancy or local drainage proxy |
| `SIMULATED` | Deterministic result for explicit assumptions and seed | Flood depth, access state, evacuation coverage |

“Retrieved now” is a transport fact, not an evidence class. A current API response may contain a dated event.

## Secret-handling rules

1. Never place live credentials in source, `.env.example`, client-side JavaScript, exported workspaces, screenshots or judge notes.
2. Store optional provider keys only as server environment variables or deployment secrets.
3. Rotate any key ever pasted into a chat, screenshot, commit or shared archive.
4. Use provider-specific least-privilege keys and quotas where supported.
5. Do not route deterministic simulation through a paid or variable-latency model dependency.
