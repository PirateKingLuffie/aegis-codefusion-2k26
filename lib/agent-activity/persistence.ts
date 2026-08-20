import type { AgentActivityRecord, AgentLedgerStorageStatus } from "./types";
import { withReceiptVerification } from "./audit";
import { loadD1AgentActivity, persistD1AgentActivity } from "./d1";

const TIMEOUT_MS = 900;

type DurableRecord = {
  id: string;
  version: number;
  payload?: {
    recordType?: string;
    activity?: AgentActivityRecord;
  };
};

function serviceBase(): string | null {
  const configured = process.env.AEGIS_OPERATIONS_API_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : null;
}

function storageStatus(mode: AgentLedgerStorageStatus["mode"]): AgentLedgerStorageStatus {
  return mode === "durable"
    ? { mode, detail: "Connected to the AEGIS versioned operations store." }
    : { mode, detail: "Runtime ledger active; durable operations storage is not reachable." };
}

function d1StorageStatus(): AgentLedgerStorageStatus {
  return { mode: "durable", detail: "Stored in the Cloudflare D1 hash-linked revision ledger." };
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function persistAgentActivity(
  activity: AgentActivityRecord,
): Promise<AgentLedgerStorageStatus> {
  const d1 = await persistD1AgentActivity(activity);
  if (d1.stored) return d1StorageStatus();
  const base = serviceBase();
  if (!base) return storageStatus("runtime-only");
  try {
    const response = await timedFetch(`${base}/api/v1/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: activity.id,
        kind: "recommendation",
        name: `Agent activity · ${activity.action.name}`,
        status: activity.humanApproval.status,
        seed: activity.receipt.digest,
        actor: "aegis-agent",
        payload: { recordType: "agent-activity", activity },
      }),
    });
    return storageStatus(response.ok || response.status === 409 ? "durable" : "runtime-only");
  } catch {
    return storageStatus("runtime-only");
  }
}

export async function loadDurableAgentActivity(
  limit = 80,
): Promise<{ records: AgentActivityRecord[]; storage: AgentLedgerStorageStatus }> {
  const d1 = await loadD1AgentActivity(limit);
  if (d1.loaded) return { records: d1.records, storage: d1StorageStatus() };
  const base = serviceBase();
  if (!base) return { records: [], storage: storageStatus("runtime-only") };
  try {
    const response = await timedFetch(
      `${base}/api/v1/records?kind=recommendation&limit=${Math.max(1, Math.min(200, limit))}&offset=0`,
    );
    if (!response.ok) return { records: [], storage: storageStatus("runtime-only") };
    const payload = await response.json() as DurableRecord[];
    const storedRecords = payload.flatMap((item) => {
      const activity = item.payload?.recordType === "agent-activity" ? item.payload.activity : undefined;
      return activity?.schemaVersion === 1 ? [activity] : [];
    });
    const records = await Promise.all(storedRecords.map(withReceiptVerification));
    return { records, storage: storageStatus("durable") };
  } catch {
    return { records: [], storage: storageStatus("runtime-only") };
  }
}

export async function updateDurableAgentActivity(
  activity: AgentActivityRecord,
): Promise<AgentLedgerStorageStatus> {
  const d1 = await persistD1AgentActivity(activity);
  if (d1.stored) return d1StorageStatus();
  const base = serviceBase();
  if (!base) return storageStatus("runtime-only");
  try {
    const currentResponse = await timedFetch(`${base}/api/v1/records/${encodeURIComponent(activity.id)}`);
    if (!currentResponse.ok) return storageStatus("runtime-only");
    const current = await currentResponse.json() as DurableRecord;
    const response = await timedFetch(`${base}/api/v1/records/${encodeURIComponent(activity.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_version: current.version,
        status: activity.humanApproval.status,
        seed: activity.receipt.digest,
        actor: activity.humanApproval.reviewer || "demo-operator",
        payload: { recordType: "agent-activity", activity },
      }),
    });
    return storageStatus(response.ok ? "durable" : "runtime-only");
  } catch {
    return storageStatus("runtime-only");
  }
}
