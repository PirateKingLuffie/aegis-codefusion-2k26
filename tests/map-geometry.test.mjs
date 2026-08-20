import assert from "node:assert/strict";
import test from "node:test";

import {
  incidentsToGeoJSON,
  relocateLegacyEitCollection,
} from "../components/map/geometry.ts";

test("legacy EIT relocation is explicit and does not mutate source geometry", () => {
  const source = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { label: "legacy scaffold" },
      geometry: { type: "Point", coordinates: [77.22, 28.25] },
    }],
  };

  const relocated = relocateLegacyEitCollection(source);

  assert.deepEqual(source.features[0].geometry.coordinates, [77.22, 28.25]);
  assert.deepEqual(relocated.features[0].geometry.coordinates, [77.4398682, 28.3912265]);
});

test("incident GeoJSON preserves a world coordinate near the former EIT scaffold", () => {
  const incidents = incidentsToGeoJSON([{
    id: "world-incident",
    title: "Imported event",
    type: "weather",
    severity: "medium",
    coordinates: [77.23, 28.24],
  }]);

  assert.deepEqual(incidents.features[0].geometry.coordinates, [77.23, 28.24]);
});

test("incident GeoJSON preserves the active status and live provider attribution used by globe markers", () => {
  const incidents = incidentsToGeoJSON([{
    id: "gdacs-active-flood",
    title: "Active flood alert",
    type: "flood",
    severity: "critical",
    coordinates: [77, 28],
    status: "active",
    occurredAt: "2026-08-15T09:30:00.000Z",
    description: "Current GDACS alert",
    source: "Global Disaster Alert and Coordination System",
  }]);

  assert.equal(incidents.features.length, 1);
  assert.deepEqual(incidents.features[0].properties, {
    id: "gdacs-active-flood",
    title: "Active flood alert",
    type: "flood",
    severity: "critical",
    live: false,
    status: "active",
    occurredAt: "2026-08-15T09:30:00.000Z",
    description: "Current GDACS alert",
    source: "Global Disaster Alert and Coordination System",
  });
});
