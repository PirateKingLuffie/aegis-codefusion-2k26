import type {
  BranchResult,
  BridgeAsset,
  BridgeImpact,
  BuildingAsset,
  BuildingImpact,
  ChemicalCellSample,
  ChemicalParameters,
  ClientSimulationSummary,
  Confidence,
  Coordinate,
  CycloneCellSample,
  CycloneParameters,
  DataProvenance,
  EarthquakeCellSample,
  EarthquakeParameters,
  EvacuationEndpoint,
  EvacuationMetrics,
  EvacuationPlan,
  EvacuationRequest,
  EvacuationRoute,
  EvacuationStage,
  FacilityAsset,
  FacilityImpact,
  FloodCellSample,
  FloodParameters,
  HazardCellSample,
  HazardKind,
  HazardParameters,
  HazardPlugin,
  ImpactBundle,
  InterventionCandidate,
  InterventionRanking,
  ModePassability,
  NetworkEdge,
  NetworkNode,
  OperationalStatus,
  PopulationImpact,
  PopulationZone,
  ResourceAssignment,
  RoadAsset,
  RoadImpact,
  RoadStatus,
  RouteHazardSegment,
  ScenarioAssets,
  ScenarioBranch,
  ScenarioDefinition,
  Severity,
  ShelterAllocation,
  SimulationCatalogItem,
  SimulationComparison,
  SimulationMetrics,
  SimulationModelInfo,
  SimulationResult,
  SimulationRunOptions,
  SpatialCellSeries,
  TerrainCell,
  TimelineFrame,
  TimeWindow,
  TransportNetwork,
  TravelMode,
  UtilityImpact,
  WildfireCellSample,
  WildfireParameters,
} from "../domain/types";
import {
  hazardRiskRatio,
  screenModePassability,
} from "./hazard-screening";

export type * from "../domain/types";

const PROTOTYPE_LABEL = "Prototype planning estimate — not an observed or certified impact";
const PROTOTYPE_DISCLAIMER =
  "AEGIS outputs are deterministic scenario estimates for planning and demonstration. They are not live observations, engineering certification, evacuation orders, or a substitute for local authorities.";
const EARTH_RADIUS_M = 6_371_000;
const EIT_OFFICIAL_MAP_CENTER: Coordinate = { lat: 28.3912265, lon: 77.4398682 };
const EIT_LEGACY_SCAFFOLD_CENTER: Coordinate = { lat: 28.251, lon: 77.22 };
const TRAVEL_MODES: TravelMode[] = [
  "pedestrian",
  "car",
  "bus",
  "ambulance",
  "heavy_rescue",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function randomUnit(seed: string, key: string): number {
  let state = fnv1a(`${seed}:${key}`) || 0x6d2b79f5;
  state += 0x6d2b79f5;
  let mixed = state;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${fnv1a(value).toString(16).padStart(8, "0")}`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const lonDelta = toRadians(b.lon - a.lon);
  const y = Math.sin(lonDelta) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lonDelta);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function midpoint(points: Coordinate[]): Coordinate {
  if (points.length === 0) return { lat: 0, lon: 0 };
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
  };
}

function timestampAt(startTimeIso: string, minute: number): string {
  return new Date(new Date(startTimeIso).getTime() + minute * 60_000).toISOString();
}

function confidence(
  score: number,
  basis: string[],
  limitations: string[] = [],
): Confidence {
  const bounded = round(clamp(score, 0, 1), 2);
  return {
    score: bounded,
    band: bounded >= 0.78 ? "high" : bounded >= 0.55 ? "medium" : "low",
    basis,
    limitations,
  };
}

function severityFromRatio(ratio: number): Severity {
  if (ratio >= 0.82) return "extreme";
  if (ratio >= 0.62) return "major";
  if (ratio >= 0.38) return "moderate";
  if (ratio >= 0.14) return "minor";
  return "minimal";
}

function severityRank(value: Severity): number {
  return { minimal: 0, minor: 1, moderate: 2, major: 3, extreme: 4 }[value];
}

function applyParameterChanges(
  parameters: HazardParameters,
  changes?: Record<string, string | number | boolean>,
): HazardParameters {
  if (!changes) return { ...parameters };
  const next = { ...parameters } as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (key in next && key !== "kind" && typeof next[key] === typeof value) {
      next[key] = value;
    }
  }
  return next as unknown as HazardParameters;
}

function parametersFor(hazard: HazardKind): HazardParameters {
  switch (hazard) {
    case "flood":
      return {
        kind: "flood",
        rainfallMmPerHour: 92,
        rainfallDurationMinutes: 72,
        antecedentSaturation: 0.78,
        drainageBlockageFraction: 0.42,
        upstreamRiseM: 0.48,
        sourceSpreadMPerMinute: 34,
        recessionRate: 0.028,
        initialWaterDepthM: 0,
      };
    case "earthquake":
      return {
        kind: "earthquake",
        magnitudeMw: 6.1,
        focalDepthKm: 12,
        soilAmplification: 1.18,
        aftershockFactor: 0.24,
      };
    case "wildfire":
      return {
        kind: "wildfire",
        windSpeedKph: 22,
        windDirectionDeg: 118,
        relativeHumidityPct: 24,
        fuelDryness: 0.72,
        ignitionIntensity: 0.8,
      };
    case "cyclone":
      return {
        kind: "cyclone",
        peakWindKph: 142,
        trackDirectionDeg: 320,
        forwardSpeedKph: 16,
        centralPressureHpa: 968,
        rainfallMmPerHour: 58,
        coastalSurgeM: 2.1,
      };
    case "chemical":
      return {
        kind: "chemical",
        materialName: "Ammonia (prototype release)",
        releaseKgPerMinute: 18,
        releaseDurationMinutes: 35,
        windSpeedKph: 14,
        windDirectionDeg: 105,
        atmosphericStability: "D",
        toxicityThresholdMgM3: 25,
      };
  }
}

function buildTerrain(
  seed: string,
  rows: number,
  columns: number,
  area: ScenarioDefinition["area"],
): TerrainCell[] {
  const cells: TerrainCell[] = [];
  const latStep = (area.north - area.south) / rows;
  const lonStep = (area.east - area.west) / columns;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rowRatio = row / Math.max(1, rows - 1);
      const columnRatio = column / Math.max(1, columns - 1);
      const center = {
        lat: area.north - (row + 0.5) * latStep,
        lon: area.west + (column + 0.5) * lonStep,
      };
      const bowl =
        Math.exp(-(((rowRatio - 0.56) / 0.3) ** 2 + ((columnRatio - 0.48) / 0.28) ** 2));
      const localNoise = randomUnit(seed, `terrain-${row}-${column}`) - 0.5;
      const elevationM = 205.5 + rowRatio * 5.2 - columnRatio * 1.4 - bowl * 3.8 + localNoise * 0.7;
      const campus = row >= 3 && row <= 6 && column >= 4 && column <= 8;
      const industrial = column >= 9 && row >= 5;
      const agricultural = row <= 2 || column <= 1;
      const landUse: TerrainCell["landUse"] = campus
        ? "campus"
        : industrial
          ? "industrial"
          : agricultural
            ? "agricultural"
            : randomUnit(seed, `land-${row}-${column}`) > 0.78
              ? "open"
              : "residential";
      const imperviousFraction =
        landUse === "campus"
          ? 0.76
          : landUse === "industrial"
            ? 0.82
            : landUse === "residential"
              ? 0.64
              : landUse === "agricultural"
                ? 0.18
                : 0.3;
      cells.push({
        id: `cell-${row.toString().padStart(2, "0")}-${column.toString().padStart(2, "0")}`,
        row,
        column,
        center,
        elevationM: round(elevationM, 2),
        slope: round(clamp(0.012 + rowRatio * 0.018 + Math.abs(localNoise) * 0.01, 0.005, 0.06), 4),
        aspectDeg: round((154 + columnRatio * 32 + localNoise * 22 + 360) % 360, 1),
        imperviousFraction,
        infiltrationMmPerHour: round(22 * (1 - imperviousFraction) + 3, 1),
        drainageMmPerHour: round((landUse === "campus" ? 28 : 19) * (0.85 + localNoise * 0.2), 1),
        roughness: round(0.025 + (1 - imperviousFraction) * 0.055, 3),
        landUse,
      });
    }
  }
  return cells;
}

function createLegacyScaffoldAssets(): ScenarioAssets {
  const nodes: NetworkNode[] = [
    { id: "n-campus", name: "EIT Campus Core", coordinate: { lat: 28.25, lon: 77.22 }, elevationM: 205.2 },
    { id: "n-west-gate", name: "West Gate", coordinate: { lat: 28.2502, lon: 77.2165 }, elevationM: 205.6 },
    { id: "n-east-gate", name: "East Gate", coordinate: { lat: 28.2505, lon: 77.2235 }, elevationM: 205.9 },
    { id: "n-south", name: "South Junction", coordinate: { lat: 28.2465, lon: 77.2202 }, elevationM: 206.1 },
    { id: "n-west", name: "West Collector", coordinate: { lat: 28.2518, lon: 77.2125 }, elevationM: 207.4 },
    { id: "n-north", name: "North Junction", coordinate: { lat: 28.2572, lon: 77.216 }, elevationM: 209.1 },
    { id: "n-east", name: "East Collector", coordinate: { lat: 28.253, lon: 77.2285 }, elevationM: 207.8 },
    { id: "n-ring", name: "Southern Ring", coordinate: { lat: 28.2425, lon: 77.224 }, elevationM: 208.3 },
    { id: "n-shelter-north", name: "North Community Shelter", coordinate: { lat: 28.261, lon: 77.2135 }, elevationM: 211.2, facilityId: "facility-shelter-north" },
    { id: "n-shelter-east", name: "East Relief Centre", coordinate: { lat: 28.2555, lon: 77.233 }, elevationM: 210.4, facilityId: "facility-shelter-east" },
    { id: "n-shelter-south", name: "South Elevated Assembly", coordinate: { lat: 28.2385, lon: 77.227 }, elevationM: 211.7, facilityId: "facility-shelter-south" },
    { id: "n-hospital", name: "Prototype District Hospital", coordinate: { lat: 28.259, lon: 77.2255 }, elevationM: 210, facilityId: "facility-hospital" },
  ];

  const edgeDefinitions: Array<
    Omit<NetworkEdge, "lengthM"> & { roadName: string; classification: RoadAsset["classification"] }
  > = [
    { id: "e-campus-west", from: "n-campus", to: "n-west-gate", roadId: "r-campus-west", freeFlowKph: 24, lanes: 2, capacityPersonsPerMinute: 92, roadName: "Campus West Access", classification: "local" },
    { id: "e-campus-east", from: "n-campus", to: "n-east-gate", roadId: "r-campus-east", freeFlowKph: 24, lanes: 2, capacityPersonsPerMinute: 92, roadName: "Campus East Access", classification: "local" },
    { id: "e-campus-south", from: "n-campus", to: "n-south", roadId: "r-campus-south", freeFlowKph: 20, lanes: 2, capacityPersonsPerMinute: 70, roadName: "Campus South Access", classification: "local" },
    { id: "e-west-gate-west", from: "n-west-gate", to: "n-west", roadId: "r-west-link", freeFlowKph: 38, lanes: 2, capacityPersonsPerMinute: 115, roadName: "West Link Road", classification: "collector" },
    { id: "e-west-north", from: "n-west", to: "n-north", roadId: "r-northwest-collector", freeFlowKph: 45, lanes: 4, capacityPersonsPerMinute: 175, roadName: "Northwest Collector", classification: "arterial", bridgeId: "bridge-west-drain" },
    { id: "e-north-shelter", from: "n-north", to: "n-shelter-north", roadId: "r-north-shelter", freeFlowKph: 32, lanes: 2, capacityPersonsPerMinute: 105, roadName: "North Shelter Approach", classification: "collector" },
    { id: "e-east-gate-east", from: "n-east-gate", to: "n-east", roadId: "r-east-link", freeFlowKph: 40, lanes: 4, capacityPersonsPerMinute: 165, roadName: "East Link Road", classification: "arterial" },
    { id: "e-east-shelter", from: "n-east", to: "n-shelter-east", roadId: "r-east-shelter", freeFlowKph: 34, lanes: 2, capacityPersonsPerMinute: 110, roadName: "East Shelter Approach", classification: "collector" },
    { id: "e-south-ring", from: "n-south", to: "n-ring", roadId: "r-south-ring-link", freeFlowKph: 35, lanes: 2, capacityPersonsPerMinute: 120, roadName: "South Ring Link", classification: "collector", bridgeId: "bridge-south-channel" },
    { id: "e-ring-shelter", from: "n-ring", to: "n-shelter-south", roadId: "r-south-shelter", freeFlowKph: 42, lanes: 4, capacityPersonsPerMinute: 170, roadName: "South Shelter Arterial", classification: "arterial" },
    { id: "e-west-ring", from: "n-west", to: "n-ring", roadId: "r-west-ring", freeFlowKph: 46, lanes: 4, capacityPersonsPerMinute: 165, roadName: "Western Bypass", classification: "arterial" },
    { id: "e-east-ring", from: "n-east", to: "n-ring", roadId: "r-east-ring", freeFlowKph: 44, lanes: 4, capacityPersonsPerMinute: 160, roadName: "Eastern Bypass", classification: "arterial" },
    { id: "e-north-hospital", from: "n-north", to: "n-hospital", roadId: "r-hospital-north", freeFlowKph: 35, lanes: 2, capacityPersonsPerMinute: 105, roadName: "Hospital North Access", classification: "collector" },
    { id: "e-east-hospital", from: "n-east", to: "n-hospital", roadId: "r-hospital-east", freeFlowKph: 35, lanes: 2, capacityPersonsPerMinute: 100, roadName: "Hospital East Access", classification: "collector" },
    { id: "e-north-east", from: "n-north", to: "n-east", roadId: "r-north-east", freeFlowKph: 42, lanes: 2, capacityPersonsPerMinute: 130, roadName: "North East Connector", classification: "collector" },
  ];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: NetworkEdge[] = edgeDefinitions.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    roadId: edge.roadId,
    freeFlowKph: edge.freeFlowKph,
    lanes: edge.lanes,
    capacityPersonsPerMinute: edge.capacityPersonsPerMinute,
    ...(edge.bridgeId ? { bridgeId: edge.bridgeId } : {}),
    ...(edge.oneWay === undefined ? {} : { oneWay: edge.oneWay }),
    lengthM: round(distanceMeters(nodeById.get(edge.from)!.coordinate, nodeById.get(edge.to)!.coordinate), 0),
  }));
  const roads: RoadAsset[] = edgeDefinitions.map((edge, index) => {
    const from = nodeById.get(edge.from)!;
    const to = nodeById.get(edge.to)!;
    return {
      id: edge.roadId,
      name: edge.roadName,
      geometry: [from.coordinate, to.coordinate],
      classification: edge.classification,
      lanes: edge.lanes,
      surface: "paved",
      elevationOffsetM: edge.classification === "arterial" ? 0.32 : 0.08,
      drainageQuality: round(0.56 + (index % 4) * 0.08, 2),
      importance: round(edge.classification === "arterial" ? 0.9 : edge.classification === "collector" ? 0.72 : 0.55, 2),
    };
  });
  const bridges: BridgeAsset[] = [
    { id: "bridge-west-drain", name: "West Drain Crossing (prototype)", roadId: "r-northwest-collector", coordinate: { lat: 28.2545, lon: 77.2142 }, deckClearanceM: 1.1, condition: 0.78 },
    { id: "bridge-south-channel", name: "South Channel Crossing (prototype)", roadId: "r-south-ring-link", coordinate: { lat: 28.2445, lon: 77.222 }, deckClearanceM: 0.85, condition: 0.7 },
  ];
  const buildings: BuildingAsset[] = [
    { id: "building-eit-main", name: "EIT Main Academic Block", coordinate: { lat: 28.2502, lon: 77.2195 }, use: "academic", floors: 4, groundFloorElevationM: 0.25, occupantsDay: 920, occupantsNight: 35, vulnerability: 0.44 },
    { id: "building-eit-lab", name: "EIT Laboratory Block", coordinate: { lat: 28.2494, lon: 77.2209 }, use: "academic", floors: 3, groundFloorElevationM: 0.18, occupantsDay: 410, occupantsNight: 20, vulnerability: 0.52 },
    { id: "building-eit-hostel", name: "EIT Hostel", coordinate: { lat: 28.2513, lon: 77.2215 }, use: "residential", floors: 5, groundFloorElevationM: 0.2, occupantsDay: 380, occupantsNight: 620, vulnerability: 0.48 },
    { id: "building-workshop", name: "Training Workshop", coordinate: { lat: 28.2486, lon: 77.218 }, use: "industrial", floors: 2, groundFloorElevationM: 0.12, occupantsDay: 170, occupantsNight: 10, vulnerability: 0.65 },
    { id: "building-west-housing", name: "West Residential Cluster", coordinate: { lat: 28.252, lon: 77.2145 }, use: "residential", floors: 3, groundFloorElevationM: 0.08, occupantsDay: 740, occupantsNight: 1120, vulnerability: 0.62 },
    { id: "building-east-market", name: "East Market Cluster", coordinate: { lat: 28.252, lon: 77.228 }, use: "commercial", floors: 2, groundFloorElevationM: 0.1, occupantsDay: 660, occupantsNight: 80, vulnerability: 0.7 },
    { id: "building-south-warehouse", name: "South Warehouse Cluster", coordinate: { lat: 28.2435, lon: 77.223 }, use: "warehouse", floors: 1, groundFloorElevationM: 0.05, occupantsDay: 150, occupantsNight: 18, vulnerability: 0.76 },
  ];
  const facilities: FacilityAsset[] = [
    { id: "facility-command", name: "EIT AEGIS Command Post", coordinate: { lat: 28.2501, lon: 77.22 }, type: "command_post", capacity: 80, baselineOccupancy: 12, backupHours: 12, criticality: 1, networkNodeId: "n-campus" },
    { id: "facility-hospital", name: "Prototype District Hospital", coordinate: { lat: 28.259, lon: 77.2255 }, type: "hospital", capacity: 260, baselineOccupancy: 174, backupHours: 24, criticality: 1, networkNodeId: "n-hospital" },
    { id: "facility-shelter-north", name: "North Community Shelter (prototype)", coordinate: { lat: 28.261, lon: 77.2135 }, type: "shelter", capacity: 2_300, baselineOccupancy: 90, backupHours: 48, criticality: 0.88, networkNodeId: "n-shelter-north" },
    { id: "facility-shelter-east", name: "East Relief Centre (prototype)", coordinate: { lat: 28.2555, lon: 77.233 }, type: "shelter", capacity: 1_850, baselineOccupancy: 50, backupHours: 36, criticality: 0.86, networkNodeId: "n-shelter-east" },
    { id: "facility-shelter-south", name: "South Elevated Assembly (prototype)", coordinate: { lat: 28.2385, lon: 77.227 }, type: "shelter", capacity: 1_700, baselineOccupancy: 25, backupHours: 36, criticality: 0.82, networkNodeId: "n-shelter-south" },
    { id: "facility-power", name: "Local Power Feeder (prototype)", coordinate: { lat: 28.2472, lon: 77.226 }, type: "power", capacity: 7_500, baselineOccupancy: 0, backupHours: 0, criticality: 0.94 },
    { id: "facility-water", name: "Water Pumping Station (prototype)", coordinate: { lat: 28.245, lon: 77.216 }, type: "water", capacity: 10_000, baselineOccupancy: 0, backupHours: 4, criticality: 0.92 },
    { id: "facility-telecom", name: "Emergency Telecom Site (prototype)", coordinate: { lat: 28.255, lon: 77.221 }, type: "telecom", capacity: 12_000, baselineOccupancy: 0, backupHours: 8, criticality: 0.9 },
  ];
  const populationZones: PopulationZone[] = [
    { id: "zone-campus", name: "EIT Campus", center: { lat: 28.25, lon: 77.22 }, population: 1_900, mobilityLimitedFraction: 0.045, vehicleAccessFraction: 0.22, vulnerability: 0.54, originNodeId: "n-campus" },
    { id: "zone-west", name: "West Residential Zone", center: { lat: 28.252, lon: 77.214 }, population: 3_200, mobilityLimitedFraction: 0.12, vehicleAccessFraction: 0.38, vulnerability: 0.7, originNodeId: "n-west" },
    { id: "zone-east", name: "East Residential and Market Zone", center: { lat: 28.2525, lon: 77.228 }, population: 2_850, mobilityLimitedFraction: 0.09, vehicleAccessFraction: 0.43, vulnerability: 0.64, originNodeId: "n-east" },
    { id: "zone-south", name: "South Peri-urban Zone", center: { lat: 28.244, lon: 77.222 }, population: 2_100, mobilityLimitedFraction: 0.1, vehicleAccessFraction: 0.31, vulnerability: 0.72, originNodeId: "n-south" },
    { id: "zone-north", name: "North Settlement", center: { lat: 28.257, lon: 77.216 }, population: 1_450, mobilityLimitedFraction: 0.14, vehicleAccessFraction: 0.35, vulnerability: 0.58, originNodeId: "n-north" },
  ];
  const responders: ScenarioAssets["responders"] = [
    { id: "unit-bus-1", name: "Evacuation Bus 1", type: "bus", homeNodeId: "n-campus", seats: 46, crew: 2, speedFactor: 0.9, capabilities: ["general-evacuation"] },
    { id: "unit-bus-2", name: "Evacuation Bus 2", type: "bus", homeNodeId: "n-east", seats: 46, crew: 2, speedFactor: 0.9, capabilities: ["general-evacuation"] },
    { id: "unit-bus-3", name: "Accessible Evacuation Bus", type: "bus", homeNodeId: "n-west", seats: 34, crew: 3, speedFactor: 0.84, capabilities: ["wheelchair", "general-evacuation"] },
    { id: "unit-ambulance-1", name: "Medical Transport 1", type: "ambulance", homeNodeId: "n-hospital", seats: 4, crew: 3, speedFactor: 1.15, capabilities: ["advanced-life-support"] },
    { id: "unit-rescue-1", name: "High-water Rescue 1", type: "rescue", homeNodeId: "n-campus", seats: 12, crew: 5, speedFactor: 0.72, capabilities: ["high-water", "debris-clearance"] },
    { id: "unit-traffic-1", name: "Traffic Control Team", type: "traffic", homeNodeId: "n-east", seats: 0, crew: 4, speedFactor: 1, capabilities: ["contraflow", "junction-control"] },
  ];
  return {
    roads,
    bridges,
    buildings,
    facilities,
    populationZones,
    responders,
    network: { nodes, edges },
  };
}

export function createEitFaridabadScenario(
  hazard: HazardKind = "flood",
  options: {
    seed?: string;
    parameterOverrides?: Record<string, string | number | boolean>;
  } = {},
): ScenarioDefinition {
  const seed = options.seed ?? "aegis-eit-faridabad-v1";
  const scaffoldArea = { north: 28.266, south: 28.236, east: 77.236, west: 77.204 };
  const area = translateArea(
    scaffoldArea,
    EIT_LEGACY_SCAFFOLD_CENTER,
    EIT_OFFICIAL_MAP_CENTER,
  );
  const parameters = applyParameterChanges(parametersFor(hazard), options.parameterOverrides);
  const metadata = {
    id: `eit-faridabad-${hazard}-official-center-v2`,
    name: `EIT Faridabad ${hazard === "flood" ? "Cloudburst Flood" : hazard} Scenario`,
    locationName: "Echelon Institute of Technology area, Faridabad, India",
    description:
      hazard === "flood"
        ? "A deterministic 120-minute cloudburst, drainage-overload and surface-flow planning scenario centred on the EIT campus."
        : `A deterministic 120-minute ${hazard} planning scenario centred on the EIT campus.`,
    startTimeIso: "2026-08-09T09:00:00+05:30",
    isPrototype: true,
    estimateLabel: PROTOTYPE_LABEL,
    disclaimer: PROTOTYPE_DISCLAIMER,
    tags: ["CodeFusion EIT Hackathon", "AEGIS", "EIT Faridabad", "prototype", hazard],
  };
  const provenance: DataProvenance[] = [
    { id: "prov-scenario", label: "AEGIS EIT scenario inputs", kind: "scenario-input", note: "User-adjustable prototype assumptions; not a report of an actual event." },
    { id: "prov-eit-official-map-center", label: "Official EIT Contact page embedded-map center", kind: "open-data", sourceUrl: "https://eitfaridabad.com/contact-us/", note: "Imported center coordinate only: 28.3912265, 77.4398682. It does not validate prototype terrain, buildings, roads or population." },
    { id: "prov-terrain", label: "Synthetic terrain proxy", kind: "prototype", note: "Replace with surveyed DEM and drainage data before operational use." },
    { id: "prov-assets", label: "Demonstration asset inventory", kind: "prototype", note: "Approximate demonstration entities and capacities." },
    { id: "prov-model", label: "AEGIS deterministic hazard model", kind: "derived", note: "Reproducible from scenario, parameters, model version and seed." },
  ];
  return {
    metadata,
    hazard,
    seed,
    durationMinutes: 120,
    stepMinutes: 5,
    area,
    gridRows: 10,
    gridColumns: 12,
    hazardSource: translateCoordinate(
      { lat: 28.2485, lon: 77.217 },
      EIT_LEGACY_SCAFFOLD_CENTER,
      EIT_OFFICIAL_MAP_CENTER,
    ),
    terrain: translatedTerrain(
      buildTerrain(seed, 10, 12, scaffoldArea),
      EIT_LEGACY_SCAFFOLD_CENTER,
      EIT_OFFICIAL_MAP_CENTER,
    ),
    assets: translateAssetsPreservingNames(
      createLegacyScaffoldAssets(),
      EIT_LEGACY_SCAFFOLD_CENTER,
      EIT_OFFICIAL_MAP_CENTER,
    ),
    parameters,
    provenance,
  };
}

function seriesNearest(field: SpatialCellSeries[], coordinate: Coordinate): SpatialCellSeries {
  let nearest = field[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const series of field) {
    const distance = distanceMeters(series.cell.center, coordinate);
    if (distance < nearestDistance) {
      nearest = series;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function peakSample(series: SpatialCellSeries): HazardCellSample {
  return series.samples.reduce((peak, sample) => {
    const current = sample.hazard === "flood"
      ? sample.depthM
      : sample.hazard === "earthquake"
        ? sample.mmi
        : sample.hazard === "wildfire"
          ? sample.firelineIntensityKwM
          : sample.hazard === "cyclone"
            ? Math.max(sample.windKph, sample.surgeDepthM * 50)
            : sample.exposureRatio;
    const previous = peak.hazard === "flood"
      ? peak.depthM
      : peak.hazard === "earthquake"
        ? peak.mmi
        : peak.hazard === "wildfire"
          ? peak.firelineIntensityKwM
          : peak.hazard === "cyclone"
            ? Math.max(peak.windKph, peak.surgeDepthM * 50)
            : peak.exposureRatio;
    return current > previous ? sample : peak;
  }, series.samples[0]);
}

function thresholdWindows(
  samples: HazardCellSample[],
  stepMinutes: number,
  predicate: (sample: HazardCellSample) => boolean,
): TimeWindow[] {
  const windows: TimeWindow[] = [];
  let start: number | null = null;
  for (const sample of samples) {
    if (predicate(sample) && start === null) start = sample.minute;
    if (!predicate(sample) && start !== null) {
      windows.push({ startMinute: start, endMinute: sample.minute });
      start = null;
    }
  }
  if (start !== null) {
    windows.push({ startMinute: start, endMinute: samples.at(-1)!.minute + stepMinutes });
  }
  return windows;
}

function roadStatusForDepth(depthM: number): RoadStatus {
  if (depthM > 0.45) return "closed";
  if (depthM > 0.25) return "restricted";
  if (depthM > 0.1) return "advisory";
  return "open";
}

function statusWorst(a: RoadStatus, b: RoadStatus): RoadStatus {
  const rank: Record<RoadStatus, number> = { open: 0, advisory: 1, restricted: 2, closed: 3 };
  return rank[a] >= rank[b] ? a : b;
}

function floodPassability(
  depthM: number,
  score: number,
  velocityMps = 0,
): Record<TravelMode, ModePassability> {
  const thresholds: Record<TravelMode, number> = {
    pedestrian: 0.1,
    car: 0.15,
    bus: 0.25,
    ambulance: 0.3,
    heavy_rescue: 0.6,
  };
  return Object.fromEntries(
    TRAVEL_MODES.map((mode) => {
      const velocityThresholds: Record<TravelMode, number> = {
        pedestrian: 0.45,
        car: 0.8,
        bus: 1,
        ambulance: 1,
        heavy_rescue: 1.5,
      };
      const passable = depthM <= thresholds[mode] && velocityMps <= velocityThresholds[mode];
      return [
        mode,
        {
          passable,
          confidence: confidence(score, ["modelled peak road depth", "modelled flow velocity", `${mode} planning thresholds`], ["Road crown, hidden scour, vehicle condition and operator judgement are not resolved."]),
          reason: passable
            ? `Modelled depth ${round(depthM, 2)} m and velocity ${round(velocityMps, 2)} m/s are within the ${mode} planning envelope.`
            : `Modelled depth ${round(depthM, 2)} m or velocity ${round(velocityMps, 2)} m/s exceeds the ${mode} planning envelope.`,
        },
      ];
    }),
  ) as unknown as Record<TravelMode, ModePassability>;
}

function floodSeries(scenario: ScenarioDefinition, parameters: FloodParameters): SpatialCellSeries[] {
  const minimumElevation = Math.min(...scenario.terrain.map((cell) => cell.elevationM));
  const maximumElevation = Math.max(...scenario.terrain.map((cell) => cell.elevationM));
  return scenario.terrain.map((cell) => {
    const elevationRange = Math.max(0.1, maximumElevation - minimumElevation);
    const depression = 1 - (cell.elevationM - minimumElevation) / elevationRange;
    const sourceDistanceM = distanceMeters(scenario.hazardSource, cell.center);
    const sourceInfluence = Math.exp(-sourceDistanceM / 1_450);
    const infiltrationLossM =
      (cell.infiltrationMmPerHour * (1 - parameters.antecedentSaturation) * parameters.rainfallDurationMinutes) /
      60 /
      1_000;
    const drainageLossM =
      (cell.drainageMmPerHour * (1 - parameters.drainageBlockageFraction) * parameters.rainfallDurationMinutes) /
      60 /
      1_000;
    const rainfallM =
      (parameters.rainfallMmPerHour * parameters.rainfallDurationMinutes) / 60 / 1_000;
    const runoffM = Math.max(0, rainfallM * (0.48 + cell.imperviousFraction * 0.46) - infiltrationLossM - drainageLossM);
    const catchmentAmplification =
      2.6 + depression * 6.2 + cell.imperviousFraction * 1.7 + randomUnit(scenario.seed, `${cell.id}-storage`) * 0.65;
    const blockageStorage =
      parameters.drainageBlockageFraction * (0.08 + depression * 0.24) * (0.65 + cell.imperviousFraction * 0.35);
    const upstreamContribution = parameters.upstreamRiseM * sourceInfluence * (0.42 + depression * 0.48);
    const peakDepthM = round(
      clamp(
        parameters.initialWaterDepthM +
          runoffM * catchmentAmplification +
          blockageStorage +
          upstreamContribution -
          Math.max(0, cell.elevationM - minimumElevation - 4.2) * 0.045,
        0,
        2.8,
      ),
      3,
    );
    const rawArrival =
      4 +
      sourceDistanceM / Math.max(5, parameters.sourceSpreadMPerMinute) +
      Math.max(0, cell.elevationM - minimumElevation) * 1.4 -
      depression * 5;
    const arrivalMinute =
      peakDepthM < 0.045
        ? null
        : clamp(Math.round(rawArrival / scenario.stepMinutes) * scenario.stepMinutes, 0, 75);
    const rawPeakMinute = Math.max(
      (arrivalMinute ?? 0) + 15,
      parameters.rainfallDurationMinutes + (depression - 0.5) * 18 + sourceInfluence * 5,
    );
    const peakMinute = clamp(
      Math.round(rawPeakMinute / scenario.stepMinutes) * scenario.stepMinutes,
      scenario.stepMinutes,
      100,
    );
    const localRecessionRate = parameters.recessionRate * (0.62 + cell.slope * 10 + (1 - depression) * 0.5);
    const theoreticalRecessionMinute =
      peakDepthM <= 0.05
        ? peakMinute
        : Math.ceil((peakMinute + Math.log(peakDepthM / 0.05) / Math.max(0.005, localRecessionRate)) / scenario.stepMinutes) * scenario.stepMinutes;
    const samples: FloodCellSample[] = [];
    let previousDepth = parameters.initialWaterDepthM;
    for (let minute = 0; minute <= scenario.durationMinutes; minute += scenario.stepMinutes) {
      let depthM = parameters.initialWaterDepthM;
      if (arrivalMinute !== null && minute >= arrivalMinute) {
        if (minute <= peakMinute) {
          const progress = clamp((minute - arrivalMinute) / Math.max(1, peakMinute - arrivalMinute), 0, 1);
          depthM = parameters.initialWaterDepthM +
            (peakDepthM - parameters.initialWaterDepthM) * Math.sin((Math.PI / 2) * progress) ** 1.35;
        } else {
          depthM = peakDepthM * Math.exp(-localRecessionRate * (minute - peakMinute));
        }
      }
      if (depthM < 0.006) depthM = 0;
      const riseRateMPerMinute = (depthM - previousDepth) / scenario.stepMinutes;
      const velocityMps = depthM <= 0.025
        ? 0
        : clamp(
            (0.08 + Math.sqrt(depthM * Math.max(0.004, cell.slope)) * 5.5) *
              (0.072 / Math.max(0.025, cell.roughness)) *
              (0.72 + sourceInfluence * 0.35),
            0,
            2.4,
          );
      const directionDeg =
        (cell.aspectDeg * 0.68 + bearingDegrees(scenario.hazardSource, cell.center) * 0.32 +
          (randomUnit(scenario.seed, `${cell.id}-direction`) - 0.5) * 8 +
          360) %
        360;
      let phase: FloodCellSample["phase"] = "dry";
      if (depthM > 0) {
        if (minute === arrivalMinute) phase = "arriving";
        else if (Math.abs(minute - peakMinute) <= scenario.stepMinutes / 2) phase = "peak";
        else if (riseRateMPerMinute > 0.002) phase = "rising";
        else if (riseRateMPerMinute < -0.002) phase = "receding";
        else phase = "standing";
      }
      samples.push({
        hazard: "flood",
        minute,
        depthM: round(depthM, 3),
        velocityMps: round(velocityMps, 3),
        directionDeg: round(directionDeg, 1),
        waterSurfaceElevationM: round(cell.elevationM + depthM, 3),
        riseRateMPerMinute: round(riseRateMPerMinute, 4),
        phase,
      });
      previousDepth = depthM;
    }
    const coveragePenalty = distanceMeters(EIT_OFFICIAL_MAP_CENTER, cell.center) / 12_000;
    return {
      cell,
      samples,
      arrivalMinute,
      peakMinute,
      recessionMinute: theoreticalRecessionMinute,
      peakValue: peakDepthM,
      metric: "water depth",
      unit: "m",
      confidence: confidence(
        0.82 - coveragePenalty,
        ["deterministic rainfall-runoff balance", "terrain/depression proxy", "drainage-capacity assumption"],
        ["Synthetic terrain and drainage inventory must be replaced for operational decisions."],
      ),
    };
  });
}

function floodRoadImpacts(scenario: ScenarioDefinition, field: SpatialCellSeries[]): RoadImpact[] {
  return scenario.assets.roads.map((road) => {
    const series = seriesNearest(field, midpoint(road.geometry));
    const adjustedSamples = series.samples.map((sample) => {
      const flood = sample as FloodCellSample;
      return {
        ...flood,
        depthM: Math.max(
          0,
          flood.depthM - road.elevationOffsetM - road.drainageQuality * 0.055,
        ),
      };
    });
    const peak = adjustedSamples.reduce((maximum, sample) => sample.depthM > maximum.depthM ? sample : maximum, adjustedSamples[0]);
    const peakDepthM = round(peak.depthM, 3);
    const status = roadStatusForDepth(peakDepthM);
    const closures = thresholdWindows(
      adjustedSamples,
      scenario.stepMinutes,
      (sample) => sample.hazard === "flood" && sample.depthM > 0.3,
    );
    const impactConfidence = confidence(
      series.confidence.score - 0.06,
      ["nearest hazard grid cell", "road elevation offset", "road drainage quality"],
      ["No surveyed road crown or culvert geometry."],
    );
    return {
      roadId: road.id,
      roadName: road.name,
      peakMinute: peak.minute,
      peakDepthM,
      peakIntensity: peakDepthM,
      status,
      closures,
      passability: floodPassability(peakDepthM, impactConfidence.score, peak.velocityMps),
      confidence: impactConfidence,
      explanation: [
        `Peak modelled carriageway depth is ${peakDepthM} m at T+${peak.minute} min.`,
        `Road elevation and drainage reduce adjacent cell depth by ${round(road.elevationOffsetM + road.drainageQuality * 0.055, 2)} m.`,
        closures.length > 0
          ? `The deterministic closure threshold is crossed in ${closures.length} time window${closures.length === 1 ? "" : "s"}.`
          : "The deterministic closure threshold is not crossed.",
      ],
    };
  });
}

function floodBridgeImpacts(
  scenario: ScenarioDefinition,
  field: SpatialCellSeries[],
  roads: RoadImpact[],
): BridgeImpact[] {
  const roadById = new Map(roads.map((road) => [road.roadId, road]));
  return scenario.assets.bridges.map((bridge) => {
    const series = seriesNearest(field, bridge.coordinate);
    const peak = peakSample(series) as FloodCellSample;
    const roadDepth = roadById.get(bridge.roadId)?.peakDepthM ?? peak.depthM;
    const approachDepthM = round(Math.max(peak.depthM, roadDepth), 3);
    const overtoppingRisk = round(clamp(approachDepthM / Math.max(0.2, bridge.deckClearanceM) * (1.15 - bridge.condition * 0.25), 0, 1), 2);
    const status: OperationalStatus = overtoppingRisk > 0.78
      ? "unavailable"
      : overtoppingRisk > 0.42
        ? "degraded"
        : "operational";
    return {
      bridgeId: bridge.id,
      bridgeName: bridge.name,
      peakMinute: peak.minute,
      approachDepthM,
      overtoppingRisk,
      status,
      confidence: confidence(series.confidence.score - 0.1, ["approach water depth", "deck-clearance assumption", "condition factor"], ["No structural inspection or hydraulic opening survey."]),
      explanation: [
        `Modelled approach depth is ${approachDepthM} m against ${bridge.deckClearanceM} m assumed deck clearance.`,
        `Condition factor is ${round(bridge.condition * 100, 0)}%; this is a screening result, not a structural assessment.`,
      ],
    };
  });
}

function floodBuildingImpacts(scenario: ScenarioDefinition, field: SpatialCellSeries[]): BuildingImpact[] {
  return scenario.assets.buildings.map((building) => {
    const series = seriesNearest(field, building.coordinate);
    const peak = peakSample(series) as FloodCellSample;
    const internalDepth = Math.max(0, peak.depthM - building.groundFloorElevationM);
    const ratio = clamp(internalDepth / 1.2 * (0.55 + building.vulnerability * 0.65), 0, 1);
    const severity = severityFromRatio(ratio);
    const occupantsPotentiallyExposed = Math.round(building.occupantsDay * clamp(internalDepth / 0.8, 0, 1));
    const status: OperationalStatus = internalDepth > 0.7
      ? "unavailable"
      : internalDepth > 0.15
        ? "degraded"
        : "operational";
    return {
      buildingId: building.id,
      buildingName: building.name,
      peakMinute: peak.minute,
      peakDepthM: round(internalDepth, 3),
      peakIntensity: round(internalDepth, 3),
      severity,
      groundFloorAffected: internalDepth >= 0.05,
      occupantsPotentiallyExposed,
      status,
      confidence: confidence(series.confidence.score - 0.08, ["nearest grid depth", "assumed ground-floor elevation", "occupancy schedule"], ["No surveyed floor level or building-specific fragility curve."]),
      explanation: [
        `External peak depth ${peak.depthM} m minus assumed floor elevation ${building.groundFloorElevationM} m gives ${round(internalDepth, 2)} m potential internal depth.`,
        `${occupantsPotentiallyExposed} daytime occupants fall within the modelled exposure envelope; this is not a casualty estimate.`,
      ],
    };
  });
}

function floodPopulationImpacts(scenario: ScenarioDefinition, field: SpatialCellSeries[]): PopulationImpact[] {
  return scenario.assets.populationZones.map((zone) => {
    const series = seriesNearest(field, zone.center);
    const peak = peakSample(series) as FloodCellSample;
    const exposureFraction = round(clamp((peak.depthM - 0.04) / 0.72 * (0.7 + zone.vulnerability * 0.35), 0, 1), 3);
    const peopleExposed = Math.round(zone.population * exposureFraction);
    const isolationRisk = round(clamp(peak.depthM / 0.65 * (0.7 + zone.vulnerability * 0.4), 0, 1), 2);
    const evacuationPriority = round(clamp(exposureFraction * 0.52 + isolationRisk * 0.28 + zone.vulnerability * 0.2, 0, 1), 2);
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      peakMinute: peak.minute,
      peakDepthM: peak.depthM,
      exposureFraction,
      peopleExposed,
      mobilityAssistanceEstimate: Math.round(peopleExposed * zone.mobilityLimitedFraction),
      evacuationPriority,
      isolationRisk,
      confidence: confidence(series.confidence.score - 0.07, ["zone population assumption", "modelled water depth", "vulnerability weighting"], ["Population is an aggregate planning estimate, not device-level presence data."]),
      explanation: [
        `${peopleExposed} of ${zone.population} scenario residents are within the depth-based exposure envelope.`,
        `Priority combines exposure ${round(exposureFraction * 100, 0)}%, isolation risk ${round(isolationRisk * 100, 0)}%, and vulnerability.`,
      ],
    };
  });
}

function accessStatusForFacility(
  facility: FacilityAsset,
  scenario: ScenarioDefinition,
  roadImpacts: RoadImpact[],
): RoadStatus {
  const nodeId = facility.networkNodeId;
  if (!nodeId) return "advisory";
  const incidentRoadIds = scenario.assets.network.edges
    .filter((edge) => edge.from === nodeId || edge.to === nodeId)
    .map((edge) => edge.roadId);
  if (incidentRoadIds.length === 0) return "advisory";
  return incidentRoadIds
    .map((id) => roadImpacts.find((impact) => impact.roadId === id)?.status ?? "advisory")
    .reduce(statusWorst, "open");
}

function floodFacilityImpacts(
  scenario: ScenarioDefinition,
  field: SpatialCellSeries[],
  roadImpacts: RoadImpact[],
  type: "hospital" | "shelter",
  exposedPopulation: number,
): FacilityImpact[] {
  return scenario.assets.facilities.filter((facility) => facility.type === type).map((facility) => {
    const series = seriesNearest(field, facility.coordinate);
    const peak = peakSample(series) as FloodCellSample;
    const accessStatus = accessStatusForFacility(facility, scenario, roadImpacts);
    const protectedDepth = Math.max(0, peak.depthM - (type === "shelter" ? 0.35 : 0));
    const directImpact = clamp((protectedDepth - 0.12) / 0.9, 0, 1);
    const projectedDemand = type === "hospital"
      ? Math.round(exposedPopulation * 0.018)
      : Math.round(exposedPopulation * 0.54 / 3);
    const projectedOccupancy = facility.baselineOccupancy + projectedDemand;
    const overloadMinute = projectedOccupancy > facility.capacity
      ? clamp(Math.round(peak.minute * facility.capacity / projectedOccupancy / 5) * 5, 5, peak.minute)
      : null;
    const status: OperationalStatus = directImpact > 0.72 || (type === "hospital" && accessStatus === "closed")
      ? "unavailable"
      : directImpact > 0.25 || accessStatus === "restricted" || accessStatus === "closed"
        ? "degraded"
        : "operational";
    return {
      facilityId: facility.id,
      facilityName: facility.name,
      facilityType: facility.type,
      peakMinute: peak.minute,
      peakDepthM: peak.depthM,
      peakIntensity: peak.depthM,
      status,
      accessStatus,
      projectedOccupancy,
      capacity: facility.capacity,
      overloadMinute,
      confidence: confidence(series.confidence.score - 0.12, ["modelled facility depth", "road access screen", "scenario capacity and demand ratio"], ["Facility staffing, supplies and real-time bed status are not connected."]),
      explanation: [
        `Direct modelled depth at the facility is ${peak.depthM} m; worst adjacent access status is ${accessStatus}.`,
        type === "shelter"
          ? "Shelter screening assumes a 0.35 m protected/raised safe-floor allowance; verify this before real use."
          : "No protected-floor allowance is applied to the hospital screen.",
        `Projected occupancy ${projectedOccupancy}/${facility.capacity} uses a transparent scenario demand ratio.`,
      ],
    };
  });
}

function floodUtilityImpacts(scenario: ScenarioDefinition, field: SpatialCellSeries[]): UtilityImpact[] {
  const totalPopulation = scenario.assets.populationZones.reduce((sum, zone) => sum + zone.population, 0);
  return scenario.assets.facilities
    .filter((facility): facility is FacilityAsset & { type: "power" | "water" | "telecom" } =>
      facility.type === "power" || facility.type === "water" || facility.type === "telecom")
    .map((facility) => {
      const series = seriesNearest(field, facility.coordinate);
      const threshold = facility.type === "power" ? 0.22 : facility.type === "water" ? 0.38 : 0.3;
      const outageSample = series.samples.find((sample) => (sample as FloodCellSample).depthM > threshold) as FloodCellSample | undefined;
      const peak = peakSample(series) as FloodCellSample;
      const status: OperationalStatus = peak.depthM > threshold * 2.1
        ? "unavailable"
        : peak.depthM > threshold
          ? "degraded"
          : "operational";
      const restoreMinute = outageSample
        ? series.samples.find((sample) => sample.minute > peak.minute && (sample as FloodCellSample).depthM <= threshold)?.minute ?? series.recessionMinute
        : null;
      return {
        facilityId: facility.id,
        utilityType: facility.type,
        status,
        estimatedOutageStartMinute: outageSample?.minute ?? null,
        estimatedRestoreMinute: restoreMinute,
        dependentPopulation: Math.min(totalPopulation, facility.capacity),
        confidence: confidence(series.confidence.score - 0.16, ["modelled site depth", "type-specific screening threshold", "scenario backup duration"], ["No live SCADA, component inventory or utility operator validation."]),
        explanation: [
          outageSample
            ? `The ${threshold} m screening threshold is first crossed at T+${outageSample.minute} min.`
            : `The ${threshold} m screening threshold is not crossed.`,
          restoreMinute === null ? "No outage is modelled." : `Hydraulic access may recover near T+${restoreMinute} min; repair time is not modelled.`,
        ],
      };
    });
}

function floodImpacts(scenario: ScenarioDefinition, field: SpatialCellSeries[]): ImpactBundle {
  const roads = floodRoadImpacts(scenario, field);
  const population = floodPopulationImpacts(scenario, field);
  const exposedPopulation = population.reduce((sum, impact) => sum + impact.peopleExposed, 0);
  return {
    roads,
    bridges: floodBridgeImpacts(scenario, field, roads),
    buildings: floodBuildingImpacts(scenario, field),
    population,
    hospitals: floodFacilityImpacts(scenario, field, roads, "hospital", exposedPopulation),
    shelters: floodFacilityImpacts(scenario, field, roads, "shelter", exposedPopulation),
    utilities: floodUtilityImpacts(scenario, field),
  };
}

function bboxAreaSquareKm(scenario: ScenarioDefinition): number {
  const northWest = { lat: scenario.area.north, lon: scenario.area.west };
  const northEast = { lat: scenario.area.north, lon: scenario.area.east };
  const southWest = { lat: scenario.area.south, lon: scenario.area.west };
  return distanceMeters(northWest, northEast) * distanceMeters(northWest, southWest) / 1_000_000;
}

function floodTimeline(
  scenario: ScenarioDefinition,
  field: SpatialCellSeries[],
): TimelineFrame[] {
  const cellArea = bboxAreaSquareKm(scenario) / field.length;
  return Array.from(
    { length: Math.floor(scenario.durationMinutes / scenario.stepMinutes) + 1 },
    (_, frameIndex) => {
      const minute = frameIndex * scenario.stepMinutes;
      const samples = field.map((series) => series.samples[frameIndex] as FloodCellSample);
      const wet = samples.filter((sample) => sample.depthM >= 0.1);
      const deep = samples.filter((sample) => sample.depthM >= 0.5);
      const maxDepth = Math.max(0, ...samples.map((sample) => sample.depthM));
      const averageDepth = wet.length === 0 ? 0 : wet.reduce((sum, sample) => sum + sample.depthM, 0) / wet.length;
      const exposedPopulation = scenario.assets.populationZones.reduce((sum, zone) => {
        const series = seriesNearest(field, zone.center);
        const depth = (series.samples[frameIndex] as FloodCellSample).depthM;
        return sum + Math.round(zone.population * clamp((depth - 0.04) / 0.72 * (0.7 + zone.vulnerability * 0.35), 0, 1));
      }, 0);
      const unavailableRoads = scenario.assets.roads.filter((road) => {
        const series = seriesNearest(field, midpoint(road.geometry));
        const depth = (series.samples[frameIndex] as FloodCellSample).depthM - road.elevationOffsetM - road.drainageQuality * 0.055;
        return depth > 0.3;
      }).length;
      const alerts: string[] = [];
      if (maxDepth >= 1) alerts.push(`Extreme local depth ${round(maxDepth, 2)} m modelled.`);
      if (unavailableRoads >= 3) alerts.push(`${unavailableRoads} road segments exceed the closure threshold.`);
      if (exposedPopulation >= 2_500) alerts.push(`${exposedPopulation.toLocaleString("en-IN")} people enter the modelled exposure envelope.`);
      if (deep.length >= 8) alerts.push(`${deep.length} grid cells exceed 0.5 m water depth.`);
      const phase = minute === 0
        ? "initial"
        : minute < 25
          ? "onset"
          : minute < 70
            ? "rising"
            : minute <= 90
              ? "peak"
              : "recession";
      return {
        minute,
        timestampIso: timestampAt(scenario.metadata.startTimeIso, minute),
        phase,
        severity: severityFromRatio(Math.max(maxDepth / 1.5, exposedPopulation / 8_000)),
        affectedAreaSqKm: round(wet.length * cellArea, 2),
        exposedPopulation,
        unavailableRoads,
        criticalAlerts: alerts,
        hazardSummary: {
          maximumDepthM: round(maxDepth, 3),
          averageWetCellDepthM: round(averageDepth, 3),
          deepWaterCells: deep.length,
          maximumVelocityMps: round(Math.max(0, ...samples.map((sample) => sample.velocityMps)), 3),
        },
      };
    },
  );
}

const FLOOD_MODEL: SimulationModelInfo = {
  id: "aegis-flood-surface-v1",
  name: "AEGIS deterministic surface flood demonstrator",
  version: "1.0.0",
  classification: "deterministic-prototype",
  method: "Grid rainfall-runoff balance with terrain storage, source travel time, drainage loss, deterministic hydrographs and explicit road/facility screening thresholds.",
  limitations: [
    "Not a 2D shallow-water or certified hydraulic solver.",
    "Synthetic terrain, drainage and asset inventory in the bundled EIT scenario.",
    "Calibration against observed gauges and surveyed cross-sections is required for operational use.",
  ],
};

function simulateFlood(scenario: ScenarioDefinition, options: SimulationRunOptions = {}): SimulationResult {
  const parameters = applyParameterChanges(scenario.parameters, options.parameterChanges);
  if (parameters.kind !== "flood") throw new Error("Flood plugin received non-flood parameters.");
  const effectiveScenario = { ...scenario, parameters };
  const field = floodSeries(effectiveScenario, parameters);
  const impacts = floodImpacts(effectiveScenario, field);
  const timeline = floodTimeline(effectiveScenario, field);
  const peakFrame = timeline.reduce((peak, frame) =>
    frame.affectedAreaSqKm + frame.exposedPopulation / 10_000 > peak.affectedAreaSqKm + peak.exposedPopulation / 10_000
      ? frame
      : peak,
  timeline[0]);
  const maximumDepth = Math.max(...field.map((series) => series.peakValue));
  const metrics: SimulationMetrics = {
    peakMinute: peakFrame.minute,
    peakAffectedAreaSqKm: Math.max(...timeline.map((frame) => frame.affectedAreaSqKm)),
    peakExposedPopulation: Math.max(...timeline.map((frame) => frame.exposedPopulation)),
    peakUnavailableRoads: Math.max(...timeline.map((frame) => frame.unavailableRoads)),
    maximumHazardValue: maximumDepth,
    maximumHazardUnit: "m water depth",
    peopleRequiringEvacuation: impacts.population.filter((impact) => impact.evacuationPriority >= 0.45).reduce((sum, impact) => sum + impact.peopleExposed, 0),
    facilitiesDegraded: [...impacts.hospitals, ...impacts.shelters].filter((impact) => impact.status !== "operational").length + impacts.utilities.filter((impact) => impact.status !== "operational").length,
    estimatedEconomicDamageInr: null,
    estimateNotes: [
      "No monetary damage is asserted because verified replacement values and locally calibrated depth-damage curves are absent.",
      "Building, population and infrastructure effects are labelled planning estimates, never observed damage.",
    ],
  };
  const branchId = options.branchId ?? "baseline";
  const runId = stableId("run", `${scenario.metadata.id}:${scenario.seed}:${branchId}:${JSON.stringify(parameters)}`);
  return {
    runId,
    scenarioId: scenario.metadata.id,
    hazard: "flood",
    seed: scenario.seed,
    estimateLabel: scenario.metadata.estimateLabel,
    disclaimer: scenario.metadata.disclaimer,
    model: FLOOD_MODEL,
    timeline,
    field,
    impacts,
    metrics,
    provenance: scenario.provenance,
    audit: [
      { sequence: 1, event: "scenario-loaded", detail: `${scenario.metadata.id} with ${scenario.terrain.length} terrain cells.` },
      { sequence: 2, event: "parameters-locked", detail: `Seed ${scenario.seed}; branch ${branchId}; 0-${scenario.durationMinutes} minutes at ${scenario.stepMinutes}-minute steps.` },
      { sequence: 3, event: "hazard-solved", detail: `Deterministic flood field generated; maximum depth ${round(maximumDepth, 2)} m.` },
      { sequence: 4, event: "impacts-derived", detail: `${impacts.roads.length} roads, ${impacts.buildings.length} buildings and ${impacts.population.length} population zones screened.` },
    ],
  };
}

function earthquakeSeries(
  scenario: ScenarioDefinition,
  parameters: EarthquakeParameters,
): SpatialCellSeries[] {
  return scenario.terrain.map((cell) => {
    const distanceKm = Math.max(0.2, distanceMeters(scenario.hazardSource, cell.center) / 1_000);
    const hypocentralKm = Math.sqrt(distanceKm ** 2 + parameters.focalDepthKm ** 2);
    const siteFactor = parameters.soilAmplification * (1 + (cell.imperviousFraction - 0.5) * 0.12);
    const baseMmi = clamp(1.25 + parameters.magnitudeMw * 1.18 - Math.log10(hypocentralKm + 1) * 1.65 + Math.log10(siteFactor + 0.1), 1, 10);
    const peakPga = clamp(0.006 * 10 ** (0.43 * parameters.magnitudeMw) / (1 + hypocentralKm / 16) * siteFactor, 0.005, 1.4);
    const liquefactionBase = clamp((1 - (cell.elevationM - 202) / 12) * 0.36 + (cell.landUse === "open" ? 0.12 : 0), 0, 0.72);
    const samples: EarthquakeCellSample[] = [];
    for (let minute = 0; minute <= scenario.durationMinutes; minute += scenario.stepMinutes) {
      const mainPulse = Math.exp(-(((minute - 10) / 5.5) ** 2));
      const aftershock = parameters.aftershockFactor * Math.exp(-(((minute - 65) / 7.5) ** 2));
      const intensityFactor = Math.max(mainPulse, aftershock);
      const currentMmi = clamp(1 + (baseMmi - 1) * intensityFactor, 1, 10);
      const currentPga = peakPga * intensityFactor;
      const currentLiquefaction = liquefactionBase * intensityFactor;
      samples.push({
        hazard: "earthquake",
        minute,
        pgaG: round(currentPga, 3),
        mmi: round(currentMmi, 2),
        liquefactionProbability: round(currentLiquefaction, 3),
        groundDisplacementCm: round(currentPga * 7 + currentLiquefaction * 11, 2),
        debrisRisk: round(clamp((currentMmi - 4) / 5 * (0.58 + cell.imperviousFraction * 0.42), 0, 1), 3),
        bridgeDemandIndex: round(clamp(currentPga / 0.65 * (0.7 + currentLiquefaction * 0.3), 0, 1), 3),
        aftershock: minute >= 35 && aftershock > mainPulse,
      });
    }
    return {
      cell,
      samples,
      arrivalMinute: 10,
      peakMinute: 10,
      recessionMinute: 75,
      peakValue: round(baseMmi, 2),
      metric: "Modified Mercalli intensity",
      unit: "MMI",
      confidence: confidence(0.68, ["magnitude-distance attenuation", "soil amplification proxy", "fixed aftershock branch"], ["No local strong-motion station, fault geometry or building-code inventory."]),
    };
  });
}

function wildfireSeries(
  scenario: ScenarioDefinition,
  parameters: WildfireParameters,
): SpatialCellSeries[] {
  const humidityDryingFactor = clamp((100 - parameters.relativeHumidityPct) / 75, 0.12, 1.2);
  const effectiveFuelAvailability = clamp(
    parameters.fuelDryness * (0.62 + humidityDryingFactor * 0.38),
    0.04,
    1,
  );
  return scenario.terrain.map((cell) => {
    const distance = distanceMeters(scenario.hazardSource, cell.center);
    const bearing = bearingDegrees(scenario.hazardSource, cell.center);
    const alignment = Math.cos(toRadians(bearing - parameters.windDirectionDeg));
    const fuelFactor = cell.landUse === "agricultural" || cell.landUse === "open" ? 1.18 : cell.landUse === "campus" ? 0.48 : 0.72;
    const spreadMPerMinute = clamp(
      7 + parameters.windSpeedKph * 0.55 * Math.max(0.18, 0.65 + alignment * 0.52) * effectiveFuelAvailability * fuelFactor,
      3,
      38,
    );
    const arrival = Math.round((distance / spreadMPerMinute) / scenario.stepMinutes) * scenario.stepMinutes;
    const burnDuration = 30 + Math.round(fuelFactor * 20);
    const peakIntensity = clamp(
      360 + parameters.ignitionIntensity * 1_850 * effectiveFuelAvailability * fuelFactor * (0.72 + Math.max(0, alignment) * 0.48),
      180,
      3_200,
    );
    const samples: WildfireCellSample[] = [];
    for (let minute = 0; minute <= scenario.durationMinutes; minute += scenario.stepMinutes) {
      const local = minute - arrival;
      const burning = local >= 0 && local <= burnDuration;
      const burnCurve = !burning ? 0 : Math.sin(Math.PI * clamp(local / burnDuration, 0, 1)) ** 0.7;
      const smokeTravel = Math.max(0, minute * (parameters.windSpeedKph * 1_000 / 60) - distance);
      const smokeIndex = clamp(
        (minute >= Math.max(0, arrival - 20) ? 0.28 + effectiveFuelAvailability * 0.62 : 0) *
          Math.exp(-Math.abs(smokeTravel) / 2_600) *
          (0.75 + Math.max(0, alignment) * 0.4),
        0,
        1,
      );
      const intensity = peakIntensity * burnCurve;
      const emberSpottingRisk = clamp(
        effectiveFuelAvailability * (0.45 + parameters.windSpeedKph / 80) *
          (burning ? 0.72 : smokeIndex * 0.4) * (0.7 + Math.max(0, alignment) * 0.3),
        0,
        1,
      );
      samples.push({
        hazard: "wildfire",
        minute,
        firelineIntensityKwM: round(intensity, 1),
        flameLengthM: round(intensity <= 0 ? 0 : 0.0775 * intensity ** 0.46, 2),
        smokeIndex: round(smokeIndex, 3),
        burning,
        radiantHeatKwM2: round(intensity / 115, 2),
        emberSpottingRisk: round(emberSpottingRisk, 3),
        visibilityM: round(Math.max(40, 10_000 * (1 - smokeIndex) ** 2), 0),
      });
    }
    const reached = arrival <= scenario.durationMinutes;
    return {
      cell,
      samples,
      arrivalMinute: reached ? arrival : null,
      peakMinute: reached ? clamp(arrival + Math.round(burnDuration / 2 / 5) * 5, 0, scenario.durationMinutes) : scenario.durationMinutes,
      recessionMinute: reached ? arrival + burnDuration : null,
      peakValue: reached ? round(peakIntensity, 1) : Math.max(...samples.map((sample) => sample.smokeIndex * 500)),
      metric: "fireline intensity",
      unit: "kW/m",
      confidence: confidence(0.61, ["wind-aligned spread", "fuel/land-use proxy", "relative-humidity drying factor", "deterministic burn curve"], ["No live fuel moisture, suppression action or calibrated fire-behaviour model."]),
    };
  });
}

function cycloneSeries(
  scenario: ScenarioDefinition,
  parameters: CycloneParameters,
): SpatialCellSeries[] {
  const elevationMinimum = Math.min(...scenario.terrain.map((cell) => cell.elevationM));
  const pressureDeficitFactor = clamp((1_010 - parameters.centralPressureHpa) / 60, 0.2, 1.35);
  return scenario.terrain.map((cell) => {
    const sourceDistanceKm = distanceMeters(scenario.hazardSource, cell.center) / 1_000;
    const bearing = bearingDegrees(scenario.hazardSource, cell.center);
    const alongTrack = Math.cos(toRadians(bearing - parameters.trackDirectionDeg)) * sourceDistanceKm;
    const peakMinute = clamp(Math.round((60 + alongTrack / Math.max(1, parameters.forwardSpeedKph) * 60) / 5) * 5, 25, 95);
    const terrainExposure = clamp(1 - (cell.elevationM - elevationMinimum) / 25, 0.68, 1.05);
    const pressureWindFactor = 0.82 + pressureDeficitFactor * 0.18;
    const localPeakWind = parameters.peakWindKph * pressureWindFactor * terrainExposure * (0.93 + randomUnit(scenario.seed, `${cell.id}-gust`) * 0.1);
    const inlandLowPointProxy = clamp((elevationMinimum + 1.6 - cell.elevationM) / 1.6, 0, 1);
    const peakSurge = parameters.coastalSurgeM * inlandLowPointProxy * 0.18;
    const samples: CycloneCellSample[] = [];
    for (let minute = 0; minute <= scenario.durationMinutes; minute += scenario.stepMinutes) {
      const envelope = Math.exp(-(((minute - peakMinute) / 31) ** 2));
      const rainEnvelope = Math.exp(-(((minute - (peakMinute - 12)) / 38) ** 2));
      const windKph = localPeakWind * envelope;
      const rainfallRate = parameters.rainfallMmPerHour * (0.75 + pressureDeficitFactor * 0.35) * rainEnvelope;
      const surgeDepthM = peakSurge * Math.exp(-(((minute - peakMinute) / 34) ** 2));
      const rainfallExcessM = Math.max(0, rainfallRate - cell.drainageMmPerHour) / 1_000 *
        Math.min(60, minute) / 60 * (0.55 + cell.imperviousFraction * 0.45);
      const surfaceFloodDepthM = surgeDepthM + rainfallExcessM;
      const debrisRisk = clamp(windKph / 175 * (0.72 + cell.imperviousFraction * 0.32), 0, 1);
      samples.push({
        hazard: "cyclone",
        minute,
        windKph: round(windKph, 1),
        rainfallMmPerHour: round(rainfallRate, 1),
        surgeDepthM: round(surgeDepthM, 3),
        debrisRisk: round(debrisRisk, 3),
        gustKph: round(windKph * 1.18, 1),
        surfaceFloodDepthM: round(surfaceFloodDepthM, 3),
        powerFailureRisk: round(clamp(Math.max(windKph / 165, debrisRisk * 0.86, surfaceFloodDepthM / 0.8), 0, 1), 3),
      });
    }
    return {
      cell,
      samples,
      arrivalMinute: clamp(peakMinute - 45, 0, scenario.durationMinutes),
      peakMinute,
      recessionMinute: clamp(peakMinute + 50, 0, scenario.durationMinutes),
      peakValue: round(Math.max(localPeakWind, peakSurge * 50), 2),
      metric: "wind speed",
      unit: "km/h",
      confidence: confidence(0.63, ["parametric wind envelope", "central-pressure consistency factor", "track timing", "terrain exposure proxy"], ["EIT is inland; the surge layer is a low-point demonstration proxy, not coastal hydrodynamics."]),
    };
  });
}

function chemicalSeries(
  scenario: ScenarioDefinition,
  parameters: ChemicalParameters,
): SpatialCellSeries[] {
  const windMPerMinute = parameters.windSpeedKph * 1_000 / 60;
  return scenario.terrain.map((cell) => {
    const distance = distanceMeters(scenario.hazardSource, cell.center);
    const bearing = bearingDegrees(scenario.hazardSource, cell.center);
    const relative = toRadians(bearing - parameters.windDirectionDeg);
    const downwindM = distance * Math.cos(relative);
    const crosswindM = distance * Math.sin(relative);
    const stabilitySpread: Record<ChemicalParameters["atmosphericStability"], number> = {
      A: 0.22,
      B: 0.17,
      C: 0.13,
      D: 0.1,
      E: 0.075,
      F: 0.055,
    };
    const arrival = downwindM <= 0 ? null : Math.round((downwindM / windMPerMinute) / 5) * 5;
    const samples: ChemicalCellSample[] = [];
    let peakConcentration = 0;
    let peakMinute = 0;
    for (let minute = 0; minute <= scenario.durationMinutes; minute += scenario.stepMinutes) {
      const plumeFrontM = windMPerMinute * minute;
      const ageMinutes = downwindM / Math.max(1, windMPerMinute);
      const active = downwindM > 0 && minute >= ageMinutes && minute <= ageMinutes + parameters.releaseDurationMinutes + 30;
      const longitudinalSigma = Math.max(90, 120 + plumeFrontM * 0.12);
      const crosswindSigma = Math.max(35, Math.abs(downwindM) * stabilitySpread[parameters.atmosphericStability] + 35);
      const frontFactor = Math.exp(-((downwindM - plumeFrontM) ** 2) / (2 * longitudinalSigma ** 2));
      const lateralFactor = Math.exp(-(crosswindM ** 2) / (2 * crosswindSigma ** 2));
      const decay = Math.exp(-Math.max(0, minute - ageMinutes - parameters.releaseDurationMinutes) / 24);
      const concentration = active
        ? parameters.releaseKgPerMinute * 1_000 * 0.095 * frontFactor * lateralFactor * decay /
          Math.max(1, parameters.windSpeedKph * (0.3 + crosswindSigma / 100))
        : 0;
      const exposureRatio = concentration / parameters.toxicityThresholdMgM3;
      const indoorProtectionFactor = cell.landUse === "commercial" || cell.landUse === "campus"
        ? 0.34
        : cell.landUse === "industrial"
          ? 0.52
          : 0.43;
      const indoorExposureRatio = exposureRatio * indoorProtectionFactor;
      if (concentration > peakConcentration) {
        peakConcentration = concentration;
        peakMinute = minute;
      }
      samples.push({
        hazard: "chemical",
        minute,
        concentrationMgM3: round(concentration, 2),
        exposureRatio: round(exposureRatio, 3),
        plumePresent: concentration >= parameters.toxicityThresholdMgM3 * 0.1,
        indoorExposureRatio: round(indoorExposureRatio, 3),
        depositionIndex: round(clamp(exposureRatio * stabilitySpread[parameters.atmosphericStability] * 1.8, 0, 1), 3),
        shelterInPlaceEffective: exposureRatio >= 1 && indoorExposureRatio < 1,
      });
    }
    const recession = samples.find((sample) => sample.minute > peakMinute && sample.concentrationMgM3 < parameters.toxicityThresholdMgM3 * 0.1)?.minute ?? null;
    return {
      cell,
      samples,
      arrivalMinute: arrival !== null && arrival <= scenario.durationMinutes ? arrival : null,
      peakMinute,
      recessionMinute: recession,
      peakValue: round(peakConcentration / parameters.toxicityThresholdMgM3, 3),
      metric: "toxicity threshold ratio",
      unit: "× threshold",
      confidence: confidence(0.6, ["Gaussian plume proxy", "wind vector", "release rate and duration"], ["Terrain, buildings, chemical reactions and indoor infiltration are not resolved."]),
    };
  });
}

function sampleRiskRatio(sample: HazardCellSample): number {
  return hazardRiskRatio(sample);
}

function buildingHazardScreen(
  sample: HazardCellSample,
  building: BuildingAsset,
): {
  impactIndex: number;
  occupantExposureFraction: number;
  groundFloorAffected: boolean;
  explanation: string[];
} {
  const vulnerabilityFactor = 0.48 + building.vulnerability * 0.72;
  if (sample.hazard === "earthquake") {
    const heightFactor = 1 + Math.min(8, Math.max(0, building.floors - 1)) * 0.025;
    const structuralDemand = Math.max(
      (sample.mmi - 4) / 5.5,
      sample.pgaG / 0.8,
      sample.groundDisplacementCm / 18,
      sample.liquefactionProbability * 0.85,
    );
    const impactIndex = clamp(structuralDemand * vulnerabilityFactor * heightFactor, 0, 1);
    return {
      impactIndex,
      occupantExposureFraction: clamp(Math.max(sample.debrisRisk, impactIndex * 0.82), 0, 1),
      groundFloorAffected: sample.liquefactionProbability >= 0.25 || sample.groundDisplacementCm >= 5,
      explanation: [
        `MMI ${sample.mmi}, PGA ${sample.pgaG} g, displacement ${sample.groundDisplacementCm} cm and the liquefaction proxy drive the structural screen.`,
        `The ${building.floors}-floor height factor and scenario vulnerability are generic; no building-specific fragility or inspection is claimed.`,
      ],
    };
  }
  if (sample.hazard === "wildfire") {
    const thermalDemand = Math.max(
      sample.firelineIntensityKwM / 2_400,
      sample.radiantHeatKwM2 / 10,
      sample.emberSpottingRisk * 0.82,
    );
    const impactIndex = clamp(thermalDemand * vulnerabilityFactor, 0, 1);
    return {
      impactIndex,
      occupantExposureFraction: clamp(Math.max(impactIndex, sample.smokeIndex * 0.88), 0, 1),
      groundFloorAffected: false,
      explanation: [
        `${round(sample.firelineIntensityKwM, 0)} kW/m fireline intensity, ${round(sample.radiantHeatKwM2, 1)} kW/m² radiant heat and ember risk drive the building screen.`,
        `Smoke affects occupancy and access but is not represented as structural fire damage.`,
      ],
    };
  }
  if (sample.hazard === "cyclone") {
    const windDemand = Math.max(sample.gustKph / 205, sample.debrisRisk * 0.92);
    const waterDemand = sample.surfaceFloodDepthM / 1.2;
    const impactIndex = clamp(Math.max(windDemand, waterDemand) * vulnerabilityFactor, 0, 1);
    return {
      impactIndex,
      occupantExposureFraction: clamp(Math.max(impactIndex, sample.powerFailureRisk * 0.65), 0, 1),
      groundFloorAffected: sample.surfaceFloodDepthM > building.groundFloorElevationM + 0.05,
      explanation: [
        `Gust ${round(sample.gustKph, 0)} km/h, debris risk ${round(sample.debrisRisk, 2)} and ${round(sample.surfaceFloodDepthM, 2)} m combined surface water drive the screen.`,
        `Wind fragility and water entry are generic planning relationships, not observed damage.`,
      ],
    };
  }
  if (sample.hazard === "flood") {
    const internalDepthM = Math.max(0, sample.depthM - building.groundFloorElevationM);
    const impactIndex = clamp(internalDepthM / 1.2 * (0.55 + building.vulnerability * 0.65), 0, 1);
    return {
      impactIndex,
      occupantExposureFraction: clamp(internalDepthM / 0.8, 0, 1),
      groundFloorAffected: internalDepthM >= 0.05,
      explanation: [
        `${round(internalDepthM, 2)} m potential internal depth follows the scenario floor-elevation allowance.`,
        "The flagship flood path supplies the primary flood-building calculation; this branch is a defensive type guard.",
      ],
    };
  }
  const impactIndex = clamp(Math.max(sample.indoorExposureRatio / 1.5, sample.exposureRatio / 4), 0, 1);
  return {
    impactIndex,
    occupantExposureFraction: clamp(Math.max(sample.indoorExposureRatio, sample.exposureRatio * 0.45), 0, 1),
    groundFloorAffected: false,
    explanation: [
      `Outdoor concentration is ${round(sample.exposureRatio, 2)}× threshold and the prototype indoor ratio is ${round(sample.indoorExposureRatio, 2)}×.`,
      `This is an occupancy/access exposure screen, not physical building damage; air-tightness, HVAC state and PPE are unknown.`,
    ],
  };
}

function routeStatusFromScreens(
  exposureRatio: number,
  passability: Record<TravelMode, ModePassability>,
): RoadStatus {
  if (!passability.pedestrian.passable && !passability.car.passable && !passability.bus.passable && !passability.ambulance.passable) {
    return "closed";
  }
  if (!passability.car.passable && !passability.bus.passable && !passability.ambulance.passable) {
    return "restricted";
  }
  if (exposureRatio > 0.72) return "restricted";
  if (exposureRatio > 0.36 || !passability.pedestrian.passable || !passability.bus.passable) return "advisory";
  return "open";
}

function genericImpacts(
  scenario: ScenarioDefinition,
  field: SpatialCellSeries[],
): ImpactBundle {
  const peakRatioAt = (coordinate: Coordinate): { series: SpatialCellSeries; ratio: number; minute: number; sample: HazardCellSample } => {
    const series = seriesNearest(field, coordinate);
    let best = { ratio: 0, minute: 0, sample: series.samples[0] };
    for (const sample of series.samples) {
      const ratio = sampleRiskRatio(sample);
      if (ratio > best.ratio) best = { ratio, minute: sample.minute, sample };
    }
    return { series, ...best };
  };
  const roads: RoadImpact[] = scenario.assets.roads.map((road) => {
    const { series, ratio, minute, sample } = peakRatioAt(midpoint(road.geometry));
    const adjustedRatio = clamp(ratio * (1.08 - road.importance * 0.12), 0, 1);
    const passability = screenModePassability(sample, series.confidence.score - 0.08);
    const status = routeStatusFromScreens(adjustedRatio, passability);
    const closures = thresholdWindows(series.samples, scenario.stepMinutes, (candidate) => {
      const screened = screenModePassability(candidate, series.confidence.score - 0.08);
      return !screened.pedestrian.passable && !screened.car.passable && !screened.bus.passable && !screened.ambulance.passable;
    });
    return {
      roadId: road.id,
      roadName: road.name,
      peakMinute: minute,
      peakIntensity: round(adjustedRatio, 3),
      status,
      closures,
      passability,
      confidence: confidence(series.confidence.score - 0.08, ["nearest hazard cell", "hazard-specific travel-mode screen", "road-class resilience factor"], ["No live inspection, authority closure or obstruction feed."]),
      explanation: [`Peak ${scenario.hazard} road exposure ratio is ${round(adjustedRatio, 2)} at T+${minute} min.`, `Travel modes are screened separately against the underlying hazard variables; road importance only adjusts prioritisation, not field evidence.`],
    };
  });
  const buildings: BuildingImpact[] = scenario.assets.buildings.map((building) => {
    const { series, minute, sample } = peakRatioAt(building.coordinate);
    const screen = buildingHazardScreen(sample, building);
    const adjusted = screen.impactIndex;
    const severity = severityFromRatio(adjusted);
    return {
      buildingId: building.id,
      buildingName: building.name,
      peakMinute: minute,
      peakIntensity: round(adjusted, 3),
      severity,
      groundFloorAffected: screen.groundFloorAffected,
      occupantsPotentiallyExposed: Math.round(building.occupantsDay * screen.occupantExposureFraction),
      status: adjusted > 0.78 ? "unavailable" : adjusted > 0.42 ? "degraded" : "operational",
      confidence: confidence(series.confidence.score - 0.1, ["hazard-specific building demand", "scenario building vulnerability", "occupancy schedule"], ["No building-specific engineering inspection, BIM attributes or locally calibrated fragility curve."]),
      explanation: [...screen.explanation, `${Math.round(building.occupantsDay * screen.occupantExposureFraction)} occupants fall inside a planning exposure envelope; this is not an injury estimate.`],
    };
  });
  const population: PopulationImpact[] = scenario.assets.populationZones.map((zone) => {
    const { series, ratio, minute } = peakRatioAt(zone.center);
    const exposureFraction = round(clamp(ratio * (0.72 + zone.vulnerability * 0.34), 0, 1), 3);
    const peopleExposed = Math.round(zone.population * exposureFraction);
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      peakMinute: minute,
      exposureFraction,
      peopleExposed,
      mobilityAssistanceEstimate: Math.round(peopleExposed * zone.mobilityLimitedFraction),
      evacuationPriority: round(clamp(exposureFraction * 0.68 + zone.vulnerability * 0.32, 0, 1), 2),
      isolationRisk: round(clamp(ratio * 0.9, 0, 1), 2),
      confidence: confidence(series.confidence.score - 0.08, ["zone population", "hazard exposure", "vulnerability weighting"], ["Aggregate scenario population only."]),
      explanation: [`${peopleExposed} people fall inside the ${scenario.hazard} exposure envelope.`, "Priority is deterministic and traceable to exposure and vulnerability."],
    };
  });
  const exposedPopulation = population.reduce((sum, impact) => sum + impact.peopleExposed, 0);
  const facilityImpact = (facility: FacilityAsset): FacilityImpact => {
    const { series, ratio, minute } = peakRatioAt(facility.coordinate);
    const accessStatus = accessStatusForFacility(facility, scenario, roads);
    const projectedDemand = facility.type === "hospital" ? Math.round(exposedPopulation * 0.015) : Math.round(exposedPopulation * 0.18);
    const projectedOccupancy = facility.baselineOccupancy + projectedDemand;
    const status: OperationalStatus = ratio > 0.8 || accessStatus === "closed" ? "unavailable" : ratio > 0.45 || accessStatus === "restricted" ? "degraded" : "operational";
    return {
      facilityId: facility.id,
      facilityName: facility.name,
      facilityType: facility.type,
      peakMinute: minute,
      peakIntensity: round(ratio, 3),
      status,
      accessStatus,
      projectedOccupancy,
      capacity: facility.capacity,
      overloadMinute: projectedOccupancy > facility.capacity ? Math.max(5, minute - 10) : null,
      confidence: confidence(series.confidence.score - 0.12, ["facility exposure", "road access", "scenario demand ratio"], ["No live staffing, stock or occupancy feed."]),
      explanation: [`Direct exposure ratio ${round(ratio, 2)} and ${accessStatus} access produce ${status} status.`, `Projected occupancy ${projectedOccupancy}/${facility.capacity}.`],
    };
  };
  const hospitals = scenario.assets.facilities.filter((facility) => facility.type === "hospital").map(facilityImpact);
  const shelters = scenario.assets.facilities.filter((facility) => facility.type === "shelter").map(facilityImpact);
  const utilities: UtilityImpact[] = scenario.assets.facilities
    .filter((facility): facility is FacilityAsset & { type: "power" | "water" | "telecom" } => facility.type === "power" || facility.type === "water" || facility.type === "telecom")
    .map((facility) => {
      const { series, ratio, minute } = peakRatioAt(facility.coordinate);
      return {
        facilityId: facility.id,
        utilityType: facility.type,
        status: ratio > 0.78 ? "unavailable" : ratio > 0.42 ? "degraded" : "operational",
        estimatedOutageStartMinute: ratio > 0.42 ? Math.max(0, minute - 10) : null,
        estimatedRestoreMinute: ratio > 0.42 ? series.recessionMinute : null,
        dependentPopulation: Math.min(facility.capacity, scenario.assets.populationZones.reduce((sum, zone) => sum + zone.population, 0)),
        confidence: confidence(series.confidence.score - 0.15, ["utility-site exposure screen"], ["No live utility telemetry or component failure model."]),
        explanation: [`Peak ${scenario.hazard} exposure ratio at the utility site is ${round(ratio, 2)}.`, "Restoration indicates hazard recession only, not completed repair."],
      };
    });
  const bridges: BridgeImpact[] = scenario.assets.bridges.map((bridge) => {
    const { series, ratio, minute, sample } = peakRatioAt(bridge.coordinate);
    const structuralRatio = sample.hazard === "earthquake"
      ? Math.max(sample.bridgeDemandIndex, sample.liquefactionProbability * 0.8)
      : sample.hazard === "cyclone"
        ? Math.max(sample.debrisRisk * 0.8, sample.surfaceFloodDepthM / Math.max(0.2, bridge.deckClearanceM))
        : sample.hazard === "wildfire"
          ? Math.max(sample.radiantHeatKwM2 / 12, sample.emberSpottingRisk * 0.45)
          : sample.hazard === "chemical"
            ? sample.exposureRatio / 4
            : ratio;
    const adjusted = clamp(structuralRatio * (1.18 - bridge.condition * 0.22), 0, 1);
    const approachDepthM = sample.hazard === "cyclone" ? sample.surfaceFloodDepthM : 0;
    return {
      bridgeId: bridge.id,
      bridgeName: bridge.name,
      peakMinute: minute,
      approachDepthM: round(approachDepthM, 3),
      overtoppingRisk: round(adjusted, 2),
      status: adjusted > 0.8 ? "unavailable" : adjusted > 0.45 ? "degraded" : "operational",
      confidence: confidence(series.confidence.score - 0.13, ["hazard-specific bridge demand", "bridge condition factor"], ["No inspection, structural model, hydraulic opening survey or authority clearance."]),
      explanation: [`Bridge demand ratio is ${round(adjusted, 2)} after the scenario condition factor.`, "This value is a closure-screening proxy, not overtopping or structural certification."],
    };
  });
  return { roads, bridges, buildings, population, hospitals, shelters, utilities };
}

function hazardTimelinePhase(
  hazard: Exclude<HazardKind, "flood">,
  minute: number,
  samples: HazardCellSample[],
): string {
  if (hazard === "earthquake") {
    const shaking = samples.some((sample) => sample.hazard === "earthquake" && sample.mmi >= 4);
    const aftershock = samples.some((sample) => sample.hazard === "earthquake" && sample.aftershock && sample.mmi >= 3);
    if (shaking && aftershock) return "aftershock";
    if (shaking) return "main-shock";
    return minute < 10 ? "pre-event" : minute < 45 ? "immediate-response" : "inspection-and-recovery";
  }
  if (hazard === "wildfire") {
    const burningCells = samples.filter((sample) => sample.hazard === "wildfire" && sample.burning).length;
    if (burningCells > 0) return burningCells >= Math.max(3, samples.length * 0.08) ? "active-spread" : "local-burn";
    return samples.some((sample) => sample.hazard === "wildfire" && sample.smokeIndex >= 0.2) ? "smoke-exposure" : "monitoring";
  }
  if (hazard === "cyclone") {
    const maximumWind = Math.max(0, ...samples.map((sample) => sample.hazard === "cyclone" ? sample.windKph : 0));
    if (maximumWind >= 100) return "peak-wind";
    if (maximumWind >= 45) return minute < 60 ? "approach" : "departing-system";
    return minute < 30 ? "outer-bands" : "post-storm-screen";
  }
  const plumeCells = samples.filter((sample) => sample.hazard === "chemical" && sample.plumePresent).length;
  if (plumeCells > 0) return minute <= 35 ? "active-release-and-plume" : "plume-clearance";
  return minute === 0 ? "source-screen" : "monitoring";
}

function rawHazardSummary(samples: HazardCellSample[]): Record<string, number> {
  const first = samples[0];
  if (!first) return {};
  if (first.hazard === "earthquake") {
    const values = samples.filter((sample): sample is EarthquakeCellSample => sample.hazard === "earthquake");
    return {
      maximumMmi: round(Math.max(0, ...values.map((sample) => sample.mmi)), 2),
      maximumPgaG: round(Math.max(0, ...values.map((sample) => sample.pgaG)), 3),
      maximumGroundDisplacementCm: round(Math.max(0, ...values.map((sample) => sample.groundDisplacementCm)), 2),
      maximumLiquefactionProxy: round(Math.max(0, ...values.map((sample) => sample.liquefactionProbability)), 3),
      maximumDebrisRisk: round(Math.max(0, ...values.map((sample) => sample.debrisRisk)), 3),
    };
  }
  if (first.hazard === "wildfire") {
    const values = samples.filter((sample): sample is WildfireCellSample => sample.hazard === "wildfire");
    return {
      burningCells: values.filter((sample) => sample.burning).length,
      maximumFirelineIntensityKwM: round(Math.max(0, ...values.map((sample) => sample.firelineIntensityKwM)), 1),
      maximumFlameLengthM: round(Math.max(0, ...values.map((sample) => sample.flameLengthM)), 2),
      maximumSmokeIndex: round(Math.max(0, ...values.map((sample) => sample.smokeIndex)), 3),
      minimumVisibilityM: round(Math.min(...values.map((sample) => sample.visibilityM)), 0),
    };
  }
  if (first.hazard === "cyclone") {
    const values = samples.filter((sample): sample is CycloneCellSample => sample.hazard === "cyclone");
    return {
      maximumSustainedWindKph: round(Math.max(0, ...values.map((sample) => sample.windKph)), 1),
      maximumGustKph: round(Math.max(0, ...values.map((sample) => sample.gustKph)), 1),
      maximumRainfallMmPerHour: round(Math.max(0, ...values.map((sample) => sample.rainfallMmPerHour)), 1),
      maximumSurfaceFloodDepthM: round(Math.max(0, ...values.map((sample) => sample.surfaceFloodDepthM)), 3),
      maximumPowerFailureRisk: round(Math.max(0, ...values.map((sample) => sample.powerFailureRisk)), 3),
    };
  }
  const values = samples.filter((sample): sample is ChemicalCellSample => sample.hazard === "chemical");
  return {
    plumeCells: values.filter((sample) => sample.plumePresent).length,
    maximumConcentrationMgM3: round(Math.max(0, ...values.map((sample) => sample.concentrationMgM3)), 2),
    maximumOutdoorThresholdRatio: round(Math.max(0, ...values.map((sample) => sample.exposureRatio)), 3),
    maximumIndoorThresholdRatio: round(Math.max(0, ...values.map((sample) => sample.indoorExposureRatio)), 3),
    shelterInPlaceEffectiveCells: values.filter((sample) => sample.shelterInPlaceEffective).length,
  };
}

function genericTimeline(
  scenario: ScenarioDefinition,
  field: SpatialCellSeries[],
): TimelineFrame[] {
  const cellArea = bboxAreaSquareKm(scenario) / field.length;
  return Array.from({ length: Math.floor(scenario.durationMinutes / scenario.stepMinutes) + 1 }, (_, index) => {
    const minute = index * scenario.stepMinutes;
    const samples = field.map((series) => series.samples[index]);
    const ratios = samples.map(sampleRiskRatio);
    const affected = ratios.filter((ratio) => ratio >= 0.2).length;
    const severe = ratios.filter((ratio) => ratio >= 0.7).length;
    const maxRatio = Math.max(...ratios);
    const exposedPopulation = scenario.assets.populationZones.reduce((sum, zone) => {
      const ratio = sampleRiskRatio(seriesNearest(field, zone.center).samples[index]);
      return sum + Math.round(zone.population * clamp(ratio * (0.72 + zone.vulnerability * 0.34), 0, 1));
    }, 0);
    const unavailableRoads = scenario.assets.roads.filter((road) =>
      sampleRiskRatio(seriesNearest(field, midpoint(road.geometry)).samples[index]) >= 0.8).length;
    const alerts: string[] = [];
    if (severe >= 5) alerts.push(`${severe} grid cells enter the severe ${scenario.hazard} screening band.`);
    if (unavailableRoads > 0) alerts.push(`${unavailableRoads} route segments are screened unavailable.`);
    if (exposedPopulation >= 1_500) alerts.push(`${exposedPopulation.toLocaleString("en-IN")} people enter the modelled exposure envelope.`);
    return {
      minute,
      timestampIso: timestampAt(scenario.metadata.startTimeIso, minute),
      phase: hazardTimelinePhase(scenario.hazard as Exclude<HazardKind, "flood">, minute, samples),
      severity: severityFromRatio(maxRatio),
      affectedAreaSqKm: round(affected * cellArea, 2),
      exposedPopulation,
      unavailableRoads,
      criticalAlerts: alerts,
      hazardSummary: {
        maximumExposureRatio: round(maxRatio, 3),
        affectedCells: affected,
        severeCells: severe,
        ...rawHazardSummary(samples),
      },
    };
  });
}

const GENERIC_MODELS: Record<Exclude<HazardKind, "flood">, SimulationModelInfo> = {
  earthquake: {
    id: "aegis-earthquake-v1",
    name: "AEGIS earthquake cascade demonstrator",
    version: "1.0.0",
    classification: "deterministic-prototype",
    method: "Magnitude-distance attenuation, soil amplification proxy, deterministic main-shock/aftershock envelopes and asset vulnerability screening.",
    limitations: ["No fault rupture geometry or local ground-motion calibration.", "Infrastructure effects are screening estimates."],
  },
  wildfire: {
    id: "aegis-wildfire-v1",
    name: "AEGIS wildfire spread demonstrator",
    version: "1.0.0",
    classification: "deterministic-prototype",
    method: "Wind-aligned travel time, land-use fuel proxy, relative-humidity drying factor, deterministic burn curve and smoke envelope.",
    limitations: ["Not a calibrated operational fire-behaviour solver.", "Suppression, spotting and live fuel moisture are absent."],
  },
  cyclone: {
    id: "aegis-cyclone-v1",
    name: "AEGIS cyclone and storm-surge demonstrator",
    version: "1.0.0",
    classification: "deterministic-prototype",
    method: "Parametric track timing, pressure-consistency-adjusted wind/rain envelopes, terrain exposure and low-point surge proxy.",
    limitations: ["No atmospheric forecast model.", "Storm surge requires coastal bathymetry; EIT output is explicitly an inland low-point proxy."],
  },
  chemical: {
    id: "aegis-chemical-v1",
    name: "AEGIS chemical plume demonstrator",
    version: "1.0.0",
    classification: "deterministic-prototype",
    method: "Deterministic Gaussian plume proxy with wind advection, stability spread, source duration and toxicity-threshold screening.",
    limitations: ["No CFD, indoor infiltration or reactive chemistry.", "Authorities and material safety guidance supersede this prototype."],
  },
};

function simulateGeneric(
  scenario: ScenarioDefinition,
  expectedHazard: Exclude<HazardKind, "flood">,
  options: SimulationRunOptions,
): SimulationResult {
  const parameters = applyParameterChanges(scenario.parameters, options.parameterChanges);
  if (parameters.kind !== expectedHazard) {
    throw new Error(`${expectedHazard} plugin received ${parameters.kind} parameters.`);
  }
  const effectiveScenario = { ...scenario, parameters };
  let field: SpatialCellSeries[];
  if (parameters.kind === "earthquake") field = earthquakeSeries(effectiveScenario, parameters);
  else if (parameters.kind === "wildfire") field = wildfireSeries(effectiveScenario, parameters);
  else if (parameters.kind === "cyclone") field = cycloneSeries(effectiveScenario, parameters);
  else field = chemicalSeries(effectiveScenario, parameters);
  const impacts = genericImpacts(effectiveScenario, field);
  const timeline = genericTimeline(effectiveScenario, field);
  const peakFrame = timeline.reduce((peak, frame) => severityRank(frame.severity) > severityRank(peak.severity) || (frame.severity === peak.severity && frame.exposedPopulation > peak.exposedPopulation) ? frame : peak, timeline[0]);
  const metrics: SimulationMetrics = {
    peakMinute: peakFrame.minute,
    peakAffectedAreaSqKm: Math.max(...timeline.map((frame) => frame.affectedAreaSqKm)),
    peakExposedPopulation: Math.max(...timeline.map((frame) => frame.exposedPopulation)),
    peakUnavailableRoads: Math.max(...timeline.map((frame) => frame.unavailableRoads)),
    maximumHazardValue: Math.max(...field.map((series) => series.peakValue)),
    maximumHazardUnit: field[0].unit,
    peopleRequiringEvacuation: impacts.population.filter((impact) => impact.evacuationPriority >= 0.5).reduce((sum, impact) => sum + impact.peopleExposed, 0),
    facilitiesDegraded: [...impacts.hospitals, ...impacts.shelters].filter((impact) => impact.status !== "operational").length + impacts.utilities.filter((impact) => impact.status !== "operational").length,
    estimatedEconomicDamageInr: null,
    estimateNotes: ["Monetary loss is withheld until verified asset values and hazard-specific damage curves are available.", "All effects are prototype planning estimates, not observed damage."],
  };
  const branchId = options.branchId ?? "baseline";
  const runId = stableId("run", `${scenario.metadata.id}:${scenario.seed}:${branchId}:${JSON.stringify(parameters)}`);
  return {
    runId,
    scenarioId: scenario.metadata.id,
    hazard: expectedHazard,
    seed: scenario.seed,
    estimateLabel: scenario.metadata.estimateLabel,
    disclaimer: scenario.metadata.disclaimer,
    model: GENERIC_MODELS[expectedHazard],
    timeline,
    field,
    impacts,
    metrics,
    provenance: scenario.provenance,
    audit: [
      { sequence: 1, event: "scenario-loaded", detail: `${scenario.metadata.id} with ${scenario.terrain.length} terrain cells.` },
      { sequence: 2, event: "parameters-locked", detail: `Seed ${scenario.seed}; branch ${branchId}; deterministic ${expectedHazard} plugin.` },
      { sequence: 3, event: "hazard-solved", detail: `${field.length} cell time series generated for 0-${scenario.durationMinutes} minutes.` },
      { sequence: 4, event: "impacts-derived", detail: `${impacts.roads.length} roads and ${impacts.population.length} population zones screened.` },
    ],
  };
}

const DEFAULT_PLUGINS: HazardPlugin[] = [
  { kind: "flood", model: FLOOD_MODEL, simulate: simulateFlood },
  { kind: "earthquake", model: GENERIC_MODELS.earthquake, simulate: (scenario, options = {}) => simulateGeneric(scenario, "earthquake", options) },
  { kind: "wildfire", model: GENERIC_MODELS.wildfire, simulate: (scenario, options = {}) => simulateGeneric(scenario, "wildfire", options) },
  { kind: "cyclone", model: GENERIC_MODELS.cyclone, simulate: (scenario, options = {}) => simulateGeneric(scenario, "cyclone", options) },
  { kind: "chemical", model: GENERIC_MODELS.chemical, simulate: (scenario, options = {}) => simulateGeneric(scenario, "chemical", options) },
];

function validateScenario(scenario: ScenarioDefinition): void {
  if (scenario.hazard !== scenario.parameters.kind) {
    throw new Error(`Scenario hazard ${scenario.hazard} does not match ${scenario.parameters.kind} parameters.`);
  }
  if (scenario.durationMinutes <= 0 || scenario.stepMinutes <= 0) {
    throw new Error("Scenario duration and timestep must be positive.");
  }
  if (scenario.durationMinutes % scenario.stepMinutes !== 0) {
    throw new Error("Scenario duration must be divisible by its timestep.");
  }
  if (scenario.terrain.length !== scenario.gridRows * scenario.gridColumns) {
    throw new Error("Terrain cell count does not match declared grid dimensions.");
  }
  if (scenario.assets.network.nodes.length === 0 || scenario.assets.network.edges.length === 0) {
    throw new Error("A transport network is required for consequence and evacuation planning.");
  }
}

export class SimulationEngine {
  private readonly plugins = new Map<HazardKind, HazardPlugin>();

  constructor(plugins: HazardPlugin[] = DEFAULT_PLUGINS) {
    for (const plugin of plugins) this.register(plugin);
  }

  register(plugin: HazardPlugin): this {
    this.plugins.set(plugin.kind, plugin);
    return this;
  }

  listPlugins(): Array<{ kind: HazardKind; model: SimulationModelInfo }> {
    return [...this.plugins.values()]
      .map((plugin) => ({ kind: plugin.kind, model: plugin.model }))
      .sort((a, b) => a.kind.localeCompare(b.kind));
  }

  run(scenario: ScenarioDefinition, options: SimulationRunOptions = {}): SimulationResult {
    validateScenario(scenario);
    const plugin = this.plugins.get(scenario.hazard);
    if (!plugin) throw new Error(`No AEGIS simulation plugin is registered for ${scenario.hazard}.`);
    return plugin.simulate(scenario, options);
  }
}

const sharedEngine = new SimulationEngine();

export function createSimulationEngine(plugins?: HazardPlugin[]): SimulationEngine {
  return new SimulationEngine(plugins ?? DEFAULT_PLUGINS);
}

export function runSimulation(
  scenario: ScenarioDefinition,
  options: SimulationRunOptions = {},
): SimulationResult {
  return sharedEngine.run(scenario, options);
}

export function runWhatIfBranches(
  scenario: ScenarioDefinition,
  branches: ScenarioBranch[],
): SimulationComparison {
  const baseline = runSimulation(scenario, { branchId: "baseline" });
  const branchResults: BranchResult[] = branches.map((branch) => {
    const result = runSimulation(scenario, {
      branchId: branch.id,
      parameterChanges: branch.parameterChanges,
    });
    return {
      branch,
      result,
      deltaFromBaseline: {
        peakAffectedAreaSqKm: round(result.metrics.peakAffectedAreaSqKm - baseline.metrics.peakAffectedAreaSqKm, 2),
        peakExposedPopulation: result.metrics.peakExposedPopulation - baseline.metrics.peakExposedPopulation,
        peakUnavailableRoads: result.metrics.peakUnavailableRoads - baseline.metrics.peakUnavailableRoads,
        peopleRequiringEvacuation: result.metrics.peopleRequiringEvacuation - baseline.metrics.peopleRequiringEvacuation,
      },
    };
  });
  return { baseline, branches: branchResults };
}

function interventionTemplates(hazard: HazardKind): Array<{
  id: string;
  title: string;
  description: string;
  category: InterventionCandidate["category"];
  parameterChanges: Record<string, string | number | boolean>;
  feasibilityScore: number;
  timeToEffectMinutes: number;
  downstreamSystemsProtected: string[];
  dependencies: string[];
  limitations: string[];
}> {
  if (hazard === "flood") return [
    { id: "clear-drainage", title: "Clear priority drainage", description: "Reduce modelled blockage before the screened peak.", category: "mitigation", parameterChanges: { drainageBlockageFraction: 0.12 }, feasibilityScore: 0.82, timeToEffectMinutes: 20, downstreamSystemsProtected: ["roads", "facilities", "shelters"], dependencies: ["field crew", "safe drain access"], limitations: ["Drain geometry and capacity are not surveyed"] },
    { id: "reduce-upstream-inflow", title: "Temporary upstream flow control", description: "Screen a lower upstream rise through a temporary barrier or diversion.", category: "mitigation", parameterChanges: { upstreamRiseM: 0.2 }, feasibilityScore: 0.54, timeToEffectMinutes: 35, downstreamSystemsProtected: ["roads", "buildings", "utilities"], dependencies: ["engineering authority", "verified flow path"], limitations: ["Barrier design and location are not resolved"] },
    { id: "early-evacuation", title: "Advance staged evacuation", description: "Operational advisory to dispatch before access deteriorates.", category: "public-safety", parameterChanges: {}, feasibilityScore: 0.88, timeToEffectMinutes: 5, downstreamSystemsProtected: ["population", "health access"], dependencies: ["authority approval", "field route verification"], limitations: ["Does not change physical hazard metrics"] },
  ];
  if (hazard === "wildfire") return [
    { id: "fuel-break", title: "Prioritise mapped fuel break", description: "Screen reduced fuel continuity around the selected operating area.", category: "mitigation", parameterChanges: { fuelDryness: 0.38 }, feasibilityScore: 0.58, timeToEffectMinutes: 45, downstreamSystemsProtected: ["roads", "buildings"], dependencies: ["verified fuel map", "qualified fire authority"], limitations: ["Prototype has no surveyed fuel inventory"] },
    { id: "windward-evacuation", title: "Open windward evacuation corridor", description: "Operational advisory for access protection and staged movement.", category: "access", parameterChanges: {}, feasibilityScore: 0.72, timeToEffectMinutes: 10, downstreamSystemsProtected: ["population", "response access"], dependencies: ["field verification"], limitations: ["Does not alter modelled fire behaviour"] },
  ];
  if (hazard === "earthquake") return [
    { id: "debris-corridor", title: "Clear critical debris corridor", description: "Prioritise access restoration after the shaking screen.", category: "access", parameterChanges: {}, feasibilityScore: 0.64, timeToEffectMinutes: 25, downstreamSystemsProtected: ["health access", "rescue"], dependencies: ["structural safety clearance", "heavy-rescue team"], limitations: ["Does not alter ground motion"] },
  ];
  if (hazard === "cyclone") return [
    { id: "surge-barrier", title: "Protect low-point access", description: "Screen reduced surge penetration at the critical corridor.", category: "mitigation", parameterChanges: { coastalSurgeM: 0.8 }, feasibilityScore: 0.46, timeToEffectMinutes: 40, downstreamSystemsProtected: ["roads", "utilities"], dependencies: ["verified elevations", "engineering authority"], limitations: ["Barrier hydraulics are not resolved"] },
  ];
  return [
    { id: "source-isolation", title: "Isolate chemical source", description: "Screen an immediate reduction in release rate and duration.", category: "mitigation", parameterChanges: { releaseKgPerMinute: 2, releaseDurationMinutes: 20 }, feasibilityScore: 0.68, timeToEffectMinutes: 10, downstreamSystemsProtected: ["population", "facilities"], dependencies: ["hazmat authority", "known material and source"], limitations: ["Indoor infiltration and chemical reactions are not resolved"] },
    { id: "shelter-in-place", title: "Shelter in place downwind", description: "Operational advisory pending field concentration checks.", category: "public-safety", parameterChanges: {}, feasibilityScore: 0.83, timeToEffectMinutes: 5, downstreamSystemsProtected: ["population"], dependencies: ["public warning capability", "building suitability"], limitations: ["No verified building air-tightness data"] },
  ];
}

export function rankInterventions(
  scenario: ScenarioDefinition,
  baseline = runSimulation(scenario, { branchId: "intervention-baseline" }),
): InterventionRanking {
  const ranked = interventionTemplates(scenario.hazard).map((template): InterventionCandidate => {
    if (Object.keys(template.parameterChanges).length === 0) {
      return {
        ...template,
        status: "advisory-only",
        benefitScore: null,
        exposedPeopleReduction: null,
        unavailableRoadReduction: null,
        degradedFacilityReduction: null,
        maximumHazardReduction: null,
        classification: "planning-advisory",
      };
    }
    const result = runSimulation(scenario, {
      branchId: `intervention-${template.id}`,
      parameterChanges: template.parameterChanges,
    });
    const exposedPeopleReduction = baseline.metrics.peakExposedPopulation - result.metrics.peakExposedPopulation;
    const unavailableRoadReduction = baseline.metrics.peakUnavailableRoads - result.metrics.peakUnavailableRoads;
    const degradedFacilityReduction = baseline.metrics.facilitiesDegraded - result.metrics.facilitiesDegraded;
    const maximumHazardReduction = round(baseline.metrics.maximumHazardValue - result.metrics.maximumHazardValue, 3);
    const exposureRatio = exposedPeopleReduction / Math.max(1, baseline.metrics.peakExposedPopulation);
    const roadRatio = unavailableRoadReduction / Math.max(1, baseline.metrics.peakUnavailableRoads);
    const facilityRatio = degradedFacilityReduction / Math.max(1, baseline.metrics.facilitiesDegraded);
    const hazardRatio = maximumHazardReduction / Math.max(0.001, baseline.metrics.maximumHazardValue);
    return {
      ...template,
      status: "screened",
      benefitScore: round(clamp(exposureRatio * 0.44 + roadRatio * 0.24 + facilityRatio * 0.14 + hazardRatio * 0.18, -1, 1), 3),
      exposedPeopleReduction,
      unavailableRoadReduction,
      degradedFacilityReduction,
      maximumHazardReduction,
      classification: "simulated-comparison",
    };
  }).sort((left, right) => (right.benefitScore ?? -1) - (left.benefitScore ?? -1) || right.feasibilityScore - left.feasibilityScore);
  return {
    scenarioId: scenario.metadata.id,
    simulationRunId: baseline.runId,
    hazard: scenario.hazard,
    ranked,
    bestScreenedInterventionId: ranked.find((candidate) => candidate.status === "screened" && (candidate.benefitScore ?? 0) > 0)?.id ?? null,
    notice: "Reverse-cascade ranking compares deterministic scenario branches. Feasibility, authority, engineering design and field safety still require human verification.",
  };
}

export function getSimulationSnapshot(
  result: SimulationResult,
  minute: number,
): {
  frame: TimelineFrame;
  cells: Array<{ cell: TerrainCell; sample: HazardCellSample }>;
} {
  const targetMinute = clamp(
    Math.round(minute / 5) * 5,
    result.timeline[0].minute,
    result.timeline.at(-1)!.minute,
  );
  const frame = result.timeline.reduce((nearest, candidate) =>
    Math.abs(candidate.minute - targetMinute) < Math.abs(nearest.minute - targetMinute) ? candidate : nearest,
  result.timeline[0]);
  return {
    frame,
    cells: result.field.map((series) => ({
      cell: series.cell,
      sample: series.samples.reduce((nearest, candidate) =>
        Math.abs(candidate.minute - frame.minute) < Math.abs(nearest.minute - frame.minute) ? candidate : nearest,
      series.samples[0]),
    })),
  };
}

export function getCellForecast(
  result: SimulationResult,
  coordinate: Coordinate,
): SpatialCellSeries {
  return seriesNearest(result.field, coordinate);
}

interface TraversalStep {
  edge: NetworkEdge;
  from: string;
  to: string;
}

interface PathResult {
  steps: TraversalStep[];
  nodeIds: string[];
  costMinutes: number;
}

interface EdgeScreen {
  status: RoadStatus;
  passable: boolean;
  risk: number;
  delayFactor: number;
  capacityFactor: number;
  peakDepthM?: number;
  explanation: string;
}

function edgeCapacityFactor(status: RoadStatus, risk: number, mode: TravelMode): number {
  const statusFactor: Record<RoadStatus, number> = {
    open: 1,
    advisory: 0.78,
    restricted: 0.42,
    closed: 0,
  };
  const modeFactor: Record<TravelMode, number> = {
    pedestrian: 0.82,
    car: 0.68,
    bus: 0.88,
    ambulance: 0.58,
    heavy_rescue: 0.5,
  };
  return clamp(statusFactor[status] * modeFactor[mode] * (1 - clamp(risk, 0, 1) * 0.32), 0, 1);
}

function nearestNode(network: TransportNetwork, coordinate: Coordinate): NetworkNode {
  return network.nodes.reduce((nearest, node) =>
    distanceMeters(node.coordinate, coordinate) < distanceMeters(nearest.coordinate, coordinate) ? node : nearest,
  network.nodes[0]);
}

function sampleAtMinute(series: SpatialCellSeries, minute: number): HazardCellSample {
  return series.samples.reduce((nearest, sample) =>
    Math.abs(sample.minute - minute) < Math.abs(nearest.minute - minute) ? sample : nearest,
  series.samples[0]);
}

function edgeScreenAt(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  edge: NetworkEdge,
  minute: number,
  mode: TravelMode,
): EdgeScreen {
  const road = scenario.assets.roads.find((candidate) => candidate.id === edge.roadId);
  if (!road) {
    return { status: "restricted", passable: false, risk: 1, delayFactor: 4, capacityFactor: 0, explanation: "Road inventory entry is missing." };
  }
  const series = seriesNearest(result.field, midpoint(road.geometry));
  const sample = sampleAtMinute(series, minute);
  if (sample.hazard === "flood") {
    const depthM = Math.max(0, sample.depthM - road.elevationOffsetM - road.drainageQuality * 0.055);
    const adjustedSample: FloodCellSample = { ...sample, depthM };
    const passability = screenModePassability(adjustedSample, series.confidence.score)[mode];
    const status = roadStatusForDepth(depthM);
    return {
      status,
      passable: passability.passable,
      risk: clamp(depthM / 0.65, 0, 1),
      delayFactor: status === "open" ? 1 : status === "advisory" ? 1.2 : status === "restricted" ? 1.75 : 4,
      capacityFactor: passability.passable ? edgeCapacityFactor(status, depthM / 0.65, mode) : 0,
      peakDepthM: round(depthM, 3),
      explanation: `${road.name}: ${round(depthM, 2)} m modelled at T+${minute} min; ${mode} is ${passability.passable ? "screened passable" : "screened impassable"}.`,
    };
  }
  const ratio = sampleRiskRatio(sample);
  const allPassability = screenModePassability(sample, series.confidence.score);
  const passability = allPassability[mode];
  const status = routeStatusFromScreens(ratio, allPassability);
  return {
    status,
    passable: passability.passable,
    risk: ratio,
    delayFactor: status === "open" ? 1 : status === "advisory" ? 1.2 : status === "restricted" ? 1.75 : 4,
    capacityFactor: passability.passable ? edgeCapacityFactor(status, ratio, mode) : 0,
    explanation: `${road.name}: ${result.hazard} exposure ratio ${round(ratio, 2)} at T+${minute} min; ${mode} is ${passability.passable ? "screened passable" : "screened impassable"}.`,
  };
}

function adjacency(network: TransportNetwork): Map<string, TraversalStep[]> {
  const graph = new Map<string, TraversalStep[]>();
  const add = (nodeId: string, step: TraversalStep) => {
    const list = graph.get(nodeId) ?? [];
    list.push(step);
    graph.set(nodeId, list);
  };
  for (const edge of network.edges) {
    add(edge.from, { edge, from: edge.from, to: edge.to });
    if (!edge.oneWay) add(edge.to, { edge, from: edge.to, to: edge.from });
  }
  for (const list of graph.values()) {
    list.sort((a, b) => a.edge.id.localeCompare(b.edge.id) || a.to.localeCompare(b.to));
  }
  return graph;
}

function shortestScreenedPath(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  originNodeId: string,
  destinationNodeId: string,
  departureMinute: number,
  mode: TravelMode,
  penalties: Map<string, number>,
  avoidedRoadIds: Set<string>,
): PathResult | null {
  const graph = adjacency(scenario.assets.network);
  const distances = new Map<string, number>([[originNodeId, 0]]);
  const previous = new Map<string, TraversalStep>();
  const unvisited = new Set(scenario.assets.network.nodes.map((node) => node.id));
  while (unvisited.size > 0) {
    let current: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const nodeId of [...unvisited].sort()) {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = nodeId;
        currentDistance = distance;
      }
    }
    if (current === null || !Number.isFinite(currentDistance)) break;
    unvisited.delete(current);
    if (current === destinationNodeId) break;
    for (const step of graph.get(current) ?? []) {
      if (!unvisited.has(step.to)) continue;
      if (avoidedRoadIds.has(step.edge.roadId)) continue;
      const travelMinute = departureMinute + currentDistance;
      const screen = edgeScreenAt(scenario, result, step.edge, travelMinute, mode);
      if (!screen.passable || screen.status === "closed") continue;
      const freeFlow = step.edge.lengthM / 1_000 / step.edge.freeFlowKph * 60;
      const penalty = penalties.get(step.edge.id) ?? 1;
      const candidate = currentDistance + freeFlow * screen.delayFactor * penalty + screen.risk * 2.5;
      const known = distances.get(step.to) ?? Number.POSITIVE_INFINITY;
      if (candidate < known - 1e-9) {
        distances.set(step.to, candidate);
        previous.set(step.to, step);
      }
    }
  }
  if (!distances.has(destinationNodeId)) return null;
  const steps: TraversalStep[] = [];
  const nodeIds = [destinationNodeId];
  let cursor = destinationNodeId;
  while (cursor !== originNodeId) {
    const step = previous.get(cursor);
    if (!step) return null;
    steps.unshift(step);
    cursor = step.from;
    nodeIds.unshift(cursor);
  }
  return { steps, nodeIds, costMinutes: distances.get(destinationNodeId)! };
}

function routeFromPath(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  path: PathResult,
  origin: EvacuationEndpoint,
  destination: EvacuationEndpoint,
  rank: number,
  departureMinute: number,
  mode: TravelMode,
): EvacuationRoute {
  const nodeById = new Map(scenario.assets.network.nodes.map((node) => [node.id, node]));
  const hazardSegments: RouteHazardSegment[] = [];
  let elapsed = 0;
  let riskWeighted = 0;
  let distanceM = 0;
  let freeFlowMinutes = 0;
  let bottleneck = Number.POSITIVE_INFINITY;
  for (const step of path.steps) {
    const freeFlow = step.edge.lengthM / 1_000 / step.edge.freeFlowKph * 60;
    const screenedMinute = clamp(departureMinute + elapsed, 0, scenario.durationMinutes);
    const screen = edgeScreenAt(scenario, result, step.edge, screenedMinute, mode);
    const delayed = freeFlow * screen.delayFactor;
    hazardSegments.push({
      edgeId: step.edge.id,
      roadId: step.edge.roadId,
      status: screen.status,
      peakDepthM: screen.peakDepthM,
      delayMinutes: round(delayed - freeFlow, 1),
      screenedMinute: round(screenedMinute, 1),
      mode,
      passable: screen.passable,
      explanation: screen.explanation,
    });
    elapsed += delayed;
    distanceM += step.edge.lengthM;
    freeFlowMinutes += freeFlow;
    riskWeighted += screen.risk * step.edge.lengthM;
    bottleneck = Math.min(bottleneck, step.edge.capacityPersonsPerMinute * screen.capacityFactor);
  }
  const riskScore = distanceM === 0 ? 0 : clamp(riskWeighted / distanceM, 0, 1);
  const reliability = clamp(0.94 - riskScore * 0.47 - hazardSegments.filter((segment) => segment.status === "restricted").length * 0.05, 0.25, 0.98);
  const etaMinutes = round(Math.max(path.costMinutes, elapsed), 1);
  const id = stableId("route", `${result.runId}:${origin.id}:${destination.id}:${path.steps.map((step) => step.edge.id).join(",")}:${rank}:${departureMinute}:${mode}`);
  return {
    id,
    rank,
    originId: origin.id,
    destinationId: destination.id,
    nodeIds: path.nodeIds,
    edgeIds: path.steps.map((step) => step.edge.id),
    polyline: path.nodeIds.map((nodeId) => nodeById.get(nodeId)!.coordinate),
    distanceM: round(distanceM, 0),
    freeFlowMinutes: round(freeFlowMinutes, 1),
    etaMinutes,
    bottleneckPersonsPerMinute: Number.isFinite(bottleneck) ? round(bottleneck, 1) : 0,
    riskScore: round(riskScore, 3),
    reliability: round(reliability, 3),
    status: rank === 1 ? "recommended" : rank === 2 ? "alternate" : "contingency",
    screenedDepartureMinute: departureMinute,
    estimatedArrivalMinute: round(departureMinute + etaMinutes, 1),
    mode,
    hazardSegments,
    explanation: [
      `Route avoids every segment screened closed for ${mode} at the estimated traversal time.`,
      `${round(distanceM / 1_000, 2)} km route; ${round(freeFlowMinutes, 1)} min free-flow and ${round(Math.max(path.costMinutes, elapsed), 1)} min hazard-adjusted ETA.`,
      `Risk ${round(riskScore * 100, 0)}%, reliability ${round(reliability * 100, 0)}%, hazard-adjusted bottleneck ${Number.isFinite(bottleneck) ? round(bottleneck, 1) : 0} people/min.`,
    ],
  };
}

function buildRouteAlternatives(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  origin: EvacuationEndpoint & { nodeId: string },
  destination: EvacuationEndpoint & { nodeId: string },
  departureMinute: number,
  mode: TravelMode,
  maximum: number,
  avoidedRoadIds: Set<string>,
): EvacuationRoute[] {
  const routes: EvacuationRoute[] = [];
  const penalties = new Map<string, number>();
  const signatures = new Set<string>();
  for (let attempt = 0; attempt < maximum * 4 && routes.length < maximum; attempt += 1) {
    const path = shortestScreenedPath(
      scenario,
      result,
      origin.nodeId,
      destination.nodeId,
      departureMinute,
      mode,
      penalties,
      avoidedRoadIds,
    );
    if (!path) break;
    const signature = path.steps.map((step) => step.edge.id).join("|");
    if (!signatures.has(signature)) {
      signatures.add(signature);
      routes.push(routeFromPath(scenario, result, path, origin, destination, routes.length + 1, departureMinute, mode));
    }
    for (const step of path.steps) {
      penalties.set(step.edge.id, (penalties.get(step.edge.id) ?? 1) * 2.4);
    }
  }
  return routes;
}

function normalizeEndpoint(
  endpoint: EvacuationEndpoint,
  network: TransportNetwork,
): EvacuationEndpoint & { nodeId: string; coordinate: Coordinate } {
  const declared = endpoint.nodeId ? network.nodes.find((node) => node.id === endpoint.nodeId) : undefined;
  const node = declared ?? (endpoint.coordinate ? nearestNode(network, endpoint.coordinate) : undefined);
  if (!node) throw new Error(`Evacuation endpoint ${endpoint.id} requires a valid nodeId or coordinate.`);
  return { ...endpoint, nodeId: node.id, coordinate: endpoint.coordinate ?? node.coordinate };
}

function routeStatusAtDeparture(route: EvacuationRoute): boolean {
  return route.hazardSegments.every((segment) => segment.status !== "closed");
}

function routePassableAtMinute(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  route: EvacuationRoute,
  departureMinute: number,
  mode: TravelMode,
): boolean {
  let elapsed = 0;
  for (const edgeId of route.edgeIds) {
    const edge = scenario.assets.network.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) return false;
    const screen = edgeScreenAt(scenario, result, edge, departureMinute + elapsed, mode);
    if (!screen.passable || screen.status === "closed") return false;
    elapsed += edge.lengthM / 1_000 / edge.freeFlowKph * 60 * screen.delayFactor;
  }
  return true;
}

function metricsForPlan(
  peopleHighRisk: number,
  covered: number,
  clearance: number,
  isolated: number,
  routes: EvacuationRoute[],
  capacity: {
    residualShelterDemand: number;
    unroutableHighRiskZones: number;
    availableShelterPlaces: number;
    reservedShelterPlaces: number;
  },
): EvacuationMetrics {
  return {
    peopleInHighRiskZones: peopleHighRisk,
    peopleCoveredByPlan: covered,
    peopleRemainingExposed: Math.max(0, peopleHighRisk - covered),
    coveragePct: peopleHighRisk === 0 ? 100 : round(covered / peopleHighRisk * 100, 1),
    estimatedClearanceMinutes: clearance,
    isolatedZones: isolated,
    routesCrossingClosures: routes.filter((route) => !routeStatusAtDeparture(route)).length,
    averageRouteRisk: routes.length === 0 ? 0 : round(routes.reduce((sum, route) => sum + route.riskScore, 0) / routes.length, 3),
    residualShelterDemand: capacity.residualShelterDemand,
    unroutableHighRiskZones: capacity.unroutableHighRiskZones,
    availableShelterPlaces: capacity.availableShelterPlaces,
    reservedShelterPlaces: capacity.reservedShelterPlaces,
  };
}

export function createEvacuationPlan(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  request: EvacuationRequest = {},
): EvacuationPlan {
  if (scenario.metadata.id !== result.scenarioId) {
    throw new Error("Evacuation scenario and simulation result do not match.");
  }
  const departureMinute = clamp(request.departureMinute ?? 15, 0, scenario.durationMinutes);
  const maxRoutes = clamp(Math.round(request.maxRoutesPerOrigin ?? 3), 1, 4);
  const stageWindow = clamp(Math.round(request.stagedWindowMinutes ?? 15), 5, 30);
  const mode: TravelMode = request.preferredMode ?? "bus";
  const minimumRouteReliability = clamp(request.minimumRouteReliability ?? 0.4, 0, 1);
  const maximumRouteRisk = clamp(request.maximumRouteRisk ?? 0.82, 0, 1);
  const reserveShelterFraction = clamp(request.reserveShelterFraction ?? 0.1, 0, 0.5);
  const routeCapacitySafetyFactor = clamp(request.routeCapacitySafetyFactor ?? 0.78, 0.25, 1);
  const avoidedRoadIds = new Set(request.avoidRoadIds ?? []);
  const network = scenario.assets.network;
  const defaultStarts: EvacuationEndpoint[] = scenario.assets.populationZones.map((zone) => ({
    id: zone.id,
    label: zone.name,
    coordinate: zone.center,
    nodeId: zone.originNodeId,
  }));
  const eligibleFacilities = scenario.assets.facilities.filter((facility) =>
    facility.type === "shelter" || (request.includeHospitals && facility.type === "hospital"));
  const unavailableFacilityIds = new Set(
    [...result.impacts.shelters, ...result.impacts.hospitals]
      .filter((impact) => impact.status === "unavailable")
      .map((impact) => impact.facilityId),
  );
  const defaultEnds: EvacuationEndpoint[] = eligibleFacilities
    .filter((facility) => !unavailableFacilityIds.has(facility.id) && facility.networkNodeId)
    .map((facility) => ({
      id: facility.id,
      label: facility.name,
      coordinate: facility.coordinate,
      nodeId: facility.networkNodeId,
    }));
  const starts = (request.startPoints?.length ? request.startPoints : defaultStarts)
    .map((endpoint) => normalizeEndpoint(endpoint, network));
  const ends = (request.endPoints?.length ? request.endPoints : defaultEnds)
    .map((endpoint) => normalizeEndpoint(endpoint, network));
  if (starts.length === 0) throw new Error("At least one evacuation start point is required.");

  const generatedRoutes: EvacuationRoute[] = [];
  for (const start of starts) {
    for (const end of ends) {
      generatedRoutes.push(...buildRouteAlternatives(scenario, result, start, end, departureMinute, mode, maxRoutes, avoidedRoadIds));
    }
  }
  const routes = generatedRoutes.filter((route) =>
    route.reliability >= minimumRouteReliability && route.riskScore <= maximumRouteRisk);
  routes.sort((a, b) =>
    a.originId.localeCompare(b.originId) ||
    a.riskScore - b.riskScore ||
    a.etaMinutes - b.etaMinutes ||
    a.destinationId.localeCompare(b.destinationId));

  const facilityById = new Map(scenario.assets.facilities.map((facility) => [facility.id, facility]));
  const destinationCapacity = new Map<string, number>();
  const destinationBaseline = new Map<string, number>();
  const destinationPhysicalCapacity = new Map<string, number>();
  const destinationReservedCapacity = new Map<string, number>();
  for (const end of ends) {
    const facility = facilityById.get(end.id);
    const physicalCapacity = facility?.capacity ?? 5_000;
    const baselineOccupancy = facility?.baselineOccupancy ?? 0;
    const unoccupiedPlaces = Math.max(0, physicalCapacity - baselineOccupancy);
    const reservedPlaces = Math.floor(unoccupiedPlaces * reserveShelterFraction);
    destinationCapacity.set(end.id, Math.max(0, unoccupiedPlaces - reservedPlaces));
    destinationBaseline.set(end.id, baselineOccupancy);
    destinationPhysicalCapacity.set(end.id, physicalCapacity);
    destinationReservedCapacity.set(end.id, reservedPlaces);
  }

  const impactByZone = new Map(result.impacts.population.map((impact) => [impact.zoneId, impact]));
  const zones = [...scenario.assets.populationZones].sort((a, b) => {
    const impactA = impactByZone.get(a.id);
    const impactB = impactByZone.get(b.id);
    return (impactB?.evacuationPriority ?? 0) - (impactA?.evacuationPriority ?? 0) || a.id.localeCompare(b.id);
  });
  const stages: EvacuationStage[] = [];
  const residualDemand: EvacuationPlan["residualDemand"] = [];
  const routeWindowUsage = new Map<string, number>();
  let stageOrder = 1;
  for (const zone of zones) {
    const impact = impactByZone.get(zone.id);
    if (!impact || impact.peopleExposed <= 0 || impact.evacuationPriority < 0.32) continue;
    const nearestStart = starts.reduce((nearest, start) =>
      distanceMeters(start.coordinate, zone.center) < distanceMeters(nearest.coordinate, zone.center) ? start : nearest,
    starts[0]);
    const candidates = routes
      .filter((route) => route.originId === nearestStart.id)
      .sort((a, b) => a.riskScore - b.riskScore || a.etaMinutes - b.etaMinutes || a.destinationId.localeCompare(b.destinationId));
    let remaining = impact.peopleExposed;
    let candidateIndex = 0;
    while (remaining > 0 && candidateIndex < candidates.length * 2) {
      const route = candidates[candidateIndex % candidates.length];
      if (!route) break;
      const startMinute = departureMinute + Math.floor((stageOrder - 1) / 3) * stageWindow;
      if (!routePassableAtMinute(scenario, result, route, startMinute, mode)) {
        candidateIndex += 1;
        continue;
      }
      const remainingAtDestination = destinationCapacity.get(route.destinationId) ?? 0;
      const routeWindowKey = `${route.id}:${startMinute}`;
      const usedRouteCapacity = routeWindowUsage.get(routeWindowKey) ?? 0;
      const routeWindowCapacity = Math.max(
        0,
        Math.floor(route.bottleneckPersonsPerMinute * stageWindow * routeCapacitySafetyFactor) - usedRouteCapacity,
      );
      const assigned = Math.min(remaining, remainingAtDestination, routeWindowCapacity);
      if (assigned > 0) {
        const stageId = `stage-${stageOrder.toString().padStart(2, "0")}-${zone.id}`;
        stages.push({
          id: stageId,
          order: stageOrder,
          zoneId: zone.id,
          zoneName: zone.name,
          populationAssigned: assigned,
          assistanceRequired: Math.min(assigned, Math.round(assigned * zone.mobilityLimitedFraction)),
          departureWindow: { startMinute, endMinute: startMinute + stageWindow },
          routeId: route.id,
          destinationFacilityId: route.destinationId,
          transportMode: zone.vehicleAccessFraction >= 0.55 ? "car" : zone.mobilityLimitedFraction >= 0.12 ? "mixed" : request.preferredMode ?? "mixed",
          status: assigned === remaining ? "covered" : "partially-covered",
          rationale: [
            `Zone priority ${round(impact.evacuationPriority * 100, 0)}% from exposure, vulnerability and isolation risk.`,
            `Route chosen at ${round(route.riskScore * 100, 0)}% risk with ${round(route.reliability * 100, 0)}% reliability.`,
            `${assigned} people fit the route-window and remaining destination capacity constraints.`,
          ],
        });
        destinationCapacity.set(route.destinationId, remainingAtDestination - assigned);
        routeWindowUsage.set(routeWindowKey, usedRouteCapacity + assigned);
        remaining -= assigned;
        stageOrder += 1;
      }
      candidateIndex += 1;
    }
    if (remaining > 0) {
      const fallbackRoute = candidates[0];
      const generatedForOrigin = generatedRoutes.filter((route) => route.originId === nearestStart.id);
      const remainingShelterPlaces = [...destinationCapacity.values()].reduce((sum, value) => sum + value, 0);
      const reason: EvacuationPlan["residualDemand"][number]["reason"] = generatedForOrigin.length === 0
        ? "no-passable-route"
        : candidates.length === 0
          ? "reliability-threshold"
          : remainingShelterPlaces === 0
            ? "shelter-capacity"
            : "route-capacity";
      residualDemand.push({
        zoneId: zone.id,
        zoneName: zone.name,
        peopleRemaining: remaining,
        reason,
        isolationReason: ends.length === 0
          ? "Every configured evacuation destination is screened unavailable for this scenario; no unsafe destination was substituted."
          : reason === "no-passable-route"
            ? `No ${mode} path remains passable at the screened traversal times.`
          : reason === "reliability-threshold"
            ? `Generated paths did not meet minimum reliability ${round(minimumRouteReliability * 100, 0)}% and maximum risk ${round(maximumRouteRisk * 100, 0)}%.`
            : reason === "shelter-capacity"
              ? `Assignable shelter places are exhausted after a ${round(reserveShelterFraction * 100, 0)}% reserve.`
              : "Hazard-adjusted route throughput is exhausted in the staged departure windows.",
      });
      stages.push({
        id: `stage-${stageOrder.toString().padStart(2, "0")}-${zone.id}-gap`,
        order: stageOrder,
        zoneId: zone.id,
        zoneName: zone.name,
        populationAssigned: 0,
        assistanceRequired: Math.round(remaining * zone.mobilityLimitedFraction),
        departureWindow: {
          startMinute: departureMinute + Math.floor((stageOrder - 1) / 3) * stageWindow,
          endMinute: departureMinute + Math.floor((stageOrder - 1) / 3) * stageWindow + stageWindow,
        },
        routeId: fallbackRoute?.id ?? "unroutable",
        destinationFacilityId: fallbackRoute?.destinationId ?? "unassigned",
        transportMode: "mixed",
        status: "uncovered",
        rationale: [
          `${remaining} exposed people remain beyond currently screened route or shelter capacity.`,
          "Open an additional shelter, add transport capacity, or change departure time and recompute.",
        ],
      });
      stageOrder += 1;
    }
  }

  const coveredStages = stages.filter((stage) => stage.populationAssigned > 0);
  const resourceAssignments: ResourceAssignment[] = [];
  const responders = [...scenario.assets.responders].sort((a, b) => a.id.localeCompare(b.id));
  for (let index = 0; index < coveredStages.length; index += 1) {
    const stage = coveredStages[index];
    const route = routes.find((candidate) => candidate.id === stage.routeId)!;
    const suitable = responders.filter((unit) =>
      stage.assistanceRequired > 0
        ? unit.type === "ambulance" || unit.capabilities.includes("wheelchair") || unit.type === "rescue"
        : unit.type === "bus" || unit.type === "traffic");
    const unit = (suitable.length > 0 ? suitable : responders)[index % Math.max(1, (suitable.length > 0 ? suitable : responders).length)];
    if (!unit) continue;
    resourceAssignments.push({
      unitId: unit.id,
      unitName: unit.name,
      stageId: stage.id,
      routeId: route.id,
      role: unit.type === "traffic" ? "junction and contraflow control" : unit.type === "ambulance" ? "mobility-assisted medical transport" : unit.type === "rescue" ? "high-water contingency" : "shuttle evacuation",
      dispatchMinute: Math.max(0, stage.departureWindow.startMinute - 8),
      estimatedArrivalMinute: round(stage.departureWindow.startMinute + route.etaMinutes, 1),
      assignedPopulationCapacity: unit.type === "bus" ? unit.seats * 3 : unit.type === "rescue" ? unit.seats * 2 : unit.seats,
    });
  }

  const shelterAllocations: ShelterAllocation[] = ends.map((end) => {
    const baseline = destinationBaseline.get(end.id) ?? 0;
    const assigned = stages.filter((stage) => stage.destinationFacilityId === end.id).reduce((sum, stage) => sum + stage.populationAssigned, 0);
    const capacity = destinationPhysicalCapacity.get(end.id) ?? baseline;
    const reserved = destinationReservedCapacity.get(end.id) ?? 0;
    const remainingCapacity = Math.max(0, capacity - baseline - reserved - assigned);
    const utilizationPct = capacity === 0 ? 100 : round((baseline + assigned) / capacity * 100, 1);
    return {
      facilityId: end.id,
      facilityName: end.label,
      baselineOccupancy: baseline,
      assignedEvacuees: assigned,
      remainingCapacity,
      utilizationPct,
      status: remainingCapacity === 0 ? "full" : utilizationPct >= 85 ? "near-capacity" : "available",
    };
  });

  const highRiskZones = result.impacts.population.filter((impact) => impact.evacuationPriority >= 0.45);
  const highRiskIds = new Set(highRiskZones.map((impact) => impact.zoneId));
  const peopleHighRisk = highRiskZones.reduce((sum, impact) => sum + impact.peopleExposed, 0);
  const covered = stages.filter((stage) => highRiskIds.has(stage.zoneId)).reduce((sum, stage) => sum + stage.populationAssigned, 0);
  const initialIsolated = highRiskZones.filter((impact) => impact.isolationRisk >= 0.65).length;
  const coveredZoneIds = new Set(stages.filter((stage) => stage.populationAssigned > 0).map((stage) => stage.zoneId));
  const remainingIsolated = highRiskZones.filter((impact) => impact.isolationRisk >= 0.65 && !coveredZoneIds.has(impact.zoneId)).length;
  const clearance = coveredStages.length === 0
    ? 0
    : Math.ceil(Math.max(...coveredStages.map((stage) => {
        const route = routes.find((candidate) => candidate.id === stage.routeId);
        return stage.departureWindow.endMinute + (route?.etaMinutes ?? 0);
      })));
  const physicalCapacity = [...destinationPhysicalCapacity.values()].reduce((sum, value) => sum + value, 0);
  const baselineOccupancy = [...destinationBaseline.values()].reduce((sum, value) => sum + value, 0);
  const reservedPlaces = [...destinationReservedCapacity.values()].reduce((sum, value) => sum + value, 0);
  const assignablePlaces = Math.max(0, physicalCapacity - baselineOccupancy - reservedPlaces);
  const assignedPlaces = shelterAllocations.reduce((sum, shelter) => sum + shelter.assignedEvacuees, 0);
  const remainingAssignablePlaces = shelterAllocations.reduce((sum, shelter) => sum + shelter.remainingCapacity, 0);
  const residualPeople = residualDemand.reduce((sum, item) => sum + item.peopleRemaining, 0);
  const unroutableZoneCount = residualDemand.filter((item) =>
    item.reason === "no-passable-route" || item.reason === "reliability-threshold").length;
  const before = metricsForPlan(peopleHighRisk, 0, 0, initialIsolated, [], {
    residualShelterDemand: peopleHighRisk,
    unroutableHighRiskZones: initialIsolated,
    availableShelterPlaces: assignablePlaces,
    reservedShelterPlaces: reservedPlaces,
  });
  const after = metricsForPlan(peopleHighRisk, covered, clearance, remainingIsolated, routes, {
    residualShelterDemand: residualPeople,
    unroutableHighRiskZones: unroutableZoneCount,
    availableShelterPlaces: remainingAssignablePlaces,
    reservedShelterPlaces: reservedPlaces,
  });
  const warnings: string[] = [
    PROTOTYPE_DISCLAIMER,
    "Route passability is modelled; field teams must verify roads before dispatch.",
  ];
  const uncovered = stages.filter((stage) => stage.status === "uncovered");
  if (uncovered.length > 0) warnings.push(`${uncovered.length} zone stage${uncovered.length === 1 ? "" : "s"} exceed current route or destination capacity.`);
  if (ends.length === 0) warnings.push("Every configured evacuation destination is screened unavailable; the plan reports residual demand without routing people to an unsafe facility.");
  if (routes.length === 0) warnings.push("No route passed the selected mode and departure-time screen.");
  if (generatedRoutes.length > routes.length) warnings.push(`${generatedRoutes.length - routes.length} generated route${generatedRoutes.length - routes.length === 1 ? " was" : "s were"} removed by the requested reliability/risk thresholds.`);
  if (reservedPlaces > 0) warnings.push(`${reservedPlaces} shelter places remain reserved and are not assigned by this plan.`);
  const planId = stableId("evac", `${result.runId}:${departureMinute}:${starts.map((point) => point.nodeId).join(",")}:${ends.map((point) => point.nodeId).join(",")}:${mode}:${minimumRouteReliability}:${maximumRouteRisk}:${reserveShelterFraction}:${routeCapacitySafetyFactor}:${[...avoidedRoadIds].sort().join(",")}`);
  const coveredArrivalMinutes = coveredStages.map((stage) => {
    const route = routes.find((candidate) => candidate.id === stage.routeId);
    return stage.departureWindow.endMinute + (route?.etaMinutes ?? 0);
  });
  const eventMinutes = [...new Set(stages.flatMap((stage) => [stage.departureWindow.startMinute, stage.departureWindow.endMinute]))].sort((a, b) => a - b);
  const peakConcurrentStages = eventMinutes.reduce((peak, eventMinute) => Math.max(
    peak,
    stages.filter((stage) => stage.populationAssigned > 0 && stage.departureWindow.startMinute <= eventMinute && stage.departureWindow.endMinute > eventMinute).length,
  ), 0);
  const networkProvenance = scenario.provenance.find((item) => /road|network|asset/i.test(item.label));
  const networkEvidenceClassification: EvacuationPlan["networkEvidenceClassification"] = networkProvenance?.kind === "observed"
    ? "observed"
    : networkProvenance?.kind === "open-data"
      ? "imported"
      : "estimated";
  return {
    id: planId,
    scenarioId: scenario.metadata.id,
    simulationRunId: result.runId,
    generatedBy: "AEGIS deterministic evacuation planner",
    estimateLabel: PROTOTYPE_LABEL,
    departureMinute,
    startPoints: starts,
    endPoints: ends,
    routes,
    stages,
    resourceAssignments,
    shelterAllocations,
    residualDemand,
    stagingSummary: {
      stageCount: stages.length,
      firstDepartureMinute: coveredStages.length === 0 ? null : Math.min(...coveredStages.map((stage) => stage.departureWindow.startMinute)),
      finalEstimatedArrivalMinute: coveredArrivalMinutes.length === 0 ? null : round(Math.max(...coveredArrivalMinutes), 1),
      peakConcurrentStages,
      assistancePlacesAssigned: coveredStages.reduce((sum, stage) => sum + stage.assistanceRequired, 0),
    },
    shelterCapacitySummary: {
      physicalCapacity,
      baselineOccupancy,
      reservedPlaces,
      assignablePlaces,
      assignedPlaces,
      remainingAssignablePlaces,
      residualDemand: residualPeople,
    },
    networkEvidenceClassification,
    before,
    after,
    improvement: {
      exposedPeopleReduction: covered,
      exposedPeopleReductionPct: peopleHighRisk === 0 ? 100 : round(covered / peopleHighRisk * 100, 1),
      isolatedZonesReduction: initialIsolated - remainingIsolated,
    },
    explanations: [
      "One click converts the selected hazard snapshot into passability screens, route alternatives, capacity-constrained shelter assignments and staged departures.",
      "Every route is recomputed for the selected departure time; closed segments are excluded rather than hidden behind a generic risk score.",
      "Zones are ordered by deterministic exposure, vulnerability and isolation priority. Destination capacity and route throughput cap every assignment.",
      "Before/after values measure plan coverage of the modelled exposure envelope; they do not claim that evacuation has occurred.",
    ],
    warnings,
    audit: [
      { sequence: 1, event: "evacuation-request", detail: `${starts.length} origins, ${ends.length} destinations, T+${departureMinute} min, mode ${mode}.` },
      { sequence: 2, event: "network-screened", detail: `${scenario.assets.network.edges.length} edges screened against time-specific hazard conditions.` },
      { sequence: 3, event: "alternatives-ranked", detail: `${routes.length} unique passable routes retained with risk, ETA and bottleneck capacity.` },
      { sequence: 4, event: "zones-staged", detail: `${stages.length} stages generated; ${covered} high-risk people covered by available capacity.` },
      { sequence: 5, event: "resources-assigned", detail: `${resourceAssignments.length} deterministic unit assignments produced.` },
    ],
  };
}

export const DEFAULT_FLOOD_BRANCHES: ScenarioBranch[] = [
  {
    id: "drainage-restored",
    label: "Drainage restored",
    description: "Clear priority drains before the peak and compare consequences with baseline.",
    parameterChanges: { drainageBlockageFraction: 0.12 },
  },
  {
    id: "rainfall-escalation",
    label: "Rainfall escalation",
    description: "Stress-test a more intense cloudburst without changing any other assumption.",
    parameterChanges: { rainfallMmPerHour: 126, rainfallDurationMinutes: 86 },
  },
  {
    id: "upstream-barrier",
    label: "Temporary upstream barrier",
    description: "Screen the effect of reducing upstream inflow before campus inundation.",
    parameterChanges: { upstreamRiseM: 0.2 },
  },
];

export function summarizeForClient(
  result: SimulationResult,
  evacuationPlan?: EvacuationPlan,
): ClientSimulationSummary {
  const topAlerts = result.timeline
    .flatMap((frame) => frame.criticalAlerts.map((alert) => ({ alert, minute: frame.minute })))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.alert === item.alert) === index)
    .sort((a, b) => a.minute - b.minute)
    .slice(0, 5)
    .map((item) => `T+${item.minute}: ${item.alert}`);
  return {
    runId: result.runId,
    hazard: result.hazard,
    label: result.estimateLabel,
    headline:
      `${result.hazard[0].toUpperCase()}${result.hazard.slice(1)} prototype peaks near T+${result.metrics.peakMinute} min, ` +
      `with ${result.metrics.peakExposedPopulation.toLocaleString("en-IN")} people in the modelled exposure envelope.`,
    peakMinute: result.metrics.peakMinute,
    peakAffectedAreaSqKm: result.metrics.peakAffectedAreaSqKm,
    exposedPopulation: result.metrics.peakExposedPopulation,
    roadClosures: result.metrics.peakUnavailableRoads,
    degradedFacilities: result.metrics.facilitiesDegraded,
    evacuationCoveragePct: evacuationPlan?.after.coveragePct,
    topAlerts,
    timeline: result.timeline.map((frame) => ({
      minute: frame.minute,
      severity: frame.severity,
      affectedAreaSqKm: frame.affectedAreaSqKm,
      exposedPopulation: frame.exposedPopulation,
    })),
  };
}

export function runEitDemonstration(
  hazard: HazardKind = "flood",
  options: {
    seed?: string;
    parameterOverrides?: Record<string, string | number | boolean>;
    evacuation?: EvacuationRequest | false;
  } = {},
): {
  scenario: ScenarioDefinition;
  result: SimulationResult;
  evacuationPlan?: EvacuationPlan;
  summary: ClientSimulationSummary;
} {
  const scenario = createEitFaridabadScenario(hazard, {
    seed: options.seed,
    parameterOverrides: options.parameterOverrides,
  });
  const result = runSimulation(scenario);
  const evacuationPlan = options.evacuation === false
    ? undefined
    : createEvacuationPlan(scenario, result, options.evacuation ?? {});
  return {
    scenario,
    result,
    evacuationPlan,
    summary: summarizeForClient(result, evacuationPlan),
  };
}

export function getSimulationCatalog(): SimulationCatalogItem[] {
  return [
    {
      hazard: "flood",
      title: "Urban and River Flood",
      status: "ready",
      description: "Flagship depth, velocity, arrival, recession, infrastructure and evacuation simulation.",
      flagship: true,
      outputMetrics: ["depth", "velocity", "arrival/peak/recession", "road passability", "evacuation capacity"],
    },
    {
      hazard: "earthquake",
      title: "Earthquake Infrastructure Cascade",
      status: "ready",
      description: "Ground-motion, soil, building, road, utility and medical-demand screening.",
      flagship: false,
      outputMetrics: ["MMI", "PGA", "liquefaction proxy", "building exposure", "facility access"],
    },
    {
      hazard: "wildfire",
      title: "Wildfire Propagation",
      status: "ready",
      description: "Wind-aligned spread, flame intensity, smoke and route exposure.",
      flagship: false,
      outputMetrics: ["arrival time", "fireline intensity", "flame length", "smoke index", "evacuation routes"],
    },
    {
      hazard: "cyclone",
      title: "Cyclone and Storm Surge",
      status: "ready",
      description: "Track-relative wind, rainfall, debris and low-point surge screening.",
      flagship: false,
      outputMetrics: ["wind", "rainfall", "surge proxy", "debris risk", "utility exposure"],
    },
    {
      hazard: "chemical",
      title: "Industrial Chemical Plume",
      status: "ready",
      description: "Release, plume travel, concentration, threshold exposure and shelter/evacuate routing.",
      flagship: false,
      outputMetrics: ["plume arrival", "concentration", "threshold ratio", "population exposure", "route screening"],
    },
    ...[
      ["tsunami", "Tsunami Coastal Inundation"],
      ["landslide", "Rainfall-triggered Landslide"],
      ["heatwave", "Heatwave and Grid Stress"],
      ["dam-break", "Dam-break Cascade"],
      ["urban-fire", "Dense Urban Fire"],
      ["pandemic-logistics", "Public-health Logistics"],
    ].map(([hazard, title]) => ({
      hazard: hazard as SimulationCatalogItem["hazard"],
      title,
      status: "coming-soon" as const,
      description: "Planned plugin using the same timeline, impact, comparison and evacuation contracts.",
      flagship: false,
      outputMetrics: ["shared AEGIS spatial field", "infrastructure impacts", "response optimization"],
    })),
  ];
}

export interface ImportedTerrainBundle {
  cells: TerrainCell[];
  gridRows: number;
  gridColumns: number;
  provenance: DataProvenance[];
}

export interface ImportedAssetsBundle {
  assets: ScenarioAssets;
  provenance: DataProvenance[];
}

export interface LocationScenarioImportedData {
  terrain?: ImportedTerrainBundle;
  assets?: ImportedAssetsBundle;
}

export interface CreateLocationScenarioInput {
  hazard: HazardKind;
  center: Coordinate;
  locationLabel: string;
  seed: string;
  parameterOverrides?: Record<string, string | number | boolean>;
  importedData?: LocationScenarioImportedData;
}

function normalizeLongitude(longitude: number): number {
  let normalized = longitude;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function unwrapLongitude(longitude: number, reference: number): number {
  let unwrapped = longitude;
  while (unwrapped - reference > 180) unwrapped -= 360;
  while (unwrapped - reference < -180) unwrapped += 360;
  return unwrapped;
}

function validateLocationInput(input: CreateLocationScenarioInput): void {
  if (!Number.isFinite(input.center.lat) || input.center.lat < -84 || input.center.lat > 84) {
    throw new Error("Location latitude must be finite and between -84 and 84 degrees for the map/simulation grid.");
  }
  if (!Number.isFinite(input.center.lon) || input.center.lon < -180 || input.center.lon > 180) {
    throw new Error("Location longitude must be finite and between -180 and 180 degrees.");
  }
  if (!input.locationLabel.trim()) {
    throw new Error("Location label is required.");
  }
  if (!input.seed.trim()) {
    throw new Error("A non-empty deterministic seed is required.");
  }
}

function hasImportedProvenance(provenance: DataProvenance[]): boolean {
  return provenance.some((source) => source.kind === "observed" || source.kind === "open-data");
}

function validateImportedTerrain(
  bundle: ImportedTerrainBundle,
  center: Coordinate,
): void {
  if (!Number.isInteger(bundle.gridRows) || !Number.isInteger(bundle.gridColumns) || bundle.gridRows <= 0 || bundle.gridColumns <= 0) {
    throw new Error("Imported terrain gridRows and gridColumns must be positive integers.");
  }
  if (bundle.cells.length !== bundle.gridRows * bundle.gridColumns) {
    throw new Error("Imported terrain cell count does not match gridRows × gridColumns.");
  }
  if (!hasImportedProvenance(bundle.provenance)) {
    throw new Error("Imported terrain requires observed or open-data provenance; otherwise omit it and use the labelled prototype terrain.");
  }
  if (bundle.cells.some((cell) => !Number.isFinite(cell.center.lat) || !Number.isFinite(cell.center.lon))) {
    throw new Error("Imported terrain contains an invalid cell coordinate.");
  }
  const centroid = {
    lat: bundle.cells.reduce((sum, cell) => sum + cell.center.lat, 0) / bundle.cells.length,
    lon: normalizeLongitude(
      bundle.cells.reduce((sum, cell) => sum + unwrapLongitude(cell.center.lon, center.lon), 0) /
        bundle.cells.length,
    ),
  };
  if (distanceMeters(center, centroid) > 100_000) {
    throw new Error("Imported terrain centroid is more than 100 km from the requested scenario center.");
  }
}

function validateImportedAssets(
  bundle: ImportedAssetsBundle,
  center: Coordinate,
): void {
  if (!hasImportedProvenance(bundle.provenance)) {
    throw new Error("Imported assets require observed or open-data provenance; otherwise omit them and use the labelled prototype assets.");
  }
  if (bundle.assets.network.nodes.length === 0 || bundle.assets.network.edges.length === 0) {
    throw new Error("Imported assets require a non-empty transport network.");
  }
  if (bundle.assets.populationZones.length === 0) {
    throw new Error("Imported assets require at least one population zone for impact and evacuation planning.");
  }
  if (
    bundle.assets.buildings.length > 10_000 ||
    bundle.assets.roads.length > 5_000 ||
    bundle.assets.facilities.length > 1_000 ||
    bundle.assets.populationZones.length > 2_000 ||
    bundle.assets.network.nodes.length > 10_000 ||
    bundle.assets.network.edges.length > 20_000
  ) {
    throw new Error("Imported asset bundle exceeds the bounded local-scenario limits.");
  }
  if (bundle.assets.buildings.some((building) =>
    (building.heightM !== undefined && (!Number.isFinite(building.heightM) || building.heightM <= 0)) ||
    building.footprint?.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lon)))) {
    throw new Error("Imported building geometry contains an invalid footprint coordinate or height.");
  }
  const nearest = bundle.assets.network.nodes.reduce(
    (minimum, node) => Math.min(minimum, distanceMeters(center, node.coordinate)),
    Number.POSITIVE_INFINITY,
  );
  if (nearest > 100_000) {
    throw new Error("Imported asset network is more than 100 km from the requested scenario center.");
  }
}

function translateCoordinate(
  value: Coordinate,
  sourceCenter: Coordinate,
  destinationCenter: Coordinate,
): Coordinate {
  const northM = (value.lat - sourceCenter.lat) * 111_320;
  const eastM =
    (value.lon - sourceCenter.lon) *
    111_320 *
    Math.max(0.1, Math.cos(toRadians(sourceCenter.lat)));
  const latitude = destinationCenter.lat + northM / 111_320;
  const longitude =
    destinationCenter.lon +
    eastM /
      (111_320 * Math.max(0.1, Math.cos(toRadians(destinationCenter.lat))));
  // Preserve a continuous local frame at the antimeridian. Map renderers wrap
  // longitudes just outside ±180, while normalization would draw local roads
  // across the entire world between +179.99 and -179.99.
  return { lat: round(latitude, 7), lon: round(longitude, 7) };
}

function translateArea(
  area: ScenarioDefinition["area"],
  sourceCenter: Coordinate,
  destinationCenter: Coordinate,
): ScenarioDefinition["area"] {
  const northWest = translateCoordinate(
    { lat: area.north, lon: area.west },
    sourceCenter,
    destinationCenter,
  );
  const southEast = translateCoordinate(
    { lat: area.south, lon: area.east },
    sourceCenter,
    destinationCenter,
  );
  return {
    north: northWest.lat,
    south: southEast.lat,
    west: unwrapLongitude(northWest.lon, destinationCenter.lon),
    east: unwrapLongitude(southEast.lon, destinationCenter.lon),
  };
}

function translatedTerrain(
  cells: TerrainCell[],
  sourceCenter: Coordinate,
  destinationCenter: Coordinate,
): TerrainCell[] {
  return cells.map((cell) => ({
    ...cell,
    center: translateCoordinate(cell.center, sourceCenter, destinationCenter),
  }));
}

function cloneTerrain(cells: TerrainCell[]): TerrainCell[] {
  return cells.map((cell) => ({ ...cell, center: { ...cell.center } }));
}

function translateAssetsPreservingNames(
  assets: ScenarioAssets,
  sourceCenter: Coordinate,
  destinationCenter: Coordinate,
): ScenarioAssets {
  const translate = (value: Coordinate) =>
    translateCoordinate(value, sourceCenter, destinationCenter);
  return {
    roads: assets.roads.map((road) => ({
      ...road,
      geometry: road.geometry.map(translate),
    })),
    bridges: assets.bridges.map((bridge) => ({
      ...bridge,
      coordinate: translate(bridge.coordinate),
    })),
    buildings: assets.buildings.map((building) => ({
      ...building,
      coordinate: translate(building.coordinate),
      footprint: building.footprint?.map(translate),
    })),
    facilities: assets.facilities.map((facility) => ({
      ...facility,
      coordinate: translate(facility.coordinate),
    })),
    populationZones: assets.populationZones.map((zone) => ({
      ...zone,
      center: translate(zone.center),
    })),
    responders: assets.responders.map((unit) => ({
      ...unit,
      capabilities: [...unit.capabilities],
    })),
    network: {
      nodes: assets.network.nodes.map((node) => ({
        ...node,
        coordinate: translate(node.coordinate),
      })),
      edges: assets.network.edges.map((edge) => ({ ...edge })),
    },
  };
}

function translatedPrototypeAssets(
  assets: ScenarioAssets,
  sourceCenter: Coordinate,
  destinationCenter: Coordinate,
): ScenarioAssets {
  const translate = (value: Coordinate) =>
    translateCoordinate(value, sourceCenter, destinationCenter);
  const typeCounts = new Map<string, number>();
  return {
    roads: assets.roads.map((road, index) => ({
      ...road,
      name: `Estimated ${road.classification} route ${index + 1} (translated prototype)`,
      geometry: road.geometry.map(translate),
    })),
    bridges: assets.bridges.map((bridge, index) => ({
      ...bridge,
      name: `Estimated crossing ${index + 1} (translated prototype)`,
      coordinate: translate(bridge.coordinate),
    })),
    buildings: assets.buildings.map((building, index) => ({
      ...building,
      name: `Estimated ${building.use} building ${index + 1} (translated prototype)`,
      coordinate: translate(building.coordinate),
      footprint: building.footprint?.map(translate),
    })),
    facilities: assets.facilities.map((facility) => {
      const count = (typeCounts.get(facility.type) ?? 0) + 1;
      typeCounts.set(facility.type, count);
      return {
        ...facility,
        name: `Estimated ${facility.type.replaceAll("_", " ")} facility ${count} (translated prototype)`,
        coordinate: translate(facility.coordinate),
      };
    }),
    populationZones: assets.populationZones.map((zone, index) => ({
      ...zone,
      name: `Estimated population zone ${index + 1} (translated prototype)`,
      center: translate(zone.center),
    })),
    responders: assets.responders.map((unit, index) => ({
      ...unit,
      name: `Scenario ${unit.type.replaceAll("_", " ")} unit ${index + 1}`,
      capabilities: [...unit.capabilities],
    })),
    network: {
      nodes: assets.network.nodes.map((node, index) => ({
        ...node,
        name: `Estimated network node ${index + 1} (translated prototype)`,
        coordinate: translate(node.coordinate),
      })),
      edges: assets.network.edges.map((edge) => ({ ...edge })),
    },
  };
}

function cloneImportedAssets(assets: ScenarioAssets): ScenarioAssets {
  return {
    roads: assets.roads.map((road) => ({
      ...road,
      geometry: road.geometry.map((point) => ({ ...point })),
    })),
    bridges: assets.bridges.map((bridge) => ({
      ...bridge,
      coordinate: { ...bridge.coordinate },
    })),
    buildings: assets.buildings.map((building) => ({
      ...building,
      coordinate: { ...building.coordinate },
      footprint: building.footprint?.map((point) => ({ ...point })),
    })),
    facilities: assets.facilities.map((facility) => ({
      ...facility,
      coordinate: { ...facility.coordinate },
    })),
    populationZones: assets.populationZones.map((zone) => ({
      ...zone,
      center: { ...zone.center },
    })),
    responders: assets.responders.map((unit) => ({
      ...unit,
      capabilities: [...unit.capabilities],
    })),
    network: {
      nodes: assets.network.nodes.map((node) => ({
        ...node,
        coordinate: { ...node.coordinate },
      })),
      edges: assets.network.edges.map((edge) => ({ ...edge })),
    },
  };
}

function areaFromTerrain(
  cells: TerrainCell[],
  rows: number,
  columns: number,
  center: Coordinate,
): ScenarioDefinition["area"] {
  const latitudes = cells.map((cell) => cell.center.lat);
  const longitudes = cells.map((cell) => unwrapLongitude(cell.center.lon, center.lon));
  const latitudeRange = Math.max(0.0002, Math.max(...latitudes) - Math.min(...latitudes));
  const longitudeRange = Math.max(0.0002, Math.max(...longitudes) - Math.min(...longitudes));
  const latitudePadding = latitudeRange / Math.max(1, rows - 1) / 2;
  const longitudePadding = longitudeRange / Math.max(1, columns - 1) / 2;
  return {
    north: Math.max(...latitudes) + latitudePadding,
    south: Math.min(...latitudes) - latitudePadding,
    east: Math.max(...longitudes) + longitudePadding,
    west: Math.min(...longitudes) - longitudePadding,
  };
}

function locationSlug(label: string): string {
  const normalized = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return normalized || "selected-location";
}

/**
 * Creates a deterministic scenario around any valid world coordinate.
 * Without provenance-backed imports, geometry, terrain, buildings and
 * population remain explicitly labelled translated prototype estimates.
 */
export function createLocationScenario(
  input: CreateLocationScenarioInput,
): ScenarioDefinition {
  validateLocationInput(input);
  const center = {
    lat: round(input.center.lat, 7),
    lon: round(normalizeLongitude(input.center.lon), 7),
  };
  const terrainImport = input.importedData?.terrain;
  const assetImport = input.importedData?.assets;
  if (terrainImport) validateImportedTerrain(terrainImport, center);
  if (assetImport) validateImportedAssets(assetImport, center);

  const prototype = createEitFaridabadScenario(input.hazard, {
    seed: input.seed,
    parameterOverrides: input.parameterOverrides,
  });
  const sourceCenter = {
    lat: (prototype.area.north + prototype.area.south) / 2,
    lon: (prototype.area.east + prototype.area.west) / 2,
  };
  const terrain = terrainImport
    ? cloneTerrain(terrainImport.cells)
    : translatedTerrain(prototype.terrain, sourceCenter, center);
  const gridRows = terrainImport?.gridRows ?? prototype.gridRows;
  const gridColumns = terrainImport?.gridColumns ?? prototype.gridColumns;
  const assets = assetImport
    ? cloneImportedAssets(assetImport.assets)
    : translatedPrototypeAssets(prototype.assets, sourceCenter, center);
  const area = terrainImport
    ? areaFromTerrain(terrain, gridRows, gridColumns, center)
    : translateArea(prototype.area, sourceCenter, center);

  const terrainImported = Boolean(terrainImport);
  const assetsImported = Boolean(assetImport);
  const sourceState = terrainImported && assetsImported
    ? "Imported terrain and asset records retain their supplied provenance; hazard effects remain simulated prototype estimates."
    : terrainImported
      ? "Terrain is provenance-backed imported data; buildings, infrastructure and population remain translated prototype estimates."
      : assetsImported
        ? "Assets and population are provenance-backed imported data; terrain remains a translated prototype estimate."
        : "Terrain, buildings, infrastructure and population are translated prototype estimates, not local records.";
  const estimateLabel = terrainImported && assetsImported
    ? "Imported local-data scenario — hazard effects remain simulated prototype estimates"
    : terrainImported
      ? "Mixed-data prototype — imported terrain; assets and population remain estimated"
      : assetsImported
        ? "Mixed-data prototype — imported assets; terrain remains estimated"
        : "Estimated generic-location prototype — translated terrain, assets and population";
  const locationLabel = input.locationLabel.trim();
  const coordinateKey = `${center.lat.toFixed(6)},${center.lon.toFixed(6)}`;
  const scenarioId = stableId(
    `location-${locationSlug(locationLabel)}-${input.hazard}`,
    `${coordinateKey}:${input.seed}:${terrainImported}:${assetsImported}`,
  );
  const provenance: DataProvenance[] = [
    {
      id: `${scenarioId}-location-input`,
      label: `${locationLabel} selected center and scenario parameters`,
      kind: "scenario-input",
      note: `User-selected center ${coordinateKey}; this identifies the simulation viewport, not an observed incident.`,
    },
    ...(terrainImport
      ? terrainImport.provenance.map((source) => ({ ...source }))
      : [{
          id: `${scenarioId}-terrain-prototype`,
          label: "Translated synthetic terrain and drainage proxy",
          kind: "prototype" as const,
          note: "Relocated from the AEGIS demonstration scaffold; no claim of local elevation or drainage fidelity.",
        }]),
    ...(assetImport
      ? assetImport.provenance.map((source) => ({ ...source }))
      : [{
          id: `${scenarioId}-assets-prototype`,
          label: "Translated prototype buildings, network, facilities and population",
          kind: "prototype" as const,
          note: "Demonstration inventory only; names are generic and every entity is labelled estimated.",
        }]),
    {
      id: `${scenarioId}-simulation-model`,
      label: `AEGIS ${input.hazard} deterministic prototype model`,
      kind: "derived",
      note: "Model outputs remain simulated estimates even when imported local source data is supplied.",
    },
  ];

  return {
    metadata: {
      id: scenarioId,
      name: `${locationLabel} ${input.hazard} planning scenario`,
      locationName: locationLabel,
      description: `A deterministic 120-minute ${input.hazard} scenario centred at ${coordinateKey}. ${sourceState}`,
      startTimeIso: prototype.metadata.startTimeIso,
      isPrototype: true,
      estimateLabel,
      disclaimer:
        `This generic-location AEGIS scenario is not a report of a real disaster, local survey, engineering certification or evacuation order. ${sourceState} Validate all operational decisions with authorities and field observations.`,
      tags: [
        "CodeFusion EIT Hackathon",
        "AEGIS",
        "generic location",
        "prototype",
        input.hazard,
        terrainImported ? "imported terrain" : "estimated terrain",
        assetsImported ? "imported assets" : "estimated assets",
      ],
    },
    hazard: input.hazard,
    seed: input.seed,
    durationMinutes: prototype.durationMinutes,
    stepMinutes: prototype.stepMinutes,
    area,
    gridRows,
    gridColumns,
    hazardSource: center,
    terrain,
    assets,
    parameters: { ...prototype.parameters },
    provenance,
  };
}

export {
  buildImpactSnapshot,
  buildImpactTimeline,
  findImpactAsset,
} from "./impact-analysis";
