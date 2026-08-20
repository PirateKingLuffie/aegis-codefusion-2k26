import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocationScenario,
  runSimulation,
} from "../lib/simulation/index.ts";

const locationInput = {
  hazard: "flood",
  center: { lat: 35.6762, lon: 139.6503 },
  locationLabel: "Selected Tokyo Area",
  seed: "location-test-seed",
  parameterOverrides: {
    rainfallMmPerHour: 110,
    rainfallDurationMinutes: 80,
  },
};

test("generic location scenario is deterministic, centred and explicitly estimated", () => {
  const first = createLocationScenario(locationInput);
  const second = createLocationScenario(locationInput);

  assert.deepEqual(first, second);
  assert.equal(first.metadata.locationName, locationInput.locationLabel);
  assert.match(first.metadata.estimateLabel, /estimated generic-location prototype/i);
  assert.match(first.metadata.description, /translated prototype estimates, not local records/i);
  assert.match(first.metadata.disclaimer, /not a report of a real disaster/i);
  assert.match(first.metadata.disclaimer, /not.*local survey/i);
  assert.doesNotMatch(first.metadata.name, /EIT|Echelon/i);
  assert.doesNotMatch(first.metadata.description, /EIT|Echelon/i);
  assert.equal(first.hazardSource.lat, locationInput.center.lat);
  assert.equal(first.hazardSource.lon, locationInput.center.lon);
  assert.equal(first.parameters.rainfallMmPerHour, 110);
  assert.equal(first.parameters.rainfallDurationMinutes, 80);
  assert.equal(first.terrain.length, first.gridRows * first.gridColumns);

  const terrainCenter = {
    lat: first.terrain.reduce((sum, cell) => sum + cell.center.lat, 0) / first.terrain.length,
    lon: first.terrain.reduce((sum, cell) => sum + cell.center.lon, 0) / first.terrain.length,
  };
  assert.ok(Math.abs(terrainCenter.lat - locationInput.center.lat) < 0.00001);
  assert.ok(Math.abs(terrainCenter.lon - locationInput.center.lon) < 0.00001);
  assert.ok(first.assets.buildings.every((building) => /estimated.*translated prototype/i.test(building.name)));
  assert.ok(first.assets.populationZones.every((zone) => /estimated.*translated prototype/i.test(zone.name)));
  assert.ok(first.provenance.some((source) => source.kind === "prototype" && /terrain/i.test(source.label)));
  assert.ok(first.provenance.some((source) => source.kind === "prototype" && /building|assets/i.test(source.label)));

  const firstResult = runSimulation(first);
  const secondResult = runSimulation(second);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.scenarioId, first.metadata.id);
  assert.match(firstResult.estimateLabel, /estimated generic-location prototype/i);
});

test("a generic location near the former EIT scaffold keeps its requested coordinates", () => {
  const requested = { lat: 28.25, lon: 77.22 };
  const scenario = createLocationScenario({
    ...locationInput,
    center: requested,
    locationLabel: "Legacy Scaffold Reference Area",
  });

  assert.deepEqual(scenario.hazardSource, requested);
  const terrainCenter = {
    lat: scenario.terrain.reduce((sum, cell) => sum + cell.center.lat, 0) / scenario.terrain.length,
    lon: scenario.terrain.reduce((sum, cell) => sum + cell.center.lon, 0) / scenario.terrain.length,
  };
  assert.ok(Math.abs(terrainCenter.lat - requested.lat) < 0.00001);
  assert.ok(Math.abs(terrainCenter.lon - requested.lon) < 0.00001);
});

test("seed and location change identifiers and translated geometry reproducibly", () => {
  const base = createLocationScenario(locationInput);
  const changedSeed = createLocationScenario({
    ...locationInput,
    seed: "another-seed",
  });
  const changedPlace = createLocationScenario({
    ...locationInput,
    center: { lat: -33.8688, lon: 151.2093 },
    locationLabel: "Selected Sydney Area",
  });

  assert.notEqual(base.metadata.id, changedSeed.metadata.id);
  assert.notDeepEqual(base.terrain, changedSeed.terrain);
  assert.notEqual(base.metadata.id, changedPlace.metadata.id);
  assert.ok(Math.abs(changedPlace.hazardSource.lat + 33.8688) < 1e-8);
  assert.ok(Math.abs(changedPlace.hazardSource.lon - 151.2093) < 1e-8);

  const nearDateline = createLocationScenario({
    ...locationInput,
    center: { lat: 1.2, lon: 179.995 },
    locationLabel: "Dateline Test Area",
  });
  const longitudes = nearDateline.assets.roads.flatMap((road) =>
    road.geometry.map((point) => point.lon));
  assert.ok(Math.max(...longitudes) - Math.min(...longitudes) < 0.1);
  assert.ok(nearDateline.area.east - nearDateline.area.west < 0.1);
  assert.doesNotThrow(() => runSimulation(nearDateline));
});

test("provenance-backed imports replace only their corresponding estimate labels", () => {
  const scaffold = createLocationScenario({
    ...locationInput,
    locationLabel: "Import Test Area",
  });
  const terrainSource = {
    id: "terrain-open-source",
    label: "Test open elevation grid",
    kind: "open-data",
    sourceUrl: "https://example.test/terrain",
    license: "Test licence",
  };
  const assetSource = {
    id: "assets-observed-source",
    label: "Test verified asset inventory",
    kind: "observed",
    observedAtIso: "2026-08-09T00:00:00Z",
  };

  const importedTerrainOnly = createLocationScenario({
    ...locationInput,
    locationLabel: "Import Test Area",
    importedData: {
      terrain: {
        cells: scaffold.terrain,
        gridRows: scaffold.gridRows,
        gridColumns: scaffold.gridColumns,
        provenance: [terrainSource],
      },
    },
  });
  assert.match(importedTerrainOnly.metadata.estimateLabel, /imported terrain/i);
  assert.match(importedTerrainOnly.metadata.estimateLabel, /assets and population remain estimated/i);
  assert.ok(importedTerrainOnly.assets.buildings.every((building) => /translated prototype/i.test(building.name)));

  const fullyImported = createLocationScenario({
    ...locationInput,
    locationLabel: "Import Test Area",
    importedData: {
      terrain: {
        cells: scaffold.terrain,
        gridRows: scaffold.gridRows,
        gridColumns: scaffold.gridColumns,
        provenance: [terrainSource],
      },
      assets: {
        assets: scaffold.assets,
        provenance: [assetSource],
      },
    },
  });
  assert.match(fullyImported.metadata.estimateLabel, /imported local-data scenario/i);
  assert.match(fullyImported.metadata.estimateLabel, /effects remain simulated prototype estimates/i);
  assert.match(fullyImported.metadata.disclaimer, /hazard effects remain simulated/i);
  assert.ok(fullyImported.provenance.some((source) => source.id === terrainSource.id));
  assert.ok(fullyImported.provenance.some((source) => source.id === assetSource.id));
  assert.notEqual(fullyImported.terrain, scaffold.terrain);
  assert.notEqual(fullyImported.assets, scaffold.assets);
  assert.doesNotThrow(() => runSimulation(fullyImported));
});

test("generic API rejects unsafe coordinates and unproven imported data", () => {
  assert.throws(
    () => createLocationScenario({ ...locationInput, center: { lat: 90, lon: 10 } }),
    /latitude/i,
  );
  assert.throws(
    () => createLocationScenario({ ...locationInput, center: { lat: 20, lon: 200 } }),
    /longitude/i,
  );
  assert.throws(
    () => createLocationScenario({ ...locationInput, seed: "" }),
    /seed/i,
  );
  assert.throws(
    () => createLocationScenario({
      ...locationInput,
      importedData: {
        terrain: {
          cells: createLocationScenario(locationInput).terrain,
          gridRows: 10,
          gridColumns: 12,
          provenance: [{
            id: "unverified",
            label: "Unverified terrain",
            kind: "prototype",
          }],
        },
      },
    }),
    /observed or open-data provenance/i,
  );
});
