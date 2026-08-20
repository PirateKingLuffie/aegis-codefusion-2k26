# Globe and operations-interface acceptance

This note records the August 2026 globe-to-street and operations-interface rehaul. It is both the source contract and the release checklist for the world map. It does not turn public map context into surveyed terrain, live satellite imagery, a verified disaster perimeter or a live sensor feed.

The current rehaul is implemented in source. Its exact final test totals, browser evidence and deployment version must be inserted in **Current-rehaul release record** after the root release pass; the older published acceptance at the end of this file is retained only as historical evidence.

## Intended operator flow

1. Open **Global map**. A large, slightly tilted Earth is visible rather than a flat placeholder.
2. Leave the pointer idle. The globe begins a slow eastward orbit after a short startup delay while retaining the slightly tilted overview framing.
3. Drag, scroll, click, search or start a camera flight. Orbit pauses immediately so the selected location stays under operator control; it resumes after the idle interval only when the camera has returned to globe-overview zoom.
4. Search a country, city, address, street, building, landmark or coordinate. The selected result receives a persistent focus marker and name while its planning coordinate becomes the active scenario location.
5. The camera keeps an angled geographic overview when appropriate and changes to Mercator projection for reliable close-range streets, terrain and available building geometry. Regional, street and site views never drift under auto-orbit.
6. Continue zooming. An opaque, keyless CARTO/OSM-derived street raster remains beneath the explicit label overlay and operational layers through zoom 20, so there is no black gap when dated Earth imagery hands off to roads, boundaries, places and buildings.
7. Select a hazard source, origins, destinations or an operating area on the map. The same deterministic five-plugin workflow can be recalculated around any valid selected world coordinate; local detail is limited by the public map and terrain data available there.

## Root cause and correction

The previous EOX raster display layer stopped at zoom 9. OpenFreeMap Dark intentionally has no opaque land-fill layer, so locations with few vector features could expose the style's black background after the raster disappeared. Projection changes also waited until `zoomend`, allowing an unstable globe/terrain frame during a continuous wheel gesture.

The corrected renderer:

- retains and overzooms the EOX Sentinel context layer beneath vector streets through zoom 20;
- keeps a neutral visible provider background if optional imagery is delayed;
- adds explicit OpenMapTiles country, city, road and road-name context when a provider style is too subtle;
- adds an opaque, keyless CARTO `dark_nolabels` street/building safety layer at regional and street zoom;
- adds a separate transparent, keyless CARTO labels-only layer through zoom 20, beneath AEGIS operational routes and hazard layers;
- changes from globe to Mercator during zoom at the controlled threshold, with hysteresis to prevent projection flapping;
- detaches terrain before a projection change and restores it only after the zoom settles;
- starts idle orbit after a short initial delay, uses a restrained default speed of 0.5 degrees of longitude per second, and avoids replaying the initial world flight on unrelated renders;
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
- three primary loaded cases—EIT campus flood, Tokyo earthquake access and Miami cyclone/surge—plus a separate Sendai coastal-inundation demonstration that is visibly disclosed as a cyclone/surge-engine tsunami proxy;
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
- play/seek all five executable hazards and confirm that each produces its own time-varying footprint/vector vocabulary;
- ask **Explain evacuation procedure** and confirm the answer cites the current plan's stages, route, destination/capacity, remaining exposure and warning;
- check 1366 × 768 for clipped search, scene, layer, timeline or decision controls;
- confirm browser console has no application error.

Free public providers have no availability SLA. If one basemap fails, AEGIS switches to the independent fallback. If optional imagery fails while vectors remain healthy, the basemap is retained and the UI reports degraded imagery rather than discarding the world map.

## Current-rehaul release record

- Deployed application source: `9b2d9f5` (`fix: keep searched locations out of EIT twin`)
- Command center Worker: `e7142f5a-84bb-4692-8381-f4f749000147`
- Agent Ledger Worker: `af5d0e22-9ed7-4e83-b0ff-ea62a312114f` (unchanged)
- Canonical verification: 76 total tests, 75 passed, zero failed and one optional public-live-feed test skipped; production build passed.
- Remote-browser evidence: Public 1366 × 768 replay confirmed enabled Auto orbit control, Eiffel Tower OSM search, a labelled Paris street/arrondissement view with no black canvas, generic-world Scenario context and Tokyo earthquake at T+60. Browser warning/error log was empty throughout the replay.
- Public API smoke checks: `GET /api/health`, `GET /api/providers`, `GET /api/simulation/catalog` and Ledger `GET /api/agent-activity` each returned HTTP 200.
- AI evacuation proof: The live command center returned a plan-grounded response through Cloudflare Workers AI (`@cf/meta/llama-3.2-3b-instruct`), labelled for human review, and rendered the calculated procedure/evidence.
- Lenovo LOQ device check: owner manual check remains before presentation.

## Previously accepted public release — historical baseline only

- Command center Worker: `58accdae-9be1-440c-b7f2-3cec0ff45e86`
- Agent Ledger Worker: `af5d0e22-9ed7-4e83-b0ff-ea62a312114f`
- Canonical verification: 67 total tests, 66 passed, zero failed, one intentionally skipped public-network test.
- Remote-browser evidence: labelled globe visible; orbit visibly advanced after six seconds; New Delhi search completed; district and street names remained visible after five additional zoom steps; the canvas did not turn black; browser warning/error log was empty.
- Public API smoke checks returned HTTP 200 for health, provider readiness, simulation catalog and Agent Ledger activity.

This acceptance used the deployed public site and did not start a local host. It is not a substitute for the final Lenovo LOQ device check.
