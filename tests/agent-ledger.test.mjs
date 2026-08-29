import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeAuditedAgentAction } from "../lib/agent-activity/execute.ts";
import {
  appendAgentActivity,
  clearRuntimeAgentActivity,
  listRuntimeAgentActivity,
  reviewRuntimeAgentActivity,
} from "../lib/agent-activity/store.ts";
import { configuredAgentProviders, publicProviderReadiness } from "../lib/agent-activity/config.ts";
import { loadDurableAgentActivity } from "../lib/agent-activity/persistence.ts";
import { loadD1AgentActivity, persistD1AgentActivity } from "../lib/agent-activity/d1.ts";
import { verifyAgentActivityChain, verifyAgentActivityRecord } from "../lib/agent-activity/audit.ts";
import { clearAgentRateLimits, consumeAgentPostLimit } from "../lib/agent-activity/rate-limit.ts";
import { requestWorkersAi } from "../lib/agent-activity/workers-ai.ts";

const simulatedState = {
  simulation: {
    peakDepthM: 1.7,
    blockedRoads: 4,
    exposedPopulation: 830,
    confidence: 0.76,
  },
  evacuation: { totalMinutes: 34 },
};

const REDACTION_FIXTURE_KEY = ["gsk", "redaction", "fixture", "123456789"].join("_");

test("issues a truthful deterministic receipt without seeding a hosted attempt", async () => {
  const result = await executeAuditedAgentAction({
    query: `Review token=${REDACTION_FIXTURE_KEY} and contact demo@example.com before recommending a route.`,
    state: simulatedState,
    evidence: [{ label: "Operator field note", url: "https://example.org/bulletin?token=evidence-secret" }],
  }, { providers: [], correlationId: "test-correlation-deterministic" });

  assert.equal(result.activity.outcome, "fallback");
  assert.equal(result.activity.execution.mode, "deterministic-fallback");
  assert.equal(result.activity.execution.attempts.length, 0);
  assert.equal(result.activity.execution.provider, "AEGIS local engine");
  assert.match(result.activity.execution.fallbackReason ?? "", /No optional hosted provider key/);
  assert.match(result.activity.input.summary, /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(result.activity), new RegExp(`${REDACTION_FIXTURE_KEY}|demo@example\\.com|evidence-secret`));
  assert.equal(result.activity.evidence.length, 2);
  assert.equal(result.activity.evidence[1].verification, "operator-supplied-unverified");
  assert.match(result.activity.receipt.digest, /^[a-f0-9]{64}$/);
  assert.equal(result.activity.humanApproval.status, "pending");
});

test("records the actual compatible provider, reported model, latency and token usage", async () => {
  let authorization = "";
  const result = await executeAuditedAgentAction({
    query: "Summarize the supplied deterministic flood state.",
    state: simulatedState,
  }, {
    providers: [{
      provider: "Test compatible provider",
      model: "configured-model",
      baseUrl: "https://provider.invalid/v1",
      apiKey: "secret-that-must-not-be-logged",
      timeoutMs: 1_000,
    }],
    fetchImpl: async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({
        model: "reported-model",
        choices: [{ message: { content: "Use the deterministic result and retain human review." } }],
        usage: { prompt_tokens: 81, completion_tokens: 12, total_tokens: 93 },
      });
    },
    correlationId: "test-correlation-hosted",
  });

  assert.equal(authorization, "Bearer secret-that-must-not-be-logged");
  assert.equal(result.activity.outcome, "completed");
  assert.equal(result.activity.execution.mode, "hosted-model");
  assert.equal(result.activity.execution.provider, "Test compatible provider");
  assert.equal(result.activity.execution.model, "reported-model");
  assert.equal(result.activity.execution.attempts[0].status, "completed");
  assert.deepEqual(result.activity.execution.attempts[0].tokens, { input: 81, output: 12, total: 93 });
  assert.doesNotMatch(JSON.stringify(result.activity), /secret-that-must-not-be-logged/);
});

test("uses the zero-secret Cloudflare Workers AI binding before key-based providers", async () => {
  let requestedModel = "";
  let maximumOutput = 0;
  let hostedPayload = "";
  let keyProviderCalled = false;
  const result = await executeAuditedAgentAction({
    query: `Write a concise flood-access brief; token=${REDACTION_FIXTURE_KEY}.`,
    state: simulatedState,
  }, {
    workersAi: {
      async run(model, input) {
        requestedModel = model;
        maximumOutput = input.max_tokens;
        hostedPayload = JSON.stringify(input.messages);
        return {
          response: "Keep the screened hospital corridor available and retain human approval.",
          usage: { prompt_tokens: 70, completion_tokens: 11, total_tokens: 81 },
        };
      },
    },
    providers: [{
      provider: "Key provider",
      model: "unused-model",
      baseUrl: "https://provider.invalid/v1",
      apiKey: "unused-secret",
      timeoutMs: 1_000,
    }],
    fetchImpl: async () => {
      keyProviderCalled = true;
      return new Response(null, { status: 500 });
    },
  });

  assert.equal(requestedModel, "@cf/meta/llama-3.2-3b-instruct");
  assert.equal(maximumOutput, 220);
  assert.doesNotMatch(hostedPayload, new RegExp(REDACTION_FIXTURE_KEY));
  assert.match(hostedPayload, /\[REDACTED\]/);
  assert.equal(keyProviderCalled, false);
  assert.equal(result.activity.execution.provider, "Cloudflare Workers AI");
  assert.equal(result.activity.execution.model, "@cf/meta/llama-3.2-3b-instruct");
  assert.deepEqual(result.activity.execution.attempts[0].tokens, { input: 70, output: 11, total: 81 });
  assert.equal(result.activity.outcome, "completed");
});

test("bounds a stalled Workers AI binding call", async () => {
  const startedAt = performance.now();
  await assert.rejects(
    requestWorkersAi(
      { run: async () => new Promise(() => undefined) },
      [{ role: "user", content: "Bounded test" }],
      15,
    ),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.ok(performance.now() - startedAt < 500);
});

test("falls back after a real provider failure and discloses the failed attempt", async () => {
  const result = await executeAuditedAgentAction({
    query: "Protect hospital access.",
    state: simulatedState,
  }, {
    providers: [{
      provider: "Unavailable provider",
      model: "unavailable-model",
      baseUrl: "https://provider.invalid/v1",
      apiKey: "unused-secret",
      timeoutMs: 1_000,
    }],
    fetchImpl: async () => new Response("Unavailable", { status: 503 }),
  });

  assert.equal(result.activity.outcome, "fallback");
  assert.equal(result.activity.execution.attempts.length, 1);
  assert.equal(result.activity.execution.attempts[0].status, "failed");
  assert.equal(result.activity.execution.attempts[0].detail, "Provider returned HTTP 503.");
  assert.match(result.activity.execution.fallbackReason ?? "", /did not return a verified response/);
});

test("accepts only HTTPS compatible-provider bases and does not expose credentials", () => {
  const insecure = configuredAgentProviders({
    OPENAI_COMPATIBLE_PROVIDER: "Insecure",
    OPENAI_COMPATIBLE_BASE_URL: "http://provider.invalid/v1",
    OPENAI_COMPATIBLE_API_KEY: "unsafe-secret",
    OPENAI_COMPATIBLE_MODEL: "model",
  });
  assert.equal(insecure.length, 0);

  const secure = configuredAgentProviders({
    OPENAI_COMPATIBLE_PROVIDER: "Secure",
    OPENAI_COMPATIBLE_BASE_URL: "https://provider.invalid/v1/",
    OPENAI_COMPATIBLE_API_KEY: "private-secret",
    OPENAI_COMPATIBLE_MODEL: "model",
  });
  assert.equal(secure.length, 1);
  assert.equal(secure[0].baseUrl, "https://provider.invalid/v1");

  const groq = configuredAgentProviders({
    GROQ_API_KEY: "one-legitimate-key",
  });
  assert.equal(groq.length, 1);
  assert.equal(groq[0].model, "openai/gpt-oss-20b");

  assert.deepEqual(publicProviderReadiness([], true), {
    configured: true,
    names: ["Cloudflare Workers AI"],
    deterministicFallback: true,
  });
});

test("human review creates a verifiable hash-linked revision", async () => {
  clearRuntimeAgentActivity();
  const execution = await executeAuditedAgentAction({
    query: "Prepare an evacuation recommendation.",
    state: simulatedState,
  }, { providers: [] });
  appendAgentActivity(execution.activity);
  const reviewed = await reviewRuntimeAgentActivity(execution.activity.id, "approved", "Test operator");
  assert.ok(reviewed);
  assert.equal(reviewed.humanApproval.status, "approved");
  assert.equal(reviewed.receipt.revision, 2);
  assert.equal(reviewed.receipt.previousDigest, execution.activity.receipt.digest);
  assert.notEqual(reviewed.receipt.digest, execution.activity.receipt.digest);
  assert.equal(reviewed.receipt.verification, "verified");
  assert.equal(await verifyAgentActivityRecord(reviewed), true);
  assert.equal(await verifyAgentActivityChain([execution.activity, reviewed]), true);
  assert.equal(listRuntimeAgentActivity()[0].id, reviewed.id);
});

test("detects receipt mutation and enforces a bounded per-client write window", async () => {
  const execution = await executeAuditedAgentAction({
    query: "Prepare a deterministic brief.",
    state: simulatedState,
  }, { providers: [] });
  const changed = {
    ...execution.activity,
    output: { ...execution.activity.output, summary: "Changed after receipt creation." },
  };
  assert.equal(await verifyAgentActivityRecord(changed), false);

  clearAgentRateLimits();
  const request = new Request("https://aegis.example/api/agent-activity", {
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });
  for (let index = 0; index < 10; index += 1) {
    assert.equal(consumeAgentPostLimit(request, 1_000).allowed, true);
  }
  const blocked = consumeAgentPostLimit(request, 1_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

test("does not attempt a loopback persistence request when the service URL is absent", async () => {
  const previous = process.env.AEGIS_OPERATIONS_API_URL;
  delete process.env.AEGIS_OPERATIONS_API_URL;
  try {
    const result = await loadDurableAgentActivity();
    assert.equal(result.storage.mode, "runtime-only");
    assert.deepEqual(result.records, []);
  } finally {
    if (previous === undefined) delete process.env.AEGIS_OPERATIONS_API_URL;
    else process.env.AEGIS_OPERATIONS_API_URL = previous;
  }
});

test("D1 stores immutable revisions and verifies the complete receipt chain", async () => {
  class FakeStatement {
    constructor(database, query) {
      this.database = database;
      this.query = query;
      this.values = [];
    }
    bind(...values) {
      this.values = values;
      return this;
    }
    async run() {
      if (!this.query.includes("INSERT INTO aegis_agent_activity_revisions")) return { success: false };
      const [receiptId, revision, recordedAt, , , , , , , , activityJson] = this.values;
      if (!this.database.rows.some((row) => row.receiptId === receiptId && row.revision === revision)) {
        this.database.rows.push({ receiptId, revision, recordedAt, activity_json: activityJson });
      }
      return { success: true };
    }
    async all() {
      if (this.query.includes("MAX(candidate.revision)")) {
        const limit = this.values[0];
        const latest = new Map();
        for (const row of this.database.rows) {
          const existing = latest.get(row.receiptId);
          if (!existing || row.revision > existing.revision) latest.set(row.receiptId, row);
        }
        return {
          success: true,
          results: [...latest.values()]
            .sort((left, right) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
            .slice(0, limit)
            .map(({ activity_json }) => ({ activity_json })),
        };
      }
      const ids = new Set(this.values);
      return {
        success: true,
        results: this.database.rows
          .filter((row) => ids.has(row.receiptId))
          .sort((left, right) => left.receiptId.localeCompare(right.receiptId) || left.revision - right.revision)
          .map(({ activity_json }) => ({ activity_json })),
      };
    }
  }
  class FakeD1 {
    rows = [];
    prepare(query) {
      return new FakeStatement(this, query);
    }
  }

  const database = new FakeD1();
  const first = await executeAuditedAgentAction({
    query: "Prepare the D1-backed evacuation brief.",
    state: simulatedState,
  }, { providers: [] });
  const second = await (await import("../lib/agent-activity/audit.ts")).reviewAgentActivityRecord(
    first.activity,
    "approved",
    "D1 test operator",
  );
  assert.deepEqual(await persistD1AgentActivity(first.activity, database), { available: true, stored: true });
  assert.deepEqual(await persistD1AgentActivity(second, database), { available: true, stored: true });
  assert.equal(database.rows.length, 2);

  const loaded = await loadD1AgentActivity(10, database);
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.records.length, 1);
  assert.equal(loaded.records[0].receipt.revision, 2);
  assert.equal(loaded.records[0].receipt.verification, "verified");

  const original = JSON.parse(database.rows[0].activity_json);
  original.output.summary = "Modified durable revision";
  database.rows[0].activity_json = JSON.stringify(original);
  const changed = await loadD1AgentActivity(10, database);
  assert.equal(changed.records[0].receipt.verification, "invalid");
});

test("wires the standalone route, audit API and shared navigation without sample records", async () => {
  const [page, consoleSource, api, commandCenter, featureNavigation, docs, migration, wrangler] = await Promise.all([
    readFile(new URL("../app/agent-ledger/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/agent-activity/AgentActivityConsole.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-activity/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/command-center/CommandCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/navigation/FeatureNavigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/AI_AGENT_LEDGER.md", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0001_agent_activity_ledger.sql", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(page, /AgentActivityConsole/);
  assert.match(consoleSource, /No agent actions recorded/);
  assert.match(consoleSource, /No seeded events/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function POST/);
  assert.match(api, /export async function PATCH/);
  assert.match(commandCenter, /FeatureNavigation/);
  assert.match(featureNavigation, /href: "\/agent-ledger"/);
  assert.match(docs, /no seeded [“"]success[”"] events/);
  assert.match(migration, /PRIMARY KEY \(receipt_id, revision\)/);
  assert.match(wrangler, /"binding": "AEGIS_LEDGER_DB"/);
  assert.match(wrangler, /"binding": "AI"/);
});
