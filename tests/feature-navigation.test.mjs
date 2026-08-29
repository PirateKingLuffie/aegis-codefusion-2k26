import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared feature navigation exposes every user-facing surface", () => {
  const source = read("components/navigation/FeatureNavigation.tsx");
  for (const href of ["/", "/live-context", "/automation", "/agent-ledger"]) {
    assert.match(source, new RegExp(`href: \\"${href.replace("/", "\\/")}\\"`));
  }
  assert.match(source, /aria-current=/);
  assert.match(source, /aria-label="AEGIS features"/);
});

test("all four product surfaces render the shared feature navigation", () => {
  const surfaces = [
    ["components/command-center/CommandCenter.tsx", 'active="operations"'],
    ["components/live-context/LiveContextConsole.tsx", 'active="intelligence"'],
    ["components/automation/AutomationConsole.tsx", 'active="automation"'],
    ["components/agent-activity/AgentActivityConsole.tsx", 'active="ledger"'],
  ];
  for (const [path, active] of surfaces) {
    const source = read(path);
    assert.match(source, /FeatureNavigation/);
    assert.ok(source.includes(active), `${path} must expose its active feature tab`);
  }
});
