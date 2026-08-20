import { reviewAgentActivityRecord } from "./audit";
import type { AgentActivityRecord } from "./types";

const MAX_RUNTIME_RECORDS = 200;

type AgentLedgerGlobal = typeof globalThis & {
  __aegisAgentLedger?: Map<string, AgentActivityRecord>;
};

function ledger(): Map<string, AgentActivityRecord> {
  const shared = globalThis as AgentLedgerGlobal;
  shared.__aegisAgentLedger ??= new Map<string, AgentActivityRecord>();
  return shared.__aegisAgentLedger;
}

export function appendAgentActivity(record: AgentActivityRecord): AgentActivityRecord {
  const records = ledger();
  records.set(record.id, record);
  if (records.size > MAX_RUNTIME_RECORDS) {
    const oldest = [...records.values()].sort((left, right) =>
      left.completedAt.localeCompare(right.completedAt),
    )[0];
    if (oldest) records.delete(oldest.id);
  }
  return record;
}

export function listRuntimeAgentActivity(limit = 80): AgentActivityRecord[] {
  return [...ledger().values()]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, Math.max(1, Math.min(MAX_RUNTIME_RECORDS, limit)));
}

export function getRuntimeAgentActivity(id: string): AgentActivityRecord | undefined {
  return ledger().get(id);
}

export async function reviewRuntimeAgentActivity(
  id: string,
  decision: "approved" | "rejected",
  reviewer: string,
  note?: string,
): Promise<AgentActivityRecord | undefined> {
  const current = ledger().get(id);
  if (!current) return undefined;
  const reviewed = await reviewAgentActivityRecord(current, decision, reviewer, note);
  ledger().set(id, reviewed);
  return reviewed;
}

export function clearRuntimeAgentActivity(): void {
  ledger().clear();
}
