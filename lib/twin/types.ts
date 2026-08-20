import type {
  Coordinate,
  EvacuationPlan,
  FacilityAsset,
  HazardKind,
  ScenarioDefinition,
  SimulationResult,
} from "../domain/types";

export type TwinEvidenceClass =
  | "OBSERVED"
  | "IMPORTED"
  | "ESTIMATED"
  | "SIMULATED";

export interface TwinProvenance {
  classification: TwinEvidenceClass;
  sourceId: string;
  sourceLabel: string;
  sourceUrl?: string;
  observedAtIso?: string;
  license?: string;
  note: string;
}

export interface TwinPolygonGeometry {
  type: "Polygon";
  /** GeoJSON coordinate order: longitude, latitude. First ring is exterior. */
  coordinates: Array<Array<[longitude: number, latitude: number]>>;
}

export interface TwinLineGeometry {
  type: "LineString";
  /** GeoJSON coordinate order: longitude, latitude. */
  coordinates: Array<[longitude: number, latitude: number]>;
}

export interface TwinPointGeometry {
  type: "Point";
  /** GeoJSON coordinate order: longitude, latitude. */
  coordinates: [longitude: number, latitude: number];
}

export interface TwinBuildingDefinition {
  id: string;
  name: string;
  function:
    | "academic"
    | "administration"
    | "laboratory"
    | "library"
    | "auditorium"
    | "workshop"
    | "hostel"
    | "dining"
    | "sports"
    | "utility"
    | "unknown";
  footprint: TwinPolygonGeometry;
  centroid: Coordinate;
  baseElevationM: number;
  heightM: number;
  floors: number;
  floorHeightM: number;
  plinthHeightM: number;
  roofStyle: "flat" | "sawtooth" | "barrel";
  vulnerability: number;
  daytimeOccupancyEstimate: number;
  nighttimeOccupancyEstimate: number;
  facadeTone: string;
  /** Geometry evidence. Kept as `provenance` for backwards compatibility. */
  provenance: TwinProvenance;
  /** Attribute evidence can differ from the imported footprint evidence. */
  attributeProvenance?: TwinProvenance;
  footprintAreaM2?: number;
  dataConfidence?: {
    geometry01: number;
    height01: number;
    occupancy01: number;
  };
}

export interface TwinTerrainControlPoint {
  id: string;
  coordinate: Coordinate;
  elevationM: number;
  roughness: number;
  drainageIndex: number;
  provenance: TwinProvenance;
}

export interface TwinCampusLandmark {
  id: string;
  name: string;
  kind: "gate" | "assembly-area" | "sports-field" | "water-body";
  geometry: TwinPointGeometry | TwinPolygonGeometry;
  provenance: TwinProvenance;
}

export interface TwinCampusDataset {
  id: string;
  version: string;
  label: string;
  center: Coordinate;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  buildings: TwinBuildingDefinition[];
  terrainControlPoints: TwinTerrainControlPoint[];
  landmarks: TwinCampusLandmark[];
  provenance: TwinProvenance[];
  prototypeLabel: string;
  disclaimer: string;
}

export interface TwinFloodExtentPolygon {
  id: string;
  minimumDepthM: number;
  geometry: TwinPolygonGeometry;
  surfaceElevationM: number;
  provenance: TwinProvenance;
}

export interface TwinFloodContour {
  id: string;
  depthM: number;
  geometry: TwinLineGeometry;
  provenance: TwinProvenance;
}

export interface TwinFloodSurface {
  minute: number;
  lowerFrameMinute: number;
  upperFrameMinute: number;
  interpolationFraction: number;
  renderMode: "continuous-interpolated-surface";
  gridVisible: false;
  maximumDepthM: number;
  meanWetDepthM: number;
  affectedAreaSqKm: number;
  extentPolygons: TwinFloodExtentPolygon[];
  contours: TwinFloodContour[];
  contourDepthsM: number[];
  provenance: TwinProvenance;
}

export interface TwinFloorImpact {
  floor: number;
  elevationAboveGroundM: number;
  waterDepthM: number;
  status: "dry" | "affected" | "isolated";
  safeRefugeCandidate: boolean;
}

export interface TwinBuildingImpactState {
  buildingId: string;
  buildingName: string;
  currentExternalDepthM: number;
  currentInternalDepthM: number;
  peakExternalDepthM: number;
  peakInternalDepthM: number;
  arrivalMinute: number | null;
  peakMinute: number;
  recessionMinute: number | null;
  damageIndex: number;
  damageBand: "none" | "minor" | "moderate" | "severe" | "critical";
  accessStatus: "open" | "restricted" | "closed";
  nearestAccessRoadId: string | null;
  floorsAffected: number;
  floorImpacts: TwinFloorImpact[];
  occupantsInExposureEnvelope: number;
  populationImpactBand?: "none" | "limited" | "elevated" | "high" | "critical";
  utilityStatus?: "normal" | "at-risk" | "degraded" | "unavailable" | "unknown";
  recoveryEstimateHours?: number;
  confidence01?: number;
  recommendedAction: string;
  explanation: string[];
  geometryProvenance: TwinProvenance;
  impactProvenance: TwinProvenance;
}

export type TwinImpactLayerKind =
  | "damage"
  | "population"
  | "utility"
  | "recovery"
  | "confidence"
  | "safe"
  | "unavailable"
  | "warning";

export interface TwinImpactLayerFeature {
  id: string;
  kind: TwinImpactLayerKind;
  geometry: TwinPolygonGeometry;
  status: string;
  severity: "low" | "moderate" | "high" | "critical";
  value: number;
  unit: string;
  label: string;
  evidenceClass: TwinEvidenceClass;
  confidence01: number;
  provenance: TwinProvenance;
}

export interface TwinImpactLayers {
  damage: TwinImpactLayerFeature[];
  population: TwinImpactLayerFeature[];
  utility: TwinImpactLayerFeature[];
  recovery: TwinImpactLayerFeature[];
  confidence: TwinImpactLayerFeature[];
  safe: TwinImpactLayerFeature[];
  unavailable: TwinImpactLayerFeature[];
  warning: TwinImpactLayerFeature[];
}

export interface TwinAgentAnimation {
  path: Coordinate[];
  startMinute: number;
  endMinute: number;
  easing: "linear-distance";
  loop: false;
}

export interface TwinEvacuationAgent {
  id: string;
  kind:
    | "evacuation-group"
    | "bus"
    | "ambulance"
    | "rescue"
    | "medical"
    | "traffic";
  label: string;
  modelKey: string;
  coordinate: Coordinate;
  headingDeg: number;
  altitudeM: number;
  status: "queued" | "staged" | "en-route" | "arrived" | "unassigned";
  progress: number;
  routeId?: string;
  stageId?: string;
  representedPeople: number;
  animation?: TwinAgentAnimation;
  provenance: TwinProvenance;
}

export interface TwinEvacuationRouteState {
  id: string;
  geometry: TwinLineGeometry;
  status: "recommended" | "alternate" | "contingency";
  riskScore: number;
  reliability: number;
  etaMinutes: number;
  assignedPopulation: number;
  provenance: TwinProvenance;
}

export interface TwinCriticalFacilityState {
  id: string;
  name: string;
  type: FacilityAsset["type"];
  coordinate: Coordinate;
  status: string;
  accessStatus: string;
  capacity: number;
  projectedOccupancy: number;
  provenance: TwinProvenance;
}

export interface TwinGlobeMetadata {
  crs: "EPSG:4326";
  projection: "globe";
  worldMapEnabled: true;
  center: Coordinate;
  overviewCamera: {
    center: Coordinate;
    altitudeM: number;
    pitchDeg: number;
    bearingDeg: number;
  };
  campusCamera: {
    center: Coordinate;
    altitudeM: number;
    pitchDeg: number;
    bearingDeg: number;
  };
  flyToDurationMs: number;
}

export interface TwinLodMetadata {
  profile: "laptop-balanced" | "high-fidelity" | "mobile-efficient";
  buildingLodDistancesM: [high: number, medium: number, low: number];
  maximumAnimatedAgents: number;
  terrainVerticalExaggeration: number;
  floodSurfaceResolution: number;
}

export interface TwinSceneMetadata {
  id: string;
  version: string;
  title: string;
  hazard: HazardKind;
  selectedMinute: number;
  timeRangeMinutes: [number, number];
  prototypeLabel: string;
  disclaimer: string;
  globe: TwinGlobeMetadata;
  lod: TwinLodMetadata;
  provenance: TwinProvenance[];
}

export interface TwinScene {
  metadata: TwinSceneMetadata;
  campus: TwinCampusDataset;
  terrain: {
    controlPoints: TwinTerrainControlPoint[];
    interpolation: "smooth-bicubic-ready";
    verticalExaggeration: number;
    provenance: TwinProvenance;
  };
  flood: TwinFloodSurface;
  buildings: TwinBuildingImpactState[];
  evacuation: {
    planId: string | null;
    agents: TwinEvacuationAgent[];
    routes: TwinEvacuationRouteState[];
    provenance: TwinProvenance;
  };
  criticalFacilities: TwinCriticalFacilityState[];
  /** Optional in older scenes; generated for all new scenes. */
  impactLayers?: TwinImpactLayers;
  timeline: Array<{
    minute: number;
    severity: string;
    maximumDepthM: number;
    exposedPopulation: number;
    unavailableRoads: number;
  }>;
}

export interface TwinSceneOptions {
  /** Interpolation samples per source-cell interval. Defaults to 4; range 2–8. */
  surfaceResolution?: number;
  /** Flood contour depths. Defaults to 0.05, 0.15, 0.3, 0.6, 1 and 1.5 m. */
  contourDepthsM?: number[];
  /** Maximum representative evacuation groups and vehicles. Defaults to 72. */
  maximumAnimatedAgents?: number;
  /** Defaults to 1.35 for legible laptop presentation. */
  terrainVerticalExaggeration?: number;
  lodProfile?: TwinLodMetadata["profile"];
}

export interface BuildTwinSceneInput {
  scenario: ScenarioDefinition;
  result: SimulationResult;
  selectedMinute: number;
  evacuationPlan?: EvacuationPlan;
  campusDataset?: TwinCampusDataset;
  options?: TwinSceneOptions;
}
