import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImpactSnapshot,
  createLocationScenario,
  runSimulation,
} from "../lib/simulation/index.ts";
import { scenarioFromApi } from "../lib/simulation/api-contract.ts";
import { buildAegisMapLayers } from "../lib/simulation/map-adapter.ts";
import { SCENARIO_PRESETS } from "../lib/workspace/index.ts";
import { buildTwinScene } from "../lib/twin/index.ts";

const cases = [
  { hazard: "flood", center: { lat: -6.2088, lon: 106.8456 }, label: "Jakarta exercise area", role: "flood-extent", vector: "flood-net-flow" },
  { hazard: "earthquake", center: { lat: -33.4489, lon: -70.6693 }, label: "Santiago exercise area", role: "earthquake-isoseismal", vector: "earthquake-pulse-outline" },
  { hazard: "wildfire", center: { lat: -33.9249, lon: 18.4241 }, label: "Cape Town exercise area", role: "wildfire-active-perimeter", vector: "wildfire-spread-axis" },
  { hazard: "cyclone", center: { lat: 17.6868, lon: 83.2185 }, label: "Visakhapatnam exercise area", role: "cyclone-wind-field", vector: "cyclone-track" },
  { hazard: "chemical", center: { lat: 51.9496, lon: 4.1453 }, label: "Rotterdam port exercise area", role: "chemical-plume", vector: "chemical-plume-axis" },
];

function animationFrames(scenario, result) {
  return result.timeline.map((frame) => ({
    minute: frame.minute,
    layers: buildAegisMapLayers({
      scenario,
      result,
      selectedMinute: frame.minute,
      options: { minimumImpactRisk: 0.02, minimumFloodDepthM: 0.005 },
    }),
  }));
}

function maximumDamage(snapshot) {
  return Math.max(0, ...snapshot.buildings.map((building) => building.damageIndex ?? 0));
}

test("all five arbitrary-location hazards emit distinct time-varying simulated visual descriptors", () => {
  for (const item of cases) {
    const scenario = createLocationScenario({
      hazard: item.hazard,
      center: item.center,
      locationLabel: item.label,
      seed: `visual-${item.hazard}-v1`,
    });
    const result = runSimulation(scenario);
    const frames = animationFrames(scenario, result);
    const allFootprints = frames.flatMap(({ layers }) => layers.hazardFootprints.features);
    const allVectors = frames.flatMap(({ layers }) => layers.hazardVectors.features);

    assert.equal(result.hazard, item.hazard);
    assert.ok(allFootprints.some((feature) => feature.properties.visualRole === item.role), item.hazard);
    assert.ok(allVectors.some((feature) => feature.properties.visualRole === item.vector), item.hazard);

    for (const feature of [...allFootprints, ...allVectors]) {
      assert.equal(feature.properties.classification, "SIMULATED", item.hazard);
      assert.equal(feature.properties.evidenceClass, "Simulated", item.hazard);
      assert.equal(feature.properties.Simulated, true, item.hazard);
      assert.equal(feature.properties.hazard, item.hazard);
      assert.match(feature.properties.displayNote, /not |only|screening/i, item.hazard);
      assert.ok(feature.properties.intensity01 >= 0 && feature.properties.intensity01 <= 1, item.hazard);
    }

    const signatures = new Set(frames.map(({ layers }) => JSON.stringify({
      footprints: layers.hazardFootprints.features.map((feature) => ({
        role: feature.properties.visualRole,
        intensity: feature.properties.intensity01,
        geometry: feature.geometry,
      })),
      vectors: layers.hazardVectors.features.map((feature) => ({
        role: feature.properties.visualRole,
        intensity: feature.properties.intensity01,
        geometry: feature.geometry,
      })),
      damage: layers.damagedBuildings.features.map((feature) => feature.properties.damageIndex),
    })));
    assert.ok(signatures.size >= 3, `${item.hazard} should visibly evolve across the timeline`);
  }
});

test("physical building damage accumulates after hazard passage while chemical exposure is not physical damage", () => {
  for (const item of cases.filter((candidate) => candidate.hazard !== "chemical")) {
    const scenario = createLocationScenario({
      hazard: item.hazard,
      center: item.center,
      locationLabel: item.label,
      seed: `damage-${item.hazard}-v1`,
    });
    const result = runSimulation(scenario);
    const early = buildImpactSnapshot({ scenario, result, selectedMinute: 0 });
    const peak = buildImpactSnapshot({ scenario, result, selectedMinute: result.metrics.peakMinute });
    const final = buildImpactSnapshot({ scenario, result, selectedMinute: scenario.durationMinutes });
    assert.ok(maximumDamage(peak) >= maximumDamage(early), item.hazard);
    assert.ok(maximumDamage(final) >= maximumDamage(peak), item.hazard);
    assert.ok(maximumDamage(final) > 0, item.hazard);
  }

  const chemicalCase = cases.find((item) => item.hazard === "chemical");
  const scenario = createLocationScenario({
    hazard: "chemical",
    center: chemicalCase.center,
    locationLabel: chemicalCase.label,
    seed: "chemical-exposure-not-damage-v1",
  });
  const result = runSimulation(scenario);
  const snapshots = result.timeline.map((frame) =>
    buildImpactSnapshot({ scenario, result, selectedMinute: frame.minute }));
  assert.ok(snapshots.flatMap((snapshot) => snapshot.buildings).every((building) => building.damageIndex === null));
  assert.ok(snapshots.flatMap((snapshot) => snapshot.buildings).every((building) => ["none", "exposed"].includes(building.damageState)));
});

test("EIT flood twin reveals water and cumulative damage through playback instead of pre-damaging buildings", () => {
  const eitScenario = scenarioFromApi({ hazard: "flood", seed: "twin-playback-damage-v1" });
  const result = runSimulation(eitScenario);
  const peakMinute = result.metrics.peakMinute;
  const early = buildTwinScene({ scenario: eitScenario, result, selectedMinute: 0 });
  const peak = buildTwinScene({ scenario: eitScenario, result, selectedMinute: peakMinute });
  const final = buildTwinScene({ scenario: eitScenario, result, selectedMinute: 120 });
  const maximumDamage = (scene) => Math.max(0, ...scene.buildings.map((building) => building.damageIndex));

  assert.equal(maximumDamage(early), 0);
  assert.ok(maximumDamage(peak) > maximumDamage(early));
  assert.ok(maximumDamage(final) >= maximumDamage(peak));
  assert.ok(peak.flood.affectedAreaSqKm >= early.flood.affectedAreaSqKm);
  assert.match(peak.buildings.find((building) => building.damageIndex > 0).explanation.join(" "), /peak-to-date/i);
});

test("operator polygon becomes the deterministic scenario envelope and remains truth-labelled", () => {
  const boundary = [
    { lat: 22.565, lon: 88.342 },
    { lat: 22.568, lon: 88.368 },
    { lat: 22.548, lon: 88.374 },
    { lat: 22.541, lon: 88.351 },
  ];
  const input = {
    hazard: "flood",
    center: { lat: 22.5726, lon: 88.3639 },
    locationLabel: "Operator-selected Kolkata sector",
    seed: "operator-area-v1",
    operatingArea: { kind: "polygon", boundary, label: "Drawn response sector" },
  };
  const first = createLocationScenario(input);
  const second = createLocationScenario(input);

  assert.deepEqual(first, second);
  assert.equal(first.operatingArea.classification, "scenario-input");
  assert.equal(first.operatingArea.geometryTreatment, "scaled-prototype-to-bounds");
  assert.match(first.operatingArea.notice, /not a hydraulic or physics boundary/i);
  assert.match(first.metadata.description, /operator-selected area/i);
  assert.ok(first.provenance.some((source) => source.id.endsWith("-operating-area")));
  assert.ok(Math.abs(first.hazardSource.lat - 22.5557) < 0.02);
  assert.ok(Math.abs(first.hazardSource.lon - 88.3587) < 0.02);
  assert.equal(first.area.north, Math.max(...boundary.map((point) => point.lat)));
  assert.equal(first.area.south, Math.min(...boundary.map((point) => point.lat)));
  assert.ok(first.terrain.every((cell) => cell.center.lat >= first.area.south && cell.center.lat <= first.area.north));
  assert.ok(first.terrain.every((cell) => cell.center.lon >= first.area.west && cell.center.lon <= first.area.east));
  assert.ok(first.assets.buildings.every((building) => /area-scaled prototype/i.test(building.name)));

  const result = runSimulation(first);
  const layers = buildAegisMapLayers({ scenario: first, result, selectedMinute: result.metrics.peakMinute });
  assert.ok(layers.hazardFootprints.features.length > 0);
  assert.ok(layers.hazardFootprints.features.every((feature) => feature.properties.classification === "SIMULATED"));

  const fromApi = scenarioFromApi({
    hazard: "wildfire",
    seed: "operator-area-api-v1",
    location: { lat: 22.5726, lon: 88.3639, label: "API-selected Kolkata sector" },
    operatingArea: { kind: "polygon", boundary, label: "API response sector" },
  });
  assert.equal(fromApi.operatingArea.geometryTreatment, "scaled-prototype-to-bounds");
  assert.equal(fromApi.hazard, "wildfire");

  assert.throws(
    () => createLocationScenario({
      ...input,
      operatingArea: {
        kind: "bounds",
        bounds: { north: 22.55, south: 22.54999, east: 88.35, west: 88.34999 },
      },
    }),
    /at least 120 m/i,
  );
});

test("new global presets are distinct, executable and disclose the tsunami proxy", () => {
  const addedIds = ["cape-town-wildfire", "rotterdam-chemical", "sendai-coastal-inundation-proxy"];
  const added = addedIds.map((id) => SCENARIO_PRESETS.find((preset) => preset.id === id));
  assert.ok(added.every(Boolean));
  assert.equal(new Set(added.map((preset) => `${preset.location.latitude},${preset.location.longitude}`)).size, 3);
  assert.deepEqual(
    new Set(SCENARIO_PRESETS.map((preset) => preset.hazard)),
    new Set(["flood", "earthquake", "wildfire", "cyclone", "industrial"]),
  );

  for (const preset of added) {
    const hazard = preset.hazard === "industrial" ? "chemical" : preset.hazard;
    const scenario = createLocationScenario({
      hazard,
      center: { lat: preset.location.latitude, lon: preset.location.longitude },
      locationLabel: preset.location.name,
      seed: `preset-${preset.id}-v1`,
      parameterOverrides: preset.parameterOverrides,
    });
    assert.equal(runSimulation(scenario).hazard, hazard);
    assert.match(scenario.metadata.disclaimer, /not a report of a real disaster/i);
  }

  const tsunamiProxy = added.find((preset) => preset.id === "sendai-coastal-inundation-proxy");
  assert.equal(tsunamiProxy.hazard, "cyclone");
  assert.match(tsunamiProxy.name, /tsunami \/ coastal inundation screening proxy/i);
  assert.match(tsunamiProxy.modelDisclosure, /not a calibrated tsunami/i);
  assert.ok(tsunamiProxy.parameterOverrides.coastalSurgeM >= 3);
});
