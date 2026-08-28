import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AUTOMATION_REGIONS,
  evaluateAutomation,
  normalizePolicy,
} from "../lib/automation/index.ts";

const NOW = "2026-08-29T12:00:00.000Z";

function incident(overrides = {}) {
  const observedAt = overrides.observedAt ?? "2026-08-29T11:50:00.000Z";
  return {
    id: overrides.id ?? "usgs:test-1",
    title: overrides.title ?? "Magnitude 6.2 earthquake near Faridabad",
    summary: overrides.summary ?? "Official test event",
    category: overrides.category ?? "earthquake",
    severity: overrides.severity ?? "high",
    state: overrides.state ?? "monitoring",
    reality: overrides.reality ?? "observed",
    dataMode: overrides.dataMode ?? "near-real-time",
    observedAt,
    updatedAt: overrides.updatedAt ?? observedAt,
    freshness: {
      band: "near-real-time",
      label: "10 minutes old",
      observedAt,
      retrievedAt: overrides.retrievedAt ?? "2026-08-29T11:55:00.000Z",
    },
    location: {
      name: "Faridabad, India",
      coordinates: overrides.coordinates ?? { latitude: 28.3912, longitude: 77.4398 },
    },
    links: [{ label: "Official event", url: "https://earthquake.usgs.gov/test", kind: "official" }],
    provenance: {
      sourceId: overrides.sourceId ?? "usgs-earthquakes",
      sourceName: overrides.sourceName ?? "U.S. Geological Survey",
      dataset: "test",
      retrievedAt: overrides.retrievedAt ?? "2026-08-29T11:55:00.000Z",
      publishedAt: observedAt,
      status: overrides.sourceStatus ?? "live",
    },
    tags: ["test"],
  };
}

const faridabad = DEFAULT_AUTOMATION_REGIONS[0];

test("first eligible official event creates a reviewable proposal", () => {
  const result = evaluateAutomation({ regions: [faridabad], incidents: [incident()], now: NOW });
  assert.equal(result.summary.proposedAlertCount, 1);
  assert.equal(result.alerts[0].delivery, "not-sent");
  assert.equal(result.alerts[0].humanReviewRequired, true);
  assert.equal(result.alerts[0].dataClass, "OBSERVED_SOURCE_REPORT");
  assert.equal(result.regions[0].status, "attention");
});

test("cooldown receipt suppresses duplicate proposals", () => {
  const first = evaluateAutomation({ regions: [faridabad], incidents: [incident()], now: NOW });
  const second = evaluateAutomation({
    regions: [faridabad],
    incidents: [incident()],
    previousReceipts: first.receipts,
    now: "2026-08-29T12:20:00.000Z",
  });
  assert.equal(second.alerts.length, 0);
  assert.equal(second.regions[0].suppressedCount, 1);
});

test("severity escalation bypasses cooldown and is labelled", () => {
  const first = evaluateAutomation({ regions: [faridabad], incidents: [incident({ severity: "medium" })], now: NOW });
  const second = evaluateAutomation({
    regions: [faridabad],
    incidents: [incident({ severity: "critical" })],
    previousReceipts: first.receipts,
    now: "2026-08-29T12:05:00.000Z",
  });
  assert.equal(second.alerts.length, 1);
  assert.equal(second.alerts[0].kind, "escalation");
});

test("stale and unverified records are visible but cannot alert by default", () => {
  const stale = incident({
    id: "news:old",
    sourceId: "google-news",
    sourceName: "Google News RSS",
    observedAt: "2026-08-27T10:00:00.000Z",
    updatedAt: "2026-08-27T10:00:00.000Z",
    retrievedAt: "2026-08-29T11:55:00.000Z",
  });
  const result = evaluateAutomation({ regions: [faridabad], incidents: [stale], now: NOW });
  assert.equal(result.alerts.length, 0);
  assert.equal(result.regions[0].matchedIncidents[0].reason, "stale-observation");
  assert.equal(result.regions[0].status, "degraded");
});

test("demo simulations are accepted only in demo mode and stay labelled", () => {
  const simulation = incident({
    id: "sim:flood",
    category: "flood",
    severity: "high",
    reality: "simulated",
    dataMode: "simulated-demo",
    sourceId: "aegis-simulation",
    sourceName: "AEGIS deterministic simulation",
  });
  const live = evaluateAutomation({ regions: [faridabad], incidents: [simulation], mode: "live", now: NOW });
  assert.equal(live.alerts.length, 0);
  assert.equal(live.regions[0].matchedIncidents[0].reason, "simulated-live-mode");
  const demo = evaluateAutomation({ regions: [faridabad], incidents: [simulation], mode: "demo", now: NOW });
  assert.equal(demo.alerts[0].dataClass, "SIMULATED_TEST_RECORD");
  assert.equal(demo.alerts[0].mode, "demo");
});

test("bounds matching handles an antimeridian crossing", () => {
  const region = {
    ...faridabad,
    id: "dateline",
    name: "Dateline watch",
    geometry: { kind: "bounds", west: 170, south: -10, east: -170, north: 10 },
    hazards: [],
    minimumSeverity: "low",
  };
  const result = evaluateAutomation({
    regions: [region],
    incidents: [incident({ coordinates: { latitude: 0, longitude: 179 } })],
    now: NOW,
  });
  assert.equal(result.alerts.length, 1);
});

test("policy values are bounded to protect the route", () => {
  const policy = normalizePolicy({ maxRegions: 9_999, maxIncidents: -4, maxAgeMinutes: 0 });
  assert.equal(policy.maxRegions, 32);
  assert.equal(policy.maxIncidents, 1);
  assert.equal(policy.maxAgeMinutes, 1);
});
