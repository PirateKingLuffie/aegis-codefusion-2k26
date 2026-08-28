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
}

export function incidentMarkerPresentation(incident: AegisIncident): IncidentMarkerPresentation {
  const status = incident.status?.trim().toLowerCase();
  if (status === "simulated" || status === "simulation" || status === "scenario") {
    return {
      kind: "simulation",
      label: `SIMULATION · ${incident.title}`,
      glyph: "S",
      live: false,
    };
  }
  if (incident.live === true) {
    return {
      kind: "incident",
      label: `LIVE · ${incident.title}`,
      glyph: "!",
      live: true,
    };
  }
  return {
    kind: "context",
    label: `CONTEXT · ${incident.title}`,
    glyph: "C",
    live: false,
  };
}
