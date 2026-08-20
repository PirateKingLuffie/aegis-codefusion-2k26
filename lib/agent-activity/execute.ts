import { deterministicDecision, type OperationsDecision } from "@/lib/ai/operations-agent";
import { createAgentActivityRecord, normalizeEvidence, redactSensitiveText } from "./audit";
import { configuredAgentProviders, type AgentProviderConfig } from "./config";
import type {
  AgentProviderAttempt,
  AgentRunRequest,
  AgentRunResult,
} from "./types";
import {
  cloudflareWorkersAiBinding,
  requestWorkersAi,
  WORKERS_AI_MODEL,
  type WorkersAiBindingLike,
} from "./workers-ai";

type FetchLike = typeof fetch;

type ProviderReply = {
  narrative: string;
  reportedModel?: string;
  tokens?: AgentProviderAttempt["tokens"];
};

type ExecuteOptions = {
  providers?: AgentProviderConfig[];
  fetchImpl?: FetchLike;
  now?: () => Date;
  performanceNow?: () => number;
  correlationId?: string;
  workersAi?: WorkersAiBindingLike | null;
};

function compact(value: string, maximum: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function safeFailureDetail(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Provider request timed out.";
  if (error instanceof Error && /^Provider returned HTTP \d{3}\.$/.test(error.message)) return error.message;
  return "Provider request failed before a verified response was received.";
}

function groundedProviderPrompt(
  query: string,
  decision: OperationsDecision,
  evidenceLabels: string[],
): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "You are the AEGIS operational briefing editor.",
        "Use only the deterministic findings and evidence labels supplied below.",
        "Do not invent measurements, incidents, casualties, sources, actions, or completed work.",
        "Clearly distinguish simulated or estimated values from observed facts.",
        "Return a concise professional brief of no more than 140 words.",
        "Operational recommendations remain proposals until a human approves them.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        operatorQuestion: query,
        deterministicFinding: {
          summary: decision.summary,
          prediction: decision.prediction,
          recommendation: decision.recommendation,
          confidence: decision.confidence,
          evidence: decision.evidence,
          risks: decision.risks,
        },
        suppliedEvidenceLabels: evidenceLabels,
      }),
    },
  ];
}

async function requestProvider(
  provider: AgentProviderConfig,
  query: string,
  decision: OperationsDecision,
  evidenceLabels: string[],
  fetchImpl: FetchLike,
): Promise<ProviderReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
  try {
    const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.15,
        max_tokens: 220,
        messages: groundedProviderPrompt(query, decision, evidenceLabels),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const payload = await response.json() as {
      model?: unknown;
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        total_tokens?: unknown;
      };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Provider response did not contain a usable brief.");
    }
    return {
      narrative: compact(redactSensitiveText(content), 1_200),
      reportedModel: typeof payload.model === "string" ? compact(payload.model, 120) : undefined,
      tokens: payload.usage && [payload.usage.prompt_tokens, payload.usage.completion_tokens, payload.usage.total_tokens].every((value) => typeof value === "number" && Number.isFinite(value))
        ? {
            input: payload.usage.prompt_tokens as number,
            output: payload.usage.completion_tokens as number,
            total: payload.usage.total_tokens as number,
          }
        : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeAuditedAgentAction(
  request: AgentRunRequest,
  options: ExecuteOptions = {},
): Promise<AgentRunResult> {
  const now = options.now ?? (() => new Date());
  const performanceNow = options.performanceNow ?? (() => performance.now());
  const providers = options.providers ?? configuredAgentProviders();
  const workersAi = options.workersAi === undefined
    ? await cloudflareWorkersAiBinding()
    : options.workersAi;
  const fetchImpl = options.fetchImpl ?? fetch;
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const requestedDate = now();
  const startedAt = performanceNow();
  const state = request.state ?? {};
  const decision = deterministicDecision(request.query, state, startedAt);
  // The local deterministic engine may inspect the original operator wording,
  // but no hosted provider receives secrets or personal identifiers we can detect.
  const hostedQuery = redactSensitiveText(request.query);
  const evidence = normalizeEvidence(request.evidence);
  const attempts: AgentProviderAttempt[] = [];
  let narrative: string | undefined;
  let selectedProvider = "AEGIS local engine";
  let selectedModel = "deterministic-operations-v1";

  if (workersAi) {
    const attemptStartedDate = now();
    const attemptStartedAt = performanceNow();
    try {
      const reply = await requestWorkersAi(
        workersAi,
        groundedProviderPrompt(
          hostedQuery,
          decision,
          evidence.map((citation) => citation.label),
        ),
      );
      const completedAt = now();
      narrative = compact(redactSensitiveText(reply.narrative), 1_200);
      selectedProvider = "Cloudflare Workers AI";
      selectedModel = WORKERS_AI_MODEL;
      attempts.push({
        provider: selectedProvider,
        model: selectedModel,
        startedAt: attemptStartedDate.toISOString(),
        completedAt: completedAt.toISOString(),
        latencyMs: Math.max(0, Math.round(performanceNow() - attemptStartedAt)),
        status: "completed",
        detail: "Bound Workers AI model returned a grounded narrative pending human review.",
        tokens: reply.tokens,
      });
    } catch (error) {
      const completedAt = now();
      const diagnostic = error instanceof Error
        ? compact(redactSensitiveText(error.message), 240)
        : "Unknown Workers AI failure.";
      console.warn(`[AEGIS] Workers AI narrative unavailable: ${diagnostic}`);
      attempts.push({
        provider: "Cloudflare Workers AI",
        model: WORKERS_AI_MODEL,
        startedAt: attemptStartedDate.toISOString(),
        completedAt: completedAt.toISOString(),
        latencyMs: Math.max(0, Math.round(performanceNow() - attemptStartedAt)),
        status: "failed",
        detail: safeFailureDetail(error),
      });
    }
  }

  for (const provider of narrative === undefined ? providers : []) {
    const attemptStartedDate = now();
    const attemptStartedAt = performanceNow();
    try {
      const reply = await requestProvider(
        provider,
        hostedQuery,
        decision,
        evidence.map((citation) => citation.label),
        fetchImpl,
      );
      const completedAt = now();
      attempts.push({
        provider: provider.provider,
        model: reply.reportedModel ?? provider.model,
        startedAt: attemptStartedDate.toISOString(),
        completedAt: completedAt.toISOString(),
        latencyMs: Math.max(0, Math.round(performanceNow() - attemptStartedAt)),
        status: "completed",
        detail: "Grounded narrative returned and preserved as model-authored text pending human review.",
        tokens: reply.tokens,
      });
      narrative = reply.narrative;
      selectedProvider = provider.provider;
      selectedModel = reply.reportedModel ?? provider.model;
      break;
    } catch (error) {
      const completedAt = now();
      attempts.push({
        provider: provider.provider,
        model: provider.model,
        startedAt: attemptStartedDate.toISOString(),
        completedAt: completedAt.toISOString(),
        latencyMs: Math.max(0, Math.round(performanceNow() - attemptStartedAt)),
        status: "failed",
        detail: safeFailureDetail(error),
      });
    }
  }

  const completedDate = now();
  const usedFallback = narrative === undefined;
  const fallbackReason = usedFallback
    ? providers.length === 0 && !workersAi
      ? "No optional hosted provider key is configured; the deterministic engine completed the request."
      : "Configured hosted providers did not return a verified response; the deterministic engine completed the request."
    : undefined;
  const activity = await createAgentActivityRecord({
    correlationId,
    channel: request.channel ?? "agent-ledger",
    query: request.query,
    suppliedStateSections: Object.keys(state).sort(),
    requestedAt: requestedDate.toISOString(),
    completedAt: completedDate.toISOString(),
    latencyMs: Math.max(1, Math.round(performanceNow() - startedAt)),
    outcome: usedFallback ? "fallback" : "completed",
    decision: {
      summary: decision.summary,
      recommendation: decision.recommendation,
      narrative,
      confidence: decision.confidence,
    },
    mode: usedFallback ? "deterministic-fallback" : "hosted-model",
    provider: selectedProvider,
    model: selectedModel,
    fallbackReason,
    attempts,
    evidence,
    approvalRequired: request.approvalRequired ?? true,
  });

  return { decision, narrative, activity };
}
