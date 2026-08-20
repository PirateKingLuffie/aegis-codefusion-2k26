import type { AegisOperationalState, OperationsDecision } from "@/lib/ai/operations-agent";

export type AgentApprovalStatus = "not-required" | "pending" | "approved" | "rejected";
export type AgentExecutionMode = "hosted-model" | "deterministic-fallback";
export type AgentExecutionOutcome = "completed" | "fallback";

export type AgentEvidenceInput = {
  label: string;
  url?: string;
  kind?: "public-source" | "operator-supplied" | "internal-method";
  observedAt?: string;
  note?: string;
};

export type AgentEvidenceCitation = {
  id: string;
  label: string;
  url?: string;
  kind: "public-source" | "operator-supplied" | "internal-method";
  observedAt?: string;
  note?: string;
  verification: "verified-internal" | "operator-supplied-unverified";
};

export type AgentProviderAttempt = {
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  status: "completed" | "failed";
  detail: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
};

export type AgentActivityRecord = {
  schemaVersion: 1;
  id: string;
  correlationId: string;
  action: {
    name: string;
    channel: "agent-ledger" | "operations-center";
    actor: "AEGIS operations agent";
  };
  requestedAt: string;
  completedAt: string;
  latencyMs: number;
  outcome: AgentExecutionOutcome;
  input: {
    summary: string;
    characters: number;
    suppliedStateSections: string[];
  };
  output: {
    summary: string;
    recommendation: string;
    narrative?: string;
    confidence: number;
  };
  execution: {
    mode: AgentExecutionMode;
    provider: string;
    model: string;
    fallbackReason?: string;
    attempts: AgentProviderAttempt[];
  };
  evidence: AgentEvidenceCitation[];
  humanApproval: {
    required: boolean;
    status: AgentApprovalStatus;
    reviewer?: string;
    reviewedAt?: string;
    note?: string;
  };
  receipt: {
    id: string;
    revision: number;
    algorithm: "SHA-256";
    digest: string;
    previousDigest?: string;
    verification: "verified" | "invalid";
  };
};

export type AgentRunRequest = {
  query: string;
  state?: AegisOperationalState;
  evidence?: AgentEvidenceInput[];
  approvalRequired?: boolean;
  channel?: AgentActivityRecord["action"]["channel"];
};

export type AgentRunResult = {
  decision: OperationsDecision;
  narrative?: string;
  activity: AgentActivityRecord;
};

export type AgentLedgerStorageStatus = {
  mode: "durable" | "runtime-only";
  detail: string;
};

export type AgentLedgerListResponse = {
  records: AgentActivityRecord[];
  storage: AgentLedgerStorageStatus;
  providers: {
    configured: boolean;
    names: string[];
    deterministicFallback: true;
  };
};
