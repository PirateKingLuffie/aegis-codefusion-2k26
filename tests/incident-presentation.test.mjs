import assert from "node:assert/strict";
import test from "node:test";

import { incidentMarkerPresentation } from "../components/map/incident-presentation.ts";

const base = {
  id: "incident-1",
  title: "Sample event",
  type: "flood",
  severity: "high",
  coordinates: [77, 28],
};

test("incident markers reserve red and pulse treatment for explicit live records", () => {
  assert.deepEqual(incidentMarkerPresentation({ ...base, live: true, status: "active" }), {
    kind: "incident",
    label: "LIVE · Sample event",
    glyph: "!",
    live: true,
  });
  assert.deepEqual(incidentMarkerPresentation({ ...base, live: true, status: "simulated" }), {
    kind: "simulation",
    label: "SIMULATION · Sample event",
    glyph: "S",
    live: false,
  });
  assert.deepEqual(incidentMarkerPresentation({ ...base, live: false, status: "cached" }), {
    kind: "context",
    label: "CONTEXT · Sample event",
    glyph: "C",
    live: false,
  });
});
