import type { AegisOperationalState } from "@/lib/ai/operations-agent";
import {
  agentRateLimitHeaders,
  appendAgentActivity,
  consumeAgentPostLimit,
  executeAuditedAgentAction,
  persistAgentActivity,
  type AgentEvidenceInput,
} from "@/lib/agent-activity";
import { readBoundedJson, validationIssues } from "@/lib/simulation/api-contract";
import { z } from "zod";

export const runtime = "nodejs";

const stateRecord = z.record(z.string().trim().min(1).max(80), z.unknown());
const operationsRequest = z.object({
  query: z.string().trim().min(1).max(600),
  state: z.object({
    incident: stateRecord.optional(),
    simulation: stateRecord.optional(),
    evacuation: stateRecord.optional(),
    infrastructure: stateRecord.optional(),
    evidence: z.array(stateRecord).max(12).optional(),
  }).strict().default({}),
}).strict();

function evidenceFromState(state: AegisOperationalState): AgentEvidenceInput[] {
  return (state.evidence ?? []).flatMap((item, index) => {
    const label = item.label ?? item.title ?? item.source;
    if (typeof label !== "string" || !label.trim()) return [];
    const url = item.url ?? item.href;
    return [{
      label: label.trim(),
      url: typeof url === "string" ? url : undefined,
      kind: "operator-supplied" as const,
      note: `Evidence item ${index + 1} supplied with the operations request.`,
    }];
  });
}

export async function POST(request: Request) {
  const rateLimit = consumeAgentPostLimit(request);
  const limitHeaders = agentRateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Operations-agent rate limit reached. Retry after the current one-minute window." },
      { status: 429, headers: { ...limitHeaders, "Cache-Control": "no-store" } },
    );
  }
  try {
    const parsed = operationsRequest.safeParse(await readBoundedJson(request, 48 * 1024));
    if (!parsed.success) {
      return Response.json(
        { error: "Operations request validation failed.", issues: validationIssues(parsed.error) },
        { status: 422, headers: limitHeaders },
      );
    }

    const state = parsed.data.state as AegisOperationalState;
    const execution = await executeAuditedAgentAction({
      query: parsed.data.query,
      state,
      evidence: evidenceFromState(state),
      approvalRequired: true,
      channel: "operations-center",
    });
    appendAgentActivity(execution.activity);
    const storage = await persistAgentActivity(execution.activity);
    return Response.json(execution.decision, {
      headers: {
        "Cache-Control": "no-store",
        ...limitHeaders,
        "X-AEGIS-Audit-Receipt": execution.activity.receipt.id,
        "X-AEGIS-Audit-Storage": storage.mode,
      },
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 413, headers: limitHeaders });
    }
    return Response.json(
      { error: "The operations analysis request could not be processed." },
      { status: 400, headers: limitHeaders },
    );
  }
}
