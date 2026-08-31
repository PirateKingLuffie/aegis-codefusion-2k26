import type { AegisIncident } from "./types";

/**
 * Keeps observed incidents, simulations and historical/context records visually
 * distinct in both the DOM marker reliability layer and its accessible labels.
 * `live` is intentionally only honoured when the record is not explicitly a
 * simulation; a stale provider record must never look like an active alarm.
 */
export type IncidentMarkerKind = "incident" | "simulation" | "context";

export interface IncidentMarkerPresentation {
  kind: IncidentMarkerKind;
  label: string;
  glyph: "!" | "S" | "C";
  live: boolean;
  sourceLabel: string;
}

export function incidentSourceLabel(source?: string): string {
  const value = source?.trim() ?? "";
  if (!value) return "SOURCE UNAVAILABLE";
  if (/\busgs\b|u\.?s\.? geological survey|united states geological survey/i.test(value)) return "USGS";
  if (/global disaster alert|\bgdacs\b/i.test(value)) return "GDACS";
  if (/earth observatory|\beonet\b/i.test(value)) return "NASA EONET";
  if (/reliefweb/i.test(value)) return "RELIEFWEB";
  if (/google news/i.test(value)) return "GOOGLE NEWS";
  if (/aegis/i.test(value)) return "AEGIS";
  return value.replace(/\s+/g, " ").slice(0, 28).toUpperCase();
}

export function incidentMarkerPresentation(incident: AegisIncident): IncidentMarkerPresentation {
  const status = incident.status?.trim().toLowerCase();
  const sourceLabel = incidentSourceLabel(incident.source);
  const simulated = incident.reality === "simulated"
    || incident.dataMode === "simulated-demo"
    || status === "simulated"
    || status === "simulation"
    || status === "scenario";
  if (simulated) {
    return {
      kind: "simulation",
      label: `SIMULATION · ${sourceLabel} · ${incident.title}`,
      glyph: "S",
      live: false,
      sourceLabel,
    };
  }
  const explicitlyStale = (incident.sourceStatus !== undefined && incident.sourceStatus !== "live")
    || incident.dataMode === "cached-source-snapshot"
    || incident.freshnessBand === "recent"
    || incident.freshnessBand === "aging"
    || incident.freshnessBand === "archived"
    || incident.freshnessBand === "unknown";
  if (incident.live === true && !explicitlyStale) {
    return {
      kind: "incident",
      label: `CURRENT OBSERVED · ${sourceLabel} · ${incident.title}`,
      glyph: "!",
      live: true,
      sourceLabel,
    };
  }
  return {
    kind: "context",
    label: `SOURCE CONTEXT · ${sourceLabel} · ${incident.title}`,
    glyph: "C",
    live: false,
    sourceLabel,
  };
}
