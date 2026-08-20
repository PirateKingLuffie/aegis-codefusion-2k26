"use client";

import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileClock,
  FileText,
  History,
  MapPin,
  Printer,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ImpactSnapshotBundle } from "@/lib/domain/types";
import {
  SCENARIO_PRESETS,
  WORKSPACE_LAYOUTS,
  type DecisionReceipt,
  type ProductAlert,
  type ScenarioWorkspace,
  type WorkspaceAnnotation,
  type WorkspaceAuditEvent,
  type WorkspaceBookmark,
  type WorkspaceLayoutId,
} from "@/lib/workspace";
import styles from "./command-center.module.css";

export type CommandAction = {
  id: string;
  label: string;
  detail: string;
  shortcut?: string;
  group: "Navigate" | "Scenario" | "Workspace" | "Export";
  onRun: () => void;
};

function DialogFrame({
  title,
  subtitle,
  onClose,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.productBackdrop}>
      <button type="button" className={styles.modalDismiss} onClick={onClose} aria-label={`Close ${title}`} />
      <section className={`${styles.productDialog} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.productDialogHeader}>
          <div><span>{subtitle}</span><strong>{title}</strong></div>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}><X size={17} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function CommandPalette({ actions, onClose }: { actions: CommandAction[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? actions.filter((action) => `${action.label} ${action.detail} ${action.group}`.toLowerCase().includes(needle))
      : actions;
  }, [actions, query]);

  return (
    <DialogFrame title="Command palette" subtitle="Navigate and operate" onClose={onClose} className={styles.commandPaletteDialog}>
      <label className={styles.commandSearch}>
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands" />
        <kbd>Esc</kbd>
      </label>
      <div className={styles.commandResults}>
        {visible.map((action) => (
          <button key={action.id} type="button" onClick={() => { action.onRun(); onClose(); }}>
            <span><b>{action.label}</b><small>{action.group} · {action.detail}</small></span>
            {action.shortcut ? <kbd>{action.shortcut}</kbd> : <ChevronRight size={15} />}
          </button>
        ))}
        {!visible.length ? <p>No command matches “{query}”.</p> : null}
      </div>
    </DialogFrame>
  );
}

export function WorkspaceManagerPanel({
  scenarioName,
  onScenarioNameChange,
  seed,
  revision,
  saved,
  bookmarks,
  annotations,
  currentLayout,
  onSave,
  onLoad,
  onDelete,
  onApplyPreset,
  onLayout,
  onBookmark,
  onOpenBookmark,
  onRemoveBookmark,
  onAddAnnotation,
  onRemoveAnnotation,
  onExportJson,
  onExportCsv,
  onPrint,
  campusDatasetLabel,
  campusImportStatus,
  onImportCampusDataset,
  onClearCampusDataset,
  onClose,
}: {
  scenarioName: string;
  onScenarioNameChange: (name: string) => void;
  seed: string;
  revision: number;
  saved: ScenarioWorkspace[];
  bookmarks: WorkspaceBookmark[];
  annotations: WorkspaceAnnotation[];
  currentLayout: WorkspaceLayoutId;
  onSave: () => void;
  onLoad: (workspace: ScenarioWorkspace) => void;
  onDelete: (workspace: ScenarioWorkspace) => void;
  onApplyPreset: (preset: (typeof SCENARIO_PRESETS)[number]) => void;
  onLayout: (layout: WorkspaceLayoutId) => void;
  onBookmark: () => void;
  onOpenBookmark: (bookmark: WorkspaceBookmark) => void;
  onRemoveBookmark: (bookmark: WorkspaceBookmark) => void;
  onAddAnnotation: (label: string, note: string) => void;
  onRemoveAnnotation: (annotation: WorkspaceAnnotation) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onPrint: () => void;
  campusDatasetLabel: string;
  campusImportStatus: string;
  onImportCampusDataset: (file: File) => void;
  onClearCampusDataset: () => void;
  onClose: () => void;
}) {
  const [annotationLabel, setAnnotationLabel] = useState("");
  const [annotationNote, setAnnotationNote] = useState("");

  return (
    <DialogFrame title="Workspace" subtitle="Local scenario control" onClose={onClose} className={styles.workspaceDialog}>
      <div className={styles.productScroll}>
        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Current scenario</span><small>Version {revision} · Seed {seed}</small></div>
          <div className={styles.workspaceSaveRow}>
            <input value={scenarioName} onChange={(event) => onScenarioNameChange(event.target.value)} aria-label="Scenario name" />
            <button type="button" onClick={onSave} disabled={!scenarioName.trim()}><Save size={14} /> Save version</button>
          </div>
        </section>

        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Campus data</span><small>{campusDatasetLabel}</small></div>
          <div className={styles.campusImportRow}>
            <label>
              <Upload size={14} /> Import verified JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onImportCampusDataset(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <a href="/api/campus/eit/template" download>Download template</a>
            <button type="button" onClick={onClearCampusDataset}>Use OSM prototype</button>
          </div>
          <p className={styles.campusImportStatus}>{campusImportStatus}</p>
        </section>

        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Scenario presets</span><small>Deterministic starting points</small></div>
          <div className={styles.presetGrid}>
            {SCENARIO_PRESETS.map((preset) => (
              <button type="button" key={preset.id} onClick={() => onApplyPreset(preset)}>
                <MapPin size={14} /><span><b>{preset.name}</b><small>{preset.hazard} · strength {preset.strength}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Workspace layout</span><small>One-click panel arrangements</small></div>
          <div className={styles.layoutGrid}>
            {WORKSPACE_LAYOUTS.map((layout) => (
              <button className={currentLayout === layout.id ? styles.productSelected : ""} type="button" key={layout.id} onClick={() => onLayout(layout.id)}>
                <span><b>{layout.label}</b><small>{layout.detail}</small></span>{currentLayout === layout.id ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Saved scenarios</span><small>{saved.length} stored locally</small></div>
          <div className={styles.savedList}>
            {saved.map((workspace) => (
              <div key={workspace.id}>
                <button type="button" onClick={() => onLoad(workspace)}><FileClock size={15} /><span><b>{workspace.name}</b><small>v{workspace.revision} · {workspace.location.name} · {workspace.hazard}</small></span></button>
                <button type="button" onClick={() => onDelete(workspace)} aria-label={`Delete ${workspace.name}`}><Trash2 size={14} /></button>
              </div>
            ))}
            {!saved.length ? <p>No saved scenario versions yet.</p> : null}
          </div>
        </section>

        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Location bookmarks</span><button type="button" onClick={onBookmark}><Bookmark size={13} /> Bookmark current</button></div>
          <div className={styles.savedList}>
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id}>
                <button type="button" onClick={() => onOpenBookmark(bookmark)}><MapPin size={15} /><span><b>{bookmark.label}</b><small>{bookmark.location.region}</small></span></button>
                <button type="button" onClick={() => onRemoveBookmark(bookmark)} aria-label={`Remove ${bookmark.label}`}><Trash2 size={14} /></button>
              </div>
            ))}
            {!bookmarks.length ? <p>No bookmarked locations.</p> : null}
          </div>
        </section>

        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Map annotation</span><small>Anchored to the latest selected point</small></div>
          <div className={styles.annotationForm}>
            <input value={annotationLabel} onChange={(event) => setAnnotationLabel(event.target.value)} placeholder="Annotation label" />
            <textarea value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} placeholder="Operator note" rows={2} />
            <button type="button" disabled={!annotationLabel.trim()} onClick={() => { onAddAnnotation(annotationLabel.trim(), annotationNote.trim()); setAnnotationLabel(""); setAnnotationNote(""); }}>Add annotation</button>
          </div>
          <div className={styles.annotationList}>
            {annotations.map((annotation) => (
              <div key={annotation.id}><MapPin size={13} /><span><b>{annotation.label}</b><small>{annotation.note || "No note"}</small></span><button type="button" onClick={() => onRemoveAnnotation(annotation)} aria-label={`Remove ${annotation.label}`}><X size={13} /></button></div>
            ))}
          </div>
        </section>
      </div>
      <footer className={styles.productFooter}>
        <button type="button" onClick={onExportJson}><Download size={14} /> Snapshot JSON</button>
        <button type="button" onClick={onExportCsv}><FileText size={14} /> Visible CSV</button>
        <button type="button" onClick={onPrint}><Printer size={14} /> Print summary</button>
      </footer>
    </DialogFrame>
  );
}

export function RecoveryPanel({ snapshot, onClose }: { snapshot: ImpactSnapshotBundle; onClose: () => void }) {
  const reentry = snapshot.buildings
    .toSorted((a, b) => b.recovery.score - a.recovery.score)
    .slice(0, 8);
  return (
    <DialogFrame title="Recovery and re-entry" subtitle={`Simulated snapshot · T+${snapshot.selectedMinute} min`} onClose={onClose} className={styles.recoveryDialog}>
      <div className={styles.productScroll}>
        <div className={styles.recoveryMetrics}>
          <div><span>Affected buildings</span><strong>{snapshot.summary.affectedBuildings}</strong></div>
          <div><span>Utilities disrupted</span><strong>{snapshot.summary.disruptedUtilities}</strong></div>
          <div><span>Facilities unavailable</span><strong>{snapshot.summary.unavailableCriticalFacilities}</strong></div>
          <div><span>People remaining</span><strong>{snapshot.humanImpact.peopleRemainingInPlanningEnvelope.toLocaleString("en-IN")}</strong></div>
        </div>
        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Recovery priorities</span><small>Inspection screening, not a repair commitment</small></div>
          <div className={styles.recoveryList}>
            {snapshot.summary.topRecoveryPriorities.map((priority, index) => (
              <article key={priority.entityId}><em>{String(index + 1).padStart(2, "0")}</em><span><b>{priority.name}</b><small>{priority.entityKind} · {priority.band}</small></span><strong>{Math.round(priority.score * 100)}%</strong></article>
            ))}
          </div>
        </section>
        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Building re-entry screen</span><small>Human inspection remains mandatory</small></div>
          <div className={styles.reentryList}>
            {reentry.map((building) => {
              const blocked = building.recovery.inspectionRequired || building.operationalStatus === "unavailable";
              return <article key={building.entityId} className={blocked ? styles.reentryBlocked : styles.reentryConditional}>
                <ShieldAlert size={16} />
                <span><b>{building.name}</b><small>{building.damageState} damage screen · {building.functionalityPct}% functionality</small></span>
                <em>{blocked ? "Hold" : "Conditional"}</em>
              </article>;
            })}
          </div>
        </section>
        <p className={styles.productNotice}>{snapshot.disclaimer}</p>
      </div>
    </DialogFrame>
  );
}

export function AlertPanel({ alerts, onClose }: { alerts: ProductAlert[]; onClose: () => void }) {
  return (
    <DialogFrame title="Operational alerts" subtitle="Configured thresholds and service gaps" onClose={onClose} className={styles.alertDialog}>
      <div className={styles.productScroll}>
        <div className={styles.thresholdAlertList}>
          {alerts.map((alert) => (
            <article key={alert.id} data-severity={alert.severity}>
              <AlertTriangle size={17} />
              <span><b>{alert.title}</b><small>{alert.detail}</small><em>{alert.classification}</em></span>
              <strong>{alert.value.toLocaleString("en-IN")} <small>{alert.unit}</small></strong>
            </article>
          ))}
          {!alerts.length ? <div className={styles.productEmpty}><Check size={18} /><span>No configured threshold is exceeded at this time.</span></div> : null}
        </div>
      </div>
    </DialogFrame>
  );
}

export function AuditPanel({ receipts, audit, onClose }: { receipts: DecisionReceipt[]; audit: WorkspaceAuditEvent[]; onClose: () => void }) {
  return (
    <DialogFrame title="Decision history" subtitle="Local audit trail and receipts" onClose={onClose} className={styles.auditDialog}>
      <div className={styles.productScroll}>
        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Decision receipts</span><small>{receipts.length} retained locally</small></div>
          <div className={styles.receiptList}>
            {receipts.map((receipt) => (
              <article key={receipt.id}><FileText size={16} /><span><b>{receipt.decision.replace(/-/g, " ")}</b><small>{receipt.scenarioName} · T+{receipt.minute} min · {receipt.coveragePct ?? "—"}% coverage</small></span><time>{new Date(receipt.createdAt).toLocaleString("en-IN")}</time></article>
            ))}
            {!receipts.length ? <p>No approved or modified plan receipts yet.</p> : null}
          </div>
        </section>
        <section className={styles.productSection}>
          <div className={styles.productSectionTitle}><span>Operator audit</span><small>Newest first</small></div>
          <div className={styles.auditList}>
            {audit.map((event) => (
              <article key={event.id}><History size={15} /><span><b>{event.action}</b><small>{event.detail}</small></span><time><Clock3 size={11} />{new Date(event.at).toLocaleTimeString("en-IN")}</time></article>
            ))}
            {!audit.length ? <p>No workspace actions recorded in this browser session.</p> : null}
          </div>
        </section>
      </div>
    </DialogFrame>
  );
}
