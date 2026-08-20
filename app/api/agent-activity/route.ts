import {
  appendAgentActivity,
  agentRateLimitHeaders,
  consumeAgentPostLimit,
  cloudflareWorkersAiBinding,
  executeAuditedAgentAction,
  listRuntimeAgentActivity,
  loadDurableAgentActivity,
  persistAgentActivity,
  publicProviderReadiness,
  reviewRuntimeAgentActivity,
  updateDurableAgentActivity,
  type AgentActivityRecord,
} from "@/lib/agent-activity";
import { readBoundedJson, validationIssues } from "@/lib/simulation/api-contract";
import { z } from "zod";

export const runtime = "nodejs";

const stateRecord = z.record(z.string().trim().min(1).max(80), z.unknown());
const evidenceInput = z.object({
  label: z.string().trim().min(1).max(180),
  url: z.url().max(2_000).optional(),
  kind: z.enum(["public-source", "operator-supplied", "internal-method"]).optional(),
  observedAt: z.iso.datetime().optional(),
  note: z.string().trim().min(1).max(280).optional(),
}).strict();
const runRequest = z.object({
  query: z.string().trim().min(1).max(1_200),
  state: z.object({
    incident: stateRecord.optional(),
    simulation: stateRecord.optional(),
    evacuation: stateRecord.optional(),
    infrastructure: stateRecord.optional(),
    evidence: z.array(stateRecord).max(12).optional(),
  }).strict().default({}),
  evidence: z.array(evidenceInput).max(12).default([]),
  approvalRequired: z.boolean().default(true),
}).strict();
const reviewRequest = z.object({
  receiptId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  decision: z.enum(["approved", "rejected"]),
  reviewer: z.string().trim().min(1).max(64).default("Demo operator"),
  note: z.string().trim().min(1).max(240).optional(),
}).strict();

function mergeRecords(
  durable: AgentActivityRecord[],
  runtimeRecords: AgentActivityRecord[],
  limit: number,
): AgentActivityRecord[] {
  const merged = new Map(durable.map((record) => [record.id, record]));
  for (const record of runtimeRecords) {
    const existing = merged.get(record.id);
    if (!existing || record.receipt.revision >= existing.receipt.revision) merged.set(record.id, record);
  }
  return [...merged.values()]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, limit);
}

export async function GET(request: Request): Promise<Response> {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 80);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, Math.round(requestedLimit))) : 80;
  const durable = await loadDurableAgentActivity(limit);
  const workersAi = await cloudflareWorkersAiBinding();
  return Response.json({
    records: mergeRecords(durable.records, listRuntimeAgentActivity(limit), limit),
    storage: durable.storage,
    providers: publicProviderReadiness(undefined, workersAi !== null),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = consumeAgentPostLimit(request);
  const limitHeaders = agentRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Agent execution rate limit reached. Retry after the current one-minute window." },
      { status: 429, headers: { ...limitHeaders, "Cache-Control": "no-store" } },
    );
  }
  try {
    const parsed = runRequest.safeParse(await readBoundedJson(request, 96 * 1024));
    if (!parsed.success) {
      return Response.json(
        { error: "Agent activity request validation failed.", issues: validationIssues(parsed.error) },
        { status: 422, headers: limitHeaders },
      );
    }
    const execution = await executeAuditedAgentAction({
      ...parsed.data,
      channel: "agent-ledger",
    });
    appendAgentActivity(execution.activity);
    const storage = await persistAgentActivity(execution.activity);
    return Response.json({ ...execution, storage }, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        ...limitHeaders,
        "X-AEGIS-Audit-Receipt": execution.activity.receipt.id,
      },
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 413, headers: limitHeaders });
    }
    return Response.json(
      { error: "The audited agent request could not be processed." },
      { status: 400, headers: limitHeaders },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const rateLimit = consumeAgentPostLimit(request);
  const limitHeaders = agentRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Agent review rate limit reached. Retry after the current one-minute window." },
      { status: 429, headers: { ...limitHeaders, "Cache-Control": "no-store" } },
    );
  }
  try {
    const parsed = reviewRequest.safeParse(await readBoundedJson(request, 16 * 1024));
    if (!parsed.success) {
      return Response.json(
        { error: "Approval request validation failed.", issues: validationIssues(parsed.error) },
        { status: 422, headers: limitHeaders },
      );
    }
    let reviewed = await reviewRuntimeAgentActivity(
      parsed.data.receiptId,
      parsed.data.decision,
      parsed.data.reviewer,
      parsed.data.note,
    );
    if (!reviewed) {
      const durable = await loadDurableAgentActivity(200);
      const recovered = durable.records.find((record) => record.id === parsed.data.receiptId);
      if (recovered) {
        appendAgentActivity(recovered);
        reviewed = await reviewRuntimeAgentActivity(
          parsed.data.receiptId,
          parsed.data.decision,
          parsed.data.reviewer,
          parsed.data.note,
        );
      }
    }
    if (!reviewed) {
      return Response.json({ error: "The requested audit receipt was not found." }, { status: 404, headers: limitHeaders });
    }
    const storage = await updateDurableAgentActivity(reviewed);
    return Response.json({ activity: reviewed, storage }, {
      headers: {
        "Cache-Control": "no-store",
        ...limitHeaders,
        "X-AEGIS-Audit-Receipt": reviewed.receipt.id,
      },
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 413, headers: limitHeaders });
    }
    return Response.json({ error: "The approval decision could not be recorded." }, { status: 400, headers: limitHeaders });
  }
}
