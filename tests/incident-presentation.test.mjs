import assert from "node:assert/strict";
import test from "node:test";

import { incidentMarkerPresentation } from "../components/map/incident-presentation.ts";

const base = {
  id: "incident-1",
  title: "Sample event",
  type: "flood",
  severity: "high",
  coordinates: [77, 28],
  source: "U.S. Geological Survey",
};

test("incident markers reserve red and pulse treatment for explicit live records", () => {
  assert.deepEqual(incidentMarkerPresentation({ ...base, live: true, status: "active" }), {
    kind: "incident",
    label: "CURRENT OBSERVED · USGS · Sample event",
    glyph: "!",
    live: true,
    sourceLabel: "USGS",
  });
  assert.deepEqual(incidentMarkerPresentation({ ...base, live: true, status: "simulated" }), {
    kind: "simulation",
    label: "SIMULATION · USGS · Sample event",
    glyph: "S",
    live: false,
    sourceLabel: "USGS",
  });
  assert.deepEqual(incidentMarkerPresentation({ ...base, live: false, status: "cached" }), {
    kind: "context",
    label: "SOURCE CONTEXT · USGS · Sample event",
    glyph: "C",
    live: false,
    sourceLabel: "USGS",
  });
  assert.equal(incidentMarkerPresentation({
    ...base,
    live: true,
    status: "active",
    sourceStatus: "live",
    dataMode: "near-real-time",
    freshnessBand: "aging",
  }).kind, "context");
  assert.equal(incidentMarkerPresentation({
    ...base,
    live: true,
    status: "active",
    sourceStatus: "degraded",
    dataMode: "near-real-time",
    freshnessBand: "near-real-time",
  }).kind, "context");
  assert.equal(incidentMarkerPresentation({
    ...base,
    live: true,
    status: "active",
    sourceStatus: "unavailable",
    dataMode: "near-real-time",
    freshnessBand: "live",
  }).kind, "context");
  assert.equal(
    incidentMarkerPresentation({ ...base, source: "Geological Survey of India", live: false }).sourceLabel,
    "GEOLOGICAL SURVEY OF INDIA",
  );
});
