# AEGIS judge brief

## Identity

- **Project:** AEGIS — Adaptive Emergency Geospatial Intelligence & Simulation
- **Event:** CodeFusion 2K26
- **Team:** X
- **Team lead:** Sankalp Gupta
- **Institution:** Echelon Institute of Technology, Faridabad
- **Active deliverables:** responsive web command center and Windows desktop shell
- **Deferred scope:** phone application is documented, not presented as a completed build
- **Live command center:** https://aegis-codefusion-2k26.guptashivaani233.workers.dev
- **Dedicated Agent Ledger:** https://aegis-agent-ledger-codefusion-2k26.guptashivaani233.workers.dev/agent-ledger

## Match to the event judging criteria

The current [CodeFusion 2K26 event listing](https://api.unstop.com/hackathons/codefusion-2k26-echelon-institute-of-technology-faridabad-1678346) identifies the Echelon Institute of Technology, Faridabad venue, a two-to-five-person team format and these judging dimensions. The live proof below is deliberately organised around them.

| Criterion | Evidence to demonstrate |
| --- | --- |
| Innovation | One evidence-to-consequence-to-action loop; time-aware routing; reverse-cascade intervention ranking; inspectable Agent Ledger |
| Technical implementation | Interactive MapLibre globe/local 3D, deterministic five-hazard engine, impact layers, evacuation constraints, server routes and versioned audit path |
| Feasibility | Zero-paid-key core, graceful provider degradation, Cloudflare public target, browser continuity and Oracle durable-stack handoff |
| Impact | Faster comparison of access, shelter, facility, utility and recovery options while preserving human authority |
| Overall presentation | Six-minute end-to-end proof with explicit evidence classes, visible limitations and a repeatable backup path |

## The one-line pitch

**AEGIS turns fragmented disaster signals into a time-specific, explainable and operator-approved action plan on one geospatial command surface.**

## Thirty-second opening

> During a disaster, the hard problem is not seeing another red dot on a map. It is deciding what that dot means for buildings, roads, utilities, shelters and people over the next few minutes—and changing the response before access fails. AEGIS joins source-labelled global intelligence, a selectable 3D operating area, deterministic multi-hazard simulation, consequence analysis and capacity-aware evacuation in one command center. Every number remains labelled as observed, imported, estimated or simulated, and every operational recommendation stays under human approval.

## Ninety-second pitch

> Emergency teams commonly move between alert feeds, maps, weather pages, spreadsheets and route planners. Those tools show pieces of the situation, but they rarely preserve a single chain from evidence to consequence to action.
>
> AEGIS closes that chain. The operator starts on a rotating interactive world globe, searches any location or selects a source-labelled incident, and creates a reproducible 120-minute planning scenario. Five executable hazard plugins—flood, earthquake, wildfire, cyclone and chemical release—translate assumptions into time-specific effects. The flagship flood model shows rise, peak and recession; external and internal water depth; building waterlines and affected floors; road and facility access; secondary consequences; uncertainty; and recovery screens.
>
> The same state then drives evacuation. Routes are checked at the minute the traveller is expected to reach each road, with different restrictions for pedestrians, cars, buses, ambulances and heavy rescue. Capacity, staged departures, remaining demand and isolated zones remain visible. AEGIS also compares what-if branches, ranks screened interventions by downstream benefit and records operator approval as a decision receipt.
>
> The distinction matters: AEGIS does not pretend a simulation is a live observation. It makes assumptions visible, keeps the numerical engine deterministic and uses AI only as an explainable operator interface—not as an untraceable source of disaster facts.

## The problem in one sentence

Current emergency workflows are fragmented: they can show where an event is, but not consistently connect **what is known** to **what may fail next**, **who is affected**, **which route remains usable at the required time**, and **which action protects the most downstream systems**.

## What AEGIS does

1. **Detect and contextualise:** aggregate source-labelled disaster feeds, weather-model context, open map data and media links.
2. **Select:** search anywhere in the world, click the globe, or convert an imported incident into a scenario.
3. **Simulate:** run a deterministic 120-minute hazard branch with an explicit seed and model limitations.
4. **Explain impact:** show time-specific effects on structures, access, facilities, utilities and population planning envelopes.
5. **Plan movement:** screen routes by hazard arrival time, movement mode, throughput and destination capacity.
6. **Compare interventions:** run contained, baseline and severe branches and rank interventions by downstream protection.
7. **Govern the decision:** require operator approval, preserve receipts, version scenarios and export classified evidence.

## Why it is more than a simulator

| A conventional simulator | AEGIS |
| --- | --- |
| Ends with an animated hazard surface | Continues into consequences, evacuation, resource staging, intervention ranking and recovery |
| Shows one intensity value | Evaluates the selected minute, arrival, peak, recession and access at route-arrival time |
| Treats roads as static lines | Screens each road by time and movement mode, then recomputes alternatives |
| Optimises only travel distance or time | Includes capacity, staged demand, exposure, closures and isolated zones |
| Produces a result without governance | Requires human approval and creates a decision receipt and audit event |
| Mixes source data and model output | Labels evidence as **OBSERVED**, **IMPORTED**, **ESTIMATED** or **SIMULATED** |
| Hides uncertainty | Exposes confidence, uncertainty envelopes, missing inputs and model limits |

## Five executable hazard demonstrations

| Plugin | What AEGIS shows | Honest boundary |
| --- | --- | --- |
| Urban and river flood | Depth, velocity, arrival/peak/recession, building waterline/internal depth, floors, access and evacuation capacity | Flagship deterministic surface-water model; not a calibrated 2D hydraulic solver |
| Earthquake infrastructure cascade | MMI, PGA, soil/liquefaction proxy, structure/access screening and downstream facility effects | No fault-rupture geometry, local ground-motion calibration or structural inspection |
| Wildfire propagation | Arrival, fireline intensity, flame length, smoke/visibility and route exposure | No live fuel-moisture, suppression or calibrated operational fire-behaviour model |
| Cyclone and surge | Track-relative wind, rainfall, gust, debris, surface-water/surge proxy and utility exposure | No atmospheric forecast; coastal surge needs bathymetry, and EIT surge is explicitly a low-point proxy |
| Industrial chemical plume | Plume arrival, outdoor concentration, toxicity-threshold ratio, exposure and shelter/evacuate screening | Gaussian planning proxy; no CFD, reactive chemistry, verified indoor infiltration or material-specific doctrine |

## What is technically distinctive

1. **Incident-to-scenario continuity.** A source-labelled world event can become a planning scenario without being relabelled as observed local damage.
2. **One state across the full decision loop.** Map layers, impact metrics, routes, resources, comparison branches, recovery and decision briefs all read the same selected minute and scenario seed.
3. **Time-aware evacuation.** A route segment is screened at its estimated traversal minute rather than only against the hazard at departure.
4. **Mode-aware access.** Pedestrian, car, bus, ambulance and heavy-rescue restrictions are evaluated separately.
5. **Reverse-cascade analysis.** AEGIS asks which feasible intervention protects the largest set of dependent roads, facilities, utilities and response functions.
6. **Truth-preserving interface.** Provenance and evidence class are product features, not footnotes.
7. **Verified-data replacement path.** OpenStreetMap footprints and estimated attributes can be replaced by a validated campus dataset without changing the user workflow.
8. **Graceful provider failure.** Two independent vector basemaps, a continuity renderer, bounded public-source adapters and visible readiness states keep upstream failure from becoming invented data.
9. **Reproducibility.** Named scenario versions, deterministic seeds, what-if branches, exports and receipts make the demonstration repeatable.
10. **Zero-paid-key core.** The active map, simulation, operations brief and public incident path do not require a paid map or model key.

## AI position: the answer judges should hear

> The safety-critical numerical path is deterministic on purpose. AI is used as an operator-facing reasoning and explanation layer over structured simulation state, evidence and constraints. It does not invent depths, casualties or road closures. The public Cloudflare build can use its zero-secret Workers AI binding first, then configured compatible providers; each may only summarise the same grounded state. The separate Agent Ledger records the deterministic finding, every provider attempt, evidence, latency, response, fallback and human action. If every hosted model is unavailable, the deterministic operations brief completes and the fallback remains visible.

The dedicated audit surface displays only actual endpoint executions; the live D1 ledger already contains the release-acceptance record and does not pretend it was created during the judge flow. A new pending recommendation can be approved or rejected, creating the next hash-linked revision of its SHA-256 integrity receipt.

Do not claim that an external language model generated the simulation. Do not describe the confidence percentage as model accuracy. It is a support/confidence indicator for the available inputs and method.

## Exact safe claims

Use these phrases verbatim when accuracy matters:

- “This is a **deterministic prototype planning scenario**, not a forecast or evacuation order.”
- “The world map and incident record are **imported context**; the coloured consequences are **simulated**.”
- “AEGIS is showing a **damage-screening state**, not a confirmed structural inspection.”
- “This number is a **population exposure envelope**, not a casualty count.”
- “Route geometry comes from the named road source; hazard passability and capacity are screened by AEGIS.”
- “Weather is model context from Open-Meteo, not an on-site sensor reading.”
- “The EIT scene uses the institute map reference, nearby OSM footprints, public regional elevation context and clearly marked estimates. It is not a surveyed BIM.”
- “Observed casualties and monetary loss remain unavailable because validated methods and authoritative inputs were not supplied.”
- “The recommendation is advisory and requires operator and competent-authority approval.”
- “Current imagery and map tiles provide geographic context; they are not a live satellite feed.”
- “Open media is contextual until publisher, time, location, licence and authenticity are verified.”

## Claims to avoid

- “AEGIS predicts exactly what will happen.”
- “This is the exact EIT campus digital twin.”
- “These are real casualties, real damage or official road closures.”
- “This footage is live” unless the original source explicitly proves that claim.
- “This map is real-time satellite imagery.”
- “The AI autonomously orders an evacuation.”
- “Every provider is always available.”
- “The model is calibrated” unless authoritative calibration data has actually been imported and validated.

## Judge Q&A

### What is the innovation if flood simulators already exist?

The innovation is the decision loop around the hazard: evidence classification, time-specific infrastructure consequence, mode- and capacity-aware evacuation, scenario comparison, reverse-cascade intervention ranking, recovery/re-entry screening and operator receipts. The animation is only one layer.

### Why use deterministic logic instead of asking an LLM for the answer?

Depths, route closures and capacity decisions must be reproducible and testable. A language model is useful for explanation and interaction, but it should not fabricate numerical emergency facts. AEGIS keeps calculations deterministic and lets the assistant explain the traceable result.

### Is this a real EIT model?

It is a georeferenced planning prototype around EIT using the institute’s map reference, nearby OSM footprints and public regional elevation context. Unknown heights, functions, occupancy, drains and dependencies are estimates. The product already accepts a validated campus JSON dataset to replace those estimates.

### Can it work anywhere in the world?

The operator can search or select any valid world coordinate and create a scenario there. Where verified local terrain, assets and population are unavailable, AEGIS explicitly uses a translated prototype asset bundle and labels the limitations. Global selection is real; global engineering fidelity is not claimed.

### Is the disaster feed live?

It is a current/recent source-labelled aggregation from public providers with their timestamps and update cadence. “Retrieved now” does not guarantee the event is still occurring, and the interface preserves that distinction.

### Does AEGIS predict casualties?

No. It computes a planning exposure envelope and an estimated mobility-assistance demand. Observed or predicted casualty counts are deliberately unavailable without a validated vulnerability method and authoritative population data.

### How are evacuation routes different from Google Maps directions?

The base road geometry is only a candidate. AEGIS screens each segment against the simulated hazard at the minute the traveller reaches it, applies movement-mode limits, identifies restrictions and closures, and then allocates demand against shelter and transport capacity.

### What happens if a provider fails?

Map providers fail over independently; terrain and live feeds can degrade without removing the simulation; status remains visible; cached source-backed data keeps its original timestamp; and AEGIS never replaces missing data with invented observations.

### What is the business or deployment path?

The command center and dedicated Agent Ledger are live on Cloudflare Workers. D1 durably stores only Agent Ledger receipt revisions and has passed cross-deployment create/read/review acceptance. The supplied Oracle Compose stack is the separate path for full FastAPI, PostGIS, Redis, nginx, durable operational records and WebSocket replay. Cloudflare does not silently include that backend; Oracle tenancy, public IP, DNS and TLS remain owner-controlled external steps.

### What would you add with official data?

An official campus boundary/site plan, BIM or CAD, verified gates and assembly areas, surveyed terrain and drainage, road widths, building occupancy/accessibility and utility dependencies. Those inputs improve fidelity without changing the command workflow.

### Who makes the final decision?

A human operator and the competent authority. AEGIS supports, compares and records decisions; it does not issue an autonomous evacuation order.

## Closing line

> AEGIS is not trying to replace emergency authorities. It gives them one defensible chain from a source-labelled signal, through a reproducible consequence model, to a time-aware plan they can inspect, approve and audit.
