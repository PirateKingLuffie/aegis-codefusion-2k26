# Globe and operations-interface acceptance

This note records the August 2026 globe-to-street and operations-interface rehaul. It is both the source contract and the release checklist for the world map. It does not turn public map context into surveyed terrain, live satellite imagery, a verified disaster perimeter or a live sensor feed.

The current rehaul is implemented and deployed. Older Worker records at the end of this file are retained
as historical evidence; the release record below is the canonical public state.

## Intended operator flow

1. Open **Global map**. A large, slightly tilted Earth is visible rather than a flat placeholder.
2. Leave the pointer idle. The globe begins a deliberate eastward orbit after a short startup delay while retaining the slightly tilted overview framing. A faint static reference lattice and range rings make the surrounding space useful without obscuring Earth imagery.
3. Drag, scroll, click, search or start a camera flight. Orbit pauses immediately so the selected location stays under operator control; it resumes after the idle interval only when the camera has returned to globe-overview zoom.
4. Search a country, city, address, street, building, landmark or coordinate. The selected result receives a persistent focus marker and name while its planning coordinate becomes the active scenario location.
5. The camera keeps an angled geographic overview when appropriate and changes to Mercator projection for reliable close-range streets, terrain and available building geometry. Regional, street and site views never drift under auto-orbit.
6. Continue zooming. One coherent keyless OpenStreetMap raster remains beneath provider vector labels, buildings and operational layers through zoom 19, so local regions retain a visible surface and city/road labels when dated Earth imagery hands off to street detail.
7. Select a hazard source, origins, destinations or an operating area on the map. The same deterministic five-plugin workflow can be recalculated around any valid selected world coordinate; local detail is limited by the public map and terrain data available there.

## Root cause and correction

The previous EOX raster display layer stopped at zoom 9. OpenFreeMap Dark intentionally has no opaque land-fill layer, so locations with few vector features could expose the style's black background after the raster disappeared. Projection changes also waited until `zoomend`, allowing an unstable globe/terrain frame during a continuous wheel gesture.

The corrected renderer:

- retains EOX Sentinel context beneath vector streets through its configured zoom 15 layer limit (the
  source tiles are native through zoom 14); the coherent keyless OpenStreetMap street raster carries
  close-range context through zoom 19;
- keeps a neutral visible provider background if optional imagery is delayed;
- adds explicit OpenMapTiles country, city, road and road-name context when a provider style is too subtle;
- adds one coherent, keyless OpenStreetMap street source at regional and street zoom; it never mixes different providers into adjacent squares;
- uses the standard OSM raster's own labels plus the active OpenFreeMap/CARTO vector style labels; the former CARTO raster-label request was removed because its public endpoint began returning a key-required watermark;
- changes from globe to Mercator during zoom at the controlled threshold, with hysteresis to prevent projection flapping;
- detaches terrain before a projection change and restores it only after the zoom settles;
- starts idle orbit after a short initial delay, uses a clearly visible default speed of 1.6 degrees of longitude per second, and avoids replaying the initial world flight on unrelated renders;
- uses a masked, static CSS reference lattice and range rings around the spherical Earth so the viewport reads as an intentional global operations field without adding another animation loop, remote asset or canvas renderer;
- pauses rotation for pointer/keyboard/map interaction, camera movement, reduced-motion preference, background tabs and close-range views, then resumes without a longitude jump;
- displays a pulsing red halo only for incident features classified by the live-intelligence adapter as current/live, while retaining their title and source context;
- displays a separate pulsing focus marker for the operator's selected search result so a successful search cannot visually disappear.

NASA Blue Marble and EOX Sentinel-2 cloudless imagery are dated geographic context, not live satellite imagery. OpenFreeMap, CARTO and their OpenStreetMap-derived vectors remain the source of streets, administrative context and available building geometry.

The red incident pulse means “current/live according to the named upstream record and AEGIS freshness rules.” It does not mean AEGIS independently observed the disaster. Simulated hazard geometry uses its own **SIMULATED** classification and must not be presented as a live disaster perimeter.

## Interface standard

The active interface follows a conventional GIS/emergency-operations hierarchy:

- flat charcoal surfaces instead of neon gradients, glass effects or decorative glow;
- normal sentence-case operational labels instead of promotional or science-fiction wording;
- square 2–4 px control and panel radii;
- 11–14 px readable interface typography with tabular operational numbers;
- blue reserved for routes and selections, green for safe/approved state, red for damage/critical state, amber for warnings, and grey for unavailable context;
- visible navigation names, a restrained header and a map-first 1366 × 768 layout;
- a short purpose briefing beneath the active World map, Incident, Scenarios, Impacts, Sources and Analysis navigation title, with concise hover/rail briefings for the same destinations;
- a Scenario panel that shows the current X longitude, Y latitude, terrain-derived Z context, hazard and selected minute;
- a two-level Scenario setup header, explicit hazard selector, readable intensity output, compact X/Y/Z/time chips and keyboard-visible loaded-case selection that remain contained at 1366 × 768;
- three primary loaded cases—EIT campus flood, Tokyo earthquake access and Miami cyclone/surge—plus a separate Sendai coastal-inundation demonstration that is visibly disclosed as a cyclone/surge-engine tsunami proxy;
- an in-product Incident Source Viewer that queries media for the selected report, embeds privacy-enhanced
  YouTube or a matching Wikimedia video when available, keeps the AEGIS URL unchanged and shows an
  explicit unavailable state plus safe source links when no incident-specific asset is returned; no
  unrelated fallback footage is substituted;
- an evacuation-procedure action in Decision support that is built from the current departure minute, staged demand, route, destination, capacity, remaining exposure and model warnings rather than a generic chat response;
- all existing layer controls, panel dragging, docking, minimizing, resizing and reset behaviour preserved.

## Hazard-animation contract

The selected timeline minute produces hazard-specific operational geometry, not a decorative video:

| Executable model | Time-varying map/twin display | Required truth label |
| --- | --- | --- |
| Flood | wet/deeper-water extents, net-flow vector, shoreline/depth/building-access progression | deterministic simulated water, not an observed boundary |
| Earthquake | concentric isoseismal bands, symbolic pulse outlines, damage/access progression | screening envelope, not measured seismic-wave travel |
| Wildfire | active-fire perimeter, smoke envelope and wind-aligned spread axis | deterministic screen, not a mapped incident perimeter |
| Cyclone/surge | wind field, surface/coastal-water envelope and storm-track display | parametric scenario, not a forecast track |
| Chemical release | directional plume, threshold-exceedance zone and plume axis | screening output, not observed gas or official health boundary |

Tsunami is not a sixth calibrated solver. The loaded Tokyo/Sendai-style coastal-inundation case deliberately reuses the cyclone/surge low-point engine as a visual planning proxy and must keep that disclosure visible. Real tsunami travel, run-up and evacuation modelling would require bathymetry, source mechanism and validated coastal data that are not present in this prototype.

## Release acceptance

Use a clean current Chrome session at 100% zoom:

- confirm Earth, coastlines and imagery appear at initial load;
- observe longitude change after the startup delay;
- confirm drag and wheel pause orbit;
- zoom continuously past the globe/flat-map boundary and confirm no black canvas;
- search a country and a city, then confirm country/city labels and street context;
- search a landmark/building and a street, then confirm the selected-place marker, place name, roads and close-range terrain/building context where public data exists;
- return to **Global map** and confirm the slightly tilted full-Earth framing;
- let the initial orbit advance, interact to pause it, wait for the idle interval at overview zoom and confirm that it resumes slowly without a camera jump;
- confirm a source-labelled current/live incident has a pulsing red mark; if no upstream event meets the freshness rule, do not fabricate one merely to satisfy this check;
- load each of the three primary scenario cards, then the clearly labelled coastal-inundation proxy, and confirm location, coordinates, hazard and minute change together;
- open **Incident updates**, select **View source media** and confirm the dialog remains inside AEGIS, shows publisher/time/licence context and never describes contextual media as a verified live camera;
- play/seek all five executable hazards and confirm that each produces its own time-varying footprint/vector vocabulary;
- ask **Explain evacuation procedure** and confirm the answer cites the current plan's stages, route, destination/capacity, remaining exposure and warning;
- check 1366 × 768 for clipped search, scene, layer, timeline or decision controls;
- confirm browser console has no application error.

Free public providers have no availability SLA. If one basemap fails, AEGIS switches to the independent fallback. If optional imagery fails while vectors remain healthy, the basemap is retained and the UI reports degraded imagery rather than discarding the world map.

## Current-rehaul release record — 27 August 2026

- Command center Worker: `1e12ba63-1fe8-4112-bda9-b6ebd3b460b0`.
- Fresh public entry: `https://aegis.guptashivaani233.workers.dev/?fresh=1e12ba63`.
- Canonical verification: 82 total tests, 81 passed, zero failed and one optional public-live-feed test skipped; production build, TypeScript and ESLint passed.
- Globe evidence: a current incident marker moved from `translate(686px, 274px)` to `translate(666px, 271px)` over 2.5 seconds at the new 1.6-degree/second orbit setting.
- Scenario evidence: at 1366 × 768 the panel remained inside the viewport at 326 × 501 px, exposed the EIT, Tokyo, Miami and Sendai cases, and used intentional internal scrolling for the complete 930 px workflow.
- Media evidence: **View source media** opened the in-site dialog without changing the AEGIS URL; the selected cyclone report produced one playable direct-video element and a visible non-live/context warning.
- Public API checks on this historical Worker: health and the incident media endpoint returned HTTP 200; the
  zero-key media path returned `open-media` with one source-linked Commons clip. The deployed 28 August
  follow-up below supersedes that behavior by refusing unrelated fallback clips.
- Browser warning/error log: empty after globe, Scenario and Incident Source Viewer replay.
- Lenovo LOQ device check: owner manual check remains before presentation.

## Current deployed follow-up — 28 August 2026

The incident/media accuracy and marker-classification pass is live in Worker
`97819d30-6091-41ec-9b57-6320eca81edf` from commit `638e063`.

- `npm run test:unit`: **85 total, 84 passed, 0 failed, 1 optional public-live-feed test skipped**.
- TypeScript, ESLint and production build: PASS (only the existing large-chunk advisory is emitted).
- Keyless media returns only incident-matching Commons results; when no match/provider result exists, the
  API returns `safe-search-links`/`unavailable` with explicit source links. Generic or unrelated clips are
  never substituted.
- Incident markers classify explicit live, simulated and context records separately; only live records
  receive the red/pulsing treatment. Simulation presets are separate from observed/context records.
- Public browser replay: `data-world-overview=true` and `data-auto-orbit=running` on load; detail zoom
  changed the overview flag without a black canvas, missing-data tiles or console errors. The public
  replay showed one context marker and nineteen live markers in Monitor, and an amber simulation marker
  when Scenario was selected.
- Incident Source Viewer opened as a large in-site dialog, reported `NO VERIFIED LIVE CAMERA AVAILABLE`
  for the selected Nepal record, showed zero matching playable results and retained search/report links.

## Operational-marker release record — 26 August 2026

- Command center Worker: `aa2b5e97-9f1d-4a3c-a989-d784f0a94c5a`.
- Fresh public entry: `https://aegis.guptashivaani233.workers.dev/?fresh=aa2b5e97`.
- Globe orbit: physically observed marker movement from `translate(769px, 268px)` to `translate(760px, 267px)` over approximately 3.2 seconds; the explicit pause/resume control remains authoritative.
- Operational overlay: live red pings, blue origin, green safe point, red hazard source, numbered amber area vertices, dotted area perimeter and completed-area badge are DOM-backed MapLibre markers above the WebGL scene.
- Tool exclusivity: incident markers are non-interactive during Origin, Safe point, Source and Area placement, so a live ping cannot consume an operator placement click.
- Incident drill-down: selecting a live ping selects its imported source record, switches to the matching hazard in Scenario mode, moves to `T+045:00`, enables the relevant impact layers and opens the calculated impact panel.
- Deployed-browser replay: five incident markers, three completed point selections, a three-vertex completed area and the incident drill-down all passed with an empty warning/error log.
- Canonical verification: 77 total tests, 76 passed, zero failed and one optional public-live-feed test skipped.

## Basemap-coherence release record — 27 August 2026

- Command center Worker: `dc0763f4-ed97-431f-92f6-6de2cd4339ae`.
- Fresh public entry: `https://aegis.guptashivaani233.workers.dev/?fresh=dc0763f4`.
- Root cause fixed: the former raster source listed OSM and Esri templates together. MapLibre treats that list as equivalent load-balancing shards, so adjacent tiles used incompatible cartography and Esri placeholders appeared as real map content.
- Free final path: one `tile.openstreetmap.org` raster template supplies coherent close-range streets and labels; OpenFreeMap remains the primary vector globe/style and CARTO Dark Matter remains only the independent vector-style failover.
- Key-gated raster removal: CARTO `dark_nolabels` and `dark_only_labels` are not requested because the deployed replay showed their key-required watermark.
- Loading changes: MapLibre downloads beside the lazy map component, the tile cache is 240 entries, Sentinel regional imagery starts after globe overview and reaches zero opacity before deep street zoom, and raster handoffs crossfade for 180 ms.
- Orbit: default presentation speed is `1.35` degrees/second, with the same explicit pause and 1.5-second interaction resume contract.
- Public replay: New Delhi search plus five more zoom steps retained the selected location, reported OpenStreetMap streets in attribution and produced no browser warning/error log.
- Canonical verification: 77 total tests, 76 passed, zero failed and one optional public-live-feed test skipped; public health returned HTTP 200 with 12/12 providers ready.

## Previously accepted public release — historical baseline only

- Command center Worker: `58accdae-9be1-440c-b7f2-3cec0ff45e86`
- Agent Ledger Worker: `af5d0e22-9ed7-4e83-b0ff-ea62a312114f`
- Canonical verification: 67 total tests, 66 passed, zero failed, one intentionally skipped public-network test.
- Remote-browser evidence: labelled globe visible; orbit visibly advanced after six seconds; New Delhi search completed; district and street names remained visible after five additional zoom steps; the canvas did not turn black; browser warning/error log was empty.
- Public API smoke checks returned HTTP 200 for health, provider readiness, simulation catalog and Agent Ledger activity.

This acceptance used the deployed public site and did not start a local host. It is not a substitute for the final Lenovo LOQ device check.
