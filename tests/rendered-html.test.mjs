import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const request = new Request("http://localhost/", { headers: { accept: "text/html" } });
  const executionContext = { waitUntil() {}, passThroughOnException() {} };
  if (typeof worker === "function") {
    return worker(request, executionContext);
  }

  return worker.fetch(
    request,
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    executionContext,
  );
}

test("server-renders the AEGIS operations center", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Operations Center \| AEGIS<\/title>/i);
  assert.match(html, /Adaptive Emergency Geospatial Intelligence/);
  assert.match(html, /Generate evacuation plan/);
  assert.match(html, /Global incident feeds/);
  assert.match(html, /Worldwide incident overview/);
  assert.match(html, /Emergency Operations Console/);
  assert.doesNotMatch(html, /starter loading skeleton|react-loading-skeleton|codex-preview/i);
});

test("keeps simulation, live intelligence, provider failover and wrappers wired", async () => {
  const [page, layout, commandCenter, mapTypes, providers, aegisMap] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/command-center/CommandCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/map/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/map/providers.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/map/AegisMap.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<CommandCenter\s*\/>/);
  assert.doesNotMatch(layout, /manifest\.webmanifest|PwaBoot/);
  assert.match(commandCenter, /buildAegisMapLayers/);
  assert.match(commandCenter, /createEvacuationPlan/);
  assert.match(commandCenter, /\/api\/live/);
  assert.match(commandCenter, /\/api\/geocode/);
  assert.match(commandCenter, /GLOBAL PROTOTYPE/);
  assert.match(mapTypes, /"origin"[\s\S]*"destination"[\s\S]*"hazard-source"[\s\S]*"area"/);
  assert.match(providers, /OpenFreeMap Dark/);
  assert.match(providers, /CARTO Dark Matter/);
  assert.match(aegisMap, /relocateLegacyEitGeometry\s*=\s*false/);
  assert.match(aegisMap, /const center = focusCenter/);
  assert.match(aegisMap, /const normalizedIncidents = incidents/);
  assert.doesNotMatch(aegisMap, /normalizeEitCoordinate/);

  await Promise.all([
    access(new URL("../platforms/windows/src-tauri/tauri.conf.json", import.meta.url)),
    access(new URL("../platforms/android/capacitor.config.ts", import.meta.url)),
    access(new URL("../docs/DATA_PROVENANCE.md", import.meta.url)),
  ]);
});
