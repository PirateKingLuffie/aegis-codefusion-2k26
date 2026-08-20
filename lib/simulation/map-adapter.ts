import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
} from "geojson";
import type {
  AegisMapLayers,
  EvacuationRouteProperties,
  FloodDepthProperties,
  FloodFlowProperties,
  HazardFootprintProperties,
  HazardVectorProperties,
  HospitalProperties,
  ImpactZoneProperties,
  OperationalRoadProperties,
  ResourceProperties,
  ShelterProperties,
} from "../../components/map/types";
import type {
  Coordinate,
  EvacuationPlan,
  EvacuationRoute,
  FacilityImpact,
  HazardCellSample,
  ImpactAssetSnapshot,
  ImpactSnapshotBundle,
  ScenarioDefinition,
  SimulationResult,
  SpatialCellSeries,
  TerrainCell,
  TravelMode,
} from "../domain/types";
import { buildImpactSnapshot } from "./impact-analysis";
import {
  hazardRiskRatio,
  screenModePassability,
} from "./hazard-screening";

export type AegisEvidenceClass =
  | "Observed"
  | "Imported"
  | "Estimated"
  | "Simulated";

export interface AegisEvidenceProperties {
  evidenceClass: AegisEvidenceClass;
  geometryEvidenceClass: AegisEvidenceClass;
  statusEvidenceClass: AegisEvidenceClass;
  Observed: boolean;
  Imported: boolean;
  Estimated: boolean;
  Simulated: boolean;
  provenanceIds: string;
  provenanceSummary: string;
  scenarioId: string;
  simulationRunId: string;
  modelId: string;
  selectedMinute: number;
  estimateLabel: string;
}

export interface AegisMapAdapterOptions {
  /** Risk below this value is omitted from impact polygons. Defaults to 0.08. */
  minimumImpactRisk?: number;
  /** Flood cells below this depth are omitted. Defaults to 0.015 m. */
  minimumFloodDepthM?: number;
  /** Flow arrows below this velocity are omitted. Defaults to 0.03 m/s. */
  minimumFlowVelocityMps?: number;
  /** Set true to render every grid cell, including dry or negligible cells. */
  includeNegligibleCells?: boolean;
}

export interface AegisMapAdapterInput {
  scenario: ScenarioDefinition;
  result: SimulationResult;
  selectedMinute: number;
  evacuationPlan?: EvacuationPlan;
  /** Optional precomputed snapshot to avoid duplicate consequence work in API handlers. */
  impactSnapshot?: ImpactSnapshotBundle;
  options?: AegisMapAdapterOptions;
}

export interface ImpactAssetLayerProperties extends AegisEvidenceProperties {
  entityId: string;
  entityKind: ImpactAssetSnapshot["entityKind"];
  name: string;
  severity: ImpactAssetSnapshot["severity"];
  damageState: ImpactAssetSnapshot["damageState"];
  damageIndex: number | null;
  impactIndex: number;
  functionalityPct: number;
  operationalStatus: ImpactAssetSnapshot["operationalStatus"];
  accessStatus: ImpactAssetSnapshot["accessStatus"];
  pedestrianPassable?: boolean;
  carPassable?: boolean;
  busPassable?: boolean;
  ambulancePassable?: boolean;
  heavyRescuePassable?: boolean;
  isolated: boolean;
  peopleWithinExposureEnvelope: number | null;
  mobilityAssistanceEstimate: number | null;
  dependentPopulationEstimate: number | null;
  recoveryPriorityScore: number;
  recoveryPriorityBand: ImpactAssetSnapshot["recovery"]["band"];
  inspectionRequired: boolean;
  earliestHazardClearMinute: number | null;
  hazardMetric: string;
  hazardValue: number;
  hazardUnit: string;
  floodDepthM?: number;
  floodVelocityMps?: number;
  explanation: string;
  displayGeometry?: string;
  evacuationStatus?: "covered" | "partially-covered" | "uncovered" | "not-planned";
  assignedPopulation?: number;
  departureStartMinute?: number;
  departureEndMinute?: number;
  routeId?: string;
  buildingUse?: string;
  floors?: number;
  buildingHeightM?: number;
  heightEvidenceClass?: AegisEvidenceClass;
  waterlineHeightM?: number;
  internalFloodDepthM?: number;
  affectedFloorEstimate?: number;
  sourceFeatureId?: string;
}

export interface RecoveryPriorityLayerProperties extends ImpactAssetLayerProperties {
  rank: number;
}

/**
 * Extended layer contract. It remains structurally compatible with
 * `AegisMapLayers`, while exposing consequence layers for a richer renderer.
 */
export interface AegisImpactMapLayers extends AegisMapLayers {
  hazardFootprints: FeatureCollection<Polygon, HazardFootprintProperties & AegisEvidenceProperties>;
  hazardVectors: FeatureCollection<LineString, HazardVectorProperties & AegisEvidenceProperties>;
  damagedBuildings: FeatureCollection<Polygon, ImpactAssetLayerProperties>;
  impactedRoads: FeatureCollection<LineString, ImpactAssetLayerProperties>;
  impactedBridges: FeatureCollection<Point, ImpactAssetLayerProperties>;
  criticalFacilities: FeatureCollection<Point, ImpactAssetLayerProperties>;
  utilityImpacts: FeatureCollection<Point, ImpactAssetLayerProperties>;
  populationImpacts: FeatureCollection<Polygon, ImpactAssetLayerProperties>;
  responseCoverageZones: FeatureCollection<Polygon, ImpactAssetLayerProperties>;
  recoveryPriorities: FeatureCollection<Point, RecoveryPriorityLayerProperties>;
  impactSnapshot: ImpactSnapshotBundle;
}

type FloodFeatureProperties = FloodDepthProperties & AegisEvidenceProperties;
type FlowFeatureProperties = FloodFlowProperties & AegisEvidenceProperties;
type RoadFeatureProperties = OperationalRoadProperties & AegisEvidenceProperties;
type RouteFeatureProperties = EvacuationRouteProperties & AegisEvidenceProperties;
type AdaptedResourceProperties = ResourceProperties & AegisEvidenceProperties;
type AdaptedHospitalProperties = HospitalProperties & AegisEvidenceProperties;
type AdaptedShelterProperties = ShelterProperties & AegisEvidenceProperties;
type AdaptedImpactProperties = ImpactZoneProperties & AegisEvidenceProperties;
type AdaptedHazardFootprintProperties = HazardFootprintProperties & AegisEvidenceProperties;
type AdaptedHazardVectorProperties = HazardVectorProperties & AegisEvidenceProperties;

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
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lon - a.lon);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function collection<G extends Point | LineString | Polygon, P>(
  features: Array<Feature<G, P>>,
): FeatureCollection<G, P> {
  return { type: "FeatureCollection", features };
}

function coordinate(value: Coordinate): [number, number] {
  return [value.lon, value.lat];
}

function nearestMinute(result: SimulationResult, requestedMinute: number): number {
  return result.timeline.reduce((nearest, frame) =>
    Math.abs(frame.minute - requestedMinute) < Math.abs(nearest - requestedMinute)
      ? frame.minute
      : nearest,
  result.timeline[0]?.minute ?? 0);
}

function sampleAt(series: SpatialCellSeries, minute: number): HazardCellSample {
  return series.samples.reduce((nearest, sample) =>
    Math.abs(sample.minute - minute) < Math.abs(nearest.minute - minute)
      ? sample
      : nearest,
  series.samples[0]);
}

function nearestSeries(
  result: SimulationResult,
  target: Coordinate,
): SpatialCellSeries {
  return result.field.reduce((nearest, series) =>
    distanceMeters(series.cell.center, target) < distanceMeters(nearest.cell.center, target)
      ? series
      : nearest,
  result.field[0]);
}

function midpoint(points: Coordinate[]): Coordinate {
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / Math.max(1, points.length),
    lon: points.reduce((sum, point) => sum + point.lon, 0) / Math.max(1, points.length),
  };
}

function evidence(
  result: SimulationResult,
  selectedMinute: number,
  evidenceClass: AegisEvidenceClass,
  geometryEvidenceClass: AegisEvidenceClass,
  statusEvidenceClass: AegisEvidenceClass,
): AegisEvidenceProperties {
  const classifications = [evidenceClass, geometryEvidenceClass, statusEvidenceClass];
  return {
    evidenceClass,
    geometryEvidenceClass,
    statusEvidenceClass,
    Observed: classifications.includes("Observed"),
    Imported: classifications.includes("Imported"),
    Estimated: classifications.includes("Estimated"),
    Simulated: classifications.includes("Simulated"),
    provenanceIds: result.provenance.map((item) => item.id).join(","),
    provenanceSummary: result.provenance
      .map((item) => `${item.label} [${item.kind}]`)
      .join(" • "),
    scenarioId: result.scenarioId,
    simulationRunId: result.runId,
    modelId: result.model.id,
    selectedMinute,
    estimateLabel: result.estimateLabel,
  };
}

function scenarioAssetGeometryEvidence(scenario: ScenarioDefinition): AegisEvidenceClass {
  const estimateLabel = scenario.metadata.estimateLabel.toLowerCase();
  const importedAssets = estimateLabel.includes("imported local-data") || estimateLabel.includes("imported assets");
  if (!importedAssets) return "Estimated";
  const relevant = scenario.provenance.filter((source) =>
    (source.kind === "observed" || source.kind === "open-data") &&
    !/center coordinate only|does not validate/i.test(source.note ?? ""));
  return relevant.some((source) => source.kind === "observed") ? "Observed" : "Imported";
}

function evidenceClassLabel(
  value: ImpactAssetSnapshot["evidence"]["geometryClassification"],
): AegisEvidenceClass {
  return `${value[0].toUpperCase()}${value.slice(1)}` as AegisEvidenceClass;
}

function cellPolygon(
  cell: TerrainCell,
  scenario: ScenarioDefinition,
): Polygon {
  const latitudeHalf = (scenario.area.north - scenario.area.south) / scenario.gridRows / 2;
  const longitudeHalf = (scenario.area.east - scenario.area.west) / scenario.gridColumns / 2;
  const west = cell.center.lon - longitudeHalf;
  const east = cell.center.lon + longitudeHalf;
  const south = cell.center.lat - latitudeHalf;
  const north = cell.center.lat + latitudeHalf;
  return {
    type: "Polygon",
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  };
}

function squareAround(center: Coordinate, radiusM: number): Polygon {
  const latitudeOffset = radiusM / 111_320;
  const longitudeOffset = radiusM / (111_320 * Math.max(0.2, Math.cos(toRadians(center.lat))));
  return {
    type: "Polygon",
    coordinates: [[
      [center.lon - longitudeOffset, center.lat - latitudeOffset],
      [center.lon + longitudeOffset, center.lat - latitudeOffset],
      [center.lon + longitudeOffset, center.lat + latitudeOffset],
      [center.lon - longitudeOffset, center.lat + latitudeOffset],
      [center.lon - longitudeOffset, center.lat - latitudeOffset],
    ]],
  };
}

function polygonFromFootprint(points: Coordinate[] | undefined): Polygon | null {
  if (!points || points.length < 3) return null;
  const ring = points.map(coordinate);
  const first = ring[0];
  const last = ring.at(-1)!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return { type: "Polygon", coordinates: [ring] };
}

function destinationPoint(
  start: Coordinate,
  directionDegrees: number,
  distanceM: number,
): Coordinate {
  const angle = toRadians(directionDegrees);
  return {
    lat: start.lat + Math.cos(angle) * distanceM / 111_320,
    lon:
      start.lon +
      Math.sin(angle) * distanceM /
        (111_320 * Math.max(0.2, Math.cos(toRadians(start.lat)))),
  };
}

function directedDestination(
  start: Coordinate,
  directionDegrees: number,
  signedDistanceM: number,
): Coordinate {
  return destinationPoint(
    start,
    signedDistanceM < 0 ? directionDegrees + 180 : directionDegrees,
    Math.abs(signedDistanceM),
  );
}

function circleCoordinates(
  center: Coordinate,
  radiusM: number,
  vertices = 48,
): Array<[number, number]> {
  const coordinates = Array.from({ length: vertices }, (_, index) =>
    coordinate(destinationPoint(center, index / vertices * 360, Math.max(1, radiusM))));
  coordinates.push([...coordinates[0]]);
  return coordinates;
}

function circlePolygon(center: Coordinate, radiusM: number): Polygon {
  return { type: "Polygon", coordinates: [circleCoordinates(center, radiusM)] };
}

function annulusPolygon(center: Coordinate, innerRadiusM: number, outerRadiusM: number): Polygon {
  const outer = circleCoordinates(center, outerRadiusM);
  if (innerRadiusM <= 1) return { type: "Polygon", coordinates: [outer] };
  return {
    type: "Polygon",
    coordinates: [outer, circleCoordinates(center, innerRadiusM).reverse()],
  };
}

function cellCornerCoordinates(cell: TerrainCell, scenario: ScenarioDefinition): Array<[number, number]> {
  return cellPolygon(cell, scenario).coordinates[0].slice(0, -1) as Array<[number, number]>;
}

function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const unique = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point])).values()]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (unique.length <= 2) return unique;
  const cross = (
    origin: [number, number],
    left: [number, number],
    right: [number, number],
  ) => (left[0] - origin[0]) * (right[1] - origin[1]) -
    (left[1] - origin[1]) * (right[0] - origin[0]);
  const lower: Array<[number, number]> = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Array<[number, number]> = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function footprintForSeries(
  scenario: ScenarioDefinition,
  selected: SpatialCellSeries[],
  fallbackRadiusM: number,
): Polygon {
  const hull = convexHull(selected.flatMap((series) => cellCornerCoordinates(series.cell, scenario)));
  if (hull.length < 3) {
    return circlePolygon(selected[0]?.cell.center ?? scenario.hazardSource, fallbackRadiusM);
  }
  return { type: "Polygon", coordinates: [[...hull, [...hull[0]]]] };
}

function maximumScenarioRadiusM(scenario: ScenarioDefinition): number {
  return Math.max(
    120,
    ...scenario.terrain.map((cell) => distanceMeters(scenario.hazardSource, cell.center)),
  );
}

function selectedTimelineFrame(result: SimulationResult, selectedMinute: number) {
  return result.timeline.reduce((nearest, frame) =>
    Math.abs(frame.minute - selectedMinute) < Math.abs(nearest.minute - selectedMinute)
      ? frame
      : nearest,
  result.timeline[0]);
}

function baseHazardVisualProperties(
  result: SimulationResult,
  selectedMinute: number,
  phase: string,
  intensity01: number,
): Pick<
  AdaptedHazardFootprintProperties,
  | keyof AegisEvidenceProperties
  | "classification"
  | "selectedMinute"
  | "phase"
  | "intensity01"
  | "animationProgress01"
  | "severity"
  | "damageIndex"
> {
  const boundedIntensity = round(clamp(intensity01, 0, 1), 3);
  return {
    ...evidence(result, selectedMinute, "Simulated", "Simulated", "Simulated"),
    evidenceClass: "Simulated",
    classification: "SIMULATED",
    selectedMinute,
    phase,
    intensity01: boundedIntensity,
    animationProgress01: round(clamp(selectedMinute / Math.max(1, result.timeline.at(-1)?.minute ?? 1), 0, 1), 3),
    severity: severity(boundedIntensity),
    damageIndex: boundedIntensity,
  };
}

function sampleRisk(sample: HazardCellSample): number {
  return hazardRiskRatio(sample);
}

function severity(risk: number): "low" | "moderate" | "high" | "critical" {
  if (risk >= 0.78) return "critical";
  if (risk >= 0.55) return "high";
  if (risk >= 0.3) return "moderate";
  return "low";
}

function sampleProperties(sample: HazardCellSample): Record<string, string | number | boolean> {
  if (sample.hazard === "flood") {
    return {
      depthM: sample.depthM,
      velocityMps: sample.velocityMps,
      directionDegrees: sample.directionDeg,
      waterSurfaceElevationM: sample.waterSurfaceElevationM,
      riseRateMPerMinute: sample.riseRateMPerMinute,
      phase: sample.phase,
    };
  }
  if (sample.hazard === "earthquake") {
    return {
      mmi: sample.mmi,
      pgaG: sample.pgaG,
      liquefactionProbability: sample.liquefactionProbability,
      groundDisplacementCm: sample.groundDisplacementCm,
      debrisRisk: sample.debrisRisk,
      bridgeDemandIndex: sample.bridgeDemandIndex,
      aftershock: sample.aftershock,
    };
  }
  if (sample.hazard === "wildfire") {
    return {
      firelineIntensityKwM: sample.firelineIntensityKwM,
      flameLengthM: sample.flameLengthM,
      smokeIndex: sample.smokeIndex,
      burning: sample.burning,
      radiantHeatKwM2: sample.radiantHeatKwM2,
      emberSpottingRisk: sample.emberSpottingRisk,
      visibilityM: sample.visibilityM,
    };
  }
  if (sample.hazard === "cyclone") {
    return {
      windKph: sample.windKph,
      rainfallMmPerHour: sample.rainfallMmPerHour,
      surgeDepthM: sample.surgeDepthM,
      debrisRisk: sample.debrisRisk,
      gustKph: sample.gustKph,
      surfaceFloodDepthM: sample.surfaceFloodDepthM,
      powerFailureRisk: sample.powerFailureRisk,
    };
  }
  return {
    concentrationMgM3: sample.concentrationMgM3,
    exposureRatio: sample.exposureRatio,
    plumePresent: sample.plumePresent,
    indoorExposureRatio: sample.indoorExposureRatio,
    depositionIndex: sample.depositionIndex,
    shelterInPlaceEffective: sample.shelterInPlaceEffective,
  };
}

function hazardVisualLayers(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  selectedMinute: number,
  options: Required<AegisMapAdapterOptions>,
): {
  footprints: FeatureCollection<Polygon, AdaptedHazardFootprintProperties>;
  vectors: FeatureCollection<LineString, AdaptedHazardVectorProperties>;
} {
  const footprints: Array<Feature<Polygon, AdaptedHazardFootprintProperties>> = [];
  const vectors: Array<Feature<LineString, AdaptedHazardVectorProperties>> = [];
  const frame = selectedTimelineFrame(result, selectedMinute);
  const samples = result.field.map((series) => ({ series, sample: sampleAt(series, selectedMinute) }));
  const maximumRadiusM = maximumScenarioRadiusM(scenario);
  const fallbackRadiusM = Math.max(24, maximumRadiusM / Math.max(scenario.gridRows, scenario.gridColumns));

  const addFootprint = (
    id: string,
    geometry: Polygon,
    visualRole: HazardFootprintProperties["visualRole"],
    intensity01: number,
    metric: string,
    value: number,
    unit: string,
    displayLabel: string,
    displayNote: string,
    extra: Partial<AdaptedHazardFootprintProperties> = {},
  ) => {
    footprints.push({
      type: "Feature",
      id: `${id}-${selectedMinute}`,
      geometry,
      properties: {
        ...baseHazardVisualProperties(result, selectedMinute, frame.phase, intensity01),
        hazard: result.hazard,
        visualRole,
        impactType: visualRole,
        metric,
        value: round(value, 3),
        unit,
        name: displayLabel,
        displayLabel,
        displayNote,
        ...extra,
      },
    });
  };
  const addVector = (
    id: string,
    geometry: LineString,
    visualRole: HazardVectorProperties["visualRole"],
    intensity01: number,
    metric: string,
    value: number,
    unit: string,
    displayLabel: string,
    displayNote: string,
    extra: Partial<AdaptedHazardVectorProperties> = {},
  ) => {
    vectors.push({
      type: "Feature",
      id: `${id}-${selectedMinute}`,
      geometry,
      properties: {
        ...baseHazardVisualProperties(result, selectedMinute, frame.phase, intensity01),
        hazard: result.hazard,
        visualRole,
        metric,
        value: round(value, 3),
        unit,
        displayLabel,
        displayNote,
        ...extra,
      },
    });
  };

  if (result.hazard === "flood") {
    const floodSamples = samples.filter((entry): entry is typeof entry & { sample: Extract<HazardCellSample, { hazard: "flood" }> } =>
      entry.sample.hazard === "flood");
    const wet = floodSamples.filter(({ sample }) => sample.depthM >= options.minimumFloodDepthM);
    const maximumDepthM = Math.max(0, ...floodSamples.map(({ sample }) => sample.depthM));
    const maximumVelocityMps = Math.max(0, ...floodSamples.map(({ sample }) => sample.velocityMps));
    if (wet.length > 0) {
      const intensity = clamp(maximumDepthM / 1.5, 0, 1);
      addFootprint(
        "hazard-flood-extent",
        footprintForSeries(scenario, wet.map(({ series }) => series), fallbackRadiusM),
        "flood-extent",
        intensity,
        "maximum water depth",
        maximumDepthM,
        "m",
        `SIMULATED flood extent · T+${selectedMinute}`,
        `Time-selected ${frame.phase} envelope derived from deterministic wet cells; it is not an observed flood boundary.`,
      );
      const deepThresholdM = Math.max(0.25, maximumDepthM * 0.55);
      const deep = wet.filter(({ sample }) => sample.depthM >= deepThresholdM);
      if (deep.length > 0) {
        addFootprint(
          "hazard-flood-deep-water",
          footprintForSeries(scenario, deep.map(({ series }) => series), fallbackRadiusM),
          "flood-deep-water",
          intensity,
          "deep-water threshold",
          deepThresholdM,
          "m",
          `SIMULATED deeper water · T+${selectedMinute}`,
          "Display band derived from the selected deterministic depth field; it is not a surveyed waterline.",
        );
      }
      const directionWeights = wet.filter(({ sample }) => sample.velocityMps > 0.01);
      if (directionWeights.length > 0) {
        const east = directionWeights.reduce((sum, { sample }) => sum + Math.sin(toRadians(sample.directionDeg)) * sample.velocityMps, 0);
        const north = directionWeights.reduce((sum, { sample }) => sum + Math.cos(toRadians(sample.directionDeg)) * sample.velocityMps, 0);
        const directionDegrees = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
        const center = {
          lat: wet.reduce((sum, { series }) => sum + series.cell.center.lat, 0) / wet.length,
          lon: wet.reduce((sum, { series }) => sum + series.cell.center.lon, 0) / wet.length,
        };
        addVector(
          "hazard-flood-net-flow",
          {
            type: "LineString",
            coordinates: [
              coordinate(center),
              coordinate(destinationPoint(center, directionDegrees, maximumRadiusM * (0.12 + intensity * 0.3))),
            ],
          },
          "flood-net-flow",
          intensity,
          "maximum flow velocity",
          maximumVelocityMps,
          "m/s",
          `SIMULATED net flow · T+${selectedMinute}`,
          "Aggregate display direction only; inspect cell vectors for local model values.",
          { directionDegrees: round(directionDegrees, 1) },
        );
      }
    }
  } else if (result.hazard === "earthquake") {
    const earthquakeSamples = samples.filter((entry): entry is typeof entry & { sample: Extract<HazardCellSample, { hazard: "earthquake" }> } =>
      entry.sample.hazard === "earthquake");
    const maximumMmi = Math.max(1, ...earthquakeSamples.map(({ sample }) => sample.mmi));
    const maximumPgaG = Math.max(0, ...earthquakeSamples.map(({ sample }) => sample.pgaG));
    const intensity = clamp((maximumMmi - 1) / 8, 0, 1);
    if (intensity >= options.minimumImpactRisk) {
      const fractions = [0.28, 0.52, 0.76, 1];
      let innerRadiusM = 0;
      fractions.forEach((fraction, index) => {
        const outerRadiusM = maximumRadiusM * fraction;
        const bandIntensity = clamp(intensity * (1 - index * 0.14), 0, 1);
        addFootprint(
          `hazard-earthquake-isoseismal-${index + 1}`,
          annulusPolygon(scenario.hazardSource, innerRadiusM, outerRadiusM),
          "earthquake-isoseismal",
          bandIntensity,
          "Modified Mercalli intensity",
          Math.max(1, maximumMmi - index * 0.9),
          "MMI",
          `SIMULATED shaking band ${index + 1} · T+${selectedMinute}`,
          "Concentric isoseismal screening band; animation shows the deterministic event envelope, not real-time seismic-wave travel.",
          { innerRadiusM: round(innerRadiusM, 1), outerRadiusM: round(outerRadiusM, 1) },
        );
        addVector(
          `hazard-earthquake-pulse-${index + 1}`,
          { type: "LineString", coordinates: circleCoordinates(scenario.hazardSource, outerRadiusM) },
          "earthquake-pulse-outline",
          bandIntensity,
          "peak ground acceleration",
          maximumPgaG,
          "g",
          `SIMULATED shaking outline ${index + 1}`,
          "Symbolic isoseismal outline, not a measured station contour.",
        );
        innerRadiusM = outerRadiusM;
      });
    }
  } else if (result.hazard === "wildfire") {
    const wildfireSamples = samples.filter((entry): entry is typeof entry & { sample: Extract<HazardCellSample, { hazard: "wildfire" }> } =>
      entry.sample.hazard === "wildfire");
    const burning = wildfireSamples.filter(({ sample }) => sample.burning && sample.firelineIntensityKwM > 0);
    const smoky = wildfireSamples.filter(({ sample }) => sample.smokeIndex >= 0.1);
    const maximumIntensityKwM = Math.max(0, ...wildfireSamples.map(({ sample }) => sample.firelineIntensityKwM));
    const maximumSmoke = Math.max(0, ...wildfireSamples.map(({ sample }) => sample.smokeIndex));
    if (smoky.length > 0) {
      addFootprint(
        "hazard-wildfire-smoke",
        footprintForSeries(scenario, smoky.map(({ series }) => series), fallbackRadiusM),
        "wildfire-smoke-envelope",
        maximumSmoke,
        "smoke index",
        maximumSmoke,
        "0–1",
        `SIMULATED smoke envelope · T+${selectedMinute}`,
        "Wind-aligned smoke screening envelope; it is not an observed plume or air-quality measurement.",
        { directionDegrees: scenario.parameters.kind === "wildfire" ? scenario.parameters.windDirectionDeg : undefined },
      );
    }
    if (burning.length > 0) {
      const intensity = clamp(maximumIntensityKwM / 3_200, 0, 1);
      addFootprint(
        "hazard-wildfire-perimeter",
        footprintForSeries(scenario, burning.map(({ series }) => series), fallbackRadiusM),
        "wildfire-active-perimeter",
        intensity,
        "maximum fireline intensity",
        maximumIntensityKwM,
        "kW/m",
        `SIMULATED active-fire perimeter · T+${selectedMinute}`,
        "Convex display envelope around currently burning deterministic cells; it is not a mapped fire perimeter.",
        { directionDegrees: scenario.parameters.kind === "wildfire" ? scenario.parameters.windDirectionDeg : undefined },
      );
    }
    if (scenario.parameters.kind === "wildfire" && (burning.length > 0 || smoky.length > 0)) {
      const reached = [...burning, ...smoky].reduce(
        (maximum, { series }) => Math.max(maximum, distanceMeters(scenario.hazardSource, series.cell.center)),
        fallbackRadiusM,
      );
      addVector(
        "hazard-wildfire-spread-axis",
        {
          type: "LineString",
          coordinates: [
            coordinate(scenario.hazardSource),
            coordinate(destinationPoint(scenario.hazardSource, scenario.parameters.windDirectionDeg, reached)),
          ],
        },
        "wildfire-spread-axis",
        clamp(Math.max(maximumSmoke, maximumIntensityKwM / 3_200), 0, 1),
        "wind-aligned spread distance",
        reached,
        "m",
        `SIMULATED spread axis · T+${selectedMinute}`,
        "Display axis follows the scenario wind direction; it is not an evacuation route or forecast track.",
        { directionDegrees: scenario.parameters.windDirectionDeg },
      );
    }
  } else if (result.hazard === "cyclone") {
    const cycloneSamples = samples.filter((entry): entry is typeof entry & { sample: Extract<HazardCellSample, { hazard: "cyclone" }> } =>
      entry.sample.hazard === "cyclone");
    const windAffected = cycloneSamples.filter(({ sample }) => sample.windKph >= 30);
    const inundated = cycloneSamples.filter(({ sample }) => sample.surfaceFloodDepthM >= options.minimumFloodDepthM);
    const maximumWindKph = Math.max(0, ...cycloneSamples.map(({ sample }) => sample.windKph));
    const maximumSurfaceWaterM = Math.max(0, ...cycloneSamples.map(({ sample }) => sample.surfaceFloodDepthM));
    if (windAffected.length > 0) {
      addFootprint(
        "hazard-cyclone-wind-field",
        footprintForSeries(scenario, windAffected.map(({ series }) => series), fallbackRadiusM),
        "cyclone-wind-field",
        clamp(maximumWindKph / 180, 0, 1),
        "maximum sustained wind",
        maximumWindKph,
        "km/h",
        `SIMULATED cyclone wind field · T+${selectedMinute}`,
        "Parametric wind-screening envelope; it is not an observed or forecast storm field.",
        { directionDegrees: scenario.parameters.kind === "cyclone" ? scenario.parameters.trackDirectionDeg : undefined },
      );
    }
    if (inundated.length > 0) {
      addFootprint(
        "hazard-cyclone-surface-water",
        footprintForSeries(scenario, inundated.map(({ series }) => series), fallbackRadiusM),
        "cyclone-surface-water",
        clamp(maximumSurfaceWaterM / 1.5, 0, 1),
        "combined surge/surface-water depth",
        maximumSurfaceWaterM,
        "m",
        `SIMULATED coastal/surface-water proxy · T+${selectedMinute}`,
        "Combined low-point surge and rainfall-excess screening. Without coastal bathymetry it is not a calibrated storm-surge or tsunami model.",
      );
    }
    if (scenario.parameters.kind === "cyclone") {
      const direction = scenario.parameters.trackDirectionDeg;
      const signedTrackDistanceM = clamp(
        (selectedMinute - 60) * scenario.parameters.forwardSpeedKph * 1_000 / 60,
        -maximumRadiusM * 1.25,
        maximumRadiusM * 1.25,
      );
      const start = directedDestination(scenario.hazardSource, direction, -maximumRadiusM * 1.25);
      const current = directedDestination(scenario.hazardSource, direction, signedTrackDistanceM);
      addVector(
        "hazard-cyclone-track",
        { type: "LineString", coordinates: [coordinate(start), coordinate(current)] },
        "cyclone-track",
        clamp(maximumWindKph / 180, 0, 1),
        "storm-centre display offset",
        signedTrackDistanceM,
        "m",
        `SIMULATED storm track · T+${selectedMinute}`,
        "Parametric scenario track for animation only; it is not a meteorological forecast track.",
        { directionDegrees: direction },
      );
    }
  } else {
    const chemicalSamples = samples.filter((entry): entry is typeof entry & { sample: Extract<HazardCellSample, { hazard: "chemical" }> } =>
      entry.sample.hazard === "chemical");
    const plume = chemicalSamples.filter(({ sample }) => sample.plumePresent || sample.exposureRatio >= 0.1);
    const threshold = chemicalSamples.filter(({ sample }) => sample.exposureRatio >= 1);
    const maximumExposureRatio = Math.max(0, ...chemicalSamples.map(({ sample }) => sample.exposureRatio));
    const maximumConcentration = Math.max(0, ...chemicalSamples.map(({ sample }) => sample.concentrationMgM3));
    if (plume.length > 0) {
      addFootprint(
        "hazard-chemical-plume",
        footprintForSeries(scenario, plume.map(({ series }) => series), fallbackRadiusM),
        "chemical-plume",
        clamp(maximumExposureRatio / 4, 0, 1),
        "maximum concentration",
        maximumConcentration,
        "mg/m³",
        `SIMULATED directional plume · T+${selectedMinute}`,
        "Gaussian-plume screening envelope; it is not observed gas, CFD or an official public-health boundary.",
        { directionDegrees: scenario.parameters.kind === "chemical" ? scenario.parameters.windDirectionDeg : undefined },
      );
    }
    if (threshold.length > 0) {
      addFootprint(
        "hazard-chemical-threshold",
        footprintForSeries(scenario, threshold.map(({ series }) => series), fallbackRadiusM),
        "chemical-threshold-zone",
        clamp(maximumExposureRatio / 4, 0, 1),
        "outdoor toxicity-threshold ratio",
        maximumExposureRatio,
        "× threshold",
        `SIMULATED threshold-exceedance zone · T+${selectedMinute}`,
        "Scenario toxicity-threshold screen only; material-specific authority guidance supersedes it.",
      );
    }
    if (scenario.parameters.kind === "chemical") {
      const frontDistanceM = Math.min(
        maximumRadiusM * 1.4,
        scenario.parameters.windSpeedKph * 1_000 / 60 * selectedMinute,
      );
      if (frontDistanceM > 0) {
        addVector(
          "hazard-chemical-plume-axis",
          {
            type: "LineString",
            coordinates: [
              coordinate(scenario.hazardSource),
              coordinate(destinationPoint(scenario.hazardSource, scenario.parameters.windDirectionDeg, frontDistanceM)),
            ],
          },
          "chemical-plume-axis",
          clamp(maximumExposureRatio / 4, 0, 1),
          "advected plume-front distance",
          frontDistanceM,
          "m",
          `SIMULATED plume axis · T+${selectedMinute}`,
          "Wind-advection display axis only; it is not a measured plume centreline.",
          { directionDegrees: scenario.parameters.windDirectionDeg },
        );
      }
    }
  }

  return { footprints: collection(footprints), vectors: collection(vectors) };
}

function floodLayers(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  selectedMinute: number,
  options: Required<AegisMapAdapterOptions>,
): {
  depth: FeatureCollection<Polygon, FloodFeatureProperties>;
  flow: FeatureCollection<LineString, FlowFeatureProperties>;
} {
  const depthFeatures: Array<Feature<Polygon, FloodFeatureProperties>> = [];
  const flowFeatures: Array<Feature<LineString, FlowFeatureProperties>> = [];
  const evidenceProperties = evidence(result, selectedMinute, "Simulated", "Simulated", "Simulated");
  const approximateCellWidthM =
    distanceMeters(
      { lat: scenario.area.north, lon: scenario.area.west },
      { lat: scenario.area.north, lon: scenario.area.east },
    ) / scenario.gridColumns;
  for (const series of result.field) {
    const sample = sampleAt(series, selectedMinute);
    if (sample.hazard !== "flood") continue;
    if (options.includeNegligibleCells || sample.depthM >= options.minimumFloodDepthM) {
      depthFeatures.push({
        type: "Feature",
        id: `flood-${series.cell.id}-${selectedMinute}`,
        geometry: cellPolygon(series.cell, scenario),
        properties: {
          ...evidenceProperties,
          cellId: series.cell.id,
          name: `Flood cell ${series.cell.row + 1}/${series.cell.column + 1}`,
          depthM: sample.depthM,
          depth: sample.depthM,
          velocityMps: sample.velocityMps,
          arrivalMinutes: series.arrivalMinute ?? undefined,
          peakMinute: series.peakMinute,
          recessionMinute: series.recessionMinute ?? undefined,
          riskLevel: severity(sampleRisk(sample)),
          phase: sample.phase,
          confidence: series.confidence.score,
          confidenceBand: series.confidence.band,
          displayVerticalExaggeration: "10× depth (visual only; inspect depthM for the model value)",
        },
      });
    }
    if (sample.velocityMps >= options.minimumFlowVelocityMps && sample.depthM >= options.minimumFloodDepthM) {
      const lineLength = approximateCellWidthM * clamp(0.22 + sample.velocityMps / 2.5, 0.22, 0.82);
      const end = destinationPoint(series.cell.center, sample.directionDeg, lineLength);
      flowFeatures.push({
        type: "Feature",
        id: `flow-${series.cell.id}-${selectedMinute}`,
        geometry: {
          type: "LineString",
          coordinates: [coordinate(series.cell.center), coordinate(end)],
        },
        properties: {
          ...evidenceProperties,
          cellId: series.cell.id,
          velocityMps: sample.velocityMps,
          velocity: sample.velocityMps,
          directionDegrees: sample.directionDeg,
          depthM: sample.depthM,
          phase: sample.phase,
          confidence: series.confidence.score,
        },
      });
    }
  }
  return { depth: collection(depthFeatures), flow: collection(flowFeatures) };
}

function currentRoadState(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  roadId: string,
  selectedMinute: number,
  mode: TravelMode = "car",
): { status: "open" | "advisory" | "restricted" | "closed"; passable: boolean; depthM?: number; risk: number } {
  const road = scenario.assets.roads.find((candidate) => candidate.id === roadId);
  if (!road) return { status: "closed", passable: false, risk: 1 };
  const series = nearestSeries(result, midpoint(road.geometry));
  const sample = sampleAt(series, selectedMinute);
  if (sample.hazard === "flood") {
    const depthM = Math.max(0, sample.depthM - road.elevationOffsetM - road.drainageQuality * 0.055);
    const adjustedSample = { ...sample, depthM };
    const modeScreen = screenModePassability(adjustedSample, series.confidence.score)[mode];
    return {
      status: !modeScreen.passable ? "closed" : depthM > 0.25 ? "restricted" : depthM > 0.1 ? "advisory" : "open",
      passable: modeScreen.passable,
      depthM: round(depthM, 3),
      risk: sampleRisk(adjustedSample),
    };
  }
  const risk = sampleRisk(sample);
  const modeScreen = screenModePassability(sample, series.confidence.score)[mode];
  return {
    status: !modeScreen.passable ? "closed" : risk > 0.62 ? "restricted" : risk > 0.38 ? "advisory" : "open",
    passable: modeScreen.passable,
    risk,
  };
}

function roadLayer(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  selectedMinute: number,
): FeatureCollection<LineString, RoadFeatureProperties> {
  const impactById = new Map(result.impacts.roads.map((impact) => [impact.roadId, impact]));
  const evidenceProperties = evidence(
    result,
    selectedMinute,
    "Simulated",
    scenarioAssetGeometryEvidence(scenario),
    "Simulated",
  );
  return collection(scenario.assets.roads.map((road): Feature<LineString, RoadFeatureProperties> => {
    const current = currentRoadState(scenario, result, road.id, selectedMinute);
    const peak = impactById.get(road.id);
    return {
      type: "Feature",
      id: road.id,
      geometry: { type: "LineString", coordinates: road.geometry.map(coordinate) },
      properties: {
        ...evidenceProperties,
        roadId: road.id,
        name: road.name,
        status: current.status,
        passable: current.passable,
        depthM: current.depthM,
        currentRisk: round(current.risk, 3),
        peakStatus: peak?.status ?? "unknown",
        peakDepthM: peak?.peakDepthM,
        peakMinute: peak?.peakMinute,
        closureWindows: peak?.closures.map((window) => `${window.startMinute}-${window.endMinute}`).join(",") ?? "",
        explanation: peak?.explanation.join(" ") ?? "No consequence record available.",
        confidence: peak?.confidence.score,
      },
    };
  }));
}

function routeLayer(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  selectedMinute: number,
  plan: EvacuationPlan | undefined,
): FeatureCollection<LineString, RouteFeatureProperties> {
  if (!plan) return collection([]);
  const edgeById = new Map(scenario.assets.network.edges.map((edge) => [edge.id, edge]));
  const stageByRoute = new Map(
    plan.stages
      .filter((stage) => stage.populationAssigned > 0)
      .map((stage) => [stage.routeId, stage]),
  );
  const evidenceProperties = evidence(result, selectedMinute, "Simulated", "Estimated", "Simulated");
  return collection(plan.routes.map((route): Feature<LineString, RouteFeatureProperties> => {
    const statuses = route.edgeIds.map((edgeId) => {
      const edge = edgeById.get(edgeId);
      return edge
        ? currentRoadState(scenario, result, edge.roadId, selectedMinute, route.mode).status
        : "closed";
    });
    const status = statuses.includes("closed")
      ? "blocked"
      : statuses.includes("restricted") || statuses.includes("advisory")
        ? "warning"
        : "safe";
    const stage = stageByRoute.get(route.id);
    return {
      type: "Feature",
      id: route.id,
      geometry: { type: "LineString", coordinates: route.polyline.map(coordinate) },
      properties: {
        ...evidenceProperties,
        routeId: route.id,
        name: `${route.status[0].toUpperCase()}${route.status.slice(1)} route`,
        status,
        routeType: route.status,
        rank: route.rank,
        originId: route.originId,
        destinationId: route.destinationId,
        etaMinutes: route.etaMinutes,
        distanceKm: round(route.distanceM / 1_000, 2),
        reliability: route.reliability,
        riskScore: route.riskScore,
        bottleneckPersonsPerMinute: route.bottleneckPersonsPerMinute,
        assignedPopulation: stage?.populationAssigned ?? 0,
        departureStartMinute: stage?.departureWindow.startMinute,
        departureEndMinute: stage?.departureWindow.endMinute,
        explanation: route.explanation.join(" "),
      },
    };
  }));
}

function interpolateRoute(route: EvacuationRoute, progress: number): Coordinate {
  if (route.polyline.length <= 1) return route.polyline[0] ?? { lat: 0, lon: 0 };
  const segmentLengths = route.polyline.slice(1).map((point, index) =>
    distanceMeters(route.polyline[index], point));
  const total = segmentLengths.reduce((sum, length) => sum + length, 0);
  let remaining = clamp(progress, 0, 1) * total;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segment = segmentLengths[index];
    if (remaining <= segment || index === segmentLengths.length - 1) {
      const ratio = segment === 0 ? 0 : remaining / segment;
      return {
        lat: route.polyline[index].lat + (route.polyline[index + 1].lat - route.polyline[index].lat) * ratio,
        lon: route.polyline[index].lon + (route.polyline[index + 1].lon - route.polyline[index].lon) * ratio,
      };
    }
    remaining -= segment;
  }
  return route.polyline.at(-1)!;
}

function resourceLayer(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  selectedMinute: number,
  plan: EvacuationPlan | undefined,
): FeatureCollection<Point, AdaptedResourceProperties> {
  const nodeById = new Map(scenario.assets.network.nodes.map((node) => [node.id, node]));
  const routeById = new Map(plan?.routes.map((route) => [route.id, route]) ?? []);
  const assignmentsByUnit = new Map<string, NonNullable<typeof plan>["resourceAssignments"]>();
  for (const assignment of plan?.resourceAssignments ?? []) {
    const assignments = assignmentsByUnit.get(assignment.unitId) ?? [];
    assignments.push(assignment);
    assignmentsByUnit.set(assignment.unitId, assignments);
  }
  const evidenceProperties = evidence(result, selectedMinute, "Simulated", "Estimated", "Simulated");
  return collection(scenario.assets.responders.map((unit): Feature<Point, AdaptedResourceProperties> => {
    const assignments = [...(assignmentsByUnit.get(unit.id) ?? [])]
      .sort((a, b) => a.dispatchMinute - b.dispatchMinute);
    const active = assignments.find((assignment) =>
      selectedMinute >= assignment.dispatchMinute && selectedMinute <= assignment.estimatedArrivalMinute) ??
      [...assignments].reverse().find((assignment) => selectedMinute > assignment.estimatedArrivalMinute) ??
      assignments[0];
    const route = active ? routeById.get(active.routeId) : undefined;
    let position = nodeById.get(unit.homeNodeId)?.coordinate ?? scenario.hazardSource;
    let status = assignments.length === 0 ? "available" : "staged";
    if (active && route) {
      if (selectedMinute < active.dispatchMinute) {
        status = "staged";
      } else if (selectedMinute >= active.estimatedArrivalMinute) {
        position = route.polyline.at(-1) ?? position;
        status = "arrived";
      } else {
        const duration = Math.max(0.1, active.estimatedArrivalMinute - active.dispatchMinute);
        position = interpolateRoute(route, (selectedMinute - active.dispatchMinute) / duration);
        status = "en-route";
      }
    }
    return {
      type: "Feature",
      id: unit.id,
      geometry: { type: "Point", coordinates: coordinate(position) },
      properties: {
        ...evidenceProperties,
        resourceId: unit.id,
        name: unit.name,
        kind: unit.type,
        status,
        available: status === "available" || status === "staged" ? 1 : 0,
        capacity: unit.seats,
        crew: unit.crew,
        capabilities: unit.capabilities.join(", "),
        assignmentRole: active?.role,
        stageId: active?.stageId,
        routeId: active?.routeId,
        dispatchMinute: active?.dispatchMinute,
        estimatedArrivalMinute: active?.estimatedArrivalMinute,
      },
    };
  }));
}

function facilityStatusAtMinute(
  result: SimulationResult,
  facilityCoordinate: Coordinate,
  peakImpact: FacilityImpact | undefined,
  selectedMinute: number,
): string {
  const sample = sampleAt(nearestSeries(result, facilityCoordinate), selectedMinute);
  const risk = sampleRisk(sample);
  if (risk >= 0.8 || (peakImpact?.status === "unavailable" && selectedMinute >= peakImpact.peakMinute - 10)) {
    return "unavailable";
  }
  if (risk >= 0.42 || peakImpact?.accessStatus === "restricted" || peakImpact?.accessStatus === "closed") {
    return "degraded";
  }
  return "operational";
}

function facilityLayers(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  selectedMinute: number,
  plan: EvacuationPlan | undefined,
): {
  hospitals: FeatureCollection<Point, AdaptedHospitalProperties>;
  shelters: FeatureCollection<Point, AdaptedShelterProperties>;
} {
  const hospitalImpact = new Map(result.impacts.hospitals.map((impact) => [impact.facilityId, impact]));
  const shelterImpact = new Map(result.impacts.shelters.map((impact) => [impact.facilityId, impact]));
  const shelterAllocation = new Map(plan?.shelterAllocations.map((allocation) => [allocation.facilityId, allocation]) ?? []);
  const evidenceProperties = evidence(
    result,
    selectedMinute,
    "Simulated",
    scenarioAssetGeometryEvidence(scenario),
    "Simulated",
  );
  const hospitals = scenario.assets.facilities
    .filter((facility) => facility.type === "hospital")
    .map((facility): Feature<Point, AdaptedHospitalProperties> => {
      const impact = hospitalImpact.get(facility.id);
      return {
        type: "Feature",
        id: facility.id,
        geometry: { type: "Point", coordinates: coordinate(facility.coordinate) },
        properties: {
          ...evidenceProperties,
          facilityId: facility.id,
          name: facility.name,
          status: facilityStatusAtMinute(result, facility.coordinate, impact, selectedMinute),
          bedsAvailable: Math.max(0, facility.capacity - (impact?.projectedOccupancy ?? facility.baselineOccupancy)),
          traumaLevel: "prototype emergency facility",
          capacity: facility.capacity,
          projectedOccupancy: impact?.projectedOccupancy,
          accessStatus: impact?.accessStatus,
          overloadMinute: impact?.overloadMinute,
          backupHours: facility.backupHours,
          confidence: impact?.confidence.score,
          explanation: impact?.explanation.join(" "),
        },
      };
    });
  const shelters = scenario.assets.facilities
    .filter((facility) => facility.type === "shelter")
    .map((facility): Feature<Point, AdaptedShelterProperties> => {
      const impact = shelterImpact.get(facility.id);
      const allocation = shelterAllocation.get(facility.id);
      return {
        type: "Feature",
        id: facility.id,
        geometry: { type: "Point", coordinates: coordinate(facility.coordinate) },
        properties: {
          ...evidenceProperties,
          facilityId: facility.id,
          name: facility.name,
          status: facilityStatusAtMinute(result, facility.coordinate, impact, selectedMinute),
          capacity: facility.capacity,
          occupancy: allocation
            ? allocation.baselineOccupancy + allocation.assignedEvacuees
            : impact?.projectedOccupancy ?? facility.baselineOccupancy,
          assignedEvacuees: allocation?.assignedEvacuees ?? 0,
          remainingCapacity: allocation?.remainingCapacity ?? Math.max(0, facility.capacity - facility.baselineOccupancy),
          utilizationPct: allocation?.utilizationPct,
          accessStatus: impact?.accessStatus,
          backupHours: facility.backupHours,
          confidence: impact?.confidence.score,
          explanation: impact?.explanation.join(" "),
        },
      };
    });
  return { hospitals: collection(hospitals), shelters: collection(shelters) };
}

function impactLayer(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  selectedMinute: number,
  options: Required<AegisMapAdapterOptions>,
): FeatureCollection<Polygon, AdaptedImpactProperties> {
  const features: Array<Feature<Polygon, AdaptedImpactProperties>> = [];
  const simulatedEvidence = evidence(result, selectedMinute, "Simulated", "Simulated", "Simulated");
  for (const series of result.field) {
    const sample = sampleAt(series, selectedMinute);
    const risk = sampleRisk(sample);
    if (!options.includeNegligibleCells && risk < options.minimumImpactRisk) continue;
    features.push({
      type: "Feature",
      id: `impact-${series.cell.id}-${selectedMinute}`,
      geometry: cellPolygon(series.cell, scenario),
      properties: {
        ...simulatedEvidence,
        cellId: series.cell.id,
        name: `${result.hazard} impact cell ${series.cell.row + 1}/${series.cell.column + 1}`,
        impactType: result.hazard,
        severity: severity(risk),
        damageIndex: round(risk, 3),
        hazardRisk: round(risk, 3),
        confidence: series.confidence.score,
        confidenceBand: series.confidence.band,
        displayExtrusion: "0–18 m risk visualization; not a physical damage height",
        arrivalMinute: series.arrivalMinute,
        peakMinute: series.peakMinute,
        recessionMinute: series.recessionMinute,
        ...sampleProperties(sample),
      },
    });
  }

  const populationImpact = new Map(result.impacts.population.map((impact) => [impact.zoneId, impact]));
  const estimatedEvidence = evidence(result, selectedMinute, "Simulated", "Estimated", "Simulated");
  for (const zone of scenario.assets.populationZones) {
    const impact = populationImpact.get(zone.id);
    if (!impact || impact.exposureFraction < options.minimumImpactRisk) continue;
    features.push({
      type: "Feature",
      id: `population-impact-${zone.id}`,
      geometry: squareAround(zone.center, 170 + Math.sqrt(zone.population) * 2.5),
      properties: {
        ...estimatedEvidence,
        zoneId: zone.id,
        name: zone.name,
        impactType: `${result.hazard}-population`,
        severity: severity(impact.evacuationPriority),
        damageIndex: impact.exposureFraction,
        population: zone.population,
        peopleExposed: impact.peopleExposed,
        assistanceEstimate: impact.mobilityAssistanceEstimate,
        evacuationPriority: impact.evacuationPriority,
        isolationRisk: impact.isolationRisk,
        confidence: impact.confidence.score,
        explanation: impact.explanation.join(" "),
      },
    });
  }
  return collection(features);
}

function impactProperties(
  result: SimulationResult,
  asset: ImpactAssetSnapshot,
): ImpactAssetLayerProperties {
  return {
    ...evidence(
      result,
      asset.minute,
      "Simulated",
      evidenceClassLabel(asset.evidence.geometryClassification),
      "Simulated",
    ),
    entityId: asset.entityId,
    entityKind: asset.entityKind,
    name: asset.name,
    severity: asset.severity,
    damageState: asset.damageState,
    damageIndex: asset.damageIndex,
    impactIndex: asset.impactIndex,
    functionalityPct: asset.functionalityPct,
    operationalStatus: asset.operationalStatus,
    accessStatus: asset.accessStatus,
    pedestrianPassable: asset.modePassability?.pedestrian,
    carPassable: asset.modePassability?.car,
    busPassable: asset.modePassability?.bus,
    ambulancePassable: asset.modePassability?.ambulance,
    heavyRescuePassable: asset.modePassability?.heavy_rescue,
    isolated: asset.isolated,
    peopleWithinExposureEnvelope: asset.peopleWithinExposureEnvelope,
    mobilityAssistanceEstimate: asset.mobilityAssistanceEstimate,
    dependentPopulationEstimate: asset.dependentPopulationEstimate,
    recoveryPriorityScore: asset.recovery.score,
    recoveryPriorityBand: asset.recovery.band,
    inspectionRequired: asset.recovery.inspectionRequired,
    earliestHazardClearMinute: asset.recovery.earliestHazardClearMinute,
    hazardMetric: asset.hazard.metric,
    hazardValue: asset.hazard.value,
    hazardUnit: asset.hazard.unit,
    floodDepthM: asset.hazard.floodDepthM,
    floodVelocityMps: asset.hazard.floodVelocityMps,
    explanation: asset.explanation.join(" "),
  };
}

function consequenceLayers(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  snapshot: ImpactSnapshotBundle,
  plan: EvacuationPlan | undefined,
  options: Required<AegisMapAdapterOptions>,
): Pick<
  AegisImpactMapLayers,
  | "damagedBuildings"
  | "impactedRoads"
  | "impactedBridges"
  | "criticalFacilities"
  | "utilityImpacts"
  | "populationImpacts"
  | "responseCoverageZones"
  | "recoveryPriorities"
> {
  const buildingById = new Map(scenario.assets.buildings.map((building) => [building.id, building]));
  const roadById = new Map(scenario.assets.roads.map((road) => [road.id, road]));
  const zoneById = new Map(scenario.assets.populationZones.map((zone) => [zone.id, zone]));
  const stageByZone = new Map(
    (plan?.stages ?? [])
      .slice()
      .sort((a, b) => b.populationAssigned - a.populationAssigned)
      .map((stage) => [stage.zoneId, stage]),
  );

  const damagedBuildings = collection(snapshot.buildings.flatMap((asset) => {
    if (!options.includeNegligibleCells && asset.impactIndex < options.minimumImpactRisk) return [];
    const source = buildingById.get(asset.entityId);
    const radiusM = 10 + Math.min(22, (source?.floors ?? 1) * 2.4);
    const importedFootprint = polygonFromFootprint(source?.footprint);
    const buildingHeightM = source?.heightM ?? (source?.floors ?? 1) * 3.2;
    const waterlineHeightM = asset.hazard.floodDepthM;
    const affectedFloorEstimate = asset.internalFloodDepthM === undefined
      ? undefined
      : Math.min(source?.floors ?? 1, Math.ceil(asset.internalFloodDepthM / 3.2));
    const baseProperties = impactProperties(result, asset);
    return [{
      type: "Feature" as const,
      id: asset.id,
      geometry: importedFootprint ?? squareAround(asset.coordinate, radiusM),
      properties: {
        ...baseProperties,
        geometryEvidenceClass: importedFootprint
          ? baseProperties.geometryEvidenceClass
          : "Estimated" as const,
        Observed: importedFootprint ? baseProperties.Observed : false,
        Imported: importedFootprint ? baseProperties.Imported : false,
        Estimated: importedFootprint ? baseProperties.Estimated : true,
        Simulated: true,
        displayGeometry: importedFootprint
          ? "Scenario source footprint; consequence state remains simulated."
          : "Centroid-derived selection footprint; join entityId to a provider footprint or 3D tile for display accuracy.",
        buildingUse: source?.use,
        floors: source?.floors,
        buildingHeightM: round(buildingHeightM, 2),
        heightEvidenceClass: source?.heightEvidenceClassification
          ? evidenceClassLabel(source.heightEvidenceClassification)
          : "Estimated",
        waterlineHeightM,
        internalFloodDepthM: asset.internalFloodDepthM,
        affectedFloorEstimate,
        sourceFeatureId: source?.sourceFeatureId,
      },
    }];
  }));

  const impactedRoads = collection(snapshot.roads.flatMap((asset) => {
    if (!options.includeNegligibleCells && asset.impactIndex < options.minimumImpactRisk) return [];
    const source = roadById.get(asset.entityId);
    if (!source || source.geometry.length < 2) return [];
    return [{
      type: "Feature" as const,
      id: asset.id,
      geometry: { type: "LineString" as const, coordinates: source.geometry.map(coordinate) },
      properties: impactProperties(result, asset),
    }];
  }));

  const impactedBridges = collection(snapshot.bridges
    .filter((asset) => options.includeNegligibleCells || asset.impactIndex >= options.minimumImpactRisk)
    .map((asset): Feature<Point, ImpactAssetLayerProperties> => ({
      type: "Feature",
      id: asset.id,
      geometry: { type: "Point", coordinates: coordinate(asset.coordinate) },
      properties: impactProperties(result, asset),
    })));

  const criticalFacilities = collection(snapshot.criticalFacilities.map((asset): Feature<Point, ImpactAssetLayerProperties> => ({
    type: "Feature",
    id: asset.id,
    geometry: { type: "Point", coordinates: coordinate(asset.coordinate) },
    properties: impactProperties(result, asset),
  })));

  const utilityImpacts = collection(snapshot.utilities.map((asset): Feature<Point, ImpactAssetLayerProperties> => ({
    type: "Feature",
    id: asset.id,
    geometry: { type: "Point", coordinates: coordinate(asset.coordinate) },
    properties: impactProperties(result, asset),
  })));

  const populationImpacts = collection(snapshot.populationZones.flatMap((asset) => {
    if (!options.includeNegligibleCells && asset.impactIndex < options.minimumImpactRisk) return [];
    const source = zoneById.get(asset.entityId);
    const radiusM = 140 + Math.sqrt(source?.population ?? 0) * 2.5;
    return [{
      type: "Feature" as const,
      id: asset.id,
      geometry: squareAround(asset.coordinate, radiusM),
      properties: {
        ...impactProperties(result, asset),
        geometryEvidenceClass: "Estimated" as const,
        Observed: false,
        Imported: false,
        Estimated: true,
        Simulated: true,
        displayGeometry: "Population-zone display envelope around an aggregate scenario centroid.",
      },
    }];
  }));

  const responseCoverageZones = collection(snapshot.populationZones.map((asset): Feature<Polygon, ImpactAssetLayerProperties> => {
    const source = zoneById.get(asset.entityId);
    const stage = stageByZone.get(asset.entityId);
    const radiusM = 150 + Math.sqrt(source?.population ?? 0) * 2.6;
    return {
      type: "Feature",
      id: `coverage-${asset.entityId}-${snapshot.selectedMinute}`,
      geometry: squareAround(asset.coordinate, radiusM),
      properties: {
        ...impactProperties(result, asset),
        geometryEvidenceClass: "Estimated",
        Observed: false,
        Imported: false,
        Estimated: true,
        Simulated: true,
        displayGeometry: "Planning coverage envelope; not an administrative or surveyed boundary.",
        evacuationStatus: stage?.status ?? "not-planned",
        assignedPopulation: stage?.populationAssigned ?? 0,
        departureStartMinute: stage?.departureWindow.startMinute,
        departureEndMinute: stage?.departureWindow.endMinute,
        routeId: stage?.routeId,
      },
    };
  }));

  const allAssets = [
    ...snapshot.buildings,
    ...snapshot.roads,
    ...snapshot.bridges,
    ...snapshot.criticalFacilities,
    ...snapshot.utilities,
    ...snapshot.populationZones,
  ];
  const recoveryById = new Map(allAssets.map((asset) => [asset.entityId, asset]));
  const recoveryPriorities = collection(snapshot.summary.topRecoveryPriorities.flatMap((priority, index) => {
    const asset = recoveryById.get(priority.entityId);
    if (!asset) return [];
    return [{
      type: "Feature" as const,
      id: `recovery-${asset.entityId}-${snapshot.selectedMinute}`,
      geometry: { type: "Point" as const, coordinates: coordinate(asset.coordinate) },
      properties: { ...impactProperties(result, asset), rank: index + 1 },
    }];
  }));

  return {
    damagedBuildings,
    impactedRoads,
    impactedBridges,
    criticalFacilities,
    utilityImpacts,
    populationImpacts,
    responseCoverageZones,
    recoveryPriorities,
  };
}

/**
 * Converts one deterministic simulation snapshot and optional evacuation plan
 * into the complete GeoJSON layer contract consumed by AegisMap.
 *
 * Intended React usage:
 * `useMemo(() => buildAegisMapLayers({ scenario, result, selectedMinute, evacuationPlan }),
 *   [scenario, result, selectedMinute, evacuationPlan])`
 */
export function buildAegisMapLayers({
  scenario,
  result,
  selectedMinute: requestedMinute,
  evacuationPlan,
  impactSnapshot: suppliedImpactSnapshot,
  options: suppliedOptions,
}: AegisMapAdapterInput): AegisImpactMapLayers {
  if (scenario.metadata.id !== result.scenarioId) {
    throw new Error("Map adapter scenario and simulation result do not match.");
  }
  if (evacuationPlan && evacuationPlan.simulationRunId !== result.runId) {
    throw new Error("Map adapter evacuation plan belongs to a different simulation run.");
  }
  if (result.field.length === 0 || result.timeline.length === 0) {
    throw new Error("Map adapter requires a non-empty simulation field and timeline.");
  }
  const selectedMinute = nearestMinute(result, requestedMinute);
  if (suppliedImpactSnapshot && (
    suppliedImpactSnapshot.scenarioId !== scenario.metadata.id ||
    suppliedImpactSnapshot.simulationRunId !== result.runId ||
    suppliedImpactSnapshot.selectedMinute !== selectedMinute
  )) {
    throw new Error("Precomputed impact snapshot does not match the requested scenario, run and minute.");
  }
  const options: Required<AegisMapAdapterOptions> = {
    minimumImpactRisk: suppliedOptions?.minimumImpactRisk ?? 0.08,
    minimumFloodDepthM: suppliedOptions?.minimumFloodDepthM ?? 0.015,
    minimumFlowVelocityMps: suppliedOptions?.minimumFlowVelocityMps ?? 0.03,
    includeNegligibleCells: suppliedOptions?.includeNegligibleCells ?? false,
  };
  const flood = floodLayers(scenario, result, selectedMinute, options);
  const hazardVisuals = hazardVisualLayers(scenario, result, selectedMinute, options);
  const roads = roadLayer(scenario, result, selectedMinute);
  const facilities = facilityLayers(scenario, result, selectedMinute, evacuationPlan);
  const impactSnapshot = suppliedImpactSnapshot ?? buildImpactSnapshot({
    scenario,
    result,
    selectedMinute,
    evacuationPlan,
  });
  const consequences = consequenceLayers(
    scenario,
    result,
    impactSnapshot,
    evacuationPlan,
    options,
  );
  return {
    floodDepth: flood.depth,
    floodFlow: flood.flow,
    hazardFootprints: hazardVisuals.footprints,
    hazardVectors: hazardVisuals.vectors,
    roads,
    evacuationRoutes: routeLayer(
      scenario,
      result,
      selectedMinute,
      evacuationPlan,
    ),
    resources: resourceLayer(scenario, result, selectedMinute, evacuationPlan),
    hospitals: facilities.hospitals,
    shelters: facilities.shelters,
    impactZones: impactLayer(scenario, result, selectedMinute, options),
    ...consequences,
    impactSnapshot,
  };
}
