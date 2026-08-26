import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import type { TwinScene } from "../../lib/twin";

/** Coordinates always use GeoJSON order: longitude, then latitude. */
export type AegisCoordinate = [longitude: number, latitude: number];

export type AegisSeverity = "low" | "moderate" | "high" | "critical";

export type AegisMapViewMode = "world" | "twin";

export type AegisMapTool =
  | "inspect"
  | "origin"
  | "destination"
  | "hazard-source"
  | "area";

export type AegisMapLayerKey =
  | "floodDepth"
  | "floodFlow"
  | "roads"
  | "evacuationRoutes"
  | "resources"
  | "hospitals"
  | "shelters"
  | "impactZones"
  | "damage"
  | "populationImpact"
  | "utilityImpact"
  | "recovery"
  | "confidence"
  | "safeZones"
  | "unavailableZones"
  | "warnings"
  | "damagedBuildings"
  | "impactedRoads"
  | "impactedBridges"
  | "criticalFacilities"
  | "utilityImpacts"
  | "populationImpacts"
  | "responseCoverageZones"
  | "recoveryPriorities"
  | "incidents";

export interface AegisIncident {
  id: string;
  title: string;
  type: string;
  severity: AegisSeverity;
  coordinates: AegisCoordinate;
  /** True only for a currently active record retrieved from a live upstream feed. */
  live?: boolean;
  status?: string;
  occurredAt?: string;
  description?: string;
  source?: string;
}

export interface FloodDepthProperties {
  depthM?: number;
  depth?: number;
  velocityMps?: number;
  arrivalMinutes?: number;
  riskLevel?: string;
  [key: string]: unknown;
}

export interface FloodFlowProperties {
  velocityMps?: number;
  velocity?: number;
  directionDegrees?: number;
  [key: string]: unknown;
}

export interface OperationalRoadProperties {
  name?: string;
  status?: "open" | "restricted" | "closed" | string;
  depthM?: number;
  passable?: boolean;
  [key: string]: unknown;
}

export interface EvacuationRouteProperties {
  name?: string;
  status?: "safe" | "warning" | "blocked" | string;
  routeType?: string;
  etaMinutes?: number;
  distanceKm?: number;
  [key: string]: unknown;
}

export interface ResourceProperties {
  name?: string;
  kind?: string;
  status?: string;
  available?: number;
  capacity?: number;
  [key: string]: unknown;
}

export interface HospitalProperties {
  name?: string;
  status?: string;
  bedsAvailable?: number;
  traumaLevel?: string;
  [key: string]: unknown;
}

export interface ShelterProperties {
  name?: string;
  status?: string;
  capacity?: number;
  occupancy?: number;
  [key: string]: unknown;
}

export interface ImpactZoneProperties {
  name?: string;
  impactType?: string;
  severity?: AegisSeverity | number | string;
  damageIndex?: number;
  [key: string]: unknown;
}

/**
 * A deterministic, time-selected visual primitive for the active hazard.
 * These properties describe a renderer effect only; `classification` and
 * `evidenceClass` deliberately prevent the geometry being mistaken for an
 * observed incident perimeter or an engineering model output.
 */
export interface HazardFootprintProperties extends ImpactZoneProperties {
  hazard: "flood" | "earthquake" | "wildfire" | "cyclone" | "chemical";
  visualRole:
    | "flood-extent"
    | "flood-deep-water"
    | "earthquake-isoseismal"
    | "wildfire-active-perimeter"
    | "wildfire-smoke-envelope"
    | "cyclone-wind-field"
    | "cyclone-surface-water"
    | "chemical-plume"
    | "chemical-threshold-zone";
  classification: "SIMULATED";
  evidenceClass: "Simulated";
  selectedMinute: number;
  phase: string;
  intensity01: number;
  animationProgress01: number;
  metric: string;
  value: number;
  unit: string;
  directionDegrees?: number;
  innerRadiusM?: number;
  outerRadiusM?: number;
  displayLabel: string;
  displayNote: string;
  [key: string]: unknown;
}

/** Direction/track companion to `HazardFootprintProperties`. */
export interface HazardVectorProperties {
  hazard: HazardFootprintProperties["hazard"];
  visualRole:
    | "flood-net-flow"
    | "earthquake-pulse-outline"
    | "wildfire-spread-axis"
    | "cyclone-track"
    | "chemical-plume-axis";
  classification: "SIMULATED";
  evidenceClass: "Simulated";
  selectedMinute: number;
  phase: string;
  intensity01: number;
  animationProgress01: number;
  metric: string;
  value: number;
  unit: string;
  directionDegrees?: number;
  displayLabel: string;
  displayNote: string;
  [key: string]: unknown;
}

export interface OperationalImpactProperties extends ImpactZoneProperties {
  status?: string;
  value?: number;
  unit?: string;
  label?: string;
  peopleExposed?: number;
  utilityStatus?: string;
  recoveryHours?: number;
  confidence01?: number;
  impactIndex?: number;
  operationalStatus?: string;
  peopleWithinExposureEnvelope?: number | null;
  recoveryPriorityScore?: number;
  recoveryPriorityBand?: string;
  rank?: number;
  evacuationStatus?: string;
  buildingHeightM?: number;
  waterlineHeightM?: number;
  evidenceClass?: "OBSERVED" | "IMPORTED" | "ESTIMATED" | "SIMULATED" | string;
}

/** Structural subset shared with the simulation adapter's richer consequence properties. */
export interface SimulationImpactProperties {
  entityId?: string;
  entityKind?: string;
  name?: string;
  status?: string;
  severity?: AegisSeverity | string;
  damageState?: string;
  damageIndex?: number | null;
  impactIndex?: number;
  functionalityPct?: number;
  operationalStatus?: string;
  accessStatus?: string | null;
  peopleWithinExposureEnvelope?: number | null;
  recoveryPriorityScore?: number;
  recoveryPriorityBand?: string;
  rank?: number;
  evacuationStatus?: string;
  buildingHeightM?: number;
  waterlineHeightM?: number;
  geometryEvidenceClass?: string;
  estimateLabel?: string;
}

export interface AegisMapLayers {
  floodDepth?: FeatureCollection<Polygon | MultiPolygon, FloodDepthProperties>;
  floodFlow?: FeatureCollection<LineString | MultiLineString, FloodFlowProperties>;
  roads?: FeatureCollection<LineString | MultiLineString, OperationalRoadProperties>;
  evacuationRoutes?: FeatureCollection<
    LineString | MultiLineString,
    EvacuationRouteProperties
  >;
  resources?: FeatureCollection<Point, ResourceProperties>;
  hospitals?: FeatureCollection<Point, HospitalProperties>;
  shelters?: FeatureCollection<Point, ShelterProperties>;
  impactZones?: FeatureCollection<Polygon | MultiPolygon, ImpactZoneProperties>;
  /** Hazard-specific animated shapes for the selected timeline minute. */
  hazardFootprints?: FeatureCollection<Polygon | MultiPolygon, HazardFootprintProperties>;
  /** Hazard-specific motion, spread or track vectors for the selected minute. */
  hazardVectors?: FeatureCollection<LineString | MultiLineString, HazardVectorProperties>;
  /** Semantic impact layers. Red damage, amber warnings, green safe and gray unavailable. */
  damage?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  populationImpact?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  utilityImpact?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  recovery?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  confidence?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  safeZones?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  unavailableZones?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  warnings?: FeatureCollection<Polygon | MultiPolygon, OperationalImpactProperties>;
  /** Exact consequence-layer keys emitted by the deterministic simulation adapter. */
  damagedBuildings?: FeatureCollection<Polygon | MultiPolygon, SimulationImpactProperties>;
  impactedRoads?: FeatureCollection<LineString | MultiLineString, SimulationImpactProperties>;
  impactedBridges?: FeatureCollection<Point, SimulationImpactProperties>;
  criticalFacilities?: FeatureCollection<Point, SimulationImpactProperties>;
  utilityImpacts?: FeatureCollection<Point, SimulationImpactProperties>;
  populationImpacts?: FeatureCollection<Polygon | MultiPolygon, SimulationImpactProperties>;
  responseCoverageZones?: FeatureCollection<Polygon | MultiPolygon, SimulationImpactProperties>;
  recoveryPriorities?: FeatureCollection<Point, SimulationImpactProperties>;
}

export interface AegisSelectionPoint {
  id: string;
  coordinates: AegisCoordinate;
  role: "origin" | "destination" | "hazard-source" | "waypoint";
  label?: string;
}

export interface AegisMapSelection {
  points: AegisSelectionPoint[];
  area?: Feature<Polygon, { name?: string }>;
}

export interface AegisFeatureInspection {
  id?: string | number;
  sourceId?: string;
  layerId?: string;
  geometryType: string;
  coordinate: AegisCoordinate;
  properties: Record<string, unknown>;
}

export interface AegisCamera {
  center: AegisCoordinate;
  zoom?: number;
  pitch?: number;
  bearing?: number;
}

export interface AegisFocusRequest extends AegisCamera {
  /** Change this value to replay a fly-to request with the same coordinates. */
  requestId?: string | number;
  durationMs?: number;
  label?: string;
}

export type AegisExternalOverlayKind =
  | "sensor"
  | "camera"
  | "command"
  | "warning"
  | "custom";

export interface AegisExternalOverlay {
  id: string;
  label: string;
  coordinates: AegisCoordinate;
  kind?: AegisExternalOverlayKind;
  status?: string;
  color?: string;
  draggable?: boolean;
  properties?: Record<string, string | number | boolean | null>;
}

export interface AegisOverlayMoveEvent {
  id: string;
  coordinates: AegisCoordinate;
  overlay: AegisExternalOverlay;
}

export interface AegisMapProps {
  layers?: AegisMapLayers;
  /** Preferred high-detail campus scene with dynamic water, buildings and evacuation state. */
  twinScene?: TwinScene;
  /** Show the bundled EIT OSM footprint subset and estimated height attributes. */
  showEstimatedCampusMassing?: boolean;
  incidents?: AegisIncident[];
  selection?: AegisMapSelection;
  onSelectionChange?: (selection: AegisMapSelection) => void;
  onFeatureInspect?: (inspection: AegisFeatureInspection | null) => void;
  /** Called when an individual incident marker is activated on the map. */
  onIncidentSelect?: (incident: AegisIncident) => void;
  /** Called for empty-ground clicks while Inspect is active in WORLD mode. */
  onLocationPick?: (coordinate: AegisCoordinate) => void;
  onMapReady?: () => void;
  viewMode?: AegisMapViewMode;
  defaultViewMode?: AegisMapViewMode;
  onViewModeChange?: (viewMode: AegisMapViewMode) => void;
  /** Set false when a parent command shell already provides WORLD/TWIN controls. */
  showViewModeControl?: boolean;
  focusRequest?: AegisFocusRequest;
  /**
   * Opt-in compatibility migration for map layers serialized by the pre-v2
   * EIT scaffold. Current simulation and search coordinates are already
   * georeferenced and must leave this disabled.
   */
  relocateLegacyEitGeometry?: boolean;
  initialCamera?: AegisCamera;
  /** Starts on the globe and performs the cinematic EIT Faridabad approach. */
  autoFlyToEit?: boolean;
  /** Slowly rotates the idle world globe. Defaults to true. */
  autoRotateGlobe?: boolean;
  /** Degrees of longitude per second while idle. Defaults to a clearly visible 1.35. */
  autoRotateSpeedDegPerSecond?: number;
  /** Delay after interaction before idle rotation resumes. Defaults to 1500 ms. */
  globeIdleResumeMs?: number;
  hazardType?: string;
  defaultTool?: AegisMapTool;
  initialLayerVisibility?: Partial<Record<AegisMapLayerKey, boolean>>;
  externalOverlays?: AegisExternalOverlay[];
  onOverlayMove?: (event: AegisOverlayMoveEvent) => void;
  /** Visual-only multiplier for the water volume. Defaults to 12. */
  waterVerticalExaggeration?: number;
  /** Enables the no-key MapLibre raster DEM when available. Defaults to true. */
  enableTerrain?: boolean;
  /** Defaults to OpenFreeMap's no-key dark style. */
  mapStyleUrl?: string;
  /** Useful for demos and connectivity testing. */
  forceOffline?: boolean;
  /** Offline viewport as [[west, south], [east, north]]. */
  offlineBounds?: [southWest: AegisCoordinate, northEast: AegisCoordinate];
  className?: string;
  ariaLabel?: string;
}
