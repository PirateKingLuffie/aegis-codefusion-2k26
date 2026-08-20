export type HazardKind =
  | "flood"
  | "earthquake"
  | "wildfire"
  | "cyclone"
  | "chemical";

export type FutureHazardKind =
  | "tsunami"
  | "landslide"
  | "heatwave"
  | "dam-break"
  | "urban-fire"
  | "pandemic-logistics";

export type Severity = "minimal" | "minor" | "moderate" | "major" | "extreme";
export type ConfidenceBand = "low" | "medium" | "high";
export type OperationalStatus =
  | "operational"
  | "degraded"
  | "unavailable"
  | "evacuated"
  | "unknown";
export type RoadStatus = "open" | "advisory" | "restricted" | "closed";
export type TravelMode =
  | "pedestrian"
  | "car"
  | "bus"
  | "ambulance"
  | "heavy_rescue";

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface TimeWindow {
  startMinute: number;
  endMinute: number;
}

export interface Confidence {
  score: number;
  band: ConfidenceBand;
  basis: string[];
  limitations: string[];
}

export interface DataProvenance {
  id: string;
  label: string;
  kind: "observed" | "open-data" | "scenario-input" | "derived" | "prototype";
  observedAtIso?: string;
  sourceUrl?: string;
  license?: string;
  note?: string;
}

export interface ScenarioMetadata {
  id: string;
  name: string;
  locationName: string;
  description: string;
  startTimeIso: string;
  isPrototype: boolean;
  estimateLabel: string;
  disclaimer: string;
  tags: string[];
}

export interface TerrainCell {
  id: string;
  row: number;
  column: number;
  center: Coordinate;
  elevationM: number;
  slope: number;
  aspectDeg: number;
  imperviousFraction: number;
  infiltrationMmPerHour: number;
  drainageMmPerHour: number;
  roughness: number;
  landUse:
    | "campus"
    | "residential"
    | "commercial"
    | "industrial"
    | "agricultural"
    | "open"
    | "water";
}

export interface RoadAsset {
  id: string;
  name: string;
  geometry: Coordinate[];
  classification: "local" | "collector" | "arterial" | "service";
  lanes: number;
  surface: "paved" | "unpaved";
  elevationOffsetM: number;
  drainageQuality: number;
  importance: number;
  geometryEvidenceClassification?: "observed" | "imported" | "estimated";
  sourceFeatureId?: string;
}

export interface BridgeAsset {
  id: string;
  name: string;
  roadId: string;
  coordinate: Coordinate;
  deckClearanceM: number;
  condition: number;
}

export interface BuildingAsset {
  id: string;
  name: string;
  coordinate: Coordinate;
  /** Optional source footprint. When absent, renderers must label any generated footprint as estimated. */
  footprint?: Coordinate[];
  /** Observed/imported height when known; otherwise renderers may derive an explicitly estimated display height. */
  heightM?: number;
  heightEvidenceClassification?: "observed" | "imported" | "estimated";
  sourceFeatureId?: string;
  use:
    | "academic"
    | "residential"
    | "commercial"
    | "industrial"
    | "public"
    | "warehouse";
  floors: number;
  groundFloorElevationM: number;
  occupantsDay: number;
  occupantsNight: number;
  vulnerability: number;
}

export interface FacilityAsset {
  id: string;
  name: string;
  coordinate: Coordinate;
  type:
    | "hospital"
    | "shelter"
    | "fire_station"
    | "command_post"
    | "power"
    | "water"
    | "telecom";
  capacity: number;
  baselineOccupancy: number;
  backupHours: number;
  criticality: number;
  networkNodeId?: string;
}

export interface PopulationZone {
  id: string;
  name: string;
  center: Coordinate;
  population: number;
  mobilityLimitedFraction: number;
  vehicleAccessFraction: number;
  vulnerability: number;
  originNodeId: string;
}

export interface ResponderUnit {
  id: string;
  name: string;
  type: "bus" | "ambulance" | "rescue" | "medical" | "traffic";
  homeNodeId: string;
  seats: number;
  crew: number;
  speedFactor: number;
  capabilities: string[];
}

export interface NetworkNode {
  id: string;
  name: string;
  coordinate: Coordinate;
  elevationM: number;
  facilityId?: string;
}

export interface NetworkEdge {
  id: string;
  from: string;
  to: string;
  roadId: string;
  lengthM: number;
  freeFlowKph: number;
  lanes: number;
  capacityPersonsPerMinute: number;
  bridgeId?: string;
  oneWay?: boolean;
  sourceFeatureId?: string;
}

export interface TransportNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface ImportedRoadGraphBundle {
  roads: RoadAsset[];
  network: TransportNetwork;
  provenance: DataProvenance[];
  sourceLabel: string;
}

export interface ScreenedNetworkEdge {
  edgeId: string;
  roadId: string;
  roadName: string;
  minute: number;
  mode: TravelMode;
  status: RoadStatus;
  passable: boolean;
  risk: number;
  delayFactor: number;
  depthM?: number;
  confidence: Confidence;
  geometryEvidenceClassification: "observed" | "imported" | "estimated";
  statusEvidenceClassification: "simulated";
  explanation: string;
}

export interface RoadNetworkSnapshot {
  scenarioId: string;
  simulationRunId: string;
  minute: number;
  mode: TravelMode;
  edges: ScreenedNetworkEdge[];
  passableEdges: number;
  restrictedEdges: number;
  closedEdges: number;
  importedGeometryEdges: number;
  classification: "simulated-passability-over-scenario-road-graph";
  notice: string;
}

export interface ScenarioAssets {
  roads: RoadAsset[];
  bridges: BridgeAsset[];
  buildings: BuildingAsset[];
  facilities: FacilityAsset[];
  populationZones: PopulationZone[];
  responders: ResponderUnit[];
  network: TransportNetwork;
}

export interface FloodParameters {
  kind: "flood";
  rainfallMmPerHour: number;
  rainfallDurationMinutes: number;
  antecedentSaturation: number;
  drainageBlockageFraction: number;
  upstreamRiseM: number;
  sourceSpreadMPerMinute: number;
  recessionRate: number;
  initialWaterDepthM: number;
}

export interface EarthquakeParameters {
  kind: "earthquake";
  magnitudeMw: number;
  focalDepthKm: number;
  soilAmplification: number;
  aftershockFactor: number;
}

export interface WildfireParameters {
  kind: "wildfire";
  windSpeedKph: number;
  windDirectionDeg: number;
  relativeHumidityPct: number;
  fuelDryness: number;
  ignitionIntensity: number;
}

export interface CycloneParameters {
  kind: "cyclone";
  peakWindKph: number;
  trackDirectionDeg: number;
  forwardSpeedKph: number;
  centralPressureHpa: number;
  rainfallMmPerHour: number;
  coastalSurgeM: number;
}

export interface ChemicalParameters {
  kind: "chemical";
  materialName: string;
  releaseKgPerMinute: number;
  releaseDurationMinutes: number;
  windSpeedKph: number;
  windDirectionDeg: number;
  atmosphericStability: "A" | "B" | "C" | "D" | "E" | "F";
  toxicityThresholdMgM3: number;
}

export type HazardParameters =
  | FloodParameters
  | EarthquakeParameters
  | WildfireParameters
  | CycloneParameters
  | ChemicalParameters;

export interface ScenarioDefinition {
  metadata: ScenarioMetadata;
  hazard: HazardKind;
  seed: string;
  durationMinutes: number;
  stepMinutes: number;
  area: BoundingBox;
  gridRows: number;
  gridColumns: number;
  hazardSource: Coordinate;
  terrain: TerrainCell[];
  assets: ScenarioAssets;
  parameters: HazardParameters;
  provenance: DataProvenance[];
}

export interface FloodCellSample {
  hazard: "flood";
  minute: number;
  depthM: number;
  velocityMps: number;
  directionDeg: number;
  waterSurfaceElevationM: number;
  riseRateMPerMinute: number;
  phase: "dry" | "arriving" | "rising" | "peak" | "receding" | "standing";
}

export interface EarthquakeCellSample {
  hazard: "earthquake";
  minute: number;
  pgaG: number;
  mmi: number;
  liquefactionProbability: number;
  groundDisplacementCm: number;
  debrisRisk: number;
  bridgeDemandIndex: number;
  aftershock: boolean;
}

export interface WildfireCellSample {
  hazard: "wildfire";
  minute: number;
  firelineIntensityKwM: number;
  flameLengthM: number;
  smokeIndex: number;
  burning: boolean;
  radiantHeatKwM2: number;
  emberSpottingRisk: number;
  visibilityM: number;
}

export interface CycloneCellSample {
  hazard: "cyclone";
  minute: number;
  windKph: number;
  rainfallMmPerHour: number;
  surgeDepthM: number;
  debrisRisk: number;
  gustKph: number;
  surfaceFloodDepthM: number;
  powerFailureRisk: number;
}

export interface ChemicalCellSample {
  hazard: "chemical";
  minute: number;
  concentrationMgM3: number;
  exposureRatio: number;
  plumePresent: boolean;
  indoorExposureRatio: number;
  depositionIndex: number;
  shelterInPlaceEffective: boolean;
}

export type HazardCellSample =
  | FloodCellSample
  | EarthquakeCellSample
  | WildfireCellSample
  | CycloneCellSample
  | ChemicalCellSample;

export interface SpatialCellSeries {
  cell: TerrainCell;
  samples: HazardCellSample[];
  arrivalMinute: number | null;
  peakMinute: number;
  recessionMinute: number | null;
  peakValue: number;
  metric: string;
  unit: string;
  confidence: Confidence;
}

export interface TimelineFrame {
  minute: number;
  timestampIso: string;
  phase: string;
  severity: Severity;
  affectedAreaSqKm: number;
  exposedPopulation: number;
  unavailableRoads: number;
  criticalAlerts: string[];
  hazardSummary: Record<string, number>;
}

export interface ModePassability {
  passable: boolean;
  confidence: Confidence;
  reason: string;
}

export interface RoadImpact {
  roadId: string;
  roadName: string;
  peakMinute: number;
  peakDepthM?: number;
  peakIntensity: number;
  status: RoadStatus;
  closures: TimeWindow[];
  passability: Record<TravelMode, ModePassability>;
  confidence: Confidence;
  explanation: string[];
}

export interface BridgeImpact {
  bridgeId: string;
  bridgeName: string;
  peakMinute: number;
  approachDepthM: number;
  overtoppingRisk: number;
  status: OperationalStatus;
  confidence: Confidence;
  explanation: string[];
}

export interface BuildingImpact {
  buildingId: string;
  buildingName: string;
  peakMinute: number;
  peakDepthM?: number;
  peakIntensity: number;
  severity: Severity;
  groundFloorAffected: boolean;
  occupantsPotentiallyExposed: number;
  status: OperationalStatus;
  confidence: Confidence;
  explanation: string[];
}

export interface PopulationImpact {
  zoneId: string;
  zoneName: string;
  peakMinute: number;
  peakDepthM?: number;
  exposureFraction: number;
  peopleExposed: number;
  mobilityAssistanceEstimate: number;
  evacuationPriority: number;
  isolationRisk: number;
  confidence: Confidence;
  explanation: string[];
}

export interface FacilityImpact {
  facilityId: string;
  facilityName: string;
  facilityType: FacilityAsset["type"];
  peakMinute: number;
  peakDepthM?: number;
  peakIntensity: number;
  status: OperationalStatus;
  accessStatus: RoadStatus;
  projectedOccupancy: number;
  capacity: number;
  overloadMinute: number | null;
  confidence: Confidence;
  explanation: string[];
}

export interface UtilityImpact {
  facilityId: string;
  utilityType: "power" | "water" | "telecom";
  status: OperationalStatus;
  estimatedOutageStartMinute: number | null;
  estimatedRestoreMinute: number | null;
  dependentPopulation: number;
  confidence: Confidence;
  explanation: string[];
}

export interface ImpactBundle {
  roads: RoadImpact[];
  bridges: BridgeImpact[];
  buildings: BuildingImpact[];
  population: PopulationImpact[];
  hospitals: FacilityImpact[];
  shelters: FacilityImpact[];
  utilities: UtilityImpact[];
}

/**
 * A strict truth label for anything displayed as evidence in AEGIS.
 * Asset geometry may be imported or estimated while its consequence status is
 * still simulated; callers must not collapse those two claims into one label.
 */
export type EvidenceClassification =
  | "observed"
  | "imported"
  | "estimated"
  | "simulated";

export type ImpactEntityKind =
  | "building"
  | "road"
  | "bridge"
  | "critical-facility"
  | "utility"
  | "population-zone";

export type DamageState =
  | "none"
  | "exposed"
  | "minor"
  | "moderate"
  | "severe"
  | "critical";

export type RecoveryPriorityBand = "routine" | "important" | "urgent" | "critical";

export interface ImpactEvidence {
  classification: "simulated";
  geometryClassification: Exclude<EvidenceClassification, "simulated">;
  statusClassification: "simulated";
  provenanceIds: string[];
  basis: string[];
  limitations: string[];
}

export interface HazardExposureSnapshot {
  hazard: HazardKind;
  metric: string;
  unit: string;
  value: number;
  riskIndex: number;
  floodDepthM?: number;
  floodVelocityMps?: number;
  floodPhase?: FloodCellSample["phase"];
  arrivalMinute?: number | null;
  peakMinute: number;
  recessionMinute?: number | null;
}

export interface RecoveryPriority {
  score: number;
  band: RecoveryPriorityBand;
  inspectionRequired: boolean;
  earliestHazardClearMinute: number | null;
  rationale: string[];
}

/**
 * One inspectable, time-specific consequence record. `damageIndex` is null for
 * population/service records where physical damage would be a misleading term.
 */
export interface ImpactAssetSnapshot {
  id: string;
  entityId: string;
  entityKind: ImpactEntityKind;
  name: string;
  coordinate: Coordinate;
  minute: number;
  timestampIso: string;
  severity: Severity;
  damageState: DamageState;
  damageIndex: number | null;
  impactIndex: number;
  functionalityPct: number;
  operationalStatus: OperationalStatus;
  accessStatus: RoadStatus | null;
  modePassability: Record<TravelMode, boolean> | null;
  isolated: boolean;
  peopleWithinExposureEnvelope: number | null;
  mobilityAssistanceEstimate: number | null;
  dependentPopulationEstimate: number | null;
  capacity: number | null;
  projectedOccupancy: number | null;
  internalFloodDepthM?: number;
  hazard: HazardExposureSnapshot;
  recovery: RecoveryPriority;
  confidence: Confidence;
  evidence: ImpactEvidence;
  explanation: string[];
}

export interface HumanImpactSnapshot {
  peopleWithinExposureEnvelope: number;
  mobilityAssistanceEstimate: number;
  peopleInIsolatedZones: number;
  peopleCoveredByEvacuationPlan: number;
  peopleRemainingInPlanningEnvelope: number;
  evacuationCoveragePct: number | null;
  observedFatalities: null;
  observedInjuries: null;
  casualtyStatus: "not-modelled";
  notice: string;
}

export interface ResponseCoverageSnapshot {
  planId: string | null;
  planClassification: "deterministic-planning-estimate" | "not-generated";
  peopleInHighRiskZones: number;
  peopleCoveredByPlan: number;
  peopleRemainingExposed: number;
  coveragePct: number | null;
  estimatedClearanceMinutes: number | null;
  isolatedZones: number;
  routesCrossingClosures: number;
  activeResourceAssignments: number;
  availableShelterPlaces: number | null;
  warnings: string[];
}

export interface ImpactSnapshotSummary {
  affectedBuildings: number;
  severelyDamagedBuildings: number;
  restrictedRoads: number;
  closedRoads: number;
  degradedBridges: number;
  unavailableBridges: number;
  degradedCriticalFacilities: number;
  unavailableCriticalFacilities: number;
  disruptedUtilities: number;
  affectedPopulationZones: number;
  peopleWithinExposureEnvelope: number;
  topRecoveryPriorities: Array<{
    entityId: string;
    entityKind: ImpactEntityKind;
    name: string;
    score: number;
    band: RecoveryPriorityBand;
  }>;
}

export type SecondaryConsequenceKind =
  | "debris"
  | "contamination"
  | "sewage-overflow"
  | "erosion"
  | "smoke-visibility"
  | "surface-water"
  | "utility-failure";

export interface SecondaryConsequenceSnapshot {
  id: string;
  cellId: string;
  coordinate: Coordinate;
  minute: number;
  kind: SecondaryConsequenceKind;
  severity: Severity;
  index: number;
  metric: string;
  value: number;
  unit: string;
  confidence: Confidence;
  classification: "simulated";
  explanation: string[];
}

export interface UncertaintyCellSnapshot {
  cellId: string;
  coordinate: Coordinate;
  minute: number;
  centralRisk: number;
  lowerRisk: number;
  upperRisk: number;
  uncertaintyWidth: number;
  confidenceScore: number;
  confidenceBand: ConfidenceBand;
  dominantLimitations: string[];
  classification: "estimated-uncertainty-envelope";
}

export interface UncertaintyEnvelopeSummary {
  meanConfidence: number;
  meanUncertaintyWidth: number;
  lowConfidenceCellCount: number;
  highestUncertaintyCellIds: string[];
  notice: string;
}

export type ReentryStatus = "blocked" | "inspection-required" | "conditional" | "screened-eligible";

export interface RecoveryAction {
  id: string;
  entityId: string;
  entityKind: ImpactEntityKind;
  name: string;
  priorityScore: number;
  priorityBand: RecoveryPriorityBand;
  reentryStatus: ReentryStatus;
  earliestScreenedMinute: number | null;
  action: string;
  dependencies: string[];
  blockers: string[];
  authorityRequired: boolean;
  classification: "simulated-planning-estimate";
}

export interface RecoveryPlan {
  generatedAtMinute: number;
  actions: RecoveryAction[];
  blockedReentries: number;
  inspectionQueue: number;
  screenedEligible: number;
  notice: string;
}

export interface ImpactSnapshotBundle {
  scenarioId: string;
  simulationRunId: string;
  hazard: HazardKind;
  requestedMinute: number;
  selectedMinute: number;
  timestampIso: string;
  classification: "simulated-planning-estimate";
  disclaimer: string;
  buildings: ImpactAssetSnapshot[];
  roads: ImpactAssetSnapshot[];
  bridges: ImpactAssetSnapshot[];
  criticalFacilities: ImpactAssetSnapshot[];
  utilities: ImpactAssetSnapshot[];
  populationZones: ImpactAssetSnapshot[];
  secondaryConsequences: SecondaryConsequenceSnapshot[];
  uncertaintyCells: UncertaintyCellSnapshot[];
  uncertaintySummary: UncertaintyEnvelopeSummary;
  recoveryPlan: RecoveryPlan;
  humanImpact: HumanImpactSnapshot;
  responseCoverage: ResponseCoverageSnapshot;
  summary: ImpactSnapshotSummary;
}

export interface ImpactSnapshotInput {
  scenario: ScenarioDefinition;
  result: SimulationResult;
  selectedMinute: number;
  evacuationPlan?: EvacuationPlan;
}

export interface ImpactTimelinePoint {
  minute: number;
  timestampIso: string;
  severity: Severity;
  affectedBuildings: number;
  closedRoads: number;
  unavailableCriticalFacilities: number;
  disruptedUtilities: number;
  peopleWithinExposureEnvelope: number;
  evacuationCoveragePct: number | null;
}

export interface SimulationMetrics {
  peakMinute: number;
  peakAffectedAreaSqKm: number;
  peakExposedPopulation: number;
  peakUnavailableRoads: number;
  maximumHazardValue: number;
  maximumHazardUnit: string;
  peopleRequiringEvacuation: number;
  facilitiesDegraded: number;
  estimatedEconomicDamageInr: number | null;
  estimateNotes: string[];
}

export interface SimulationModelInfo {
  id: string;
  name: string;
  version: string;
  classification: "deterministic-prototype";
  method: string;
  limitations: string[];
}

export interface AuditEvent {
  sequence: number;
  event: string;
  detail: string;
}

export interface SimulationResult {
  runId: string;
  scenarioId: string;
  hazard: HazardKind;
  seed: string;
  estimateLabel: string;
  disclaimer: string;
  model: SimulationModelInfo;
  timeline: TimelineFrame[];
  field: SpatialCellSeries[];
  impacts: ImpactBundle;
  metrics: SimulationMetrics;
  provenance: DataProvenance[];
  audit: AuditEvent[];
}

export interface SimulationRunOptions {
  branchId?: string;
  parameterChanges?: Record<string, string | number | boolean>;
}

export interface ScenarioBranch {
  id: string;
  label: string;
  description: string;
  parameterChanges: Record<string, string | number | boolean>;
}

export interface BranchResult {
  branch: ScenarioBranch;
  result: SimulationResult;
  deltaFromBaseline: {
    peakAffectedAreaSqKm: number;
    peakExposedPopulation: number;
    peakUnavailableRoads: number;
    peopleRequiringEvacuation: number;
  };
}

export interface SimulationComparison {
  baseline: SimulationResult;
  branches: BranchResult[];
}

export type InterventionStatus = "screened" | "blocked-by-missing-authority-data" | "advisory-only";

export interface InterventionCandidate {
  id: string;
  title: string;
  description: string;
  category: "mitigation" | "access" | "capacity" | "utility" | "public-safety";
  status: InterventionStatus;
  parameterChanges: Record<string, string | number | boolean>;
  benefitScore: number | null;
  exposedPeopleReduction: number | null;
  unavailableRoadReduction: number | null;
  degradedFacilityReduction: number | null;
  maximumHazardReduction: number | null;
  timeToEffectMinutes: number | null;
  feasibilityScore: number;
  downstreamSystemsProtected: string[];
  dependencies: string[];
  limitations: string[];
  classification: "simulated-comparison" | "planning-advisory";
}

export interface InterventionRanking {
  scenarioId: string;
  simulationRunId: string;
  hazard: HazardKind;
  ranked: InterventionCandidate[];
  bestScreenedInterventionId: string | null;
  notice: string;
}

export type AuthoritativeDatasetKind =
  | "bim"
  | "dem"
  | "drainage"
  | "occupancy"
  | "asset-values"
  | "casualty-curves"
  | "road-graph";

export interface AuthoritativeDatasetDescriptor {
  kind: AuthoritativeDatasetKind;
  status: "missing" | "provided" | "validated" | "rejected";
  path: string | null;
  sourceOrganization: string | null;
  sourceUrl: string | null;
  license: string | null;
  capturedAtIso: string | null;
  sha256: string | null;
  coordinateReferenceSystem: string | null;
  schemaVersion: string | null;
  validationNotes: string[];
}

export interface AuthoritativeDataManifest {
  manifestVersion: "1.0";
  siteId: string;
  siteName: string;
  datasets: AuthoritativeDatasetDescriptor[];
}

export interface AuthoritativeReadiness {
  siteId: string;
  ready: boolean;
  validatedKinds: AuthoritativeDatasetKind[];
  missingKinds: AuthoritativeDatasetKind[];
  rejectedKinds: AuthoritativeDatasetKind[];
  economicDamageEnabled: boolean;
  casualtyEstimationEnabled: boolean;
  authoritativeTerrainEnabled: boolean;
  authoritativeBuildingModelEnabled: boolean;
  outputs: {
    economicDamage: null;
    casualtyEstimate: null;
  };
  blockers: string[];
  notice: string;
}

export interface EvacuationEndpoint {
  id: string;
  label: string;
  coordinate?: Coordinate;
  nodeId?: string;
}

export interface EvacuationRequest {
  startPoints?: EvacuationEndpoint[];
  endPoints?: EvacuationEndpoint[];
  departureMinute?: number;
  maxRoutesPerOrigin?: number;
  stagedWindowMinutes?: number;
  preferredMode?: "bus" | "car" | "pedestrian";
  includeHospitals?: boolean;
  minimumRouteReliability?: number;
  maximumRouteRisk?: number;
  reserveShelterFraction?: number;
  routeCapacitySafetyFactor?: number;
  avoidRoadIds?: string[];
}

export interface RouteHazardSegment {
  edgeId: string;
  roadId: string;
  status: RoadStatus;
  peakDepthM?: number;
  delayMinutes: number;
  screenedMinute: number;
  mode: TravelMode;
  passable: boolean;
  explanation: string;
}

export interface EvacuationRoute {
  id: string;
  rank: number;
  originId: string;
  destinationId: string;
  nodeIds: string[];
  edgeIds: string[];
  polyline: Coordinate[];
  distanceM: number;
  freeFlowMinutes: number;
  etaMinutes: number;
  bottleneckPersonsPerMinute: number;
  riskScore: number;
  reliability: number;
  status: "recommended" | "alternate" | "contingency";
  screenedDepartureMinute: number;
  estimatedArrivalMinute: number;
  mode: TravelMode;
  hazardSegments: RouteHazardSegment[];
  explanation: string[];
}

export interface EvacuationStage {
  id: string;
  order: number;
  zoneId: string;
  zoneName: string;
  populationAssigned: number;
  assistanceRequired: number;
  departureWindow: TimeWindow;
  routeId: string;
  destinationFacilityId: string;
  transportMode: "bus" | "car" | "pedestrian" | "mixed";
  status: "covered" | "partially-covered" | "uncovered";
  rationale: string[];
}

export interface ResourceAssignment {
  unitId: string;
  unitName: string;
  stageId: string;
  routeId: string;
  role: string;
  dispatchMinute: number;
  estimatedArrivalMinute: number;
  assignedPopulationCapacity: number;
}

export interface ShelterAllocation {
  facilityId: string;
  facilityName: string;
  baselineOccupancy: number;
  assignedEvacuees: number;
  remainingCapacity: number;
  utilizationPct: number;
  status: "available" | "near-capacity" | "full" | "unavailable";
}

export interface EvacuationMetrics {
  peopleInHighRiskZones: number;
  peopleCoveredByPlan: number;
  peopleRemainingExposed: number;
  coveragePct: number;
  estimatedClearanceMinutes: number;
  isolatedZones: number;
  routesCrossingClosures: number;
  averageRouteRisk: number;
  residualShelterDemand: number;
  unroutableHighRiskZones: number;
  availableShelterPlaces: number;
  reservedShelterPlaces: number;
}

export interface EvacuationResidualDemand {
  zoneId: string;
  zoneName: string;
  peopleRemaining: number;
  reason: "no-passable-route" | "shelter-capacity" | "route-capacity" | "reliability-threshold";
  isolationReason: string;
}

export interface EvacuationStagingSummary {
  stageCount: number;
  firstDepartureMinute: number | null;
  finalEstimatedArrivalMinute: number | null;
  peakConcurrentStages: number;
  assistancePlacesAssigned: number;
}

export interface ShelterCapacitySummary {
  physicalCapacity: number;
  baselineOccupancy: number;
  reservedPlaces: number;
  assignablePlaces: number;
  assignedPlaces: number;
  remainingAssignablePlaces: number;
  residualDemand: number;
}

export interface EvacuationPlan {
  id: string;
  scenarioId: string;
  simulationRunId: string;
  generatedBy: "AEGIS deterministic evacuation planner";
  estimateLabel: string;
  departureMinute: number;
  startPoints: EvacuationEndpoint[];
  endPoints: EvacuationEndpoint[];
  routes: EvacuationRoute[];
  stages: EvacuationStage[];
  resourceAssignments: ResourceAssignment[];
  shelterAllocations: ShelterAllocation[];
  residualDemand: EvacuationResidualDemand[];
  stagingSummary: EvacuationStagingSummary;
  shelterCapacitySummary: ShelterCapacitySummary;
  networkEvidenceClassification: "observed" | "imported" | "estimated";
  before: EvacuationMetrics;
  after: EvacuationMetrics;
  improvement: {
    exposedPeopleReduction: number;
    exposedPeopleReductionPct: number;
    isolatedZonesReduction: number;
  };
  explanations: string[];
  warnings: string[];
  audit: AuditEvent[];
}

export interface HazardPlugin {
  kind: HazardKind;
  model: SimulationModelInfo;
  simulate: (scenario: ScenarioDefinition, options?: SimulationRunOptions) => SimulationResult;
}

export interface SimulationCatalogItem {
  hazard: HazardKind | FutureHazardKind;
  title: string;
  status: "ready" | "coming-soon";
  description: string;
  flagship: boolean;
  outputMetrics: string[];
}

export interface ClientSimulationSummary {
  runId: string;
  hazard: HazardKind;
  label: string;
  headline: string;
  peakMinute: number;
  peakAffectedAreaSqKm: number;
  exposedPopulation: number;
  roadClosures: number;
  degradedFacilities: number;
  evacuationCoveragePct?: number;
  topAlerts: string[];
  timeline: Array<{
    minute: number;
    severity: Severity;
    affectedAreaSqKm: number;
    exposedPopulation: number;
  }>;
}
