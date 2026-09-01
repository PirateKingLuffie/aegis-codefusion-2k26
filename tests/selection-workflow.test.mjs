import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSelectionWorkflowAssessment,
  selectionAreaDimensionsMeters,
  selectionAreaSummary,
  selectionFingerprint,
  selectionHasOperationalInput,
  selectionPlanningAnchor,
} from "../components/command-center/selection-workflow.ts";

const selection = {
  points: [
    { id: "source-1", role: "hazard-source", coordinates: [77.231, 28.251], label: "FLOOD SOURCE" },
    { id: "origin-1", role: "origin", coordinates: [77.228, 28.249], label: "EVAC ORIGIN" },
    { id: "destination-1", role: "destination", coordinates: [77.237, 28.256], label: "SAFE POINT" },
  ],
  area: {
    type: "Feature",
    properties: { name: "Selected operating area" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [77.226, 28.247],
        [77.239, 28.247],
        [77.239, 28.258],
        [77.226, 28.258],
        [77.226, 28.247],
      ]],
    },
  },
};

const common = {
  locationLabel: "Echelon Institute of Technology",
  hazardLabel: "Urban flood",
  scenarioSeed: 260826,
  scenarioRevision: "flood:30:baseline",
  operatingAreaAccepted: true,
  metrics: {
    peakExposedPopulation: 1840,
    affectedBuildings: 17,
    closedRoads: 3,
    restrictedRoads: 4,
  },
  plan: {
    id: "EVAC-001",
    routeCount: 3,
    coveragePct: 91.35,
    clearanceMinutes: 38.26,
    peopleRemainingExposed: 159,
    warnings: ["Field confirmation required"],
    generatedBy: "AEGIS deterministic evacuation optimizer",
  },
};

test("operator geometry deterministically creates a source-labelled dry-run assessment", () => {
  const first = buildSelectionWorkflowAssessment({ selection, stage: "ready", ...common });
  const second = buildSelectionWorkflowAssessment({ selection, stage: "ready", ...common });

  assert.deepEqual(first, second);
  assert.match(first.id, /^ASM-[A-F0-9]{8}$/);
  assert.ok(first.areaSquareKm > 1);
  assert.equal(first.inputs.boundary, "operator-drawn");
  assert.equal(first.inputs.hazardSource, "operator-placed");
  assert.equal(first.inputs.evacuationOrigin, "operator-placed");
  assert.equal(first.inputs.safeDestination, "operator-placed");
  assert.equal(first.dispatch.externalAttempted, false);
  assert.equal(first.dispatch.mode, "DRY-RUN");
  assert.match(first.dispatch.notice, /No public alert, government message or field dispatch was sent/);
  assert.deepEqual(first.provenance.map((item) => item.classification), ["OPERATOR INPUT", "SIMULATED", "ESTIMATED"]);
});

test("missing pointers are explicitly identified as model defaults rather than invented observations", () => {
  const boundaryOnly = { points: [], area: selection.area };
  const result = buildSelectionWorkflowAssessment({ selection: boundaryOnly, stage: "ready", ...common });

  assert.equal(result.inputs.hazardSource, "active-location-default");
  assert.equal(result.inputs.evacuationOrigin, "model-network-default");
  assert.equal(result.inputs.safeDestination, "screened-facility-default");
  assert.equal(result.plan.coveragePct, 91.4);
  assert.equal(result.plan.clearanceMinutes, 38.3);
});

test("selection fingerprint changes with operator input and empty selections do not trigger", () => {
  assert.equal(selectionHasOperationalInput({ points: [] }), false);
  assert.equal(selectionHasOperationalInput(selection), true);
  assert.notEqual(
    selectionFingerprint(selection),
    selectionFingerprint({ ...selection, points: selection.points.slice(0, 2) }),
  );
});

test("completed area exposes a stable centroid for the selected location", () => {
  const summary = selectionAreaSummary(selection);
  assert.ok(summary.center);
  assert.ok(Math.abs(summary.center.latitude - 28.2525) < 0.0001);
  assert.ok(Math.abs(summary.center.longitude - 77.2325) < 0.0001);
});

test("antimeridian areas retain a local centroid and dimensions", () => {
  const crossing = {
    points: [],
    area: {
      ...selection.area,
      geometry: {
        type: "Polygon",
        coordinates: [[[179.99, 10], [-179.99, 10], [-179.99, 10.01], [179.99, 10.01], [179.99, 10]]],
      },
    },
  };
  const summary = selectionAreaSummary(crossing);
  const dimensions = selectionAreaDimensionsMeters(crossing);
  assert.ok(Math.abs(Math.abs(summary.center.longitude) - 180) < 0.00001);
  assert.ok(Math.abs(summary.center.latitude - 10.005) < 0.00001);
  assert.ok(summary.areaSquareKm > 2 && summary.areaSquareKm < 3);
  assert.ok(Math.abs(dimensions.northSouthM - 1_113.2) < 0.01);
  assert.ok(dimensions.eastWestM > 2_100 && dimensions.eastWestM < 2_300);
  assert.equal(selectionAreaDimensionsMeters({ points: [] }), null);
});

test("rejected operating areas explicitly report a model-domain fallback", () => {
  const result = buildSelectionWorkflowAssessment({ selection, stage: "ready", ...common, operatingAreaAccepted: false });
  assert.equal(result.inputs.boundary, "model-domain-fallback");
  assert.match(result.provenance[0].label, /retained as context.*size limits rejected/);
  assert.deepEqual(result.center, selectionAreaSummary(selection).center);
  const noBoundary = buildSelectionWorkflowAssessment({ selection: { points: selection.points }, stage: "ready", ...common, operatingAreaAccepted: false });
  assert.equal(noBoundary.inputs.boundary, "model-domain");
});

test("planning anchors prioritize area, hazard source, origin, destination and waypoint", () => {
  assert.equal(selectionPlanningAnchor(selection).source, "area");
  assert.deepEqual(selectionPlanningAnchor(selection), {
    ...selectionAreaSummary(selection).center,
    label: "Selected operating area",
    source: "area",
  });
  const waypoint = { id: "waypoint-1", role: "waypoint", coordinates: [77.24, 28.26], label: "WAYPOINT" };
  const ordered = [...selection.points, waypoint];
  for (let index = 0; index < ordered.length; index += 1) {
    const point = ordered[index];
    const anchor = selectionPlanningAnchor({ points: ordered.slice(index).reverse() });
    assert.deepEqual(anchor, {
      longitude: point.coordinates[0], latitude: point.coordinates[1], label: point.label, source: point.role,
    });
  }
  assert.equal(selectionPlanningAnchor({ points: [] }), null);
});

test("assessment identity changes with scenario revision without changing geometry identity", () => {
  const first = buildSelectionWorkflowAssessment({ selection, stage: "ready", ...common });
  const revised = buildSelectionWorkflowAssessment({ selection, stage: "ready", ...common, scenarioRevision: "flood:60:rainfall-95" });
  assert.notEqual(first.id, revised.id);
  assert.equal(first.fingerprint, revised.fingerprint);
});

test("command center wires map input to automatic deterministic assessment and response", async () => {
  const source = await readFile(new URL("../components/command-center/CommandCenter.tsx", import.meta.url), "utf8");
  assert.match(source, /buildSelectionWorkflowAssessment/);
  assert.match(source, /selectionHasOperationalInput/);
  assert.match(source, /setSelectionWorkflowStage\("assessing"\)/);
  assert.match(source, /setEvacuationVisible\(true\)/);
  assert.match(source, /onAreaComplete=\{completeOperatingArea\}/);
  assert.match(source, /onSelectionClear=\{clearOperatorSelection\}/);
  assert.match(source, /selection=\{viewMode === "monitor" \? EMPTY_MAP_SELECTION : mapSelection\}/);
  assert.match(source, /<SelectionWorkflowCard/);

  const workflowStart = source.indexOf("const fingerprint = selectionFingerprint(selection);");
  const duplicateGuard = source.indexOf("if (fingerprint === selectionFingerprintRef.current) return false;", workflowStart);
  const replacementTimerClear = source.indexOf("window.clearTimeout(selectionWorkflowTimerRef.current);", duplicateGuard);
  assert.ok(workflowStart >= 0 && duplicateGuard > workflowStart);
  assert.ok(replacementTimerClear > duplicateGuard, "a duplicate area completion must not cancel its active assessment timer");
});
