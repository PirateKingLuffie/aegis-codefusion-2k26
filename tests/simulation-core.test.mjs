import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FLOOD_BRANCHES,
  buildImpactSnapshot,
  createEitFaridabadScenario,
  createEvacuationPlan,
  createSimulationEngine,
  getCellForecast,
  getSimulationCatalog,
  getSimulationSnapshot,
  runSimulation,
  runWhatIfBranches,
  summarizeForClient,
} from "../lib/simulation/index.ts";

test("EIT flood run is reproducible and carries explicit estimate labels", () => {
  const firstScenario = createEitFaridabadScenario("flood", { seed: "test-seed-a" });
  const secondScenario = createEitFaridabadScenario("flood", { seed: "test-seed-a" });
  const first = runSimulation(firstScenario);
  const second = runSimulation(secondScenario);

  assert.deepEqual(first, second);
  assert.match(first.estimateLabel, /prototype planning estimate/i);
  assert.match(first.disclaimer, /not live observations/i);
  assert.equal(first.model.classification, "deterministic-prototype");
  assert.equal(first.metrics.estimatedEconomicDamageInr, null);

  const changed = runSimulation(
    createEitFaridabadScenario("flood", { seed: "test-seed-b" }),
  );
  assert.notDeepEqual(first.field, changed.field);
  assert.notEqual(first.runId, changed.runId);
});

test("flood flagship contains complete cell hydrographs and impact screens", () => {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);

  assert.equal(result.timeline.length, 25);
  assert.equal(result.timeline[0].minute, 0);
  assert.equal(result.timeline.at(-1).minute, 120);
  assert.equal(result.field.length, scenario.gridRows * scenario.gridColumns);
  assert.ok(result.metrics.maximumHazardValue > 0.5);

  const wetCell = result.field.find((series) => series.peakValue > 0.6);
  assert.ok(wetCell);
  assert.equal(wetCell.samples.length, 25);
  assert.ok(wetCell.arrivalMinute !== null);
  assert.ok(wetCell.peakMinute >= wetCell.arrivalMinute);
  assert.ok(wetCell.recessionMinute >= wetCell.peakMinute);
  assert.ok(wetCell.confidence.score > 0 && wetCell.confidence.score <= 1);
  assert.ok(wetCell.samples.some((sample) => sample.phase === "rising"));
  assert.ok(wetCell.samples.some((sample) => sample.phase === "receding"));
  assert.ok(wetCell.samples.some((sample) => sample.velocityMps > 0));
  assert.ok(wetCell.samples.every((sample) => sample.directionDeg >= 0 && sample.directionDeg < 360));

  assert.equal(result.impacts.roads.length, scenario.assets.roads.length);
  assert.equal(result.impacts.bridges.length, scenario.assets.bridges.length);
  assert.equal(result.impacts.buildings.length, scenario.assets.buildings.length);
  assert.equal(result.impacts.population.length, scenario.assets.populationZones.length);
  assert.ok(result.impacts.hospitals.length > 0);
  assert.ok(result.impacts.shelters.length >= 3);
  assert.ok(result.impacts.utilities.length >= 3);
  assert.ok(result.impacts.roads.some((road) => road.closures.length > 0));
  assert.ok(result.impacts.roads.every((road) => road.passability.ambulance));
  assert.ok(result.impacts.buildings.every((building) => building.explanation.length >= 2));
  assert.ok(result.impacts.population.every((zone) => zone.peopleExposed <= scenario.assets.populationZones.find((item) => item.id === zone.zoneId).population));

  const forecast = getCellForecast(result, { lat: 28.25, lon: 77.22 });
  assert.equal(forecast.samples.length, 25);
  const snapshot = getSimulationSnapshot(result, 63);
  assert.equal(snapshot.frame.minute, 65);
  assert.equal(snapshot.cells.length, result.field.length);
});

test("five deterministic hazard plugins share one stable result contract", () => {
  const engine = createSimulationEngine();
  const hazards = ["flood", "earthquake", "wildfire", "cyclone", "chemical"];
  assert.deepEqual(engine.listPlugins().map((plugin) => plugin.kind).sort(), [...hazards].sort());

  for (const hazard of hazards) {
    const scenario = createEitFaridabadScenario(hazard, { seed: `plugin-${hazard}` });
    const result = engine.run(scenario);
    assert.equal(result.hazard, hazard);
    assert.equal(result.timeline.length, 25);
    assert.equal(result.field.length, 120);
    assert.ok(result.field.every((series) => series.samples.length === 25));
    assert.ok(Number.isFinite(result.metrics.maximumHazardValue));
    assert.ok(result.metrics.maximumHazardValue >= 0);
    assert.ok(result.impacts.roads.length > 0);
    assert.ok(result.impacts.population.length > 0);
    assert.equal(result.runId, engine.run(scenario).runId);
    const summaries = result.timeline.map((frame) => frame.hazardSummary);
    if (hazard === "earthquake") assert.ok(summaries.some((summary) => summary.maximumPgaG > 0));
    if (hazard === "wildfire") assert.ok(summaries.some((summary) => summary.maximumFirelineIntensityKwM > 0));
    if (hazard === "cyclone") assert.ok(summaries.some((summary) => summary.maximumGustKph > 0));
    if (hazard === "chemical") assert.ok(summaries.some((summary) => summary.maximumConcentrationMgM3 > 0));
  }
});

test("what-if branches are deterministic and report deltas from baseline", () => {
  const scenario = createEitFaridabadScenario("flood");
  const comparison = runWhatIfBranches(scenario, DEFAULT_FLOOD_BRANCHES);
  const repeated = runWhatIfBranches(scenario, DEFAULT_FLOOD_BRANCHES);

  assert.deepEqual(comparison, repeated);
  assert.equal(comparison.branches.length, 3);
  const escalation = comparison.branches.find((branch) => branch.branch.id === "rainfall-escalation");
  const restored = comparison.branches.find((branch) => branch.branch.id === "drainage-restored");
  assert.ok(escalation.result.metrics.maximumHazardValue > comparison.baseline.metrics.maximumHazardValue);
  assert.ok(restored.result.metrics.maximumHazardValue < comparison.baseline.metrics.maximumHazardValue);
  assert.equal(
    escalation.deltaFromBaseline.peakUnavailableRoads,
    escalation.result.metrics.peakUnavailableRoads - comparison.baseline.metrics.peakUnavailableRoads,
  );
});

test("one-click evacuation produces alternatives, capacity stages and before/after metrics", () => {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);
  const plan = createEvacuationPlan(scenario, result);
  const repeated = createEvacuationPlan(scenario, result);

  assert.deepEqual(plan, repeated);
  assert.match(plan.generatedBy, /deterministic evacuation planner/i);
  assert.ok(plan.routes.length >= 3);
  assert.ok(plan.routes.some((route) => route.status === "alternate"));
  assert.ok(plan.routes.every((route) => route.nodeIds.length >= 2));
  assert.ok(plan.routes.every((route) => route.edgeIds.length === route.hazardSegments.length));
  assert.ok(plan.routes.every((route) => route.hazardSegments.every((segment) => segment.status !== "closed")));
  assert.ok(plan.routes.every((route) => route.mode === "bus"));
  assert.ok(plan.routes.every((route) => route.estimatedArrivalMinute >= route.screenedDepartureMinute));
  assert.ok(plan.routes.every((route) => route.hazardSegments.every((segment) => segment.passable && segment.mode === route.mode && segment.screenedMinute >= route.screenedDepartureMinute)));
  assert.ok(plan.stages.length >= 3);
  assert.ok(plan.stages.some((stage) => stage.populationAssigned > 0));
  assert.ok(plan.stages.every((stage) => stage.departureWindow.endMinute > stage.departureWindow.startMinute));
  assert.ok(plan.shelterAllocations.length >= 2);
  assert.ok(plan.shelterAllocations.every((shelter) => shelter.assignedEvacuees + shelter.baselineOccupancy + shelter.remainingCapacity >= shelter.assignedEvacuees));
  assert.equal(plan.before.peopleCoveredByPlan, 0);
  assert.ok(plan.after.peopleCoveredByPlan > 0);
  assert.ok(plan.after.peopleRemainingExposed < plan.before.peopleRemainingExposed);
  assert.ok(plan.improvement.exposedPeopleReductionPct > 0);
  assert.equal(plan.after.routesCrossingClosures, 0);
  assert.ok(plan.resourceAssignments.length > 0);
  assert.equal(plan.networkEvidenceClassification, "estimated");
  assert.ok(plan.shelterCapacitySummary.reservedPlaces > 0);
  assert.ok(plan.shelterCapacitySummary.assignedPlaces <= plan.shelterCapacitySummary.assignablePlaces);
  assert.equal(plan.after.residualShelterDemand, plan.shelterCapacitySummary.residualDemand);
  assert.equal(plan.stagingSummary.stageCount, plan.stages.length);

  const custom = createEvacuationPlan(scenario, result, {
    startPoints: [{ id: "selected-start", label: "Selected start", coordinate: { lat: 28.2501, lon: 77.2199 } }],
    endPoints: [{ id: "facility-shelter-south", label: "Selected safe endpoint", coordinate: { lat: 28.2385, lon: 77.227 } }],
    departureMinute: 10,
    maxRoutesPerOrigin: 2,
  });
  assert.equal(custom.startPoints[0].id, "selected-start");
  assert.ok(custom.startPoints[0].nodeId);
  assert.equal(custom.endPoints[0].id, "facility-shelter-south");
  assert.ok(custom.routes.length >= 1 && custom.routes.length <= 2);
});

test("evacuation constraints expose residual demand rather than routing through forbidden roads", () => {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);
  const constrained = createEvacuationPlan(scenario, result, {
    avoidRoadIds: scenario.assets.roads.map((road) => road.id),
    reserveShelterFraction: 0.2,
    routeCapacitySafetyFactor: 0.5,
  });

  assert.equal(constrained.routes.length, 0);
  assert.ok(constrained.residualDemand.length > 0);
  assert.ok(constrained.residualDemand.every((item) => item.reason === "no-passable-route"));
  assert.ok(constrained.after.peopleRemainingExposed > 0);
  assert.equal(constrained.after.unroutableHighRiskZones, constrained.residualDemand.length);
});

test("impact snapshot returns secondary effects, uncertainty and recovery with truth limits", () => {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);
  const plan = createEvacuationPlan(scenario, result);
  const snapshot = buildImpactSnapshot({ scenario, result, selectedMinute: 65, evacuationPlan: plan });

  assert.ok(snapshot.secondaryConsequences.length > 0);
  assert.equal(snapshot.uncertaintyCells.length, result.field.length);
  assert.match(snapshot.uncertaintySummary.notice, /not statistical forecast probabilities/i);
  assert.ok(snapshot.recoveryPlan.actions.length > 0);
  assert.match(snapshot.recoveryPlan.notice, /qualified authorities/i);
  assert.equal(snapshot.humanImpact.observedFatalities, null);
  assert.equal(snapshot.humanImpact.casualtyStatus, "not-modelled");
});

test("client summary and catalog expose ready and coming-soon capabilities", () => {
  const scenario = createEitFaridabadScenario("flood");
  const result = runSimulation(scenario);
  const plan = createEvacuationPlan(scenario, result);
  const summary = summarizeForClient(result, plan);
  const catalog = getSimulationCatalog();

  assert.equal(summary.runId, result.runId);
  assert.equal(summary.timeline.length, 25);
  assert.equal(summary.evacuationCoveragePct, plan.after.coveragePct);
  assert.equal(catalog.filter((item) => item.status === "ready").length, 5);
  assert.ok(catalog.filter((item) => item.status === "coming-soon").length >= 5);
  assert.equal(catalog.find((item) => item.hazard === "flood").flagship, true);
});
