import { verifyAgentActivityChain, withReceiptVerification } from "./audit";
import type { AgentActivityRecord } from "./types";

export type D1ResultLike<T = Record<string, unknown>> = {
  success?: boolean;
  results?: T[];
};

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  run(): Promise<D1ResultLike>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

export type D1WriteResult = {
  available: boolean;
  stored: boolean;
};

export type D1ReadResult = {
  available: boolean;
  loaded: boolean;
  records: AgentActivityRecord[];
};

const INSERT_REVISION = `
  INSERT INTO aegis_agent_activity_revisions (
    receipt_id, revision, recorded_at, completed_at, digest, previous_digest,
    approval_status, channel, provider, model, activity_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(receipt_id, revision) DO NOTHING
`;

const SELECT_LATEST = `
  SELECT activity_json
  FROM aegis_agent_activity_revisions AS current
  WHERE current.revision = (
    SELECT MAX(candidate.revision)
    FROM aegis_agent_activity_revisions AS candidate
    WHERE candidate.receipt_id = current.receipt_id
  )
  ORDER BY current.recorded_at DESC
  LIMIT ?
`;

let cloudflareBindingPromise: Promise<D1DatabaseLike | null> | undefined;

function isD1Database(value: unknown): value is D1DatabaseLike {
  return Boolean(value && typeof value === "object" && "prepare" in value && typeof value.prepare === "function");
}

export async function cloudflareLedgerBinding(): Promise<D1DatabaseLike | null> {
  cloudflareBindingPromise ??= (async () => {
    try {
      const workers = await import("cloudflare:workers");
      const binding = workers.env.AEGIS_LEDGER_DB;
      return isD1Database(binding) ? binding : null;
    } catch {
      return null;
    }
  })();
  return cloudflareBindingPromise;
}

function parseActivity(value: unknown): AgentActivityRecord | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<AgentActivityRecord>;
    if (parsed.schemaVersion !== 1 || typeof parsed.id !== "string") return null;
    if (!parsed.receipt || typeof parsed.receipt.digest !== "string") return null;
    return parsed as AgentActivityRecord;
  } catch {
    return null;
  }
}

export async function persistD1AgentActivity(
  activity: AgentActivityRecord,
  database?: D1DatabaseLike | null,
): Promise<D1WriteResult> {
  const binding = database === undefined ? await cloudflareLedgerBinding() : database;
  if (!binding) return { available: false, stored: false };
  try {
    const recordedAt = activity.humanApproval.reviewedAt ?? activity.completedAt;
    const result = await binding.prepare(INSERT_REVISION).bind(
      activity.id,
      activity.receipt.revision,
      recordedAt,
      activity.completedAt,
      activity.receipt.digest,
      activity.receipt.previousDigest ?? null,
      activity.humanApproval.status,
      activity.action.channel,
      activity.execution.provider,
      activity.execution.model,
      JSON.stringify(activity),
    ).run();
    return { available: true, stored: result.success !== false };
  } catch {
    return { available: true, stored: false };
  }
}

export async function loadD1AgentActivity(
  limit = 80,
  database?: D1DatabaseLike | null,
): Promise<D1ReadResult> {
  const binding = database === undefined ? await cloudflareLedgerBinding() : database;
  if (!binding) return { available: false, loaded: false, records: [] };
  const boundedLimit = Math.max(1, Math.min(200, Math.round(limit)));
  try {
    const latestResult = await binding.prepare(SELECT_LATEST).bind(boundedLimit).all<{ activity_json: string }>();
    if (latestResult.success === false) return { available: true, loaded: false, records: [] };
    const latest = (latestResult.results ?? []).map((row) => parseActivity(row.activity_json)).filter((record): record is AgentActivityRecord => record !== null);
    if (latest.length === 0) return { available: true, loaded: true, records: [] };

    const receiptIds = latest.map((record) => record.id);
    const chunks = Array.from(
      { length: Math.ceil(receiptIds.length / 80) },
      (_, index) => receiptIds.slice(index * 80, index * 80 + 80),
    );
    const chainResults = await Promise.all(chunks.map((ids) => {
      const placeholders = ids.map(() => "?").join(", ");
      return binding.prepare(`
        SELECT activity_json
        FROM aegis_agent_activity_revisions
        WHERE receipt_id IN (${placeholders})
        ORDER BY receipt_id ASC, revision ASC
      `).bind(...ids).all<{ activity_json: string }>();
    }));
    if (chainResults.some((result) => result.success === false)) {
      return { available: true, loaded: false, records: [] };
    }
    const revisions = chainResults.flatMap((result) => result.results ?? [])
      .map((row) => parseActivity(row.activity_json))
      .filter((record): record is AgentActivityRecord => record !== null);
    const byReceipt = new Map<string, AgentActivityRecord[]>();
    for (const revision of revisions) {
      const group = byReceipt.get(revision.id) ?? [];
      group.push(revision);
      byReceipt.set(revision.id, group);
    }

    const records = await Promise.all(latest.map(async (record) => {
      const digestChecked = await withReceiptVerification(record);
      const chain = byReceipt.get(record.id) ?? [];
      const chainValid = await verifyAgentActivityChain(chain);
      return chainValid ? digestChecked : {
        ...digestChecked,
        receipt: { ...digestChecked.receipt, verification: "invalid" as const },
      };
    }));
    return { available: true, loaded: true, records };
  } catch {
    return { available: true, loaded: false, records: [] };
  }
}
