import assert from "node:assert/strict";
import test from "node:test";

import {
  createEitFaridabadScenario,
  createEvacuationPlan,
  createLocationScenario,
  runSimulation,
} from "../lib/simulation/index.ts";
import {
  buildTwinScene,
  createEitCampusDataset,
} from "../lib/twin/index.ts";

function buildFloodFixture(selectedMinute = 62.5) {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);
  const evacuationPlan = createEvacuationPlan(scenario, result);
  return {
    scenario,
    result,
    evacuationPlan,
    scene: buildTwinScene({
      scenario,
      result,
      evacuationPlan,
      selectedMinute,
    }),
  };
}

test("EIT twin uses official map center while geometry and terrain remain estimated", () => {
  const scenario = createEitFaridabadScenario("flood");
  const dataset = createEitCampusDataset();
  const expectedCenter = { lat: 28.3912265, lon: 77.4398682 };
  const scenarioCenter = {
    lat: (scenario.area.north + scenario.area.south) / 2,
    lon: (scenario.area.east + scenario.area.west) / 2,
  };

  assert.deepEqual(dataset.center, expectedCenter);
  assert.ok(Math.abs(scenarioCenter.lat - expectedCenter.lat) < 1e-7);
  assert.ok(Math.abs(scenarioCenter.lon - expectedCenter.lon) < 1e-7);
  assert.ok(
    scenario.provenance.some(
      (source) =>
        source.id === "prov-eit-official-map-center" &&
        source.kind === "open-data" &&
        /coordinate only/i.test(source.note),
    ),
  );
  assert.equal(dataset.provenance.find((source) => source.classification === "IMPORTED").sourceId, "eit-official-contact-map-center");
  assert.match(dataset.prototypeLabel, /FOOTPRINTS IMPORTED/i);
  assert.match(dataset.prototypeLabel, /ESTIMATED/i);
  assert.match(dataset.disclaimer, /surveyed boundary, BIM, DEM/i);

  assert.equal(dataset.buildings.length, 21);
  assert.equal(dataset.terrainControlPoints.length, 49);
  assert.ok(dataset.buildings.every((building) => building.provenance.classification === "IMPORTED"));
  assert.ok(dataset.buildings.every((building) => building.attributeProvenance.classification === "ESTIMATED"));
  assert.ok(dataset.terrainControlPoints.every((point) => point.provenance.classification === "ESTIMATED"));
  assert.ok(dataset.buildings.every((building) => building.floors >= 1 && building.heightM > building.floors * 2.5));
  assert.ok(dataset.buildings.some((building) => building.floors >= 3));
  assert.ok(dataset.buildings.every((building) => {
    const ring = building.footprint.coordinates[0];
    return ring.length >= 4 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
  }));
  assert.deepEqual(dataset, createEitCampusDataset());
});

test("twin flood surface is deterministic, continuous and contains no cell grid", () => {
  const fixture = buildFloodFixture(62.5);
  const repeated = buildTwinScene({
    scenario: fixture.scenario,
    result: fixture.result,
    evacuationPlan: fixture.evacuationPlan,
    selectedMinute: 62.5,
  });
  const flood = fixture.scene.flood;

  assert.deepEqual(fixture.scene, repeated);
  assert.equal(flood.minute, 62.5);
  assert.equal(flood.lowerFrameMinute, 60);
  assert.equal(flood.upperFrameMinute, 65);
  assert.equal(flood.interpolationFraction, 0.5);
  assert.equal(flood.renderMode, "continuous-interpolated-surface");
  assert.equal(flood.gridVisible, false);
  assert.ok(flood.maximumDepthM > 0.5);
  assert.ok(flood.affectedAreaSqKm > 0);
  assert.ok(flood.extentPolygons.length > 0);
  assert.ok(flood.extentPolygons.length < fixture.scenario.terrain.length / 4);
  assert.ok(flood.contours.length > 0);
  assert.ok(flood.extentPolygons.every((polygon) =>
    polygon.geometry.coordinates[0].length > 20));
  assert.ok(flood.contours.every((contour) =>
    contour.geometry.type === "LineString" && contour.geometry.coordinates.length >= 4));
  assert.ok(flood.extentPolygons.every((polygon) => polygon.provenance.classification === "SIMULATED"));

  const at60 = buildTwinScene({
    scenario: fixture.scenario,
    result: fixture.result,
    selectedMinute: 60,
  }).flood;
  const at65 = buildTwinScene({
    scenario: fixture.scenario,
    result: fixture.result,
    selectedMinute: 65,
  }).flood;
  assert.notEqual(flood.maximumDepthM, at60.maximumDepthM);
  assert.notEqual(flood.maximumDepthM, at65.maximumDepthM);
  assert.ok(
    flood.maximumDepthM >= Math.min(at60.maximumDepthM, at65.maximumDepthM) &&
    flood.maximumDepthM <= Math.max(at60.maximumDepthM, at65.maximumDepthM),
  );
});

test("building states expose depth, damage, access and floor-by-floor effects", () => {
  const { scene } = buildFloodFixture(70);

  assert.equal(scene.buildings.length, scene.campus.buildings.length);
  assert.ok(scene.buildings.every((building) => building.floorImpacts.length >= 1));
  assert.ok(scene.buildings.every((building) => building.damageIndex >= 0 && building.damageIndex <= 1));
  assert.ok(scene.buildings.every((building) => ["open", "restricted", "closed"].includes(building.accessStatus)));
  assert.ok(scene.buildings.every((building) => building.explanation.length >= 4));
  assert.ok(scene.buildings.every((building) => building.geometryProvenance.classification === "IMPORTED"));
  assert.ok(scene.buildings.every((building) => building.impactProvenance.classification === "SIMULATED"));
  assert.ok(scene.buildings.some((building) => building.floorsAffected > 0));
  assert.ok(scene.buildings.some((building) => building.damageBand !== "none"));
  assert.ok(scene.buildings.every((building) =>
    building.floorImpacts.filter((floor) => floor.status === "affected").length === building.floorsAffected));
  assert.ok(scene.buildings.every((building) => /not an injury or casualty estimate/i.test(building.explanation.at(-1))));
});

test("evacuation agents and vehicles advance deterministically along route trajectories", () => {
  const { scenario, result, evacuationPlan } = buildFloodFixture(16);
  const scene = buildTwinScene({
    scenario,
    result,
    evacuationPlan,
    selectedMinute: 16,
    options: { maximumAnimatedAgents: 48 },
  });

  assert.equal(scene.evacuation.planId, evacuationPlan.id);
  assert.ok(scene.evacuation.routes.length > 0);
  assert.ok(scene.evacuation.agents.length > scenario.assets.responders.length);
  assert.ok(scene.evacuation.agents.length <= 48);
  assert.ok(scene.evacuation.agents.some((agent) => agent.kind === "evacuation-group"));
  assert.ok(scene.evacuation.agents.some((agent) => agent.kind === "bus"));
  assert.ok(scene.evacuation.agents.some((agent) => agent.status === "en-route"));
  assert.ok(scene.evacuation.agents.every((agent) => agent.progress >= 0 && agent.progress <= 1));
  assert.ok(scene.evacuation.agents.filter((agent) => agent.animation).every((agent) =>
    agent.animation.path.length >= 2 && agent.animation.endMinute > agent.animation.startMinute));
  assert.ok(scene.evacuation.agents.every((agent) => agent.provenance.classification === "SIMULATED"));

  const later = buildTwinScene({
    scenario,
    result,
    evacuationPlan,
    selectedMinute: 17,
    options: { maximumAnimatedAgents: 48 },
  });
  const moving = scene.evacuation.agents.find((agent) => agent.status === "en-route");
  const moved = later.evacuation.agents.find((agent) => agent.id === moving.id);
  assert.ok(moved.progress >= moving.progress);
  assert.notDeepEqual(moved.coordinate, moving.coordinate);
});

test("scene carries globe/LOD metadata and refuses EIT geometry at other locations", () => {
  const { scene } = buildFloodFixture(30);
  assert.equal(scene.metadata.globe.projection, "globe");
  assert.equal(scene.metadata.globe.worldMapEnabled, true);
  assert.equal(scene.metadata.globe.crs, "EPSG:4326");
  assert.equal(scene.metadata.lod.profile, "laptop-balanced");
  assert.equal(scene.metadata.lod.floodSurfaceResolution, 4);
  assert.ok(scene.metadata.provenance.some((source) => source.classification === "IMPORTED"));
  assert.ok(scene.metadata.provenance.some((source) => source.classification === "ESTIMATED"));
  assert.ok(scene.metadata.provenance.some((source) => source.classification === "SIMULATED"));

  const remoteScenario = createLocationScenario({
    hazard: "flood",
    center: { lat: 35.6762, lon: 139.6503 },
    locationLabel: "Remote Test Area",
    seed: "remote-twin-test",
  });
  const remoteResult = runSimulation(remoteScenario);
  assert.throws(
    () => buildTwinScene({
      scenario: remoteScenario,
      result: remoteResult,
      selectedMinute: 30,
    }),
    /do not reuse the estimated EIT twin at another world location/i,
  );
});
