export const WORKSPACE_SCHEMA_VERSION = 1 as const;

export type WorkspaceLayoutId = "focused" | "map-only" | "response" | "analysis";
export type WorkspaceViewMode = "monitor" | "simulate" | "respond";
export type WorkspaceHazardId = "flood" | "earthquake" | "wildfire" | "cyclone" | "industrial";

export type WorkspaceLocation = {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  fidelity: string;
};

export type WorkspaceSelectionPoint = {
  id: string;
  coordinates: [number, number];
  role: "origin" | "destination" | "hazard-source" | "waypoint";
  label?: string;
};

/** Operator-drawn local simulation extent retained with a saved workspace. */
export type WorkspaceSelectionArea = {
  name?: string;
  coordinates: [number, number][];
};

export type WorkspaceAnnotation = {
  id: string;
  label: string;
  note: string;
  coordinates: [number, number];
  classification: "operator-annotation";
  createdAt: string;
};

export type WorkspaceBookmark = {
  id: string;
  label: string;
  location: WorkspaceLocation;
  createdAt: string;
};

export type ScenarioWorkspace = {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  seed: string;
  location: WorkspaceLocation;
  hazard: WorkspaceHazardId;
  scenarioStrength: number;
  selectedMinute: number;
  viewMode: WorkspaceViewMode;
  layout: WorkspaceLayoutId;
  layerVisibility: Record<string, boolean>;
  layerThreshold: number;
  selection: {
    points: WorkspaceSelectionPoint[];
    area?: WorkspaceSelectionArea;
  };
  annotations: WorkspaceAnnotation[];
  sourceIncident?: {
    id: string;
    title: string;
    provider: string;
    observedAt?: string;
  };
};

export type DecisionReceipt = {
  id: string;
  createdAt: string;
  scenarioId: string;
  simulationRunId: string;
  scenarioName: string;
  seed: string;
  minute: number;
  decision: "evacuation-plan-approved" | "evacuation-plan-modified" | "plan-rejected";
  planId: string | null;
  clearanceMinutes: number | null;
  coveragePct: number | null;
  routesCrossingClosures: number | null;
  remainingExposure: number;
  warnings: string[];
  operatorNote: string;
  classification: "simulation-decision-receipt";
};

export type WorkspaceAuditEvent = {
  id: string;
  at: string;
  action: string;
  detail: string;
  classification: "operator-action" | "simulated-result" | "imported-context";
};

export type ProductAlert = {
  id: string;
  kind: "damage" | "access" | "service-gap" | "capacity" | "evidence";
  severity: "critical" | "warning" | "information";
  title: string;
  detail: string;
  value: number;
  threshold: number;
  unit: string;
  classification: "simulated" | "estimated" | "imported";
};

export type AlertThresholds = {
  severeBuildings: number;
  closedRoads: number;
  unavailableFacilities: number;
  remainingExposure: number;
  mobilityAssistance: number;
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  severeBuildings: 2,
  closedRoads: 3,
  unavailableFacilities: 1,
  remainingExposure: 500,
  mobilityAssistance: 100,
};

export const WORKSPACE_LAYOUTS: Array<{
  id: WorkspaceLayoutId;
  label: string;
  detail: string;
}> = [
  { id: "focused", label: "Focused", detail: "Map, timeline and task-specific panels" },
  { id: "map-only", label: "Map only", detail: "Maximum geospatial canvas" },
  { id: "response", label: "Response", detail: "Evacuation, capacity and resources" },
  { id: "analysis", label: "Analysis", detail: "Impact, evidence and recovery" },
];

export const SCENARIO_PRESETS: Array<{
  id: string;
  name: string;
  location: WorkspaceLocation;
  hazard: WorkspaceHazardId;
  strength: number;
  minute: number;
  parameterOverrides?: Record<string, string | number | boolean>;
  /** Truth label shown with presets that intentionally reuse a proxy model. */
  modelDisclosure?: string;
}> = [
  {
    id: "eit-flood",
    name: "EIT campus flood exercise",
    location: { id: "eit", name: "Echelon Institute of Technology", region: "Kabulpur, Faridabad, India", latitude: 28.3912265, longitude: 77.4398682, fidelity: "EIT SITE MODEL" },
    hazard: "flood",
    strength: 74,
    minute: 0,
  },
  {
    id: "guwahati-flood",
    name: "Guwahati flood planning exercise",
    location: { id: "guwahati", name: "Guwahati", region: "Assam, India", latitude: 26.1445, longitude: 91.7362, fidelity: "GLOBAL PROTOTYPE" },
    hazard: "flood",
    strength: 82,
    minute: 0,
  },
  {
    id: "tokyo-earthquake",
    name: "Tokyo earthquake access exercise",
    location: { id: "tokyo", name: "Tokyo", region: "Japan", latitude: 35.6762, longitude: 139.6503, fidelity: "GLOBAL PROTOTYPE" },
    hazard: "earthquake",
    strength: 96,
    minute: 0,
  },
  {
    id: "miami-cyclone",
    name: "Miami cyclone and surge exercise",
    location: { id: "miami", name: "Miami", region: "Florida, USA", latitude: 25.7617, longitude: -80.1918, fidelity: "GLOBAL PROTOTYPE" },
    hazard: "cyclone",
    strength: 104,
    minute: 0,
  },
  {
    id: "cape-town-wildfire",
    name: "Cape Town foothills wildfire exercise",
    location: { id: "cape-town", name: "Cape Town", region: "Western Cape, South Africa", latitude: -33.9249, longitude: 18.4241, fidelity: "GLOBAL PROTOTYPE" },
    hazard: "wildfire",
    strength: 88,
    minute: 0,
    parameterOverrides: { windSpeedKph: 34, windDirectionDeg: 132, fuelDryness: 0.84, relativeHumidityPct: 24 },
  },
  {
    id: "rotterdam-chemical",
    name: "Rotterdam port chemical-plume exercise",
    location: { id: "rotterdam-port", name: "Port of Rotterdam", region: "South Holland, Netherlands", latitude: 51.9496, longitude: 4.1453, fidelity: "GLOBAL PROTOTYPE" },
    hazard: "industrial",
    strength: 78,
    minute: 0,
    parameterOverrides: { releaseKgPerMinute: 6.5, releaseDurationMinutes: 45, windSpeedKph: 19, windDirectionDeg: 82, atmosphericStability: "D" },
  },
  {
    id: "sendai-coastal-inundation-proxy",
    name: "Sendai tsunami / coastal inundation screening proxy",
    location: { id: "sendai-coast", name: "Sendai coastal area", region: "Miyagi, Japan", latitude: 38.2682, longitude: 140.8694, fidelity: "GLOBAL PROTOTYPE" },
    hazard: "cyclone",
    strength: 98,
    minute: 0,
    parameterOverrides: { peakWindKph: 118, rainfallMmPerHour: 72, coastalSurgeM: 3.4, trackDirectionDeg: 318, forwardSpeedKph: 24 },
    modelDisclosure: "Uses the deterministic cyclone/surge low-point engine as a coastal-inundation screening proxy; it is not a calibrated tsunami, wave-propagation or evacuation model.",
  },
];

const STORAGE_KEYS = {
  scenarios: "aegis-workspaces-v1",
  bookmarks: "aegis-bookmarks-v1",
  receipts: "aegis-decision-receipts-v1",
  audit: "aegis-audit-v1",
} as const;

function safeArray<T>(storage: Storage, key: string): T[] {
  try {
    const value = JSON.parse(storage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function persistArray<T>(storage: Storage, key: string, values: T[]): void {
  storage.setItem(key, JSON.stringify(values));
}

export function loadScenarioWorkspaces(storage: Storage): ScenarioWorkspace[] {
  return safeArray<ScenarioWorkspace>(storage, STORAGE_KEYS.scenarios)
    .filter((item) => item?.schemaVersion === WORKSPACE_SCHEMA_VERSION && typeof item.id === "string")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveScenarioWorkspace(storage: Storage, workspace: ScenarioWorkspace): ScenarioWorkspace[] {
  const current = loadScenarioWorkspaces(storage);
  const next = [workspace, ...current.filter((item) => item.id !== workspace.id)].slice(0, 40);
  persistArray(storage, STORAGE_KEYS.scenarios, next);
  return next;
}

export function removeScenarioWorkspace(storage: Storage, id: string): ScenarioWorkspace[] {
  const next = loadScenarioWorkspaces(storage).filter((item) => item.id !== id);
  persistArray(storage, STORAGE_KEYS.scenarios, next);
  return next;
}

export function loadBookmarks(storage: Storage): WorkspaceBookmark[] {
  return safeArray<WorkspaceBookmark>(storage, STORAGE_KEYS.bookmarks)
    .filter((item) => typeof item?.id === "string" && Number.isFinite(item.location?.latitude))
    .slice(0, 30);
}

export function saveBookmark(storage: Storage, bookmark: WorkspaceBookmark): WorkspaceBookmark[] {
  const current = loadBookmarks(storage);
  const next = [bookmark, ...current.filter((item) => item.id !== bookmark.id)].slice(0, 30);
  persistArray(storage, STORAGE_KEYS.bookmarks, next);
  return next;
}

export function removeBookmark(storage: Storage, id: string): WorkspaceBookmark[] {
  const next = loadBookmarks(storage).filter((item) => item.id !== id);
  persistArray(storage, STORAGE_KEYS.bookmarks, next);
  return next;
}

export function loadDecisionReceipts(storage: Storage): DecisionReceipt[] {
  return safeArray<DecisionReceipt>(storage, STORAGE_KEYS.receipts).slice(0, 100);
}

export function appendDecisionReceipt(storage: Storage, receipt: DecisionReceipt): DecisionReceipt[] {
  const next = [receipt, ...loadDecisionReceipts(storage)].slice(0, 100);
  persistArray(storage, STORAGE_KEYS.receipts, next);
  return next;
}

export function loadAuditHistory(storage: Storage): WorkspaceAuditEvent[] {
  return safeArray<WorkspaceAuditEvent>(storage, STORAGE_KEYS.audit).slice(0, 200);
}

export function appendAuditEvent(storage: Storage, event: WorkspaceAuditEvent): WorkspaceAuditEvent[] {
  const next = [event, ...loadAuditHistory(storage)].slice(0, 200);
  persistArray(storage, STORAGE_KEYS.audit, next);
  return next;
}

export function makeWorkspaceId(prefix: string, now = Date.now()): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.abs(Math.round(now)).toString(36);
  return `${prefix}-${suffix}`;
}

export function nextWorkspaceRevision(previous?: ScenarioWorkspace): number {
  return previous ? previous.revision + 1 : 1;
}

export function pathDistanceKm(points: Array<{ coordinates: [number, number] }>): number {
  if (points.length < 2) return 0;
  const radiusKm = 6_371.0088;
  const radians = (value: number) => value * Math.PI / 180;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [lon1, lat1] = points[index - 1].coordinates;
    const [lon2, lat2] = points[index].coordinates;
    const deltaLat = radians(lat2 - lat1);
    const deltaLon = radians(lon2 - lon1);
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
    total += radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total * 1_000) / 1_000;
}

export function polygonAreaSqKm(coordinates: [number, number][]): number {
  if (coordinates.length < 3) return 0;
  const closed = coordinates[0][0] === coordinates.at(-1)?.[0]
    && coordinates[0][1] === coordinates.at(-1)?.[1]
    ? coordinates
    : [...coordinates, coordinates[0]];
  const referenceLatitude = closed.reduce((sum, coordinate) => sum + coordinate[1], 0) / closed.length;
  const longitudeKm = 111.320 * Math.cos(referenceLatitude * Math.PI / 180);
  const latitudeKm = 110.574;
  let twiceArea = 0;
  for (let index = 0; index < closed.length - 1; index += 1) {
    const first = closed[index];
    const second = closed[index + 1];
    twiceArea += first[0] * longitudeKm * second[1] * latitudeKm
      - second[0] * longitudeKm * first[1] * latitudeKm;
  }
  return Math.round(Math.abs(twiceArea / 2) * 1_000) / 1_000;
}

type ImpactAlertInput = {
  summary: {
    severelyDamagedBuildings: number;
    closedRoads: number;
    unavailableCriticalFacilities: number;
  };
  humanImpact: {
    peopleRemainingInPlanningEnvelope: number;
    mobilityAssistanceEstimate: number;
  };
};

export function buildProductAlerts(
  snapshot: ImpactAlertInput,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
): ProductAlert[] {
  const candidates: ProductAlert[] = [
    { id: "severe-buildings", kind: "damage", severity: "critical", title: "Severe building impact", detail: "Structures reached severe deterministic damage-screening states.", value: snapshot.summary.severelyDamagedBuildings, threshold: thresholds.severeBuildings, unit: "structures", classification: "simulated" },
    { id: "closed-roads", kind: "access", severity: "warning", title: "Road access loss", detail: "Closed links exceeded the configured operational threshold.", value: snapshot.summary.closedRoads, threshold: thresholds.closedRoads, unit: "links", classification: "simulated" },
    { id: "facility-gap", kind: "service-gap", severity: "critical", title: "Critical service gap", detail: "One or more critical facilities are unavailable in the current snapshot.", value: snapshot.summary.unavailableCriticalFacilities, threshold: thresholds.unavailableFacilities, unit: "facilities", classification: "simulated" },
    { id: "remaining-exposure", kind: "capacity", severity: "warning", title: "Evacuation coverage gap", detail: "People remain inside the planning exposure envelope after current assignments.", value: snapshot.humanImpact.peopleRemainingInPlanningEnvelope, threshold: thresholds.remainingExposure, unit: "people", classification: "estimated" },
    { id: "assistance-demand", kind: "capacity", severity: "warning", title: "Mobility-assistance demand", detail: "Planning demand exceeds the configured assistance threshold.", value: snapshot.humanImpact.mobilityAssistanceEstimate, threshold: thresholds.mobilityAssistance, unit: "people", classification: "estimated" },
  ];
  return candidates.filter((alert) => alert.value >= alert.threshold);
}

export function detectIncidentChanges<T extends {
  id: string;
  state: string;
  severity: string;
  observedAt?: string;
  impactMetrics?: unknown[];
}>(previous: T[], current: T[]): Array<{ id: string; change: "new" | "updated" }> {
  const previousById = new Map(previous.map((incident) => [incident.id, incident]));
  return current.flatMap((incident): Array<{ id: string; change: "new" | "updated" }> => {
    const before = previousById.get(incident.id);
    if (!before) return [{ id: incident.id, change: "new" as const }];
    const changed = before.state !== incident.state
      || before.severity !== incident.severity
      || before.observedAt !== incident.observedAt
      || JSON.stringify(before.impactMetrics ?? []) !== JSON.stringify(incident.impactMetrics ?? []);
    return changed ? [{ id: incident.id, change: "updated" as const }] : [];
  });
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildVisibleDataCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "classification,name,value,unit\n";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}

export function buildWorkspaceJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildPrintableSummaryHtml(input: {
  title: string;
  location: string;
  scenario: string;
  seed: string;
  minute: number;
  metrics: Array<{ label: string; value: string; classification: string }>;
  recommendations: string[];
  generatedAt: string;
}): string {
  const metrics = input.metrics.map((metric) => `<tr><td>${escapeHtml(metric.label)}</td><td>${escapeHtml(metric.value)}</td><td>${escapeHtml(metric.classification)}</td></tr>`).join("");
  const recommendations = input.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title><style>body{font-family:Arial,sans-serif;margin:36px;color:#111}h1{font-size:26px}p{line-height:1.5}table{width:100%;border-collapse:collapse;margin:22px 0}th,td{padding:9px;border:1px solid #bbb;text-align:left}small{color:#555}.classification{text-transform:uppercase}</style></head><body><h1>${escapeHtml(input.title)}</h1><p><strong>Location:</strong> ${escapeHtml(input.location)}<br><strong>Scenario:</strong> ${escapeHtml(input.scenario)}<br><strong>Seed:</strong> ${escapeHtml(input.seed)}<br><strong>Time:</strong> T+${escapeHtml(input.minute)} min</p><table><thead><tr><th>Measure</th><th>Value</th><th>Classification</th></tr></thead><tbody>${metrics}</tbody></table><h2>Operator guidance</h2><ul>${recommendations}</ul><p><small>Generated ${escapeHtml(input.generatedAt)}. AEGIS exercise values are planning estimates, not observed casualties, official closures or engineering certification.</small></p></body></html>`;
}
