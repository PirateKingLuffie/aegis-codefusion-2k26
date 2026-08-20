# Globe and operations-interface acceptance

This note records the August 2026 globe-to-street and interface rehaul. It is the release checklist for the world map; it does not turn public map context into surveyed or live sensor data.

## Intended operator flow

1. Open **Global map**. A large, slightly tilted Earth is visible rather than a flat placeholder.
2. Leave the pointer idle. The globe begins a slow eastward orbit after a short startup delay.
3. Drag, scroll, click, search or start a camera flight. Orbit pauses immediately so the selected location stays under operator control.
4. After ordinary world-view interaction, orbit resumes only while the camera remains at globe overview zoom. Regional, street and site views never drift.
5. Search a country, city, address, landmark or coordinate. The camera keeps an angled geographic overview when appropriate and uses Mercator projection for reliable close-range streets, terrain and buildings.
6. Continue zooming. Satellite context remains beneath provider vectors through street zoom, so there is no black gap when the globe imagery hands off to roads, boundaries, city labels and buildings.

## Root cause and correction

The previous EOX raster display layer stopped at zoom 9. OpenFreeMap Dark intentionally has no opaque land-fill layer, so locations with few vector features could expose the style's black background after the raster disappeared. Projection changes also waited until `zoomend`, allowing an unstable globe/terrain frame during a continuous wheel gesture.

The corrected renderer:

- retains and overzooms the EOX Sentinel context layer beneath vector streets through zoom 20;
- keeps a neutral visible provider background if optional imagery is delayed;
- adds explicit OpenMapTiles country, city, road and road-name context when a provider style is too subtle;
- adds a transparent, keyless CARTO labels-only fallback through zoom 20, beneath AEGIS operational routes and hazard layers;
- changes from globe to Mercator during zoom at the controlled threshold, with hysteresis to prevent projection flapping;
- detaches terrain before a projection change and restores it only after the zoom settles;
- starts idle orbit promptly, uses a restrained visible speed, and avoids replaying the initial world flight on unrelated renders.

NASA Blue Marble and EOX Sentinel-2 cloudless imagery are dated geographic context, not live satellite imagery. OpenFreeMap, CARTO and their OpenStreetMap-derived vectors remain the source of streets, administrative context and available building geometry.

## Interface standard

The active interface follows a conventional GIS/emergency-operations hierarchy:

- flat charcoal surfaces instead of neon gradients, glass effects or decorative glow;
- normal sentence-case operational labels instead of promotional or science-fiction wording;
- square 2–4 px control and panel radii;
- 11–14 px readable interface typography with tabular operational numbers;
- blue reserved for routes and selections, green for safe/approved state, red for damage/critical state, amber for warnings, and grey for unavailable context;
- visible navigation names, a restrained header and a map-first 1366 × 768 layout;
- all existing layer controls, panel dragging, docking, minimizing, resizing and reset behaviour preserved.

## Release acceptance

Use a clean current Chrome session at 100% zoom:

- confirm Earth, coastlines and imagery appear at initial load;
- observe longitude change after the startup delay;
- confirm drag and wheel pause orbit;
- zoom continuously past the globe/flat-map boundary and confirm no black canvas;
- search a country and a city, then confirm country/city labels and street context;
- search a landmark and confirm close-range terrain/building context where public data exists;
- return to **Global map** and confirm the slightly tilted full-Earth framing;
- check 1366 × 768 for clipped search, scene, layer, timeline or decision controls;
- confirm browser console has no application error.

Free public providers have no availability SLA. If one basemap fails, AEGIS switches to the independent fallback. If optional imagery fails while vectors remain healthy, the basemap is retained and the UI reports degraded imagery rather than discarding the world map.

## Accepted public release

- Command center Worker: `58accdae-9be1-440c-b7f2-3cec0ff45e86`
- Agent Ledger Worker: `af5d0e22-9ed7-4e83-b0ff-ea62a312114f`
- Canonical verification: 67 total tests, 66 passed, zero failed, one intentionally skipped public-network test.
- Remote-browser evidence: labelled globe visible; orbit visibly advanced after six seconds; New Delhi search completed; district and street names remained visible after five additional zoom steps; the canvas did not turn black; browser warning/error log was empty.
- Public API smoke checks returned HTTP 200 for health, provider readiness, simulation catalog and Agent Ledger activity.

This acceptance used the deployed public site and did not start a local host. It is not a substitute for the final Lenovo LOQ device check.
