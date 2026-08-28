import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("automation and live-evidence routes render their isolated console components", async () => {
  const [automationPage, liveContextPage] = await Promise.all([
    readProjectFile("app/automation/page.tsx"),
    readProjectFile("app/live-context/page.tsx"),
  ]);

  assert.match(automationPage, /AutomationConsole/);
  assert.match(liveContextPage, /LiveContextConsole/);
  assert.doesNotMatch(automationPage, /CommandCenter|AegisMap/);
  assert.doesNotMatch(liveContextPage, /CommandCenter|AegisMap/);
});

test("regional automation uses its dedicated dry-run endpoint and states its delivery boundary", async () => {
  const [consoleSource, routeSource] = await Promise.all([
    readProjectFile("components/automation/AutomationConsole.tsx"),
    readProjectFile("app/api/automation/route.ts"),
  ]);

  assert.match(consoleSource, /fetch\("\/api\/automation"/);
  assert.match(consoleSource, /method:\s*"POST"/);
  assert.match(consoleSource, /DRY-RUN/);
  assert.match(consoleSource, /No external sends|No external notification was sent/);
  assert.match(consoleSource, /Notification\.requestPermission\(\)/);

  assert.match(routeSource, /export async function GET\(\)/);
  assert.match(routeSource, /export async function POST\(request:\s*Request\)/);
  assert.match(routeSource, /notificationDispatch:\s*\{[\s\S]*?enabled:\s*false[\s\S]*?attempted:\s*false/);
  assert.match(routeSource, /Caller-supplied incidents are accepted only in demo mode/);
});

test("live evidence consumes the shared live feed and preserves observation truth labels", async () => {
  const [consoleSource, liveRoute] = await Promise.all([
    readProjectFile("components/live-context/LiveContextConsole.tsx"),
    readProjectFile("app/api/live/route.ts"),
  ]);

  assert.match(consoleSource, /fetch\(`\/api\/live\?/);
  assert.match(consoleSource, /includeMedia:\s*"false"/);
  assert.match(consoleSource, /OBSERVED INCIDENT/);
  assert.match(consoleSource, /SOURCE-CACHED RECORD/);
  assert.match(consoleSource, /SIMULATED RECORD/);
  assert.match(consoleSource, /LiveMediaDialog/);
  assert.match(consoleSource, /Satellite scenes and damage assessments have acquisition and processing delay/);

  assert.match(liveRoute, /aggregateLiveIntelligence\(parseLiveOptions\(request\.url\)\)/);
  assert.match(liveRoute, /"X-AEGIS-Data-Mode":\s*response\.mode/);
  assert.match(liveRoute, /export function OPTIONS\(\)/);
});
