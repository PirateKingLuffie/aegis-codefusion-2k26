import type { AegisMapSelection } from "@/components/map/types";

export type SelectionWorkflowStage = "idle" | "assessing" | "ready";

export interface SelectionWorkflowMetrics {
  peakExposedPopulation: number;
  affectedBuildings: number;
  closedRoads: number;
  restrictedRoads: number;
}

export interface SelectionWorkflowPlan {
  id: string;
  routeCount: number;
  coveragePct: number;
  clearanceMinutes: number;
  peopleRemainingExposed: number;
  warnings: string[];
  generatedBy: string;
}

export interface SelectionWorkflowAssessment {
  id: string;
  fingerprint: string;
  stage: SelectionWorkflowStage;
  title: string;
  locationLabel: string;
  hazardLabel: string;
  areaSquareKm: number | null;
  center: { latitude: number; longitude: number } | null;
  inputs: {
    boundary: "operator-drawn" | "model-domain" | "model-domain-fallback";
    hazardSource: "operator-placed" | "active-location-default";
    evacuationOrigin: "operator-placed" | "model-network-default";
    safeDestination: "operator-placed" | "screened-facility-default";
  };
  metrics: SelectionWorkflowMetrics;
  plan: SelectionWorkflowPlan;
  decisionSummary: string;
  provenance: Array<{
    classification: "OPERATOR INPUT" | "SIMULATED" | "ESTIMATED";
    label: string;
  }>;
  dispatch: {
    mode: "DRY-RUN";
    externalAttempted: false;
    notice: string;
  };
}

export interface BuildSelectionWorkflowInput {
  selection: AegisMapSelection;
  stage: SelectionWorkflowStage;
  locationLabel: string;
  hazardLabel: string;
  scenarioSeed: string | number;
  scenarioRevision: string;
  operatingAreaAccepted: boolean;
  metrics: SelectionWorkflowMetrics;
  plan: SelectionWorkflowPlan;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizedRing(selection: AegisMapSelection): Array<[number, number]> {
  const coordinates = selection.area?.geometry.coordinates[0] ?? [];
  if (coordinates.length < 3) return [];
  const ring = coordinates.map(([longitude, latitude]) => [longitude, latitude] as [number, number]);
  const first = ring[0];
  const last = ring.at(-1);
  if (last && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring;
}

function normalizeLongitude(longitude: number): number {
  let value = longitude;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function unwrappedRing(selection: AegisMapSelection): Array<[number, number]> {
  const ring = normalizedRing(selection);
  if (!ring.length) return ring;
  const reference = ring[0][0];
  return ring.map(([rawLongitude, latitude]) => {
    let longitude = rawLongitude;
    while (longitude - reference > 180) longitude -= 360;
    while (longitude - reference < -180) longitude += 360;
    return [longitude, latitude];
  });
}

export function selectionAreaDimensionsMeters(selection: AegisMapSelection): {
  northSouthM: number;
  eastWestM: number;
} | null {
  const ring = unwrappedRing(selection);
  if (ring.length < 3) return null;
  const latitudes = ring.map(([, latitude]) => latitude);
  const longitudes = ring.map(([longitude]) => longitude);
  const centerLatitude = latitudes.reduce((sum, latitude) => sum + latitude, 0) / latitudes.length;
  return {
    northSouthM: (Math.max(...latitudes) - Math.min(...latitudes)) * 111_320,
    eastWestM: (Math.max(...longitudes) - Math.min(...longitudes))
      * 111_320
      * Math.max(0.2, Math.cos(centerLatitude * Math.PI / 180)),
  };
}

export function selectionAreaSummary(selection: AegisMapSelection): {
  areaSquareKm: number | null;
  center: { latitude: number; longitude: number } | null;
} {
  const ring = unwrappedRing(selection);
  if (ring.length < 3) return { areaSquareKm: null, center: null };

  const meanLatitude = ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length;
  const longitudeScale = 111.32 * Math.max(0.05, Math.cos(meanLatitude * Math.PI / 180));
  const latitudeScale = 110.574;
  let twiceArea = 0;
  let longitudeMoment = 0;
  let latitudeMoment = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const first = ring[index];
    const second = ring[(index + 1) % ring.length];
    const firstX = first[0] * longitudeScale;
    const firstY = first[1] * latitudeScale;
    const secondX = second[0] * longitudeScale;
    const secondY = second[1] * latitudeScale;
    const cross = firstX * secondY - secondX * firstY;
    twiceArea += cross;
    longitudeMoment += (firstX + secondX) * cross;
    latitudeMoment += (firstY + secondY) * cross;
  }

  const areaSquareKm = Math.abs(twiceArea) / 2;
  if (Math.abs(twiceArea) < 1e-8) {
    return {
      areaSquareKm: 0,
      center: {
        latitude: round(meanLatitude, 6),
        longitude: round(normalizeLongitude(ring.reduce((sum, coordinate) => sum + coordinate[0], 0) / ring.length), 6),
      },
    };
  }

  return {
    areaSquareKm: round(areaSquareKm, areaSquareKm < 0.1 ? 3 : 2),
    center: {
      latitude: round(latitudeMoment / (3 * twiceArea) / latitudeScale, 6),
      longitude: round(normalizeLongitude(longitudeMoment / (3 * twiceArea) / longitudeScale), 6),
    },
  };
}

export function selectionPlanningAnchor(selection: AegisMapSelection): {
  latitude: number;
  longitude: number;
  label: string;
  source: "area" | "hazard-source" | "origin" | "destination" | "waypoint";
} | null {
  const area = selectionAreaSummary(selection);
  if (area.center) {
    return {
      ...area.center,
      label: selection.area?.properties.name ?? "Operator-selected area",
      source: "area",
    };
  }
  const roles = ["hazard-source", "origin", "destination", "waypoint"] as const;
  for (const role of roles) {
    const point = selection.points.find((candidate) => candidate.role === role);
    if (point) {
      return {
        latitude: point.coordinates[1],
        longitude: point.coordinates[0],
        label: point.label ?? `Operator-selected ${role}`,
        source: role,
      };
    }
  }
  return null;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function selectionFingerprint(selection: AegisMapSelection): string {
  const points = selection.points
    .map((point) => `${point.role}:${point.coordinates[0].toFixed(6)},${point.coordinates[1].toFixed(6)}`)
    .sort()
    .join("|");
  const boundary = normalizedRing(selection)
    .map(([longitude, latitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`)
    .join("|");
  return fnv1a(`${points}::${boundary}`);
}

export function selectionHasOperationalInput(selection: AegisMapSelection): boolean {
  return selection.points.length > 0 || normalizedRing(selection).length >= 3;
}

export function buildSelectionWorkflowAssessment({
  selection,
  stage,
  locationLabel,
  hazardLabel,
  scenarioSeed,
  scenarioRevision,
  operatingAreaAccepted,
  metrics,
  plan,
}: BuildSelectionWorkflowInput): SelectionWorkflowAssessment {
  const fingerprint = selectionFingerprint(selection);
  const polygon = selectionAreaSummary(selection);
  const hasRole = (role: AegisMapSelection["points"][number]["role"]) =>
    selection.points.some((point) => point.role === role);
  const boundaryDrawn = polygon.areaSquareKm !== null;
  const boundary = boundaryDrawn
    ? operatingAreaAccepted ? "operator-drawn" : "model-domain-fallback"
    : "model-domain";

  const accessPressure = metrics.closedRoads + metrics.restrictedRoads;
  const decisionSummary = accessPressure > 0
    ? `${accessPressure} access links require screening; stage movement on the recommended routes before the modelled clearance window closes.`
    : "No access closure is calculated at the selected time; retain staged movement and verify every route in the field.";

  return {
    id: `ASM-${fnv1a(`${scenarioSeed}:${scenarioRevision}:${hazardLabel}:${locationLabel}:${fingerprint}`).toUpperCase()}`,
    fingerprint,
    stage,
    title: `${hazardLabel} regional assessment`,
    locationLabel,
    hazardLabel,
    areaSquareKm: polygon.areaSquareKm,
    center: polygon.center,
    inputs: {
      boundary,
      hazardSource: hasRole("hazard-source") ? "operator-placed" : "active-location-default",
      evacuationOrigin: hasRole("origin") ? "operator-placed" : "model-network-default",
      safeDestination: hasRole("destination") ? "operator-placed" : "screened-facility-default",
    },
    metrics: { ...metrics },
    plan: {
      ...plan,
      routeCount: Math.max(0, Math.round(plan.routeCount)),
      coveragePct: round(Math.max(0, Math.min(100, plan.coveragePct)), 1),
      clearanceMinutes: round(Math.max(0, plan.clearanceMinutes), 1),
      peopleRemainingExposed: Math.max(0, Math.round(plan.peopleRemainingExposed)),
      warnings: [...plan.warnings],
    },
    decisionSummary,
    provenance: [
      {
        classification: "OPERATOR INPUT",
        label: boundaryDrawn
          ? operatingAreaAccepted
            ? "Drawn boundary and placed map points"
            : "Drawn boundary retained as context; local model uses its center because size limits rejected the envelope"
          : "Placed map points",
      },
      { classification: "SIMULATED", label: "Deterministic hazard, access and route calculation" },
      { classification: "ESTIMATED", label: "Exposure, occupancy and facility capacity" },
    ],
    dispatch: {
      mode: "DRY-RUN",
      externalAttempted: false,
      notice: "Planning output only. No public alert, government message or field dispatch was sent.",
    },
  };
}
