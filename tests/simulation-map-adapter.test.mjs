import assert from "node:assert/strict";
import test from "node:test";

import {
  createEitFaridabadScenario,
  createEvacuationPlan,
  runSimulation,
} from "../lib/simulation/index.ts";
import { buildAegisMapLayers } from "../lib/simulation/map-adapter.ts";

function allFeatures(layers) {
  return Object.values(layers).flatMap((layer) => layer?.features ?? []);
}

test("map adapter produces complete time-selected flood and operations layers", () => {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);
  const evacuationPlan = createEvacuationPlan(scenario, result);
  const layers = buildAegisMapLayers({
    scenario,
    result,
    selectedMinute: 63,
    evacuationPlan,
  });

  assert.ok(layers.floodDepth.features.length > 0);
  assert.ok(layers.floodFlow.features.length > 0);
  assert.equal(layers.roads.features.length, scenario.assets.roads.length);
  assert.equal(layers.evacuationRoutes.features.length, evacuationPlan.routes.length);
  assert.equal(layers.resources.features.length, scenario.assets.responders.length);
  assert.equal(layers.hospitals.features.length, 1);
  assert.equal(layers.shelters.features.length, 3);
  assert.ok(layers.impactZones.features.length > 0);

  const flood = layers.floodDepth.features[0];
  assert.equal(flood.geometry.type, "Polygon");
  assert.equal(flood.geometry.coordinates[0][0][0], flood.geometry.coordinates[0].at(-1)[0]);
  assert.equal(flood.geometry.coordinates[0][0][1], flood.geometry.coordinates[0].at(-1)[1]);
  assert.equal(flood.properties.selectedMinute, 65);
  assert.equal(flood.properties.evidenceClass, "Simulated");
  assert.equal(flood.properties.geometryEvidenceClass, "Simulated");
  assert.equal(flood.properties.statusEvidenceClass, "Simulated");
  assert.equal(flood.properties.Observed, false);
  assert.equal(flood.properties.Imported, false);
  assert.equal(flood.properties.Estimated, false);
  assert.equal(flood.properties.Simulated, true);
  assert.match(flood.properties.provenanceSummary, /scenario-input/i);
  assert.match(flood.properties.estimateLabel, /prototype planning estimate/i);

  assert.ok(layers.floodFlow.features.every((feature) => feature.geometry.coordinates.length === 2));
  assert.ok(layers.roads.features.every((feature) => ["open", "restricted", "closed"].includes(feature.properties.status)));
  assert.ok(layers.evacuationRoutes.features.every((feature) => ["safe", "warning", "blocked"].includes(feature.properties.status)));
  assert.ok(layers.resources.features.every((feature) => feature.geometry.type === "Point"));
  assert.ok(layers.hospitals.features.every((feature) => Number.isFinite(feature.properties.bedsAvailable)));
  assert.ok(layers.shelters.features.every((feature) => Number.isFinite(feature.properties.capacity)));

  for (const feature of allFeatures(layers)) {
    assert.equal(feature.properties.simulationRunId, result.runId);
    assert.equal(feature.properties.scenarioId, scenario.metadata.id);
    assert.ok(["Observed", "Imported", "Estimated", "Simulated"].includes(feature.properties.evidenceClass));
  }
});

test("map adapter renders non-flood hazards as impact polygons without fake water", () => {
  for (const hazard of ["earthquake", "wildfire", "cyclone", "chemical"]) {
    const scenario = createEitFaridabadScenario(hazard);
    const result = runSimulation(scenario);
    const evacuationPlan = createEvacuationPlan(scenario, result);
    const layers = buildAegisMapLayers({
      scenario,
      result,
      selectedMinute: result.metrics.peakMinute,
      evacuationPlan,
    });

    assert.equal(layers.floodDepth.features.length, 0, hazard);
    assert.equal(layers.floodFlow.features.length, 0, hazard);
    assert.ok(layers.impactZones.features.length > 0, hazard);
    assert.ok(
      layers.impactZones.features.some(
        (feature) => feature.properties.impactType === hazard,
      ),
      hazard,
    );
    assert.equal(layers.evacuationRoutes.features.length, evacuationPlan.routes.length, hazard);
    assert.equal(layers.resources.features.length, scenario.assets.responders.length, hazard);
    assert.equal(layers.impactSnapshot.secondaryConsequences.every((item) => item.classification === "simulated"), true, hazard);
    assert.equal(layers.impactSnapshot.uncertaintyCells.length, result.field.length, hazard);
  }
});

test("map adapter validates run ownership and supports display thresholds", () => {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);
  const allCells = buildAegisMapLayers({
    scenario,
    result,
    selectedMinute: -500,
    options: { includeNegligibleCells: true },
  });
  assert.equal(allCells.floodDepth.features.length, scenario.terrain.length);
  assert.equal(allCells.floodDepth.features[0].properties.selectedMinute, 0);

  const mismatched = createEitFaridabadScenario("flood", { seed: "different" });
  const mismatchedResult = runSimulation(mismatched);
  const mismatchedPlan = createEvacuationPlan(mismatched, mismatchedResult);
  assert.throws(
    () => buildAegisMapLayers({
      scenario,
      result,
      selectedMinute: 30,
      evacuationPlan: mismatchedPlan,
    }),
    /different simulation run/i,
  );
});
