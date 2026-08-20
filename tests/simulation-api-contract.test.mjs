import assert from "node:assert/strict";
import test from "node:test";

import {
  apiEvacuationOptionsSchema,
  apiScenarioSchema,
  evacuationRequestFromApi,
  scenarioFromApi,
} from "../lib/simulation/api-contract.ts";
import {
  buildImpactSnapshot,
  createEvacuationPlan,
  runSimulation,
} from "../lib/simulation/index.ts";
import { buildAegisMapLayers } from "../lib/simulation/map-adapter.ts";

const HAZARDS = ["flood", "earthquake", "wildfire", "cyclone", "chemical"];

test("all five API hazard selections complete simulation, planning, impact and map contracts", () => {
  for (const hazard of HAZARDS) {
    const parsedScenario = apiScenarioSchema.parse({
      hazard,
      seed: `api-contract-${hazard}`,
    });
    const scenario = scenarioFromApi(parsedScenario);
    const result = runSimulation(scenario);
    const evacuationPlan = createEvacuationPlan(scenario, result);
    const impactSnapshot = buildImpactSnapshot({
      scenario,
      result,
      selectedMinute: result.metrics.peakMinute,
      evacuationPlan,
    });
    const mapLayers = buildAegisMapLayers({
      scenario,
      result,
      selectedMinute: result.metrics.peakMinute,
      evacuationPlan,
      impactSnapshot,
    });

    assert.equal(result.hazard, hazard);
    assert.equal(evacuationPlan.simulationRunId, result.runId);
    assert.equal(impactSnapshot.simulationRunId, result.runId);
    assert.equal(mapLayers.impactSnapshot.simulationRunId, result.runId);
    assert.equal(mapLayers.evacuationRoutes.features.length, evacuationPlan.routes.length);
    assert.doesNotThrow(() => JSON.stringify({ result, evacuationPlan, impactSnapshot, mapLayers }));

    if (evacuationPlan.endPoints.length === 0) {
      assert.equal(evacuationPlan.routes.length, 0);
      assert.ok(evacuationPlan.residualDemand.length > 0);
      assert.match(evacuationPlan.warnings.join(" "), /destination is screened unavailable/i);
    }
  }
});

test("API evacuation controls survive validation and conversion without silent loss", () => {
  const parsed = apiEvacuationOptionsSchema.parse({
    departureMinute: 25,
    preferredMode: "pedestrian",
    minimumRouteReliability: 0.72,
    maximumRouteRisk: 0.35,
    reserveShelterFraction: 0.2,
    routeCapacitySafetyFactor: 0.55,
    avoidRoadIds: ["road-a", "road-a", "road-b"],
  });
  const request = evacuationRequestFromApi(parsed);

  assert.equal(request.minimumRouteReliability, 0.72);
  assert.equal(request.maximumRouteRisk, 0.35);
  assert.equal(request.reserveShelterFraction, 0.2);
  assert.equal(request.routeCapacitySafetyFactor, 0.55);
  assert.deepEqual(request.avoidRoadIds, ["road-a", "road-b"]);
  assert.equal(request.preferredMode, "pedestrian");
  assert.equal(request.departureMinute, 25);
});

test("wildfire humidity and cyclone central pressure are active, deterministic inputs", () => {
  const dryWildfire = runSimulation(scenarioFromApi(apiScenarioSchema.parse({
    hazard: "wildfire",
    seed: "humidity-sensitivity",
    parameterOverrides: { relativeHumidityPct: 10 },
  })));
  const humidWildfire = runSimulation(scenarioFromApi(apiScenarioSchema.parse({
    hazard: "wildfire",
    seed: "humidity-sensitivity",
    parameterOverrides: { relativeHumidityPct: 90 },
  })));
  assert.ok(dryWildfire.metrics.maximumHazardValue > humidWildfire.metrics.maximumHazardValue);

  const deepCyclone = runSimulation(scenarioFromApi(apiScenarioSchema.parse({
    hazard: "cyclone",
    seed: "pressure-sensitivity",
    parameterOverrides: { centralPressureHpa: 900 },
  })));
  const weakCyclone = runSimulation(scenarioFromApi(apiScenarioSchema.parse({
    hazard: "cyclone",
    seed: "pressure-sensitivity",
    parameterOverrides: { centralPressureHpa: 1_005 },
  })));
  assert.ok(deepCyclone.metrics.maximumHazardValue > weakCyclone.metrics.maximumHazardValue);
});
