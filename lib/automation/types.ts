import type {
  IncidentCategory,
  IncidentSeverity,
  LiveIncident,
  Coordinates,
} from "@/lib/live/types";

/** A geographic watch area. Bounds may cross the antimeridian (west > east). */
export type AutomationRegionGeometry =
  | {
      kind: "circle";
      center: Coordinates;
      radiusKm: number;
    }
  | {
      kind: "bounds";
      west: number;
      south: number;
      east: number;
      north: number;
    };

export type AutomationRegionStatus =
  | "watch"
  | "attention"
  | "no-current-match"
  | "degraded"
  | "paused";

export interface AutomationRegion {
  id: string;
  name: string;
  enabled: boolean;
  geometry: AutomationRegionGeometry;
  /** Empty means all supported categories. */
  hazards: IncidentCategory[];
  minimumSeverity: Exclude<IncidentSeverity, "unknown">;
  maxAgeMinutes: number;
  cooldownMinutes: number;
}

export interface AutomationPolicy {
  /** Do not generate an operational alert from an unverified news-only record. */
  requireOfficialSource: boolean;
  /** Maximum age of the event observation/publication accepted for a match. */
  maxAgeMinutes: number;
  /** Maximum age of the source retrieval itself. */
  maxRetrievalAgeMinutes: number;
  /** Upper bound for server/browser work in one evaluation. */
  maxRegions: number;
  maxIncidents: number;
}

export type AutomationMode = "live" | "demo";
export type AutomationAlertKind = "new" | "escalation" | "update" | "reminder";

export interface NormalizedAutomationIncident {
  incident: LiveIncident;
  coordinates?: Coordinates;
  severity: Exclude<IncidentSeverity, "unknown"> | "unknown";
  ageMinutes?: number;
  retrievalAgeMinutes?: number;
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  isOfficialSource: boolean;
  isSimulated: boolean;
  freshnessBand: string;
  fingerprint: string;
}

export type MatchRejectionReason =
  | "eligible"
  | "outside-region"
  | "category-filter"
  | "below-severity-threshold"
  | "stale-observation"
  | "stale-source-retrieval"
  | "unverified-source"
  | "closed-record"
  | "simulated-live-mode"
  | "missing-location";

export interface AutomationIncidentMatch {
  incident: LiveIncident;
  distanceKm?: number;
  eligible: boolean;
  reason: MatchRejectionReason;
  ageMinutes?: number;
  sourceFreshnessMinutes?: number;
  officialSource: boolean;
}

export interface AutomationAlert {
  id: string;
  dedupeKey: string;
  regionId: string;
  regionName: string;
  incidentId: string;
  title: string;
  category: IncidentCategory;
  severity: Exclude<IncidentSeverity, "unknown">;
  summary: string;
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  observedAt?: string;
  createdAt: string;
  expiresAt: string;
  kind: AutomationAlertKind;
  mode: AutomationMode;
  delivery: "not-sent";
  humanReviewRequired: true;
  dataClass: "OBSERVED_SOURCE_REPORT" | "SIMULATED_TEST_RECORD";
  notice: string;
}

export interface AutomationReceipt {
  dedupeKey: string;
  regionId: string;
  incidentId: string;
  sourceId: string;
  fingerprint: string;
  severity: Exclude<IncidentSeverity, "unknown"> | "unknown";
  firstSeenAt: string;
  lastSeenAt: string;
  lastProposedAt?: string;
  lastAlertId?: string;
}

export interface AutomationRegionEvaluation {
  regionId: string;
  regionName: string;
  status: AutomationRegionStatus;
  evaluatedAt: string;
  matchedIncidents: AutomationIncidentMatch[];
  proposedAlerts: AutomationAlert[];
  suppressedCount: number;
  counts: {
    candidates: number;
    eligible: number;
    stale: number;
    unverified: number;
  };
}

export interface AutomationSummary {
  regionCount: number;
  enabledRegionCount: number;
  observedIncidentCount: number;
  simulatedIncidentCount: number;
  eligibleIncidentCount: number;
  proposedAlertCount: number;
  suppressedAlertCount: number;
  unlocatedIncidentCount: number;
}

export interface AutomationEvaluation {
  schemaVersion: "1.0";
  runId: string;
  evaluatedAt: string;
  mode: AutomationMode;
  policy: AutomationPolicy;
  regions: AutomationRegionEvaluation[];
  alerts: AutomationAlert[];
  receipts: AutomationReceipt[];
  summary: AutomationSummary;
  sources: Array<{
    sourceId: string;
    sourceName: string;
    recordCount: number;
    retrievedAt?: string;
    status?: string;
  }>;
  safetyNotice: string;
}

export interface AutomationEvaluationInput {
  regions: AutomationRegion[];
  incidents: LiveIncident[];
  previousReceipts?: AutomationReceipt[];
  policy?: Partial<AutomationPolicy>;
  now?: Date | string;
  mode?: AutomationMode;
  sources?: AutomationEvaluation["sources"];
}

export interface AutomationCapabilities {
  schemaVersion: "1.0";
  dryRun: true;
  notificationsEnabled: false;
  persistence: "browser-or-caller-managed";
  maxRegions: number;
  maxIncidents: number;
  supportedHazards: IncidentCategory[];
  supportedChannels: ["in-app"];
  notes: string[];
}
