import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProviderCandidates,
  classifyMapFailure,
  providersAreIndependent,
} from "../components/map/providers.ts";
import {
  WORLD_DETAIL_IMAGERY_LAYER_MAX_ZOOM,
  WORLD_DETAIL_IMAGERY_OPACITY_STOPS,
  WORLD_CONTEXT_LAYER_IDS,
  WORLD_GLOBE_EXIT_ZOOM,
  WORLD_GLOBE_REENTRY_ZOOM,
  WORLD_GLOBE_DEFAULT_IDLE_RESUME_MS,
  WORLD_GLOBE_DEFAULT_ORBIT_SPEED,
  WORLD_GLOBE_INITIAL_ORBIT_DELAY_MS,
  WORLD_IMAGERY_LAYER_IDS,
  WORLD_IMAGERY_SOURCES,
  WORLD_RASTER_LABELS,
  WORLD_RASTER_STREETS,
  initialOrbitResumeDeadline,
  isProviderContextLabelLayer,
  nextOrbitLongitude,
  orbitResumeDeadline,
  shouldAdvanceOrbit,
  shouldAutoFlyToTwin,
  worldCameraForViewport,
  worldFocusUsesGlobe,
  worldPitchForFocus,
  worldProjectionModeForZoom,
} from "../components/map/globe-runtime.ts";
import { createEitFaridabadScenario, rankInterventions, runSimulation } from "../lib/simulation/index.ts";
import { createEitCampusDataset, parseTwinCampusDataset } from "../lib/twin/index.ts";
import { buildProductAlerts, pathDistanceKm, polygonAreaSqKm } from "../lib/workspace/index.ts";

test("zero-cost basemap candidates are independent and ordered", () => {
  const providers = buildProviderCandidates();
  assert.equal(providers[0].id, "openfreemap-dark");
  assert.equal(providers[1].id, "carto-dark");
  assert.equal(providersAreIndependent(providers[0], providers[1]), true);
  assert.equal(providers.every((provider) => !/google|mapbox/i.test(provider.styleUrl)), true);
});

test("basemap failover ignores terrain and AEGIS overlay failures", () => {
  assert.equal(classifyMapFailure({
    sourceId: "aegis-terrain-dem",
    message: "tile request failed",
    styleReady: true,
  }), "optional");
  assert.equal(classifyMapFailure({
    sourceId: "aegis-water-surface-source",
    message: "GeoJSON update failed",
    styleReady: true,
  }), "operational");
  assert.equal(classifyMapFailure({
    message: "Source aegis-water-surface-source could not be updated",
    styleReady: true,
  }), "operational");
  assert.equal(classifyMapFailure({
    sourceId: "openmaptiles",
    message: "vector tile request failed",
    styleReady: true,
  }), "base-resource");
  assert.equal(classifyMapFailure({
    sourceId: "aegis-world-sentinel",
    message: "satellite tile request failed",
    styleReady: true,
  }), "optional");
});

test("world surface uses independent keyless imagery with a street-detail handoff", () => {
  assert.equal(WORLD_IMAGERY_SOURCES.length, 2);
  assert.equal(WORLD_IMAGERY_LAYER_IDS.length, 2);
  assert.equal(new URL(WORLD_IMAGERY_SOURCES[0].tiles[0]).hostname, "gibs.earthdata.nasa.gov");
  assert.equal(new URL(WORLD_IMAGERY_SOURCES[1].tiles[0]).hostname, "tiles.maps.eox.at");
  assert.equal(WORLD_IMAGERY_SOURCES.every((source) => !/[?&](key|token)=/i.test(source.tiles[0])), true);
  assert.ok(WORLD_IMAGERY_SOURCES.every((source) => source.maxzoom >= 8));
  assert.equal(WORLD_DETAIL_IMAGERY_LAYER_MAX_ZOOM, 20);
  const imageryOpacityByZoom = new Map(
    Array.from({ length: WORLD_DETAIL_IMAGERY_OPACITY_STOPS.length / 2 }, (_, index) => [
      WORLD_DETAIL_IMAGERY_OPACITY_STOPS[index * 2],
      WORLD_DETAIL_IMAGERY_OPACITY_STOPS[index * 2 + 1],
    ]),
  );
  assert.equal(imageryOpacityByZoom.get(14), 0.34);
  assert.ok(imageryOpacityByZoom.get(18) <= 0.1);
  assert.equal(worldFocusUsesGlobe(4.7), true);
  assert.equal(worldFocusUsesGlobe(6.5), false);
  assert.equal(worldFocusUsesGlobe(14.2), false);
  assert.equal(worldFocusUsesGlobe(16.2), false);
});

test("provider-independent world context defines roads, road names, countries and cities", () => {
  assert.deepEqual(Object.keys(WORLD_CONTEXT_LAYER_IDS).sort(), [
    "cityLabels",
    "countryLabels",
    "roadCasing",
    "roadLabels",
    "roads",
  ]);
  assert.equal(new Set(Object.values(WORLD_CONTEXT_LAYER_IDS)).size, 5);
  assert.ok(Object.values(WORLD_CONTEXT_LAYER_IDS).every((id) => id.startsWith("aegis-world-")));
});

test("glyph-free CARTO label tiles cover world through street zoom and degrade independently", () => {
  assert.equal(WORLD_RASTER_LABELS.minzoom, 0);
  assert.equal(WORLD_RASTER_LABELS.maxzoom, 20);
  assert.equal(WORLD_RASTER_LABELS.tiles.length, 4);
  assert.ok(WORLD_RASTER_LABELS.tiles.every((url) => (
    new URL(url).hostname.endsWith("basemaps.cartocdn.com")
      && url.includes("/dark_only_labels/")
      && !/[?&](?:key|token)=/i.test(url)
  )));
  assert.match(WORLD_RASTER_LABELS.attribution, /CARTO/);
  assert.match(WORLD_RASTER_LABELS.attribution, /OpenStreetMap/);
  assert.equal(classifyMapFailure({
    sourceId: WORLD_RASTER_LABELS.sourceId,
    message: "label tile request failed",
    styleReady: true,
  }), "optional");
});

test("keyless CARTO/OSM no-label street base replaces satellite overzoom at every location", () => {
  assert.equal(WORLD_RASTER_STREETS.layerMinzoom, 5);
  assert.equal(WORLD_RASTER_STREETS.maxzoom, 20);
  assert.equal(WORLD_RASTER_STREETS.tiles.length, 4);
  assert.ok(WORLD_RASTER_STREETS.tiles.every((url) => (
    new URL(url).hostname.endsWith("basemaps.cartocdn.com")
      && url.includes("/dark_nolabels/")
      && !/[?&](?:key|token)=/i.test(url)
  )));
  const streetOpacityByZoom = new Map(
    Array.from({ length: WORLD_RASTER_STREETS.opacityStops.length / 2 }, (_, index) => [
      WORLD_RASTER_STREETS.opacityStops[index * 2],
      WORLD_RASTER_STREETS.opacityStops[index * 2 + 1],
    ]),
  );
  assert.equal(streetOpacityByZoom.get(5.5), 0);
  assert.ok(streetOpacityByZoom.get(11) >= 0.9);
  assert.equal(classifyMapFailure({
    sourceId: WORLD_RASTER_STREETS.sourceId,
    message: "street tile request failed",
    styleReady: true,
  }), "optional");
});

test("style reload reinstalls street, label, marker and pulse layers below operations", async () => {
  const source = await readFile(new URL("../components/map/AegisMap.tsx", import.meta.url), "utf8");
  const styleLoadStart = source.indexOf('map.on("style.load"');
  const styleLoadEnd = source.indexOf('map.on("mousedown"', styleLoadStart);
  const reloadPath = source.slice(styleLoadStart, styleLoadEnd);
  assert.ok(styleLoadStart > 0 && styleLoadEnd > styleLoadStart);
  assert.match(reloadPath, /installWorldImagery\(map\)/);
  assert.match(reloadPath, /installRasterStreetFallback\(map\)/);
  assert.match(reloadPath, /enableProviderVectorContext\(map\)/);
  assert.match(reloadPath, /installRasterLabelFallback\(map\)/);
  assert.match(reloadPath, /promoteOperationalPriorityMarkers\(map\)/);
  assert.ok(reloadPath.indexOf("installRasterStreetFallback(map)") < reloadPath.indexOf("addMapLayers(map"));
  assert.ok(reloadPath.indexOf("installRasterLabelFallback(map)") < reloadPath.indexOf("addMapLayers(map"));
  assert.match(source, /aegis-selection-focus-halo/);
  assert.match(source, /aegis-incident-live-pulse/);
  assert.match(source, /aegis-hazard-footprint-fill/);
  assert.match(source, /aegis-hazard-vector-line/);
  assert.match(source, /hazardFootprints: asAny\(layers\.hazardFootprints\)/);
  assert.match(source, /hazardVectors: asAny\(layers\.hazardVectors\)/);
});

test("world camera keeps a restrained presentation tilt and orbit pauses then wraps smoothly", () => {
  const laptop = worldCameraForViewport(1366, 768);
  const compact = worldCameraForViewport(900, 520);
  assert.equal(laptop.pitch, 12);
  assert.equal(laptop.bearing, -8);
  assert.ok(laptop.zoom > compact.zoom);
  assert.equal(worldPitchForFocus(1.84, 0), 12);
  assert.equal(worldPitchForFocus(12.2, 42), 42);
  assert.equal(WORLD_GLOBE_DEFAULT_ORBIT_SPEED, 0.5);
  assert.equal(WORLD_GLOBE_DEFAULT_IDLE_RESUME_MS, 3_200);
  assert.equal(WORLD_GLOBE_INITIAL_ORBIT_DELAY_MS, 650);
  assert.equal(initialOrbitResumeDeadline(1_000), 1_650);
  assert.equal(orbitResumeDeadline(1_000, WORLD_GLOBE_DEFAULT_IDLE_RESUME_MS), 4_200);
  assert.equal(orbitResumeDeadline(1_000, 6_500, 2_400), 9_900);
  assert.equal(nextOrbitLongitude(179.99, 1.25, 0.1) < -179, true);
  assert.equal(shouldAdvanceOrbit({
    worldView: true,
    enabled: true,
    reducedMotion: false,
    documentVisible: true,
    nowMs: 10_000,
    resumeAtMs: 9_000,
    lastFrameMs: 9_950,
    moving: false,
  }), true);
  assert.equal(shouldAdvanceOrbit({
    worldView: true,
    enabled: true,
    reducedMotion: false,
    documentVisible: true,
    nowMs: 10_000,
    resumeAtMs: 11_000,
    lastFrameMs: 9_950,
    moving: false,
  }), false);
});

test("globe projection hands off before local detail and uses hysteresis on zoom-out", () => {
  assert.equal(worldProjectionModeForZoom(WORLD_GLOBE_EXIT_ZOOM - 0.01, "globe"), "globe");
  assert.equal(worldProjectionModeForZoom(WORLD_GLOBE_EXIT_ZOOM, "globe"), "mercator");
  assert.equal(worldProjectionModeForZoom(WORLD_GLOBE_REENTRY_ZOOM + 0.01, "mercator"), "mercator");
  assert.equal(worldProjectionModeForZoom(WORLD_GLOBE_REENTRY_ZOOM, "mercator"), "globe");
});

test("globe orbit advances slowly and continuously while respecting runtime gates", () => {
  let longitude = 12;
  for (let frame = 0; frame < 120; frame += 1) {
    longitude = nextOrbitLongitude(longitude, 0.25, 0.05);
  }
  assert.ok(Math.abs(longitude - 13.5) < 1e-9);

  const ready = {
    worldView: true,
    enabled: true,
    reducedMotion: false,
    documentVisible: true,
    nowMs: 10_000,
    resumeAtMs: 9_000,
    lastFrameMs: 9_950,
    moving: false,
  };
  assert.equal(shouldAdvanceOrbit(ready), true);
  assert.equal(shouldAdvanceOrbit({ ...ready, worldView: false }), false);
  assert.equal(shouldAdvanceOrbit({ ...ready, enabled: false }), false);
  assert.equal(shouldAdvanceOrbit({ ...ready, reducedMotion: true }), false);
  assert.equal(shouldAdvanceOrbit({ ...ready, documentVisible: false }), false);
  assert.equal(shouldAdvanceOrbit({ ...ready, moving: true }), false);
  assert.equal(shouldAdvanceOrbit({ ...ready, lastFrameMs: 9_980 }), false);
});

test("controlled WORLD maps keep the globe instead of auto-flying to the twin", () => {
  assert.equal(shouldAutoFlyToTwin({ enabled: true, hasInitialCamera: false, controlledView: false }), true);
  assert.equal(shouldAutoFlyToTwin({ enabled: true, hasInitialCamera: false, controlledView: true }), false);
  assert.equal(shouldAutoFlyToTwin({ enabled: true, hasInitialCamera: true, controlledView: false }), false);
  assert.equal(shouldAutoFlyToTwin({ enabled: false, hasInitialCamera: false, controlledView: false }), false);
});

test("provider geographic labels are distinguishable from AEGIS overlay symbols", () => {
  assert.equal(isProviderContextLabelLayer({
    id: "road-label",
    type: "symbol",
    sourceLayer: "transportation_name",
    hasTextField: true,
  }), true);
  assert.equal(isProviderContextLabelLayer({
    id: "aegis-incident-label",
    type: "symbol",
    sourceLayer: "incidents",
    hasTextField: true,
  }), false);
  assert.equal(isProviderContextLabelLayer({
    id: "place-label",
    type: "symbol",
    sourceLayer: "place",
    hasTextField: false,
  }), false);
  assert.equal(isProviderContextLabelLayer({
    id: "country-name-label",
    type: "symbol",
    sourceLayer: "place",
    hasTextField: true,
  }), true);
});

test("validated campus import accepts the bundled EIT dataset and rejects malformed bounds", () => {
  const campus = createEitCampusDataset();
  const accepted = parseTwinCampusDataset(campus);
  assert.equal(accepted.ok, true);
  const rejected = parseTwinCampusDataset({ ...campus, bounds: { north: 1, south: 2, east: 1, west: 2 } });
  assert.equal(rejected.ok, false);
});

test("reverse-cascade ranking is reproducible and keeps advisory actions distinct", () => {
  const scenario = createEitFaridabadScenario("flood");
  const baseline = runSimulation(scenario);
  const first = rankInterventions(scenario, baseline);
  const second = rankInterventions(scenario, baseline);
  assert.deepEqual(first, second);
  assert.ok(first.ranked.some((candidate) => candidate.status === "screened"));
  assert.ok(first.ranked.some((candidate) => candidate.status === "advisory-only"));
  assert.ok(first.ranked.every((candidate) => candidate.classification === "simulated-comparison" || candidate.classification === "planning-advisory"));
});

test("measurement and threshold alerts are deterministic", () => {
  const distance = pathDistanceKm([
    { coordinates: [77.44, 28.39] },
    { coordinates: [77.45, 28.40] },
  ]);
  const area = polygonAreaSqKm([
    [77.44, 28.39], [77.45, 28.39], [77.45, 28.40], [77.44, 28.40],
  ]);
  assert.ok(distance > 1);
  assert.ok(area > 1);
  const alerts = buildProductAlerts({
    summary: { severelyDamagedBuildings: 3, closedRoads: 4, unavailableCriticalFacilities: 1 },
    humanImpact: { peopleRemainingInPlanningEnvelope: 800, mobilityAssistanceEstimate: 160 },
  });
  assert.equal(alerts.length, 5);
});
