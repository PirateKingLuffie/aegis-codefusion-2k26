# AEGIS demo runbook

This is the primary **5–7 minute** judge flow for the Cloudflare command center at https://aegis.guptashivaani233.workers.dev. The dedicated audit surface is https://aegis-agent-ledger-codefusion-2k26.guptashivaani233.workers.dev/agent-ledger. Do not improvise numerical claims; let the current interface show them and state their evidence class.

**Release gate:** completed for deployed application source `a78d873` on Worker `d17fab58-065c-44b1-98bb-160f06b5082c`. Check the live URL once on the presentation laptop before the judges arrive; the remaining device-specific check is the Lenovo LOQ manual pass.

## Roles

- **Presenter/operator:** Sankalp Gupta
- **Optional teammate:** watches the clock and opens the evidence backup only if asked
- **Target duration:** 6 minutes 15 seconds, leaving 45 seconds inside a seven-minute slot

## Final preflight — complete before judges enter

1. Open `https://aegis.guptashivaani233.workers.dev` in a clean, current Chrome window at 100% zoom.
2. Use the Lenovo LOQ on AC power, Windows performance mode, RTX 4050 enabled and Chrome hardware acceleration on.
3. Confirm that the slightly tilted globe renders with place labels, begins a slow orbit after its startup delay, pauses on drag/scroll and resumes only after idle at world-overview zoom.
4. Open **Service setup** from the header. Confirm **OpenFreeMap** is primary, **CARTO Dark Matter** is fallback, and no required paid key is missing.
5. Confirm the incident strip shows a provider/source and timestamp, or honestly displays a degraded/unavailable state.
6. Search one world city, one street/landmark and `Echelon Institute of Technology, Faridabad`. Confirm the selected-place marker remains visible, deep zoom retains an opaque street map and labels, and **Site 3D** opens around the EIT reference.
7. Select **Urban Flood**, set the timeline to `T+000`, and keep panels in their reset positions.
8. Rehearse one saved scenario and evacuation receipt in a separate browser profile. The D1 Agent Ledger is shared and already contains the genuine release-acceptance record; do not describe it as a new judge execution.
9. Keep the actual-build evidence packet ready in a separate tab: screenshots, a short screen recording, exported scenario JSON/CSV and this runbook. Never substitute stock or generated disaster imagery.
10. Disable notifications, downloads, battery saver and background GPU-heavy software. Keep browser DevTools closed.

## Six-minute script and actions

### 0:00–0:35 — The problem and world view

**Action:** Enter AEGIS and let the detailed, labelled globe rotate for several seconds. Drag it to pause, return to the overview and let the orbit resume. Search a city or landmark and show the persistent selected-place marker, named place and high-zoom streets.

**Say:**

> Disaster response is not missing another map. It is missing a reliable chain from a source-labelled signal to consequences, routes and an approved action. AEGIS puts that chain on one command surface.

Point out the interactive globe, city/street labels, incident clusters, source labels and provider state. A pulsing red incident mark is current/live only according to its named upstream record and freshness classification; it is not an AEGIS observation. Do not call map imagery “live satellite.” If no upstream incident is classified current/live, say so and do not create a fake red marker.

### 0:35–1:10 — Source-labelled incident to scenario

**Action:** Open the incident strip or **Evidence desk**. Choose a record with coordinates, show its source and timestamp, select **Focus on map**, then **Create scenario**.

**Say:**

> This incident is imported context from the named provider. One click creates a planning scenario, but AEGIS never relabels the imported event as observed local damage.

If feeds are quiet or degraded, search EIT directly and say that live provider state is visibly unavailable; do not wait for a perfect headline.

### 1:10–2:25 — Selected location, scenario and EIT 3D flood consequence

**Action:** Open **Scenarios** and point out its one-line purpose briefing and current X/Y/terrain-derived Z summary. Briefly show the three primary loaded cases—EIT Campus Flood Exercise, Tokyo Earthquake Access Exercise and Miami Cyclone and Surge—then load EIT, select **Site 3D**, choose **Urban Flood**, switch to **SIMULATE**, and play or drag the timeline through rise, peak and recession. Pause at a visually clear impact minute.

**Show:**

- continuous water surface and depth/intensity legend;
- red damage-screening structures;
- blue escape routes;
- green modelled safe areas;
- grey unavailable/unsafe areas;
- building waterline, external depth, affected floors and access state;
- road closures/restrictions and secondary consequence screens.

**Say:**

> The selected minute drives every layer. For flood, AEGIS screens water depth, flow, arrival and recession, internal building depth, affected floors, access and secondary consequences. Red means simulated damage screening—not a confirmed structural inspection. The EIT massing uses the institute map reference, nearby OSM footprints and estimated attributes; it is not a surveyed BIM.

If a judge asks about global use, search/select another valid world coordinate or operating area, choose one of the five executable hazard plugins and run it there. Say: “The workflow is location-generic; fidelity follows the public roads, labels, terrain and building data available at the selected location.” Do not say it can accurately model literally every disaster.

### 2:25–3:25 — Evacuation as a constrained decision

**Action:** Select or place an origin, destination and hazard source if needed. Choose a movement profile and select **Generate evacuation plan**. Show three route alternatives, clearance, coverage, conflicts, staged movement and resource assignments. Change the timeline/departure once to demonstrate recomputation. Select **Approve plan**.

**Say:**

> This is not shortest-path navigation. AEGIS screens each road at the minute the traveller is expected to reach it, applies mode-specific limits, then assigns demand against route throughput, transport and destination capacity. Approval creates a decision receipt; AEGIS does not issue an autonomous evacuation order.

### 3:25–4:20 — What-if and reverse-cascade advantage

**Action:** Select **Compare** or **Branch what-if scenario**. Show contained, baseline and severe branches using the same deterministic seed. Apply a branch only if time permits. Open **Cascade graph** and point to the best screened intervention.

**Say:**

> The same seed makes the branches comparable. AEGIS does not only ask what fails; reverse-cascade ranking asks which feasible intervention protects the most downstream access, health, shelter and utility functions.

### 4:20–5:05 — Recovery and evidence governance

**Action:** Press `Ctrl+K`, open **Recovery and re-entry**, then open **Decision history** if time permits.

**Say:**

> A response plan is incomplete without re-entry and restoration. AEGIS screens inspection holds, recovery priorities, service gaps and remaining demand. Scenario versions, exports, audit events and decision receipts preserve what the operator saw and approved.

### 5:05–5:40 — Decision brief and AI boundary

**Action:** Open **Decision brief** (`Ctrl+B`) and select **Explain evacuation procedure**. Point to the departure minute, staged demand, preferred/available route, destination, capacity/coverage, remaining exposure and warning drawn from the current evacuation plan. If time remains, ask “Prioritize hospitals” or “What if Bridge B fails?”

**Say:**

> The assistant is grounded in the current structured twin and evacuation plan. The numerical path stays deterministic and reproducible. An optional language-model layer may explain that state, but it cannot invent depths, casualty counts, routes or closures, and its activity is logged for review.

Open the dedicated **Agent activity ledger** URL after the answer appears. Show the matching request, deterministic-first execution path, hosted provider or disclosed fallback, evidence citations, latency and SHA-256 integrity receipt. Approve or reject the pending recommendation to create the next hash-linked revision. The live release has already verified cross-deployment D1 create/read/review; use a new execution for the judge rather than presenting the acceptance record as if it just ran.

### 5:40–6:15 — Close on reliability and scale

**Action:** Briefly open **Service setup** or **Workspace**. Show provider failover/readiness, a deterministic seed, save/version, and JSON/CSV/print export.

**Say:**

> AEGIS is online-first but not dependent on one paid provider. Two basemaps fail over independently, public data remains source-labelled, and deterministic analysis continues when a live feed degrades. The same workflow supports any selected world coordinate, while local engineering fidelity increases as verified terrain, BIM, drainage, occupancy and utility records are imported.

**Close:**

> AEGIS turns a map into an explainable, time-aware and human-approved decision system.

## If the slot is only five minutes

Cut the detailed Workspace and Recovery interaction. Keep these four proof points:

1. world incident/search to scenario;
2. EIT 3D flood impact across time;
3. time/mode/capacity-aware evacuation with approval;
4. what-if/cascade plus the truth policy.

## Optional 45-second multi-hazard proof

Use timeline seek rather than waiting for playback. Load one location, change the active hazard and show the map vocabulary changing with the selected minute:

1. **Earthquake:** concentric isoseismal bands and symbolic pulse outlines with damage/access progression.
2. **Wildfire:** active-fire perimeter, smoke envelope and wind-aligned spread axis.
3. **Cyclone/surge:** wind field, coastal/surface-water envelope and scenario track.
4. **Chemical release:** directional plume, threshold zone and plume axis.
5. **Flood:** water/deeper-water extents, flow and building/road access changes.

The separate coastal-inundation card is a tsunami **proxy**, not a sixth solver. It deliberately reuses the cyclone/surge low-point engine and is not calibrated wave propagation, run-up or official tsunami evacuation modelling.

## Live demo backup ladder

Use the first working level and continue. Never hide provider failure or invent an observation.

| Failure | Immediate response | What to say |
| --- | --- | --- |
| OpenFreeMap style fails | Wait for automatic CARTO failover; keep speaking | “The independent basemap provider has taken over; AEGIS data layers are separate.” |
| Both vector basemaps fail | Use the interactive continuity renderer and click **Retry live globe** after connectivity returns | “The geospatial provider is unavailable; AEGIS preserves interaction and reports the missing context.” |
| Satellite/context imagery fails | Continue with vector streets/buildings | “Imagery is optional context and is not part of the numerical simulation.” |
| Terrain fails | Continue with 3D extrusion; use the visible degraded label | “The regional terrain provider is degraded; no survey-grade claim is being made.” |
| Incident feed fails | Search EIT and run the prepared deterministic scenario | “The feed is unavailable, so I will not fabricate a live incident. The planning workflow remains executable.” |
| Media result is absent | Open the source/publisher/search link or skip media | “Media requires independent verification and is not required for the decision engine.” |
| Full operations API is unavailable | Continue with browser-local scenario versions; use D1-backed Agent Ledger if its storage badge is linked | “Full scenario persistence is degraded. The browser keeps the planning workflow available, while the ledger reports its own storage mode separately.” |
| Agent/LLM provider fails | Show the failed attempt and deterministic fallback in `/agent-ledger` | “The optional language layer is unavailable; the grounded deterministic engine completed and logged the request.” |
| Frame rate drops | Pause playback, close unused floating panels and apply Map-only/focused layout | “The state is unchanged; I am reducing concurrent visual layers.” |
| Public site is unreachable | Show the pre-captured recording and exported evidence packet from this exact build | “The public endpoint is unreachable. This is a recording and export from the verified build—not a different mock-up.” |

## Fast troubleshooting

### Black or empty globe

1. Wait five seconds for provider failover.
2. Check whether the browser has WebGL/hardware acceleration enabled.
3. Select **World** again to reset the projection and camera.
4. Use **Retry live globe** once after connectivity returns.
5. Confirm the opaque Esri/OSM street layer and separate labels layer have loaded at close zoom; optional dated imagery may still be degraded. Low-feature regions should retain a visible land surface instead of a black/white tile.
6. If both providers remain unavailable, continue with the continuity renderer and evidence packet.

### Search returns no result

Use direct coordinates as `latitude, longitude`, or select the EIT quick location. Nominatim may throttle public requests; do not repeat searches rapidly.

If a result is returned but the map is visually empty, return to **World**, repeat the result selection once and confirm the selected-place marker/name appears. Do not describe missing public building geometry as a failed simulation; street and label context should remain, while detailed 3D geometry depends on upstream coverage.

### EIT view appears approximate

That is expected without an official site plan/BIM. State the limitation and, if asked, open **Workspace → Campus data** to show the verified JSON replacement path.

### Route conflicts or low coverage appear

Do not hide them. Change departure minute, movement profile, origin/destination or surge capacity and recompute. Remaining demand is a product result, not a demo failure.

### Panel collision at laptop resolution

Use **Reset workspace**, the command palette, or a named focused/Map-only layout. Floating panels can be dragged, docked, minimized and resized.

### Agent Ledger shows `RUNTIME`

Do not call the records durable. Continue the execution proof, show the visible storage state and use the exact line: “The audited request executed, but durable ledger storage is unavailable, so this record is held only in the active runtime.” After deployment, check that the `AEGIS_LEDGER_DB` binding exists and that `migrations/0001_agent_activity_ledger.sql` was applied remotely.

## Truth phrases

- “Imported context” came from the named source; it does not mean AEGIS observed the site.
- “Simulated” is deterministic output for the selected assumptions and seed.
- “Estimated” is an inferred planning input or consequence, not a survey or confirmed impact.
- “Exposure envelope” is not a casualty count.
- “Current/recent feed” is not necessarily a currently occurring event or camera view.
- A pulsing red live-incident mark inherits its status and timestamp from a named upstream record; it is not an AEGIS field observation.
- The tsunami/coastal-inundation demonstration is a cyclone/surge-engine planning proxy, not calibrated tsunami physics.
- All recommendations require a human operator and competent authority.
- Call Agent Ledger records durable only when its storage badge reports linked durable storage; D1 durability covers ledger revisions, not scenarios.
