import type {
  Coordinates,
  IncidentCategory,
  IncidentSeverity,
} from "@/lib/live/types";
import {
  incidentFingerprint,
  normalizeIncident,
  normalizeNow,
  normalizePolicy,
  severityRank,
} from "./normalize";
import type {
  AutomationAlert,
  AutomationEvaluation,
  AutomationEvaluationInput,
  AutomationIncidentMatch,
  AutomationMode,
  AutomationReceipt,
  AutomationRegion,
  AutomationRegionEvaluation,
  MatchRejectionReason,
  NormalizedAutomationIncident,
} from "./types";

const EARTH_RADIUS_KM = 6371.0088;
const MAX_RETURNED_RECEIPTS = 512;
const SEVERITIES: IncidentSeverity[] = ["unknown", "low", "medium", "high", "critical"];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeIso(value: Date) {
  return value.toISOString();
}

function haversineKm(left: Coordinates, right: Coordinates) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clamp(a, 0, 1)));
}

function longitudeInBounds(longitude: number, west: number, east: number) {
  // west > east denotes a dateline-crossing rectangle.
  return west <= east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east;
}

function regionDistance(region: AutomationRegion, coordinates: Coordinates) {
  if (region.geometry.kind === "circle") {
    const distanceKm = haversineKm(region.geometry.center, coordinates);
    return distanceKm <= region.geometry.radiusKm ? distanceKm : undefined;
  }
  const { west, south, east, north } = region.geometry;
  return coordinates.latitude >= Math.min(south, north) &&
    coordinates.latitude <= Math.max(south, north) &&
    longitudeInBounds(coordinates.longitude, west, east)
    ? 0
    : undefined;
}

function matchReason(
  region: AutomationRegion,
  normalized: NormalizedAutomationIncident,
  policy: ReturnType<typeof normalizePolicy>,
  mode: AutomationMode,
): { reason: MatchRejectionReason; distanceKm?: number } {
  if (!normalized.coordinates) return { reason: "missing-location" };
  const distanceKm = regionDistance(region, normalized.coordinates);
  if (distanceKm === undefined) return { reason: "outside-region" };
  if (region.hazards.length && !region.hazards.includes(normalized.incident.category as IncidentCategory)) {
    return { reason: "category-filter", distanceKm };
  }
  if (normalized.severity === "unknown" || severityRank(normalized.severity) < severityRank(region.minimumSeverity)) {
    return { reason: "below-severity-threshold", distanceKm };
  }
  // A rehearsed fixture can be dated or marked closed because it describes a
  // completed exercise. In explicit demo mode it remains useful for proving
  // the alert pipeline; never relax these checks in live mode.
  const demoSimulation = mode === "demo" && normalized.isSimulated;
  if (normalized.incident.state === "closed" && !demoSimulation) return { reason: "closed-record", distanceKm };
  if (mode === "live" && normalized.isSimulated) return { reason: "simulated-live-mode", distanceKm };
  const maxAgeMinutes = Math.min(policy.maxAgeMinutes, Math.max(1, region.maxAgeMinutes));
  if (!demoSimulation && normalized.ageMinutes !== undefined && normalized.ageMinutes > maxAgeMinutes) {
    return { reason: "stale-observation", distanceKm };
  }
  if (!demoSimulation && normalized.retrievalAgeMinutes !== undefined && normalized.retrievalAgeMinutes > policy.maxRetrievalAgeMinutes) {
    return { reason: "stale-source-retrieval", distanceKm };
  }
  // A demo simulation is intentionally allowed only in demo mode. For live
  // observations, an official source is required by the default policy.
  if (policy.requireOfficialSource && !normalized.isOfficialSource && !normalized.isSimulated) {
    return { reason: "unverified-source", distanceKm };
  }
  return { reason: "eligible", distanceKm };
}

function dedupeKey(regionId: string, normalized: NormalizedAutomationIncident) {
  return `${regionId}|${normalized.sourceId}|${normalized.incident.id}`;
}

function asReceipt(value: AutomationReceipt): AutomationReceipt | undefined {
  if (!value || typeof value.dedupeKey !== "string" || typeof value.regionId !== "string" || typeof value.incidentId !== "string") return undefined;
  return {
    dedupeKey: value.dedupeKey.slice(0, 240),
    regionId: value.regionId.slice(0, 96),
    incidentId: value.incidentId.slice(0, 160),
    sourceId: String(value.sourceId ?? "unknown").slice(0, 96),
    fingerprint: String(value.fingerprint ?? "").slice(0, 64),
    severity: SEVERITIES.includes(value.severity) ? value.severity : "unknown",
    firstSeenAt: String(value.firstSeenAt ?? ""),
    lastSeenAt: String(value.lastSeenAt ?? ""),
    lastProposedAt: value.lastProposedAt,
    lastAlertId: value.lastAlertId,
  };
}

function alertKind(previous: AutomationReceipt | undefined, current: NormalizedAutomationIncident, nowMs: number, cooldownMs: number) {
  if (!previous?.lastProposedAt) return "new" as const;
  if (severityRank(current.severity) > severityRank(previous.severity)) return "escalation" as const;
  const previousFingerprint = previous.fingerprint;
  if (previousFingerprint !== current.fingerprint) return "update" as const;
  const lastProposed = Date.parse(previous.lastProposedAt);
  if (!Number.isFinite(lastProposed) || nowMs - lastProposed >= cooldownMs) return "reminder" as const;
  return undefined;
}

function createAlert(
  region: AutomationRegion,
  normalized: NormalizedAutomationIncident,
  mode: AutomationMode,
  now: Date,
  kind: NonNullable<ReturnType<typeof alertKind>>,
) {
  const key = dedupeKey(region.id, normalized);
  const alertId = `aegis-alert-${stableHash(`${key}|${normalized.fingerprint}|${kind}`)}`;
  const expires = new Date(now.getTime() + Math.max(60, Math.min(24 * 60, region.maxAgeMinutes)) * 60_000);
  return {
    id: alertId,
    dedupeKey: key,
    regionId: region.id,
    regionName: region.name,
    incidentId: normalized.incident.id,
    title: normalized.incident.title,
    category: normalized.incident.category,
    severity: normalized.severity as Exclude<IncidentSeverity, "unknown">,
    summary: normalized.incident.summary.slice(0, 600),
    sourceId: normalized.sourceId,
    sourceName: normalized.sourceName,
    sourceUrl: normalized.sourceUrl,
    observedAt: normalized.incident.observedAt ?? normalized.incident.updatedAt,
    createdAt: safeIso(now),
    expiresAt: expires.toISOString(),
    kind,
    mode,
    delivery: "not-sent" as const,
    humanReviewRequired: true as const,
    dataClass: normalized.isSimulated ? "SIMULATED_TEST_RECORD" as const : "OBSERVED_SOURCE_REPORT" as const,
    notice: "Proposal only. AEGIS did not send a notification or issue an evacuation order.",
  } satisfies AutomationAlert;
}

function evaluateRegion(
  region: AutomationRegion,
  normalizedIncidents: NormalizedAutomationIncident[],
  policy: ReturnType<typeof normalizePolicy>,
  mode: AutomationMode,
  now: Date,
  receiptMap: Map<string, AutomationReceipt>,
) {
  const matches: AutomationIncidentMatch[] = [];
  const proposedAlerts: AutomationAlert[] = [];
  let suppressedCount = 0;
  let stale = 0;
  let unverified = 0;
  let eligible = 0;

  for (const normalized of normalizedIncidents) {
    const result = matchReason(region, normalized, policy, mode);
    // Keep only records that have a geographic relationship with this watch;
    // missing-location records cannot be safely assigned to a region.
    if (result.reason === "outside-region" || result.reason === "missing-location") continue;
    const match: AutomationIncidentMatch = {
      incident: normalized.incident,
      distanceKm: result.distanceKm,
      eligible: result.reason === "eligible",
      reason: result.reason,
      ageMinutes: normalized.ageMinutes,
      sourceFreshnessMinutes: normalized.retrievalAgeMinutes,
      officialSource: normalized.isOfficialSource,
    };
    matches.push(match);
    if (result.reason === "stale-observation" || result.reason === "stale-source-retrieval") stale += 1;
    if (result.reason === "unverified-source") unverified += 1;
    if (result.reason !== "eligible") continue;
    eligible += 1;
    const key = dedupeKey(region.id, normalized);
    const previous = receiptMap.get(key);
    const kind = alertKind(previous, normalized, now.getTime(), region.cooldownMinutes * 60_000);
    if (kind) {
      const alert = createAlert(region, normalized, mode, now, kind);
      proposedAlerts.push(alert);
      receiptMap.set(key, {
        dedupeKey: key,
        regionId: region.id,
        incidentId: normalized.incident.id,
        sourceId: normalized.sourceId,
        fingerprint: normalized.fingerprint,
        severity: normalized.severity,
        firstSeenAt: previous?.firstSeenAt ?? safeIso(now),
        lastSeenAt: safeIso(now),
        lastProposedAt: safeIso(now),
        lastAlertId: alert.id,
      });
    } else {
      suppressedCount += 1;
      receiptMap.set(key, {
        dedupeKey: key,
        regionId: region.id,
        incidentId: normalized.incident.id,
        sourceId: normalized.sourceId,
        fingerprint: normalized.fingerprint,
        severity: normalized.severity,
        firstSeenAt: previous?.firstSeenAt ?? safeIso(now),
        lastSeenAt: safeIso(now),
        lastProposedAt: previous?.lastProposedAt,
        lastAlertId: previous?.lastAlertId,
      });
    }
  }

  const status = proposedAlerts.length
    ? "attention"
    : !matches.length
      ? "no-current-match"
      : eligible
        ? "watch"
        : stale + unverified === matches.length
          ? "degraded"
          : "watch";
  return {
    regionId: region.id,
    regionName: region.name,
    status,
    evaluatedAt: safeIso(now),
    matchedIncidents: matches,
    proposedAlerts,
    suppressedCount,
    counts: {
      candidates: matches.length,
      eligible,
      stale,
      unverified,
    },
  } satisfies AutomationRegionEvaluation;
}

export function evaluateAutomation(input: AutomationEvaluationInput): AutomationEvaluation {
  const now = normalizeNow(input.now);
  const policy = normalizePolicy(input.policy);
  const mode: AutomationMode = input.mode === "demo" ? "demo" : "live";
  const regions = input.regions.slice(0, policy.maxRegions);
  const incidents = input.incidents.slice(0, policy.maxIncidents);
  const normalized = incidents.map((incident) => normalizeIncident(incident, now));
  const receiptMap = new Map<string, AutomationReceipt>();
  for (const receipt of (input.previousReceipts ?? []).slice(0, MAX_RETURNED_RECEIPTS)) {
    const safe = asReceipt(receipt);
    if (safe) receiptMap.set(safe.dedupeKey, safe);
  }
  const evaluations = regions.map((region) => region.enabled
    ? evaluateRegion(region, normalized, policy, mode, now, receiptMap)
    : {
        regionId: region.id,
        regionName: region.name,
        status: "paused" as const,
        evaluatedAt: safeIso(now),
        matchedIncidents: [],
        proposedAlerts: [],
        suppressedCount: 0,
        counts: { candidates: 0, eligible: 0, stale: 0, unverified: 0 },
      } satisfies AutomationRegionEvaluation);
  const alerts = evaluations.flatMap((evaluation) => evaluation.proposedAlerts);
  const sourceMap = new Map<string, AutomationEvaluation["sources"][number]>();
  for (const incident of incidents) {
    const sourceId = incident.provenance.sourceId;
    const existing = sourceMap.get(sourceId);
    const retrievedAt = incident.provenance.retrievedAt;
    if (existing) {
      existing.recordCount += 1;
      if ((retrievedAt ?? "") > (existing.retrievedAt ?? "")) existing.retrievedAt = retrievedAt;
    } else {
      sourceMap.set(sourceId, {
        sourceId,
        sourceName: incident.provenance.sourceName,
        recordCount: 1,
        retrievedAt,
        status: incident.provenance.status,
      });
    }
  }
  const runId = `automation-${stableHash(`${mode}|${safeIso(now).slice(0, 16)}|${regions.map((region) => region.id).join(",")}|${incidents.map((incident) => incident.id).join(",")}`)}`;
  const receipts = [...receiptMap.values()].slice(-MAX_RETURNED_RECEIPTS);
  return {
    schemaVersion: "1.0",
    runId,
    evaluatedAt: safeIso(now),
    mode,
    policy,
    regions: evaluations,
    alerts,
    receipts,
    summary: {
      regionCount: regions.length,
      enabledRegionCount: regions.filter((region) => region.enabled).length,
      observedIncidentCount: incidents.filter((incident) => incident.reality !== "simulated").length,
      simulatedIncidentCount: incidents.filter((incident) => incident.reality === "simulated").length,
      eligibleIncidentCount: evaluations.reduce((sum, evaluation) => sum + evaluation.counts.eligible, 0),
      proposedAlertCount: alerts.length,
      suppressedAlertCount: evaluations.reduce((sum, evaluation) => sum + evaluation.suppressedCount, 0),
      unlocatedIncidentCount: normalized.filter((incident) => !incident.coordinates).length,
    },
    sources: input.sources ?? [...sourceMap.values()],
    safetyNotice: "AUTOMATION DRY RUN · Calculations and alert proposals only. No external notification, public warning, casualty statement or evacuation order is issued by AEGIS.",
  };
}

export { incidentFingerprint };
