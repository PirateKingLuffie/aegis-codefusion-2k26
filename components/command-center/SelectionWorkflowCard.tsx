import { Check, LoaderCircle, Route, ShieldAlert, X } from "lucide-react";

import type { SelectionWorkflowAssessment } from "./selection-workflow";
import styles from "./SelectionWorkflowCard.module.css";

interface SelectionWorkflowCardProps {
  assessment: SelectionWorkflowAssessment;
  onOpenResponse: () => void;
  onDismiss: () => void;
}

function humanize(value: string): string {
  return value.replaceAll("-", " ");
}

export function SelectionWorkflowCard({
  assessment,
  onOpenResponse,
  onDismiss,
}: SelectionWorkflowCardProps) {
  const ready = assessment.stage === "ready";
  return (
    <aside
      className={styles.card}
      data-selection-workflow={assessment.stage}
      aria-live="polite"
      aria-label="Automatic selection assessment"
    >
      <header>
        <span className={ready ? styles.readyIcon : styles.pendingIcon} aria-hidden="true">
          {ready ? <Check size={15} /> : <LoaderCircle size={15} />}
        </span>
        <span>
          <small>AUTOMATIC REGIONAL WORKFLOW</small>
          <strong>{ready ? "Response package ready" : "Recalculating selected region"}</strong>
        </span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss automatic assessment"><X size={14} /></button>
      </header>

      <div className={styles.identity}>
        <span>{assessment.id}</span>
        <b>SIMULATED</b>
        <em>DRY-RUN</em>
      </div>

      <div className={styles.summary}>
        <strong>{assessment.title}</strong>
        <small>{assessment.locationLabel}{assessment.areaSquareKm !== null ? ` · ${assessment.areaSquareKm.toLocaleString("en-IN")} km² drawn` : " · point-defined model domain"}</small>
      </div>

      {assessment.inputs.boundary === "model-domain-fallback" ? (
        <p className={styles.inputNotice}>The boundary is outside the 120 m–100 km model limits. Results use a local domain at its center, not the full drawn area.</p>
      ) : null}

      <div className={styles.inputGrid}>
        <span><small>Boundary</small><b>{humanize(assessment.inputs.boundary)}</b></span>
        <span><small>Hazard source</small><b>{humanize(assessment.inputs.hazardSource)}</b></span>
        <span><small>Evac origin</small><b>{humanize(assessment.inputs.evacuationOrigin)}</b></span>
        <span><small>Safe point</small><b>{humanize(assessment.inputs.safeDestination)}</b></span>
      </div>

      {ready ? (
        <>
          <div className={styles.metrics}>
            <span><small>Exposure</small><b>{assessment.metrics.peakExposedPopulation.toLocaleString("en-IN")}</b></span>
            <span><small>Structures</small><b>{assessment.metrics.affectedBuildings.toLocaleString("en-IN")}</b></span>
            <span><small>Routes</small><b>{assessment.plan.routeCount}</b></span>
            <span><small>Coverage</small><b>{assessment.plan.coveragePct}%</b></span>
          </div>
          <p>{assessment.decisionSummary}</p>
          <button className={styles.openButton} type="button" onClick={onOpenResponse}>
            <Route size={14} /> Open evacuation response
          </button>
        </>
      ) : (
        <div className={styles.progress}><i /><span>Hazard · exposure · access · routes · resources</span></div>
      )}

      <footer>
        <ShieldAlert size={13} />
        <span>{assessment.dispatch.notice} Routes use the available model network and require field confirmation.</span>
      </footer>
    </aside>
  );
}
