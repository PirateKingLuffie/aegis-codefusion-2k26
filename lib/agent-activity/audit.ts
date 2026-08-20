import type {
  AgentActivityRecord,
  AgentEvidenceCitation,
  AgentEvidenceInput,
  AgentProviderAttempt,
} from "./types";

const INTERNAL_METHOD_CITATION: AgentEvidenceCitation = {
  id: "method-deterministic-operations-v1",
  label: "AEGIS deterministic operations engine · v1",
  kind: "internal-method",
  note: "Numerical findings and recommendations were calculated by the repository's deterministic operations engine.",
  verification: "verified-internal",
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function receiptMaterial(record: AgentActivityRecord): unknown {
  return {
    ...record,
    receipt: {
      id: record.receipt.id,
      revision: record.receipt.revision,
      algorithm: record.receipt.algorithm,
      previousDigest: record.receipt.previousDigest,
    },
  };
}

function safeEvidenceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(?:api[_-]?key|token|secret|password|signature|authorization|auth)/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanSummary(value: string, maximum: number): string {
  const compact = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  return compact.length <= maximum ? compact : `${compact.slice(0, maximum - 1)}…`;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(?:sk|gsk|key)[-_][A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_KEY]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_KEY]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
}

export function normalizeEvidence(inputs: AgentEvidenceInput[] = []): AgentEvidenceCitation[] {
  const supplied = inputs.slice(0, 12).map((item, index): AgentEvidenceCitation => ({
    id: `evidence-${index + 1}`,
    label: cleanSummary(item.label, 180),
    url: safeEvidenceUrl(item.url),
    kind: item.kind === "public-source" ? "public-source" : "operator-supplied",
    observedAt: item.observedAt,
    note: item.note ? cleanSummary(item.note, 280) : undefined,
    verification: "operator-supplied-unverified",
  }));
  return [INTERNAL_METHOD_CITATION, ...supplied];
}

type CreateRecordInput = {
  correlationId: string;
  channel: AgentActivityRecord["action"]["channel"];
  query: string;
  suppliedStateSections: string[];
  requestedAt: string;
  completedAt: string;
  latencyMs: number;
  outcome: AgentActivityRecord["outcome"];
  decision: AgentActivityRecord["output"];
  mode: AgentActivityRecord["execution"]["mode"];
  provider: string;
  model: string;
  fallbackReason?: string;
  attempts: AgentProviderAttempt[];
  evidence: AgentEvidenceCitation[];
  approvalRequired: boolean;
};

export async function createAgentActivityRecord(
  input: CreateRecordInput,
): Promise<AgentActivityRecord> {
  const receiptId = `agt:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 12)}`;
  const unsigned = {
    schemaVersion: 1 as const,
    id: receiptId,
    correlationId: input.correlationId,
    action: {
      name: "Operational evidence brief",
      channel: input.channel,
      actor: "AEGIS operations agent" as const,
    },
    requestedAt: input.requestedAt,
    completedAt: input.completedAt,
    latencyMs: input.latencyMs,
    outcome: input.outcome,
    input: {
      summary: cleanSummary(input.query, 360),
      characters: input.query.length,
      suppliedStateSections: input.suppliedStateSections,
    },
    output: input.decision,
    execution: {
      mode: input.mode,
      provider: cleanSummary(input.provider, 120),
      model: cleanSummary(input.model, 160),
      fallbackReason: input.fallbackReason ? cleanSummary(input.fallbackReason, 280) : undefined,
      attempts: input.attempts.map((attempt) => ({
        ...attempt,
        provider: cleanSummary(attempt.provider, 120),
        model: cleanSummary(attempt.model, 160),
        detail: cleanSummary(attempt.detail, 280),
      })),
    },
    evidence: input.evidence,
    humanApproval: {
      required: input.approvalRequired,
      status: input.approvalRequired ? "pending" as const : "not-required" as const,
    },
  };
  const pendingRecord = {
    ...unsigned,
    receipt: {
      id: receiptId,
      revision: 1,
      algorithm: "SHA-256",
      digest: "",
      verification: "invalid",
    },
  } satisfies AgentActivityRecord;
  return {
    ...pendingRecord,
    receipt: {
      ...pendingRecord.receipt,
      digest: await sha256(receiptMaterial(pendingRecord)),
      verification: "verified",
    },
  };
}

export async function reviewAgentActivityRecord(
  record: AgentActivityRecord,
  decision: "approved" | "rejected",
  reviewer: string,
  note?: string,
): Promise<AgentActivityRecord> {
  if (!record.humanApproval.required) return record;
  const previousDigest = record.receipt.digest;
  const reviewed = {
    ...record,
    humanApproval: {
      required: true,
      status: decision,
      reviewer: cleanSummary(reviewer || "Demo operator", 64),
      reviewedAt: new Date().toISOString(),
      note: note ? cleanSummary(note, 240) : undefined,
    },
    receipt: {
      ...record.receipt,
      revision: record.receipt.revision + 1,
      previousDigest,
      digest: "",
      verification: "invalid",
    },
  } satisfies AgentActivityRecord;
  return {
    ...reviewed,
    receipt: {
      ...reviewed.receipt,
      digest: await sha256(receiptMaterial(reviewed)),
      verification: "verified",
    },
  };
}

export async function verifyAgentActivityRecord(record: AgentActivityRecord): Promise<boolean> {
  return record.receipt.digest === await sha256(receiptMaterial(record));
}

export async function withReceiptVerification(
  record: AgentActivityRecord,
): Promise<AgentActivityRecord> {
  const verified = await verifyAgentActivityRecord(record);
  return {
    ...record,
    receipt: {
      ...record.receipt,
      verification: verified ? "verified" : "invalid",
    },
  };
}

export async function verifyAgentActivityChain(
  revisions: AgentActivityRecord[],
): Promise<boolean> {
  if (revisions.length === 0) return true;
  const ordered = [...revisions].sort((left, right) => left.receipt.revision - right.receipt.revision);
  if (ordered[0].receipt.revision !== 1 || ordered[0].receipt.previousDigest !== undefined) return false;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (!await verifyAgentActivityRecord(current)) return false;
    if (index === 0) continue;
    const previous = ordered[index - 1];
    if (current.id !== previous.id) return false;
    if (current.receipt.revision !== previous.receipt.revision + 1) return false;
    if (current.receipt.previousDigest !== previous.receipt.digest) return false;
  }
  return true;
}
