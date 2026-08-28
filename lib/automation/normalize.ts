import type { IncidentSeverity, LiveIncident, Coordinates } from "@/lib/live/types";
import type { AutomationPolicy, NormalizedAutomationIncident } from "./types";

const OFFICIAL_SOURCE_IDS = new Set([
  "nasa-eonet",
  "usgs-earthquakes",
  "gdacs",
  "reliefweb",
  "aegis-verified-cache",
]);

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function parseTime(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function severityRank(value: IncidentSeverity) {
  return SEVERITY_RANK[value] ?? 0;
}

export function sourceIsOfficial(incident: LiveIncident) {
  if (OFFICIAL_SOURCE_IDS.has(incident.provenance.sourceId)) return true;
  const sourceName = `${incident.provenance.sourceName} ${incident.provenance.dataset}`.toLowerCase();
  return /usgs|nasa\b|gdacs|ocha|reliefweb|government|official/.test(sourceName);
}

function eventTimestamp(incident: LiveIncident) {
  return (
    parseTime(incident.updatedAt) ??
    parseTime(incident.observedAt) ??
    parseTime(incident.freshness.observedAt) ??
    parseTime(incident.provenance.publishedAt)
  );
}

function coordinateOf(incident: LiveIncident): Coordinates | undefined {
  const value = incident.location.coordinates;
  if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return undefined;
  if (value.latitude < -90 || value.latitude > 90 || value.longitude < -180 || value.longitude > 180) return undefined;
  return value;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function incidentFingerprint(incident: LiveIncident) {
  const timestamp = incident.updatedAt ?? incident.observedAt ?? incident.provenance.publishedAt ?? "";
  return stableHash(
    [incident.id, incident.category, incident.severity, timestamp, incident.summary.slice(0, 180)].join("|"),
  );
}

export function normalizeIncident(incident: LiveIncident, now: Date): NormalizedAutomationIncident {
  const retrievedAt = parseTime(incident.provenance.retrievedAt);
  const eventAt = eventTimestamp(incident);
  const ageMinutes = eventAt === undefined ? undefined : Math.max(0, (now.getTime() - eventAt) / 60_000);
  const retrievalAgeMinutes = retrievedAt === undefined
    ? undefined
    : Math.max(0, (now.getTime() - retrievedAt) / 60_000);
  const freshnessBand = incident.freshness?.band ?? "unknown";
  const sourceUrl = incident.links.find((link) => link.kind === "official" || link.kind === "source")?.url;
  return {
    incident,
    coordinates: coordinateOf(incident),
    severity: incident.severity,
    ageMinutes,
    retrievalAgeMinutes,
    sourceId: incident.provenance.sourceId,
    sourceName: incident.provenance.sourceName,
    sourceUrl,
    isOfficialSource: sourceIsOfficial(incident),
    isSimulated: incident.reality === "simulated" || incident.dataMode === "simulated-demo",
    freshnessBand,
    fingerprint: incidentFingerprint(incident),
  };
}

export function normalizePolicy(policy: Partial<AutomationPolicy> = {}): AutomationPolicy {
  const positive = (value: unknown, fallback: number, max: number) => {
    const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.max(1, Math.min(max, number));
  };
  return {
    requireOfficialSource: policy.requireOfficialSource !== false,
    maxAgeMinutes: positive(policy.maxAgeMinutes, 24 * 60, 7 * 24 * 60),
    maxRetrievalAgeMinutes: positive(policy.maxRetrievalAgeMinutes, 45, 24 * 60),
    maxRegions: positive(policy.maxRegions, 16, 32),
    maxIncidents: positive(policy.maxIncidents, 240, 500),
  };
}

export function normalizeNow(value: Date | string | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}
