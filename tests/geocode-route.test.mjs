import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/geocode/route.ts";

test("geocode keeps recognizable places usable when Nominatim is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("simulated provider outage");
  };
  try {
    const response = await GET(new Request("http://localhost/api/geocode?q=Eiffel%20Tower"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.degraded, true);
    assert.equal(payload.providerStatus, "unavailable");
    assert.equal(payload.dataClass, "REFERENCE");
    assert.equal(payload.results[0].id, "offline-eiffel-tower");
    assert.match(payload.notice, /exact addresses/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("geocode reports honest degraded metadata for unknown offline queries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("simulated provider outage");
  };
  try {
    const response = await GET(new Request("http://localhost/api/geocode?q=local%20lane"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.results, []);
    assert.equal(payload.dataClass, "UNAVAILABLE");
    assert.equal(payload.degraded, true);
    assert.match(payload.notice, /not in the built-in reference index/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("geocode preserves live imported results and provenance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{
    place_id: 7,
    display_name: "Example Street, Example City",
    lat: "12.34",
    lon: "56.78",
    type: "road",
    importance: 0.4,
  }]), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await GET(new Request("http://localhost/api/geocode?q=Example%20Street"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.degraded, false);
    assert.equal(payload.providerStatus, "available");
    assert.equal(payload.dataClass, "IMPORTED");
    assert.equal(payload.results[0].source, "OpenStreetMap Nominatim");
    assert.equal(payload.results[0].latitude, 12.34);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
