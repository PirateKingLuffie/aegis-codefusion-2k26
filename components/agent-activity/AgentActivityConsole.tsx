"use client";

import {
  Activity,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clipboard,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Gauge,
  KeyRound,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  X,
  XCircle,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FeatureNavigation } from "@/components/navigation/FeatureNavigation";
import type {
  AgentActivityRecord,
  AgentLedgerListResponse,
  AgentLedgerStorageStatus,
  AgentRunResult,
} from "@/lib/agent-activity";
import styles from "./agent-activity.module.css";

type RunResponse = AgentRunResult & { storage: AgentLedgerStorageStatus };
type ReviewResponse = { activity: AgentActivityRecord; storage: AgentLedgerStorageStatus };

const EMPTY_LEDGER: AgentLedgerListResponse = {
  records: [],
  storage: {
    mode: "runtime-only",
    detail: "Checking the ledger store.",
  },
  providers: {
    configured: false,
    names: [],
    deterministicFallback: true,
  },
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

function formatTimestamp(value: string): string {
  return TIMESTAMP_FORMATTER.format(new Date(value));
}

function shortReceipt(value: string): string {
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function confidenceLabel(value: number): string {
  if (value >= 0.8) return "High";
  if (value >= 0.5) return "Moderate";
  return "Limited";
}

function approvalLabel(record: AgentActivityRecord): string {
  if (!record.humanApproval.required) return "No approval required";
  if (record.humanApproval.status === "pending") return "Awaiting human review";
  return record.humanApproval.status === "approved" ? "Human approved" : "Human rejected";
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || `Request returned HTTP ${response.status}.`;
  } catch {
    return `Request returned HTTP ${response.status}.`;
  }
}

export function AgentActivityConsole() {
  const [ledger, setLedger] = useState<AgentLedgerListResponse>(EMPTY_LEDGER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [query, setQuery] = useState("");
  const [stateJson, setStateJson] = useState("{}");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshLedger = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch("/api/agent-activity?limit=100", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as AgentLedgerListResponse;
      setLedger(payload);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The activity ledger could not be refreshed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshLedger(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshLedger(true);
    }, 8_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refreshLedger]);

  const selected = useMemo(
    () => ledger.records.find((record) => record.id === selectedId) ?? ledger.records[0] ?? null,
    [ledger.records, selectedId],
  );
  const metrics = useMemo(() => {
    let hosted = 0;
    let fallback = 0;
    let pending = 0;
    let failedAttempts = 0;
    for (const record of ledger.records) {
      if (record.execution.mode === "hosted-model") hosted += 1;
      else fallback += 1;
      if (record.humanApproval.status === "pending") pending += 1;
      failedAttempts += record.execution.attempts.filter((attempt) => attempt.status === "failed").length;
    }
    return { hosted, fallback, pending, failedAttempts };
  }, [ledger.records]);

  const runAgent = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    let state: Record<string, unknown>;
    try {
      const parsed = JSON.parse(stateJson) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("State context must be a JSON object.");
      }
      state = parsed as Record<string, unknown>;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "State context must be valid JSON.");
      return;
    }
    setRunning(true);
    setNotice(null);
    try {
      const evidence = sourceLabel.trim()
        ? [{
            label: sourceLabel.trim(),
            url: sourceUrl.trim() || undefined,
            kind: "operator-supplied" as const,
          }]
        : [];
      const response = await fetch("/api/agent-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedQuery,
          state,
          evidence,
          approvalRequired,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as RunResponse;
      setLedger((current) => ({
        ...current,
        storage: payload.storage,
        records: [payload.activity, ...current.records.filter((item) => item.id !== payload.activity.id)],
      }));
      setSelectedId(payload.activity.id);
      setQuery("");
      setNotice("Execution completed and a SHA-256 integrity receipt was issued.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The audited request could not be completed.");
    } finally {
      setRunning(false);
    }
  }, [approvalRequired, query, sourceLabel, sourceUrl, stateJson]);

  const review = useCallback(async (decision: "approved" | "rejected") => {
    if (!selected) return;
    setReviewing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/agent-activity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptId: selected.id,
          decision,
          reviewer: "Demo operator",
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as ReviewResponse;
      setLedger((current) => ({
        ...current,
        storage: payload.storage,
        records: current.records.map((item) => item.id === payload.activity.id ? payload.activity : item),
      }));
      setNotice(`Receipt ${decision}; hash-linked revision ${payload.activity.receipt.revision} issued.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The human decision could not be recorded.");
    } finally {
      setReviewing(false);
    }
  }, [selected]);

  const copyReceipt = useCallback(async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        receipt: selected.receipt,
        action: selected.action,
        completedAt: selected.completedAt,
        provider: selected.execution.provider,
        model: selected.execution.model,
        approval: selected.humanApproval,
      }, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      setNotice("Clipboard access is unavailable; the receipt remains visible below.");
    }
  }, [selected]);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark avoids an image runtime dependency */}
            <img src="/aegis-mark.svg" alt="" width="28" height="33" />
          </span>
          <div>
            <span>AEGIS Emergency Operations</span>
            <strong>Decision Audit Log</strong>
          </div>
        </div>
        <div className={styles.captureState}>
          <i />
          <span>Audit capture active</span>
          <small>No seeded events</small>
        </div>
        <FeatureNavigation active="ledger" />
      </header>

      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="ledger-title">
          <div>
            <span className={styles.kicker}>Decision support audit</span>
            <h1 id="ledger-title">Agent activity and decision records</h1>
            <p>
              A separate operational record of real executions, provider attempts, grounded outputs
              and the person who accepted or rejected the recommendation.
            </p>
          </div>
          <div className={styles.summaryGrid}>
            <article>
              <Activity size={15} />
              <span>Executions</span>
              <strong>{ledger.records.length.toString().padStart(2, "0")}</strong>
              <small>{metrics.hosted} hosted · {metrics.fallback} local</small>
            </article>
            <article>
              <ShieldCheck size={15} />
              <span>Approval queue</span>
              <strong>{metrics.pending.toString().padStart(2, "0")}</strong>
              <small>human control retained</small>
            </article>
            <article>
              <Gauge size={15} />
              <span>Provider failures</span>
              <strong>{metrics.failedAttempts.toString().padStart(2, "0")}</strong>
              <small>fallbacks disclosed</small>
            </article>
            <article>
              <Database size={15} />
              <span>Receipt store</span>
              <strong>{ledger.storage.mode === "durable" ? "LINKED" : "RUNTIME"}</strong>
              <small>{ledger.storage.mode === "durable" ? "versioned record" : "service unavailable"}</small>
            </article>
          </div>
        </section>

        {notice ? (
          <div className={styles.notice} role="status">
            <CircleDot size={13} />
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={14} /></button>
          </div>
        ) : null}

        <section className={styles.workspace}>
          <aside className={styles.stream} aria-label="Agent activity stream">
            <div className={styles.panelHeading}>
              <div>
                <span>Activity log</span>
                <strong>Recorded executions</strong>
              </div>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => void refreshLedger()}
                aria-label="Refresh agent activity"
                disabled={refreshing}
              >
                <RefreshCw size={14} className={refreshing ? styles.spinning : ""} />
              </button>
            </div>
            <div className={styles.streamMeta}>
              <span>{ledger.providers.configured ? ledger.providers.names.join(" + ") : "Hosted provider unavailable"}</span>
              <small>Deterministic fallback ready</small>
            </div>
            <div className={styles.recordList}>
              {loading ? (
                <div className={styles.emptyState}><LoaderCircle className={styles.spinning} /><span>Loading activity records</span></div>
              ) : ledger.records.length === 0 ? (
                <div className={styles.emptyState}>
                  <Fingerprint size={25} />
                  <strong>No agent actions recorded</strong>
                  <span>The ledger starts empty by design. Run a request to create the first real receipt.</span>
                </div>
              ) : ledger.records.map((record) => (
                <button
                  type="button"
                  className={record.id === selected?.id ? styles.recordActive : styles.recordButton}
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  aria-pressed={record.id === selected?.id}
                >
                  <span className={record.outcome === "completed" ? styles.statusGood : styles.statusFallback}>
                    {record.outcome === "completed" ? <CheckCircle2 size={13} /> : <RefreshCw size={13} />}
                  </span>
                  <span className={styles.recordCopy}>
                    <strong>{record.action.name}</strong>
                    <small>{record.execution.provider} · {record.latencyMs} ms</small>
                    <em>{formatTimestamp(record.completedAt)}</em>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </aside>

          <article className={styles.detail} aria-live="polite">
            {selected ? (
              <>
                <div className={styles.detailHeading}>
                  <div>
                    <span>Audit receipt · revision {selected.receipt.revision}</span>
                    <h2>{selected.action.name}</h2>
                    <p>{shortReceipt(selected.receipt.id)}</p>
                  </div>
                  <span className={selected.humanApproval.status === "approved" ? styles.approvalApproved : selected.humanApproval.status === "rejected" ? styles.approvalRejected : styles.approvalPending}>
                    {approvalLabel(selected)}
                  </span>
                </div>

                <div className={styles.executionStrip}>
                  <div><span>Provider</span><strong>{selected.execution.provider}</strong></div>
                  <div><span>Model / engine</span><strong>{selected.execution.model}</strong></div>
                  <div><span>Latency</span><strong>{selected.latencyMs} ms</strong></div>
                  <div><span>Confidence</span><strong>{Math.round(selected.output.confidence * 100)}% · {confidenceLabel(selected.output.confidence)}</strong></div>
                </div>

                <div className={styles.detailScroll}>
                  <section className={styles.block}>
                    <div className={styles.blockTitle}><TerminalSquare size={14} /><span>Input summary</span></div>
                    <p className={styles.question}>{selected.input.summary}</p>
                    <div className={styles.microMeta}>
                      <span>{selected.input.characters} characters</span>
                      <span>{selected.input.suppliedStateSections.length ? selected.input.suppliedStateSections.join(" · ") : "no state sections supplied"}</span>
                    </div>
                  </section>

                  <section className={styles.block}>
                    <div className={styles.blockTitle}><FileCheck2 size={14} /><span>Grounded output</span></div>
                    <p>{selected.output.summary}</p>
                    {selected.output.narrative ? (
                      <blockquote>
                        <span>Model-authored narrative · human review required</span>
                        {selected.output.narrative}
                      </blockquote>
                    ) : null}
                    <div className={styles.recommendation}>
                      <span>Proposed action</span>
                      <strong>{selected.output.recommendation}</strong>
                    </div>
                  </section>

                  <section className={styles.block}>
                    <div className={styles.blockTitle}><Activity size={14} /><span>Execution path</span></div>
                    <ol className={styles.timeline}>
                      <li>
                        <i className={styles.timelineGood}><Check size={11} /></i>
                        <div><strong>Deterministic analysis completed</strong><span>AEGIS calculated the operational finding before any optional language-model call.</span></div>
                      </li>
                      {selected.execution.attempts.map((attempt, index) => (
                        <li key={`${attempt.provider}-${attempt.startedAt}-${index}`}>
                          <i className={attempt.status === "completed" ? styles.timelineGood : styles.timelineBad}>
                            {attempt.status === "completed" ? <Check size={11} /> : <X size={11} />}
                          </i>
                          <div>
                            <strong>{attempt.provider} / {attempt.model}</strong>
                            <span>{attempt.detail} · {attempt.latencyMs} ms{attempt.tokens ? ` · ${attempt.tokens.total} tokens` : " · token usage not reported"}</span>
                          </div>
                        </li>
                      ))}
                      {selected.execution.mode === "deterministic-fallback" ? (
                        <li>
                          <i className={styles.timelineNeutral}><RefreshCw size={10} /></i>
                          <div><strong>Deterministic fallback delivered</strong><span>{selected.execution.fallbackReason}</span></div>
                        </li>
                      ) : null}
                    </ol>
                  </section>

                  <section className={styles.block}>
                    <div className={styles.blockTitle}><KeyRound size={14} /><span>Evidence citations</span></div>
                    <div className={styles.evidenceList}>
                      {selected.evidence.map((citation) => (
                        <article key={citation.id}>
                          <div>
                            <strong>{citation.label}</strong>
                            <span>{citation.kind.replaceAll("-", " ")} · {citation.verification.replaceAll("-", " ")}</span>
                          </div>
                          {citation.url ? (
                            <a href={citation.url} target="_blank" rel="noreferrer" aria-label={`Open evidence: ${citation.label}`}><ExternalLink size={13} /></a>
                          ) : <small>INTERNAL</small>}
                        </article>
                      ))}
                    </div>
                  </section>
                </div>

                <footer className={styles.receiptFooter}>
                  <div>
                    <Fingerprint size={15} />
                    <span><strong>{selected.receipt.algorithm} · {selected.receipt.verification.toUpperCase()}</strong>{selected.receipt.digest}</span>
                  </div>
                  <button type="button" onClick={() => void copyReceipt()}>
                    {copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy receipt"}
                  </button>
                </footer>
              </>
            ) : (
              <div className={styles.detailEmpty}>
                <Fingerprint size={34} />
                <h2>No receipt selected</h2>
                <p>Complete a real request or select an existing execution to inspect its provider path and evidence.</p>
              </div>
            )}
          </article>

          <aside className={styles.actionPanel} aria-label="Run audited agent request">
            <div className={styles.panelHeading}>
              <div>
                <span>New analysis</span>
                <strong>Run an evidence-based brief</strong>
              </div>
              <Play size={15} />
            </div>
            <form onSubmit={runAgent}>
              <label>
                <span>Operator question</span>
                <textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={1_200}
                  placeholder="Ask for an operational recommendation based on the current supplied state…"
                  rows={5}
                  required
                />
                <small>{query.length} / 1,200</small>
              </label>

              <details className={styles.contextDetails}>
                <summary>Structured state context <span>OPTIONAL</span></summary>
                <label>
                  <span>JSON state</span>
                  <textarea
                    className={styles.codeInput}
                    value={stateJson}
                    onChange={(event) => setStateJson(event.target.value)}
                    rows={7}
                    spellCheck={false}
                    aria-label="Structured JSON state context"
                  />
                </label>
              </details>

              <div className={styles.sourceFields}>
                <label>
                  <span>Evidence label <em>OPTIONAL</em></span>
                  <input value={sourceLabel} maxLength={180} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Official incident bulletin" />
                </label>
                <label>
                  <span>Evidence URL</span>
                  <input value={sourceUrl} maxLength={2_000} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" inputMode="url" />
                </label>
              </div>

              <label className={styles.approvalToggle} aria-label="Require human approval for this recommendation">
                <input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} />
                <span><strong>Require human approval</strong><small>Recommendations cannot become an approved action automatically.</small></span>
              </label>

              <button className={styles.runButton} type="submit" disabled={running || !query.trim()}>
                {running ? <LoaderCircle className={styles.spinning} size={15} /> : <Play size={14} />}
                {running ? "Executing and hashing…" : "Run audited brief"}
              </button>
            </form>

            {selected?.humanApproval.status === "pending" ? (
              <section className={styles.approvalBox}>
                <div><ShieldCheck size={16} /><span><strong>Human decision required</strong><small>The agent has not authorized action.</small></span></div>
                <div>
                  <button type="button" disabled={reviewing} onClick={() => void review("rejected")}><XCircle size={14} />Reject</button>
                  <button type="button" disabled={reviewing} onClick={() => void review("approved")}><CheckCircle2 size={14} />Approve</button>
                </div>
              </section>
            ) : null}

            <p className={styles.truthNote}>
              <Clock3 size={13} />
              Only requests executed through the AEGIS audit endpoint are shown. No example actions are presented as real.
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}
