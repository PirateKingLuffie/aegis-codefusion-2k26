import type {
  BridgeAsset,
  BuildingAsset,
  Confidence,
  Coordinate,
  DamageState,
  EvacuationPlan,
  FacilityAsset,
  HazardCellSample,
  HazardExposureSnapshot,
  ImpactAssetSnapshot,
  ImpactEvidence,
  ImpactSnapshotBundle,
  ImpactSnapshotInput,
  ImpactTimelinePoint,
  OperationalStatus,
  PopulationZone,
  RecoveryPriority,
  ResponseCoverageSnapshot,
  RecoveryPlan,
  RoadAsset,
  RoadStatus,
  ScenarioDefinition,
  SecondaryConsequenceSnapshot,
  Severity,
  SimulationResult,
  SpatialCellSeries,
  TravelMode,
  UncertaintyCellSnapshot,
  UncertaintyEnvelopeSummary,
} from "../domain/types";
import {
  hazardRiskRatio,
  modePassabilityBooleans,
} from "./hazard-screening";

const EARTH_RADIUS_M = 6_371_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function midpoint(points: Coordinate[]): Coordinate {
  if (points.length === 0) return { lat: 0, lon: 0 };
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
  };
}

function nearestSeries(result: SimulationResult, coordinate: Coordinate): SpatialCellSeries {
  if (result.field.length === 0) throw new Error("Impact analysis requires a non-empty hazard field.");
  let nearest = result.field[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const series of result.field) {
    const distance = distanceMeters(series.cell.center, coordinate);
    if (distance < nearestDistance) {
      nearest = series;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function sampleAt(series: SpatialCellSeries, minute: number): HazardCellSample {
  if (series.samples.length === 0) throw new Error("Impact analysis requires sampled hazard series.");
  return series.samples.reduce((nearest, sample) =>
    Math.abs(sample.minute - minute) < Math.abs(nearest.minute - minute) ? sample : nearest,
  series.samples[0]);
}

function selectedFrame(result: SimulationResult, requestedMinute: number) {
  if (result.timeline.length === 0) throw new Error("Impact analysis requires a non-empty timeline.");
  return result.timeline.reduce((nearest, frame) =>
    Math.abs(frame.minute - requestedMinute) < Math.abs(nearest.minute - requestedMinute)
      ? frame
      : nearest,
  result.timeline[0]);
}

function riskFor(sample: HazardCellSample): number {
  return hazardRiskRatio(sample);
}

function exposureFor(
  sample: HazardCellSample,
  series: SpatialCellSeries,
): HazardExposureSnapshot {
  const common = {
    hazard: sample.hazard,
    riskIndex: round(riskFor(sample), 3),
    arrivalMinute: series.arrivalMinute,
    peakMinute: series.peakMinute,
    recessionMinute: series.recessionMinute,
  };
  if (sample.hazard === "flood") {
    return {
      ...common,
      metric: "water depth",
      unit: "m",
      value: sample.depthM,
      floodDepthM: sample.depthM,
      floodVelocityMps: sample.velocityMps,
      floodPhase: sample.phase,
    };
  }
  if (sample.hazard === "earthquake") {
    return { ...common, metric: "modified Mercalli intensity", unit: "MMI", value: sample.mmi };
  }
  if (sample.hazard === "wildfire") {
    return { ...common, metric: "fireline intensity", unit: "kW/m", value: sample.firelineIntensityKwM };
  }
  if (sample.hazard === "cyclone") {
    return sample.surgeDepthM > 0.05
      ? { ...common, metric: "storm-surge depth", unit: "m", value: sample.surgeDepthM }
      : { ...common, metric: "wind speed", unit: "km/h", value: sample.windKph };
  }
  return { ...common, metric: "toxicity-threshold ratio", unit: "ratio", value: sample.exposureRatio };
}

function severityFor(index: number): Severity {
  if (index >= 0.82) return "extreme";
  if (index >= 0.62) return "major";
  if (index >= 0.38) return "moderate";
  if (index >= 0.14) return "minor";
  return "minimal";
}

function damageStateFor(index: number, physicalDamage: boolean): DamageState {
  if (index < 0.08) return "none";
  if (!physicalDamage) return "exposed";
  if (index >= 0.82) return "critical";
  if (index >= 0.62) return "severe";
  if (index >= 0.38) return "moderate";
  if (index >= 0.14) return "minor";
  return "exposed";
}

function buildingImpactForSample(
  sample: HazardCellSample,
  building: BuildingAsset,
): { impactIndex: number; internalDepthM?: number } {
  if (sample.hazard === "flood") {
    const internalDepthM = Math.max(0, sample.depthM - building.groundFloorElevationM);
    return {
      impactIndex: clamp(
        internalDepthM / 1.2 * (0.55 + building.vulnerability * 0.65),
        0,
        1,
      ),
      internalDepthM,
    };
  }
  return {
    impactIndex: clamp(riskFor(sample) * (0.55 + building.vulnerability * 0.72), 0, 1),
  };
}

function cumulativeBuildingDamageIndex(
  series: SpatialCellSeries,
  minute: number,
  building: BuildingAsset,
): number | null {
  // A chemical plume changes occupancy/access but does not physically damage a
  // building in this model. Other hazard damage is cumulative: receding water,
  // a passed fire front or the end of shaking must not visually repair assets.
  if (series.samples[0]?.hazard === "chemical") return null;
  return series.samples
    .filter((candidate) => candidate.minute <= minute)
    .reduce(
      (maximum, candidate) => Math.max(maximum, buildingImpactForSample(candidate, building).impactIndex),
      0,
    );
}

function operationalStatus(index: number): OperationalStatus {
  if (index >= 0.78) return "unavailable";
  if (index >= 0.34) return "degraded";
  return "operational";
}

function confidenceFrom(
  source: Confidence,
  penalty: number,
  basis: string[],
  limitations: string[],
): Confidence {
  const score = round(clamp(source.score - penalty, 0, 1), 2);
  return {
    score,
    band: score >= 0.78 ? "high" : score >= 0.55 ? "medium" : "low",
    basis: [...source.basis, ...basis],
    limitations: [...source.limitations, ...limitations],
  };
}

function assetGeometryClassification(
  scenario: ScenarioDefinition,
): ImpactEvidence["geometryClassification"] {
  const label = scenario.metadata.estimateLabel.toLowerCase();
  const assetImportClaim = label.includes("imported local-data") || label.includes("imported assets");
  if (!assetImportClaim) return "estimated";
  const relevant = scenario.provenance.filter((source) =>
    (source.kind === "observed" || source.kind === "open-data") &&
    !/center coordinate only|does not validate/i.test(source.note ?? ""));
  return relevant.some((source) => source.kind === "observed") ? "observed" : "imported";
}

function evidenceFor(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  basis: string[],
  limitations: string[],
  forceEstimatedGeometry = false,
): ImpactEvidence {
  return {
    classification: "simulated",
    geometryClassification: forceEstimatedGeometry
      ? "estimated"
      : assetGeometryClassification(scenario),
    statusClassification: "simulated",
    provenanceIds: result.provenance.map((source) => source.id),
    basis,
    limitations,
  };
}

function earliestClearMinute(
  series: SpatialCellSeries,
  selectedMinute: number,
  threshold = 0.2,
): number | null {
  return series.samples.find((sample) =>
    sample.minute >= selectedMinute && riskFor(sample) < threshold)?.minute ?? null;
}

function recoveryPriority(
  impactIndex: number,
  criticality: number,
  people: number,
  series: SpatialCellSeries,
  selectedMinute: number,
  inspectionRequired: boolean,
  rationale: string[],
): RecoveryPriority {
  const populationWeight = clamp(Math.log10(Math.max(1, people)) / 4, 0, 1);
  const score = round(clamp(impactIndex * 0.58 + criticality * 0.27 + populationWeight * 0.15, 0, 1), 3);
  return {
    score,
    band: score >= 0.78 ? "critical" : score >= 0.56 ? "urgent" : score >= 0.3 ? "important" : "routine",
    inspectionRequired,
    earliestHazardClearMinute: earliestClearMinute(series, selectedMinute),
    rationale,
  };
}

function roadStatus(index: number): RoadStatus {
  if (index >= 0.75) return "closed";
  if (index >= 0.42) return "restricted";
  if (index >= 0.16) return "advisory";
  return "open";
}

function currentModePassability(
  sample: HazardCellSample,
  impactIndex: number,
  floodDepthM?: number,
): Record<TravelMode, boolean> {
  void impactIndex;
  if (sample.hazard === "flood" && floodDepthM !== undefined) {
    return modePassabilityBooleans({ ...sample, depthM: floodDepthM });
  }
  return modePassabilityBooleans(sample);
}

function worstRoadStatus(values: RoadStatus[]): RoadStatus {
  const rank: Record<RoadStatus, number> = { open: 0, advisory: 1, restricted: 2, closed: 3 };
  return values.reduce((worst, value) => rank[value] > rank[worst] ? value : worst, "open");
}

function roadSnapshot(
  road: RoadAsset,
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  timestampIso: string,
): ImpactAssetSnapshot {
  const coordinate = midpoint(road.geometry);
  const series = nearestSeries(result, coordinate);
  const sample = sampleAt(series, minute);
  let index = riskFor(sample);
  let depthM: number | undefined;
  if (sample.hazard === "flood") {
    depthM = Math.max(0, sample.depthM - road.elevationOffsetM - road.drainageQuality * 0.055);
    index = clamp(depthM / 0.65, 0, 1);
  } else {
    index = clamp(index * (1.08 - road.importance * 0.12), 0, 1);
  }
  const status: RoadStatus = sample.hazard === "flood"
    ? (depthM ?? 0) > 0.45
      ? "closed"
      : (depthM ?? 0) > 0.25
        ? "restricted"
        : (depthM ?? 0) > 0.1
          ? "advisory"
          : "open"
    : index > 0.8
      ? "closed"
      : index > 0.62
        ? "restricted"
        : index > 0.38
          ? "advisory"
          : "open";
  const sourceConfidence = series.confidence;
  return {
    id: `impact-road-${road.id}-${minute}`,
    entityId: road.id,
    entityKind: "road",
    name: road.name,
    coordinate,
    minute,
    timestampIso,
    severity: severityFor(index),
    damageState: damageStateFor(index, false),
    damageIndex: null,
    impactIndex: round(index, 3),
    functionalityPct: round(clamp(100 - index * 100, 0, 100), 1),
    operationalStatus: status === "closed" ? "unavailable" : status === "restricted" ? "degraded" : "operational",
    accessStatus: status,
    modePassability: currentModePassability(sample, index, depthM),
    isolated: status === "closed",
    peopleWithinExposureEnvelope: null,
    mobilityAssistanceEstimate: null,
    dependentPopulationEstimate: null,
    capacity: null,
    projectedOccupancy: null,
    hazard: { ...exposureFor(sample, series), ...(depthM === undefined ? {} : { value: round(depthM, 3), floodDepthM: round(depthM, 3) }) },
    recovery: recoveryPriority(index, road.importance, 0, series, minute, status !== "open", [
      `${status} route-screening status at T+${minute} min.`,
      "Restore high-importance access before lower-priority circulation links.",
    ]),
    confidence: confidenceFrom(sourceConfidence, 0.07, ["road elevation and drainage screen"], ["No field closure, culvert or pavement-condition feed is connected."]),
    evidence: evidenceFor(scenario, result, ["hazard sample", "road attributes"], ["Road status is simulated, not an authority-issued closure."]),
    explanation: [
      depthM === undefined
        ? `Current ${sample.hazard} route-impact index is ${round(index, 2)}.`
        : `Current modelled carriageway depth is ${round(depthM, 2)} m.`,
      `The road is ${status} for deterministic planning at T+${minute} min; verify in the field.`,
    ],
  };
}

function buildingSnapshot(
  building: BuildingAsset,
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  timestampIso: string,
): ImpactAssetSnapshot {
  const series = nearestSeries(result, building.coordinate);
  const sample = sampleAt(series, minute);
  const current = buildingImpactForSample(sample, building);
  const cumulativeDamageIndex = cumulativeBuildingDamageIndex(series, minute, building);
  const physicalDamage = cumulativeDamageIndex !== null;
  const index = physicalDamage
    ? Math.max(current.impactIndex, cumulativeDamageIndex)
    : current.impactIndex;
  const people = Math.round(building.occupantsDay * clamp(current.impactIndex * 1.2, 0, 1));
  const status = operationalStatus(index);
  return {
    id: `impact-building-${building.id}-${minute}`,
    entityId: building.id,
    entityKind: "building",
    name: building.name,
    coordinate: building.coordinate,
    minute,
    timestampIso,
    severity: severityFor(index),
    damageState: damageStateFor(physicalDamage ? cumulativeDamageIndex : current.impactIndex, physicalDamage),
    damageIndex: physicalDamage ? round(cumulativeDamageIndex, 3) : null,
    impactIndex: round(index, 3),
    functionalityPct: round(clamp(100 - index * 100, 0, 100), 1),
    operationalStatus: status,
    accessStatus: null,
    modePassability: null,
    isolated: false,
    peopleWithinExposureEnvelope: people,
    mobilityAssistanceEstimate: null,
    dependentPopulationEstimate: null,
    capacity: building.occupantsDay,
    projectedOccupancy: null,
    internalFloodDepthM: current.internalDepthM === undefined ? undefined : round(current.internalDepthM, 3),
    hazard: exposureFor(sample, series),
    recovery: recoveryPriority(index, building.use === "public" || building.use === "academic" ? 0.72 : 0.5, people, series, minute, physicalDamage && cumulativeDamageIndex >= 0.14, [
      `${severityFor(index)} simulated building-impact band.`,
      physicalDamage && cumulativeDamageIndex >= 0.14 ? "Inspection is required before re-entry." : "Continue monitoring as the hazard evolves.",
    ]),
    confidence: confidenceFrom(series.confidence, 0.1, ["building vulnerability", "assumed floor elevation"], ["No surveyed floor elevation, BIM fragility or engineering inspection."]),
    evidence: evidenceFor(scenario, result, ["hazard sample", "scenario building vulnerability"], ["Damage is a simulated screening band, not an observed structural condition."]),
    explanation: [
      current.internalDepthM === undefined
        ? `Current vulnerability-adjusted exposure is ${round(current.impactIndex, 2)}${physicalDamage ? `; cumulative simulated damage is ${round(cumulativeDamageIndex, 2)}` : "; no physical building damage is modelled for this hazard"}.`
        : `Potential internal water depth is ${round(current.internalDepthM, 2)} m; cumulative simulated water-damage index is ${round(cumulativeDamageIndex ?? 0, 2)}.`,
      `${people} occupants fall inside a planning exposure envelope; this is not an injury or casualty estimate.`,
    ],
  };
}

function bridgeSnapshot(
  bridge: BridgeAsset,
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  timestampIso: string,
): ImpactAssetSnapshot {
  const series = nearestSeries(result, bridge.coordinate);
  const sample = sampleAt(series, minute);
  const raw = sample.hazard === "flood"
    ? clamp(sample.depthM / Math.max(0.2, bridge.deckClearanceM), 0, 1)
    : riskFor(sample);
  const index = clamp(raw * (1.18 - bridge.condition * 0.22), 0, 1);
  const status = operationalStatus(index);
  const accessStatus = roadStatus(index);
  return {
    id: `impact-bridge-${bridge.id}-${minute}`,
    entityId: bridge.id,
    entityKind: "bridge",
    name: bridge.name,
    coordinate: bridge.coordinate,
    minute,
    timestampIso,
    severity: severityFor(index),
    damageState: damageStateFor(index, true),
    damageIndex: round(index, 3),
    impactIndex: round(index, 3),
    functionalityPct: round(clamp(100 - index * 100, 0, 100), 1),
    operationalStatus: status,
    accessStatus,
    modePassability: null,
    isolated: accessStatus === "closed",
    peopleWithinExposureEnvelope: null,
    mobilityAssistanceEstimate: null,
    dependentPopulationEstimate: null,
    capacity: null,
    projectedOccupancy: null,
    hazard: exposureFor(sample, series),
    recovery: recoveryPriority(index, 0.9, 0, series, minute, index >= 0.14, ["Crossing continuity affects multiple response routes.", "Structural clearance remains a human engineering decision."]),
    confidence: confidenceFrom(series.confidence, 0.14, ["condition and deck-clearance screening"], ["No structural inspection or hydraulic opening survey."]),
    evidence: evidenceFor(scenario, result, ["hazard sample", "bridge screening attributes"], ["Simulated closure/damage screening only."]),
    explanation: [`Current bridge screening index is ${round(index, 2)}.`, "Do not interpret the index as a certified structural damage percentage."],
  };
}

function populationSnapshot(
  zone: PopulationZone,
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  timestampIso: string,
  closedRoadIds: Set<string>,
): ImpactAssetSnapshot {
  const series = nearestSeries(result, zone.center);
  const sample = sampleAt(series, minute);
  const index = clamp(riskFor(sample) * (0.72 + zone.vulnerability * 0.34), 0, 1);
  const people = Math.round(zone.population * index);
  const assistance = Math.round(people * zone.mobilityLimitedFraction);
  const originEdges = scenario.assets.network.edges.filter((edge) => edge.from === zone.originNodeId || edge.to === zone.originNodeId);
  const isolated = originEdges.length > 0 && originEdges.every((edge) => closedRoadIds.has(edge.roadId));
  return {
    id: `impact-population-${zone.id}-${minute}`,
    entityId: zone.id,
    entityKind: "population-zone",
    name: zone.name,
    coordinate: zone.center,
    minute,
    timestampIso,
    severity: severityFor(index),
    damageState: damageStateFor(index, false),
    damageIndex: null,
    impactIndex: round(index, 3),
    functionalityPct: round(clamp(100 - index * 100, 0, 100), 1),
    operationalStatus: isolated ? "unavailable" : index >= 0.34 ? "degraded" : "operational",
    accessStatus: isolated ? "closed" : null,
    modePassability: null,
    isolated,
    peopleWithinExposureEnvelope: people,
    mobilityAssistanceEstimate: assistance,
    dependentPopulationEstimate: null,
    capacity: zone.population,
    projectedOccupancy: null,
    hazard: exposureFor(sample, series),
    recovery: recoveryPriority(index, zone.vulnerability, people, series, minute, false, ["Prioritise high exposure, isolation and mobility-assistance demand."]),
    confidence: confidenceFrom(series.confidence, 0.08, ["aggregate population and vulnerability"], ["Population is a scenario aggregate, not live device-level presence."]),
    evidence: evidenceFor(scenario, result, ["hazard sample", "scenario population zone"], ["Human impact is an exposure envelope; casualties are not modelled."]),
    explanation: [`${people} of ${zone.population} scenario occupants fall inside the current exposure envelope.`, `${assistance} may require mobility assistance; field confirmation is required.`],
  };
}

function facilitySnapshot(
  facility: FacilityAsset,
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  timestampIso: string,
  roadsById: Map<string, ImpactAssetSnapshot>,
  peopleExposed: number,
): ImpactAssetSnapshot {
  const series = nearestSeries(result, facility.coordinate);
  const sample = sampleAt(series, minute);
  const directIndex = riskFor(sample);
  const roadStatuses = facility.networkNodeId
    ? scenario.assets.network.edges
        .filter((edge) => edge.from === facility.networkNodeId || edge.to === facility.networkNodeId)
        .map((edge) => roadsById.get(edge.roadId)?.accessStatus ?? "advisory")
    : ["advisory" as const];
  const accessStatus = worstRoadStatus(roadStatuses);
  const accessPenalty = accessStatus === "closed" ? 0.32 : accessStatus === "restricted" ? 0.16 : 0;
  const index = clamp(directIndex * 0.76 + accessPenalty, 0, 1);
  const demandFraction = facility.type === "hospital" ? 0.015 : facility.type === "shelter" ? 0.18 : 0;
  const projectedOccupancy = facility.baselineOccupancy + Math.round(peopleExposed * demandFraction);
  const critical = facility.type !== "shelter" ? facility.criticality : 0.72;
  const status = index >= 0.78 || (facility.type === "hospital" && accessStatus === "closed")
    ? "unavailable"
    : index >= 0.34 || accessStatus === "restricted" || accessStatus === "closed"
      ? "degraded"
      : "operational";
  return {
    id: `impact-facility-${facility.id}-${minute}`,
    entityId: facility.id,
    entityKind: "critical-facility",
    name: facility.name,
    coordinate: facility.coordinate,
    minute,
    timestampIso,
    severity: severityFor(index),
    damageState: damageStateFor(index, true),
    damageIndex: round(directIndex, 3),
    impactIndex: round(index, 3),
    functionalityPct: round(clamp(100 - index * 100, 0, 100), 1),
    operationalStatus: status,
    accessStatus,
    modePassability: null,
    isolated: accessStatus === "closed",
    peopleWithinExposureEnvelope: null,
    mobilityAssistanceEstimate: null,
    dependentPopulationEstimate: null,
    capacity: facility.capacity,
    projectedOccupancy,
    hazard: exposureFor(sample, series),
    recovery: recoveryPriority(index, critical, projectedOccupancy, series, minute, index >= 0.14, ["Service criticality, direct exposure, access and demand determine priority."]),
    confidence: confidenceFrom(series.confidence, 0.13, ["facility exposure", "adjacent road access", "scenario demand ratio"], ["No live staffing, supplies, occupancy or inspection feed."]),
    evidence: evidenceFor(scenario, result, ["hazard sample", "facility attributes", "simulated road access"], ["Status and demand are deterministic planning estimates."]),
    explanation: [`Direct exposure ${round(directIndex, 2)} with ${accessStatus} access produces ${status} service status.`, `Projected planning occupancy is ${projectedOccupancy}/${facility.capacity}; this is not a live count.`],
  };
}

function utilitySnapshot(
  facility: FacilityAsset & { type: "power" | "water" | "telecom" },
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  timestampIso: string,
  totalPopulation: number,
): ImpactAssetSnapshot {
  const series = nearestSeries(result, facility.coordinate);
  const sample = sampleAt(series, minute);
  let index = riskFor(sample);
  if (sample.hazard === "flood") {
    const threshold = facility.type === "power" ? 0.22 : facility.type === "water" ? 0.38 : 0.3;
    index = clamp(sample.depthM / Math.max(0.1, threshold * 2.1), 0, 1);
  }
  const status = operationalStatus(index);
  const dependents = Math.min(totalPopulation, facility.capacity);
  return {
    id: `impact-utility-${facility.id}-${minute}`,
    entityId: facility.id,
    entityKind: "utility",
    name: facility.name,
    coordinate: facility.coordinate,
    minute,
    timestampIso,
    severity: severityFor(index),
    damageState: damageStateFor(index, false),
    damageIndex: null,
    impactIndex: round(index, 3),
    functionalityPct: round(clamp(100 - index * 100, 0, 100), 1),
    operationalStatus: status,
    accessStatus: null,
    modePassability: null,
    isolated: false,
    peopleWithinExposureEnvelope: null,
    mobilityAssistanceEstimate: null,
    dependentPopulationEstimate: dependents,
    capacity: facility.capacity,
    projectedOccupancy: null,
    hazard: exposureFor(sample, series),
    recovery: recoveryPriority(index, facility.criticality, dependents, series, minute, status !== "operational", ["Dependent population and service criticality elevate restoration priority."]),
    confidence: confidenceFrom(series.confidence, 0.16, ["utility-site threshold screen"], ["No live SCADA, component inventory or utility-operator restoration estimate."]),
    evidence: evidenceFor(scenario, result, ["hazard sample", "utility criticality"], ["Disruption is simulated; hazard clearance is not a repair-completion estimate."]),
    explanation: [`Current ${facility.type} service-impact index is ${round(index, 2)}.`, `${dependents} scenario occupants are within the dependency envelope; this is not confirmed outage reach.`],
  };
}

function responseCoverage(
  plan: EvacuationPlan | undefined,
  minute: number,
  populationZones: ImpactAssetSnapshot[],
): ResponseCoverageSnapshot {
  const peopleInHighRiskZones = populationZones
    .filter((zone) => zone.impactIndex >= 0.38)
    .reduce((sum, zone) => sum + (zone.peopleWithinExposureEnvelope ?? 0), 0);
  const isolatedZones = populationZones.filter((zone) => zone.isolated).length;
  if (!plan) {
    return {
      planId: null,
      planClassification: "not-generated",
      peopleInHighRiskZones,
      peopleCoveredByPlan: 0,
      peopleRemainingExposed: peopleInHighRiskZones,
      coveragePct: null,
      estimatedClearanceMinutes: null,
      isolatedZones,
      routesCrossingClosures: 0,
      activeResourceAssignments: 0,
      availableShelterPlaces: null,
      warnings: ["No evacuation plan is attached to this snapshot."],
    };
  }
  const startedStages = plan.stages.filter((stage) => stage.departureWindow.startMinute <= minute);
  const peopleCoveredByPlan = Math.min(
    peopleInHighRiskZones,
    startedStages.reduce((sum, stage) => sum + stage.populationAssigned, 0),
  );
  const activeResourceAssignments = plan.resourceAssignments.filter((assignment) =>
    assignment.dispatchMinute <= minute && assignment.estimatedArrivalMinute >= minute).length;
  const coveragePct = peopleInHighRiskZones === 0
    ? 100
    : round(peopleCoveredByPlan / peopleInHighRiskZones * 100, 1);
  return {
    planId: plan.id,
    planClassification: "deterministic-planning-estimate",
    peopleInHighRiskZones,
    peopleCoveredByPlan,
    peopleRemainingExposed: Math.max(0, peopleInHighRiskZones - peopleCoveredByPlan),
    coveragePct,
    estimatedClearanceMinutes: plan.after.estimatedClearanceMinutes,
    isolatedZones,
    routesCrossingClosures: plan.after.routesCrossingClosures,
    activeResourceAssignments,
    availableShelterPlaces: plan.shelterAllocations.reduce((sum, shelter) => sum + shelter.remainingCapacity, 0),
    warnings: [...plan.warnings],
  };
}

function consequenceConfidence(
  series: SpatialCellSeries,
  basis: string,
  limitation: string,
): Confidence {
  return confidenceFrom(series.confidence, 0.08, [basis], [limitation]);
}

function secondaryConsequencesAtMinute(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
): SecondaryConsequenceSnapshot[] {
  const consequences: SecondaryConsequenceSnapshot[] = [];
  const push = (
    series: SpatialCellSeries,
    kind: SecondaryConsequenceSnapshot["kind"],
    index: number,
    metric: string,
    value: number,
    unit: string,
    explanation: string,
  ) => {
    const bounded = clamp(index, 0, 1);
    if (bounded < 0.08) return;
    consequences.push({
      id: `consequence-${kind}-${series.cell.id}-${minute}`,
      cellId: series.cell.id,
      coordinate: series.cell.center,
      minute,
      kind,
      severity: severityFor(bounded),
      index: round(bounded, 3),
      metric,
      value: round(value, 3),
      unit,
      confidence: consequenceConfidence(
        series,
        `${kind} screening relationship`,
        "No field sample or calibrated local consequence curve is connected.",
      ),
      classification: "simulated",
      explanation: [explanation, "This layer is a screening estimate, not an observed condition."],
    });
  };

  for (const series of result.field) {
    const sample = sampleAt(series, minute);
    const cell = series.cell;
    if (sample.hazard === "flood") {
      const blockage = scenario.parameters.kind === "flood"
        ? scenario.parameters.drainageBlockageFraction
        : 0;
      const debris = clamp(sample.depthM / 1.1 * 0.38 + sample.velocityMps / 1.2 * 0.62, 0, 1);
      const contaminationLandFactor = cell.landUse === "industrial"
        ? 1
        : cell.landUse === "commercial" || cell.landUse === "residential"
          ? 0.72
          : 0.42;
      const contamination = clamp(sample.depthM / 1.1 * contaminationLandFactor, 0, 1);
      const sewage = clamp(sample.depthM / 0.8 * (cell.imperviousFraction * 0.58 + blockage * 0.42), 0, 1);
      const erosion = clamp(sample.velocityMps / 1.15 * (0.58 + cell.slope * 1.8) * (1.08 - cell.roughness * 0.25), 0, 1);
      push(series, "debris", debris, "debris transport index", debris, "index", `Depth ${sample.depthM} m and velocity ${sample.velocityMps} m/s drive the debris screen.`);
      push(series, "contamination", contamination, "contamination potential", contamination, "index", `${cell.landUse} land use and modelled inundation drive the contamination screen.`);
      push(series, "sewage-overflow", sewage, "sewer surcharge potential", sewage, "index", "Imperviousness, drainage blockage and water depth drive the sewer-overflow screen.");
      push(series, "erosion", erosion, "erosion/scour potential", erosion, "index", "Velocity, slope and surface roughness drive the erosion screen.");
    } else if (sample.hazard === "earthquake") {
      push(series, "debris", sample.debrisRisk, "debris obstruction risk", sample.debrisRisk, "index", `MMI ${sample.mmi} and built-surface exposure drive the debris screen.`);
      push(series, "utility-failure", Math.max(sample.bridgeDemandIndex * 0.72, sample.liquefactionProbability), "lifeline disruption risk", Math.max(sample.bridgeDemandIndex * 0.72, sample.liquefactionProbability), "index", "Ground motion, displacement and liquefaction proxy drive the lifeline screen.");
    } else if (sample.hazard === "wildfire") {
      const visibilityLoss = clamp(1 - sample.visibilityM / 10_000, 0, 1);
      const postFireErosion = clamp((sample.burning ? 0.72 : sample.emberSpottingRisk * 0.35) * (0.45 + cell.slope * 2.2), 0, 1);
      push(series, "smoke-visibility", visibilityLoss, "visibility", sample.visibilityM, "m", `Smoke index ${sample.smokeIndex} reduces modelled visibility.`);
      push(series, "debris", sample.emberSpottingRisk, "ember spotting risk", sample.emberSpottingRisk, "index", "Wind, fuel dryness and fire activity drive ember transport.");
      push(series, "erosion", postFireErosion, "post-fire erosion susceptibility", postFireErosion, "index", "Burn state and terrain slope screen post-fire erosion susceptibility.");
    } else if (sample.hazard === "cyclone") {
      const sewage = clamp(sample.surfaceFloodDepthM / 0.75 * (0.5 + cell.imperviousFraction * 0.5), 0, 1);
      push(series, "debris", sample.debrisRisk, "windborne debris risk", sample.debrisRisk, "index", `Gust ${sample.gustKph} km/h drives the windborne-debris screen.`);
      push(series, "surface-water", clamp(sample.surfaceFloodDepthM / 1.2, 0, 1), "combined surface-water depth", sample.surfaceFloodDepthM, "m", "Rainfall excess and surge proxy combine into surface-water depth.");
      push(series, "utility-failure", sample.powerFailureRisk, "power failure risk", sample.powerFailureRisk, "index", "Gust, debris and surface water drive the power-service screen.");
      push(series, "sewage-overflow", sewage, "sewer surcharge potential", sewage, "index", "Surface water and imperviousness drive the sewer-overflow screen.");
    } else {
      push(series, "contamination", clamp(sample.exposureRatio / 3, 0, 1), "outdoor toxicity-threshold ratio", sample.exposureRatio, "ratio", "Modelled outdoor concentration is compared with the scenario toxicity threshold.");
      push(series, "surface-water", sample.depositionIndex, "deposition/contact persistence index", sample.depositionIndex, "index", "Atmospheric stability and plume concentration drive the deposition screen.");
    }
  }
  return consequences;
}

function uncertaintyAtMinute(
  result: SimulationResult,
  minute: number,
): { cells: UncertaintyCellSnapshot[]; summary: UncertaintyEnvelopeSummary } {
  const cells = result.field.map((series): UncertaintyCellSnapshot => {
    const centralRisk = riskFor(sampleAt(series, minute));
    const width = clamp(0.06 + (1 - series.confidence.score) * 0.58, 0.06, 0.68);
    return {
      cellId: series.cell.id,
      coordinate: series.cell.center,
      minute,
      centralRisk: round(centralRisk, 3),
      lowerRisk: round(clamp(centralRisk - width / 2, 0, 1), 3),
      upperRisk: round(clamp(centralRisk + width / 2, 0, 1), 3),
      uncertaintyWidth: round(width, 3),
      confidenceScore: series.confidence.score,
      confidenceBand: series.confidence.band,
      dominantLimitations: series.confidence.limitations.slice(0, 3),
      classification: "estimated-uncertainty-envelope",
    };
  });
  const meanConfidence = cells.length === 0 ? 0 : cells.reduce((sum, cell) => sum + cell.confidenceScore, 0) / cells.length;
  const meanWidth = cells.length === 0 ? 0 : cells.reduce((sum, cell) => sum + cell.uncertaintyWidth, 0) / cells.length;
  const highest = [...cells]
    .sort((a, b) => b.uncertaintyWidth - a.uncertaintyWidth || a.cellId.localeCompare(b.cellId))
    .slice(0, 12)
    .map((cell) => cell.cellId);
  return {
    cells,
    summary: {
      meanConfidence: round(meanConfidence, 3),
      meanUncertaintyWidth: round(meanWidth, 3),
      lowConfidenceCellCount: cells.filter((cell) => cell.confidenceBand === "low").length,
      highestUncertaintyCellIds: highest,
      notice: "Bounds are deterministic sensitivity envelopes derived from input/model confidence. They are not statistical forecast probabilities.",
    },
  };
}

function recoveryActionFor(asset: ImpactAssetSnapshot) {
  const hazardClear = asset.recovery.earliestHazardClearMinute;
  const blocked = asset.operationalStatus === "unavailable" || hazardClear === null;
  const reentryStatus = blocked
    ? "blocked" as const
    : asset.recovery.inspectionRequired
      ? "inspection-required" as const
      : asset.operationalStatus === "degraded"
        ? "conditional" as const
        : "screened-eligible" as const;
  const action = asset.entityKind === "building"
    ? "Inspect structure, utilities and access; dewater and disinfect before re-entry."
    : asset.entityKind === "road"
      ? "Verify passability, clear debris and inspect pavement, culverts and shoulders."
      : asset.entityKind === "bridge"
        ? "Complete qualified bridge inspection before reopening."
        : asset.entityKind === "utility"
          ? "Isolate, inspect and restore the service through the responsible utility operator."
          : asset.entityKind === "critical-facility"
            ? "Verify access, structure, backup power, staffing and operating capacity."
            : "Confirm access and welfare needs before declaring the zone clear.";
  const dependencies = asset.entityKind === "building"
    ? ["safe access", "structural inspection", "utility isolation"]
    : asset.entityKind === "critical-facility"
      ? ["safe access", "utility availability", "staffing confirmation"]
      : asset.entityKind === "utility"
        ? ["operator clearance", "safe access"]
        : ["field verification"];
  const blockers = [
    ...(hazardClear === null ? ["hazard does not fall below the screening threshold within the model horizon"] : []),
    ...(asset.operationalStatus === "unavailable" ? ["asset remains screened unavailable"] : []),
    ...(asset.recovery.inspectionRequired ? ["qualified inspection pending"] : []),
  ];
  return {
    id: `recovery-${asset.entityId}-${asset.minute}`,
    entityId: asset.entityId,
    entityKind: asset.entityKind,
    name: asset.name,
    priorityScore: asset.recovery.score,
    priorityBand: asset.recovery.band,
    reentryStatus,
    earliestScreenedMinute: hazardClear,
    action,
    dependencies,
    blockers,
    authorityRequired: asset.entityKind === "bridge" || asset.entityKind === "utility" || asset.entityKind === "critical-facility" || asset.recovery.inspectionRequired,
    classification: "simulated-planning-estimate" as const,
  };
}

function recoveryPlan(assets: ImpactAssetSnapshot[], minute: number): RecoveryPlan {
  const actions = assets
    .filter((asset) => asset.impactIndex >= 0.08 || asset.operationalStatus !== "operational")
    .map(recoveryActionFor)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));
  return {
    generatedAtMinute: minute,
    actions,
    blockedReentries: actions.filter((action) => action.reentryStatus === "blocked").length,
    inspectionQueue: actions.filter((action) => action.reentryStatus === "inspection-required").length,
    screenedEligible: actions.filter((action) => action.reentryStatus === "screened-eligible").length,
    notice: "Re-entry and repair items are model-ranked work queues. Qualified authorities and asset owners issue actual clearance and restoration decisions.",
  };
}

/**
 * Creates a bounded, inspectable consequence snapshot for one existing
 * deterministic result. It reuses the simulation field and never invents
 * observed casualty, damage-cost, live-closure or repair-completion values.
 */
export function buildImpactSnapshot({
  scenario,
  result,
  selectedMinute: requestedMinute,
  evacuationPlan,
}: ImpactSnapshotInput): ImpactSnapshotBundle {
  if (!Number.isFinite(requestedMinute)) {
    throw new Error("Impact snapshot minute must be finite.");
  }
  if (scenario.metadata.id !== result.scenarioId) {
    throw new Error("Impact analysis scenario and simulation result do not match.");
  }
  if (evacuationPlan && evacuationPlan.simulationRunId !== result.runId) {
    throw new Error("Impact analysis evacuation plan belongs to a different simulation run.");
  }
  const frame = selectedFrame(result, requestedMinute);
  const minute = frame.minute;
  const roads = scenario.assets.roads.map((road) => roadSnapshot(road, scenario, result, minute, frame.timestampIso));
  const roadsById = new Map(roads.map((road) => [road.entityId, road]));
  const closedRoadIds = new Set(roads.filter((road) => road.accessStatus === "closed").map((road) => road.entityId));
  const populationZones = scenario.assets.populationZones.map((zone) => populationSnapshot(zone, scenario, result, minute, frame.timestampIso, closedRoadIds));
  const peopleExposed = populationZones.reduce((sum, zone) => sum + (zone.peopleWithinExposureEnvelope ?? 0), 0);
  const buildings = scenario.assets.buildings.map((building) => buildingSnapshot(building, scenario, result, minute, frame.timestampIso));
  const bridges = scenario.assets.bridges.map((bridge) => bridgeSnapshot(bridge, scenario, result, minute, frame.timestampIso));
  const criticalFacilities = scenario.assets.facilities
    .filter((facility) => facility.type !== "power" && facility.type !== "water" && facility.type !== "telecom")
    .map((facility) => facilitySnapshot(facility, scenario, result, minute, frame.timestampIso, roadsById, peopleExposed));
  const totalPopulation = scenario.assets.populationZones.reduce((sum, zone) => sum + zone.population, 0);
  const utilities = scenario.assets.facilities
    .filter((facility): facility is FacilityAsset & { type: "power" | "water" | "telecom" } =>
      facility.type === "power" || facility.type === "water" || facility.type === "telecom")
    .map((facility) => utilitySnapshot(facility, scenario, result, minute, frame.timestampIso, totalPopulation));
  const coverage = responseCoverage(evacuationPlan, minute, populationZones);
  const mobilityAssistanceEstimate = populationZones.reduce((sum, zone) => sum + (zone.mobilityAssistanceEstimate ?? 0), 0);
  const peopleInIsolatedZones = populationZones.filter((zone) => zone.isolated)
    .reduce((sum, zone) => sum + (zone.peopleWithinExposureEnvelope ?? 0), 0);
  const allAssets = [...buildings, ...roads, ...bridges, ...criticalFacilities, ...utilities, ...populationZones];
  const secondaryConsequences = secondaryConsequencesAtMinute(scenario, result, minute);
  const uncertainty = uncertaintyAtMinute(result, minute);
  const screenedRecoveryPlan = recoveryPlan(allAssets, minute);
  const topRecoveryPriorities = [...allAssets]
    .filter((asset) => asset.recovery.score >= 0.25)
    .sort((a, b) => b.recovery.score - a.recovery.score || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map((asset) => ({
      entityId: asset.entityId,
      entityKind: asset.entityKind,
      name: asset.name,
      score: asset.recovery.score,
      band: asset.recovery.band,
    }));

  return {
    scenarioId: scenario.metadata.id,
    simulationRunId: result.runId,
    hazard: result.hazard,
    requestedMinute,
    selectedMinute: minute,
    timestampIso: frame.timestampIso,
    classification: "simulated-planning-estimate",
    disclaimer: "All consequence states in this snapshot are deterministic planning estimates. They are not observed damage, confirmed casualties, official closures, engineering certification or repair commitments.",
    buildings,
    roads,
    bridges,
    criticalFacilities,
    utilities,
    populationZones,
    secondaryConsequences,
    uncertaintyCells: uncertainty.cells,
    uncertaintySummary: uncertainty.summary,
    recoveryPlan: screenedRecoveryPlan,
    humanImpact: {
      peopleWithinExposureEnvelope: peopleExposed,
      mobilityAssistanceEstimate,
      peopleInIsolatedZones,
      peopleCoveredByEvacuationPlan: coverage.peopleCoveredByPlan,
      peopleRemainingInPlanningEnvelope: coverage.peopleRemainingExposed,
      evacuationCoveragePct: coverage.coveragePct,
      observedFatalities: null,
      observedInjuries: null,
      casualtyStatus: "not-modelled",
      notice: "AEGIS does not infer confirmed deaths or injuries from a hypothetical scenario. Exposure and assistance values are aggregate planning estimates only.",
    },
    responseCoverage: coverage,
    summary: {
      affectedBuildings: buildings.filter((building) => building.impactIndex >= 0.14).length,
      severelyDamagedBuildings: buildings.filter((building) => building.damageState === "severe" || building.damageState === "critical").length,
      restrictedRoads: roads.filter((road) => road.accessStatus === "restricted").length,
      closedRoads: roads.filter((road) => road.accessStatus === "closed").length,
      degradedBridges: bridges.filter((bridge) => bridge.operationalStatus === "degraded").length,
      unavailableBridges: bridges.filter((bridge) => bridge.operationalStatus === "unavailable").length,
      degradedCriticalFacilities: criticalFacilities.filter((facility) => facility.operationalStatus === "degraded").length,
      unavailableCriticalFacilities: criticalFacilities.filter((facility) => facility.operationalStatus === "unavailable").length,
      disruptedUtilities: utilities.filter((utility) => utility.operationalStatus !== "operational").length,
      affectedPopulationZones: populationZones.filter((zone) => zone.impactIndex >= 0.14).length,
      peopleWithinExposureEnvelope: peopleExposed,
      topRecoveryPriorities,
    },
  };
}

/** Returns a down-sampled consequence timeline and caps work to 48 points by default. */
export function buildImpactTimeline(
  input: ImpactSnapshotInput,
  maxPoints = 48,
): ImpactTimelinePoint[] {
  const boundedPoints = Math.round(clamp(maxPoints, 2, 120));
  const frames = input.result.timeline;
  if (frames.length === 0) return [];
  const stride = Math.max(1, Math.ceil(frames.length / boundedPoints));
  const selectedFrames = frames.filter((_, index) => index % stride === 0);
  if (selectedFrames.at(-1)?.minute !== frames.at(-1)?.minute) selectedFrames.push(frames.at(-1)!);
  return selectedFrames.map((frame) => {
    const snapshot = buildImpactSnapshot({ ...input, selectedMinute: frame.minute });
    return {
      minute: snapshot.selectedMinute,
      timestampIso: snapshot.timestampIso,
      severity: frame.severity,
      affectedBuildings: snapshot.summary.affectedBuildings,
      closedRoads: snapshot.summary.closedRoads,
      unavailableCriticalFacilities: snapshot.summary.unavailableCriticalFacilities,
      disruptedUtilities: snapshot.summary.disruptedUtilities,
      peopleWithinExposureEnvelope: snapshot.summary.peopleWithinExposureEnvelope,
      evacuationCoveragePct: snapshot.responseCoverage.coveragePct,
    };
  });
}

export function findImpactAsset(
  snapshot: ImpactSnapshotBundle,
  entityId: string,
): ImpactAssetSnapshot | null {
  return [
    ...snapshot.buildings,
    ...snapshot.roads,
    ...snapshot.bridges,
    ...snapshot.criticalFacilities,
    ...snapshot.utilities,
    ...snapshot.populationZones,
  ].find((asset) => asset.entityId === entityId) ?? null;
}
