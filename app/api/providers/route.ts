import {
  getProviderReadiness,
  summarizeProviderReadiness,
} from "@/lib/providers";
import {
  cloudflareWorkersAiBinding,
  loadD1AgentActivity,
  WORKERS_AI_MODEL,
} from "@/lib/agent-activity";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const providers = getProviderReadiness();
  const [workersAi, d1] = await Promise.all([
    cloudflareWorkersAiBinding(),
    loadD1AgentActivity(1),
  ]);
  providers.push({
    id: "workers-ai-narrative",
    label: "Cloudflare Workers AI",
    capability: "agent-narrative",
    readiness: workersAi ? "ready" : "degraded",
    mode: workersAi ? "configured-online" : "deterministic-fallback",
    configured: workersAi !== null,
    detail: workersAi
      ? `${WORKERS_AI_MODEL} is bound for short grounded narratives; deterministic calculations remain authoritative.`
      : "The hosted narrative binding is unavailable; deterministic operations analysis remains active.",
  });
  providers.push({
    id: "d1-agent-ledger",
    label: "Cloudflare D1 Agent Ledger",
    capability: "audit-ledger",
    readiness: d1.loaded ? "ready" : "degraded",
    mode: d1.loaded ? "configured-online" : "deterministic-fallback",
    configured: d1.available,
    detail: d1.loaded
      ? "Immutable agent receipt revisions are stored in the shared D1 ledger and verified on read."
      : "The D1 ledger is unavailable; the bounded runtime ledger remains active.",
  });
  const operationsApi = process.env.AEGIS_OPERATIONS_API_URL?.trim().replace(/\/$/, "");
  let operationsReady = false;
  if (operationsApi) {
    try {
      const response = await fetch(`${operationsApi}/health`, { cache: "no-store", signal: AbortSignal.timeout(900) });
      operationsReady = response.ok;
    } catch {
      operationsReady = false;
    }
  }
  providers.push({
    id: "operations-api",
    label: "Durable Operations API",
    capability: "durable-operations",
    readiness: operationsReady ? "ready" : "degraded",
    mode: operationsReady ? "configured-online" : "deterministic-fallback",
    configured: operationsReady,
    detail: operationsReady
      ? "FastAPI, versioned records, audit receipts and WebSocket replay are connected."
      : "Browser-local version history is active; connect the packaged FastAPI service for durable records.",
  });

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      operatingMode: "online-first",
      providers,
      summary: summarizeProviderReadiness(providers),
      notice:
        "Zero-cost public endpoints are configured. AEGIS uses deterministic analysis and keyless source links, and reports upstream availability failures at the point of use.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
