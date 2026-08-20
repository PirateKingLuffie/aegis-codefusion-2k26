"use client";

import {
  AlertTriangle,
  Ban,
  Building2,
  Crosshair,
  Flag,
  Focus,
  Globe2,
  Hospital,
  Layers3,
  LocateFixed,
  MapPin,
  MousePointer2,
  Navigation,
  Radio,
  RotateCw,
  Route,
  ShieldCheck,
  TentTree,
  Trash2,
  Truck,
  Users,
  Waves,
  Wrench,
  Clock3,
  Gauge,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import type {
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
} from "maplibre-gl";
import type {
  ExpressionSpecification,
  LayerSpecification,
} from "@maplibre/maplibre-gl-style-spec";

import styles from "./AegisMap.module.css";
import { OfflineCampusTwin } from "./OfflineCampusTwin";
import { WorldContinuity } from "./WorldContinuity";
import {
  EIT_CAMPUS_BOUNDARY,
  EIT_CAMPUS_BUILDINGS,
  EIT_CAMPUS_ROADS,
  EIT_FARIDABAD,
} from "./campus-data";
import {
  EMPTY_FEATURE_COLLECTION,
  buildRouteMovers,
  closePolygon,
  externalOverlaysToGeoJSON,
  incidentsToGeoJSON,
  polygonCollectionToPoints,
  prepareFloodVisuals,
  relocateLegacyEitCollection,
  selectionToGeoJSON,
  type AnyFeatureCollection,
  type FloodVisualData,
} from "./geometry";
import { twinSceneToMapData, type TwinVisualData } from "./twin-adapter";
import {
  buildProviderCandidates,
  classifyMapFailure,
  type MapProviderState,
} from "./providers";
import {
  WORLD_DETAIL_IMAGERY_LAYER_MAX_ZOOM,
  WORLD_DETAIL_IMAGERY_OPACITY_STOPS,
  WORLD_CONTEXT_LAYER_IDS,
  WORLD_GLOBE_ORBIT_MAX_ZOOM,
  WORLD_IMAGERY_LAYER_IDS,
  WORLD_IMAGERY_SOURCES,
  WORLD_RASTER_LABELS,
  initialOrbitResumeDeadline,
  nextOrbitLongitude,
  orbitResumeDeadline,
  shouldAdvanceOrbit,
  shouldAutoFlyToTwin,
  isProviderCountryLabelLayer,
  isProviderContextLabelLayer,
  worldCameraForViewport,
  worldFocusUsesGlobe,
  worldPitchForFocus,
  worldProjectionModeForZoom,
  type WorldProjectionMode,
} from "./globe-runtime";
import type {
  AegisCoordinate,
  AegisExternalOverlay,
  AegisFeatureInspection,
  AegisIncident,
  AegisMapLayerKey,
  AegisMapLayers,
  AegisMapProps,
  AegisMapSelection,
  AegisMapTool,
  AegisMapViewMode,
  AegisSelectionPoint,
} from "./types";

const TERRAIN_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];
const MAP_FONT_STACK = ["Noto Sans Regular"];
const EMPTY_LAYERS: AegisMapLayers = {};
const EMPTY_INCIDENTS: AegisIncident[] = [];
const EMPTY_OVERLAYS: AegisExternalOverlay[] = [];
const EMPTY_OVERLAY_OVERRIDES: ReadonlyMap<string, AegisCoordinate> = new Map();

type ConnectionState = "loading" | "live" | "degraded" | "offline";
type SourceKey =
  | "waterSurface"
  | "waterSamples"
  | "waterContours"
  | "flow"
  | "roads"
  | "routes"
  | "routeMovers"
  | "resources"
  | "hospitals"
  | "shelters"
  | "impactSamples"
  | "damage"
  | "populationSamples"
  | "utilityImpact"
  | "recovery"
  | "confidence"
  | "safeZones"
  | "unavailableZones"
  | "warnings"
  | "impactedRoads"
  | "impactedBridges"
  | "criticalFacilities"
  | "utilityPoints"
  | "responseCoverage"
  | "recoveryPoints"
  | "incidents"
  | "selection"
  | "campusBoundary"
  | "campusBuildings"
  | "campusRoads"
  | "twinAgents"
  | "twinFacilities"
  | "terrainPoints"
  | "externalOverlays";

type SourceData = Record<SourceKey, AnyFeatureCollection>;

const SOURCE_IDS: Record<SourceKey, string> = {
  waterSurface: "aegis-water-surface-source",
  waterSamples: "aegis-water-samples-source",
  waterContours: "aegis-water-contours-source",
  flow: "aegis-flow-source",
  roads: "aegis-roads-source",
  routes: "aegis-routes-source",
  routeMovers: "aegis-route-movers-source",
  resources: "aegis-resources-source",
  hospitals: "aegis-hospitals-source",
  shelters: "aegis-shelters-source",
  impactSamples: "aegis-impact-samples-source",
  damage: "aegis-damage-source",
  populationSamples: "aegis-population-impact-source",
  utilityImpact: "aegis-utility-impact-source",
  recovery: "aegis-recovery-source",
  confidence: "aegis-confidence-source",
  safeZones: "aegis-safe-zones-source",
  unavailableZones: "aegis-unavailable-zones-source",
  warnings: "aegis-warning-zones-source",
  impactedRoads: "aegis-impacted-roads-source",
  impactedBridges: "aegis-impacted-bridges-source",
  criticalFacilities: "aegis-critical-facilities-source",
  utilityPoints: "aegis-utility-points-source",
  responseCoverage: "aegis-response-coverage-source",
  recoveryPoints: "aegis-recovery-points-source",
  incidents: "aegis-incidents-source",
  selection: "aegis-selection-source",
  campusBoundary: "aegis-campus-boundary-source",
  campusBuildings: "aegis-campus-buildings-source",
  campusRoads: "aegis-campus-roads-source",
  twinAgents: "aegis-twin-agents-source",
  twinFacilities: "aegis-twin-facilities-source",
  terrainPoints: "aegis-terrain-points-source",
  externalOverlays: "aegis-external-overlays-source",
};

const LAYER_IDS: Record<AegisMapLayerKey, string[]> = {
  floodDepth: [
    "aegis-depth-field",
    "aegis-water-volume",
    "aegis-water-sheen",
    "aegis-water-shoreline",
    "aegis-water-contours",
  ],
  floodFlow: ["aegis-flow-line"],
  roads: ["aegis-road-casing", "aegis-road-line", "aegis-impacted-road-casing", "aegis-impacted-road-line"],
  evacuationRoutes: [
    "aegis-route-casing",
    "aegis-route-line",
    "aegis-route-direction",
    "aegis-route-mover-glow",
    "aegis-route-mover-core",
    "aegis-twin-agent-glow",
    "aegis-twin-agent-core",
    "aegis-response-coverage-fill",
    "aegis-response-coverage-outline",
  ],
  resources: ["aegis-resource-ring", "aegis-resource-core", "aegis-resource-label"],
  hospitals: ["aegis-hospital-ring", "aegis-hospital-core", "aegis-hospital-label"],
  shelters: ["aegis-shelter-ring", "aegis-shelter-core", "aegis-shelter-label"],
  impactZones: ["aegis-impact-field"],
  damage: [
    "aegis-damage-fill",
    "aegis-damage-outline",
    "aegis-impacted-bridge-ring",
    "aegis-impacted-bridge-core",
  ],
  populationImpact: ["aegis-population-impact"],
  utilityImpact: ["aegis-utility-fill", "aegis-utility-outline", "aegis-utility-point-ring", "aegis-utility-point-core"],
  recovery: ["aegis-recovery-fill", "aegis-recovery-outline", "aegis-recovery-point-ring", "aegis-recovery-point-core", "aegis-recovery-point-label"],
  confidence: ["aegis-confidence-outline"],
  safeZones: ["aegis-safe-fill", "aegis-safe-outline"],
  unavailableZones: ["aegis-unavailable-fill", "aegis-unavailable-outline"],
  warnings: ["aegis-warning-fill", "aegis-warning-outline"],
  damagedBuildings: ["aegis-damage-fill", "aegis-damage-outline"],
  impactedRoads: ["aegis-impacted-road-casing", "aegis-impacted-road-line"],
  impactedBridges: ["aegis-impacted-bridge-ring", "aegis-impacted-bridge-core"],
  criticalFacilities: ["aegis-critical-facility-ring", "aegis-critical-facility-core", "aegis-critical-facility-label"],
  utilityImpacts: ["aegis-utility-point-ring", "aegis-utility-point-core"],
  populationImpacts: ["aegis-population-impact"],
  responseCoverageZones: ["aegis-response-coverage-fill", "aegis-response-coverage-outline"],
  recoveryPriorities: ["aegis-recovery-point-ring", "aegis-recovery-point-core", "aegis-recovery-point-label"],
  incidents: [
    "aegis-incident-cluster-glow",
    "aegis-incident-cluster-core",
    "aegis-incident-cluster-count",
    "aegis-incident-glow",
    "aegis-incident-live-pulse",
    "aegis-incident-core",
    "aegis-incident-label",
  ],
};

const CAMPUS_LAYER_IDS = [
  "aegis-campus-ground",
  "aegis-campus-perimeter",
  "aegis-campus-road-casing",
  "aegis-campus-road-line",
  "aegis-campus-building-shadow",
  "aegis-campus-buildings",
  "aegis-campus-building-waterline",
  "aegis-campus-building-label",
  "aegis-terrain-relief",
  "aegis-twin-facility-core",
];

const INTERACTIVE_LAYER_IDS = [
  "aegis-campus-buildings",
  "aegis-campus-building-waterline",
  "aegis-campus-ground",
  "aegis-water-volume",
  "aegis-water-sheen",
  "aegis-water-shoreline",
  "aegis-damage-fill",
  "aegis-safe-fill",
  "aegis-unavailable-fill",
  "aegis-warning-fill",
  "aegis-utility-fill",
  "aegis-recovery-fill",
  "aegis-response-coverage-fill",
  "aegis-impacted-road-line",
  "aegis-impacted-bridge-core",
  "aegis-critical-facility-core",
  "aegis-utility-point-core",
  "aegis-recovery-point-core",
  "aegis-road-line",
  "aegis-campus-road-line",
  "aegis-route-line",
  "aegis-resource-core",
  "aegis-hospital-core",
  "aegis-shelter-core",
  "aegis-incident-core",
  "aegis-incident-cluster-core",
  "aegis-twin-agent-core",
  "aegis-twin-facility-core",
  "aegis-external-core",
  "aegis-selection-points",
];

const DEFAULT_VISIBILITY: Record<AegisMapLayerKey, boolean> = {
  floodDepth: true,
  floodFlow: true,
  roads: true,
  evacuationRoutes: true,
  resources: true,
  hospitals: true,
  shelters: true,
  impactZones: true,
  damage: true,
  populationImpact: false,
  utilityImpact: false,
  recovery: false,
  confidence: false,
  safeZones: true,
  unavailableZones: true,
  warnings: true,
  damagedBuildings: true,
  impactedRoads: true,
  impactedBridges: true,
  criticalFacilities: true,
  utilityImpacts: true,
  populationImpacts: true,
  responseCoverageZones: true,
  recoveryPriorities: true,
  incidents: true,
};

const TOOL_OPTIONS: Array<{
  key: AegisMapTool;
  label: string;
  title: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { key: "inspect", label: "Inspect", title: "Inspect or pick a location", icon: MousePointer2 },
  { key: "origin", label: "Origin", title: "Place evacuation origin", icon: MapPin },
  { key: "destination", label: "Safe point", title: "Place evacuation destination", icon: Flag },
  { key: "hazard-source", label: "Source", title: "Place flood source", icon: Waves },
  { key: "area", label: "Area", title: "Draw operating area", icon: Crosshair },
];

const LAYER_OPTIONS: Array<{
  key: AegisMapLayerKey;
  label: string;
  color: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { key: "floodDepth", label: "Continuous water", color: "#43dff5", icon: Waves },
  { key: "floodFlow", label: "Flow vectors", color: "#b2f4ff", icon: Navigation },
  { key: "roads", label: "Road access", color: "#c6d6dc", icon: Route },
  { key: "evacuationRoutes", label: "Evacuation movement", color: "#2f8fff", icon: Navigation },
  { key: "resources", label: "Response units", color: "#f1c957", icon: Truck },
  { key: "hospitals", label: "Hospitals", color: "#ff6579", icon: Hospital },
  { key: "shelters", label: "Shelters", color: "#93e774", icon: TentTree },
  { key: "impactZones", label: "Impact field", color: "#ff8357", icon: AlertTriangle },
  { key: "damage", label: "Damaged structures", color: "#ff3b49", icon: AlertTriangle },
  { key: "populationImpact", label: "Population exposure", color: "#f2b84b", icon: Users },
  { key: "utilityImpact", label: "Utility impact", color: "#ff7a45", icon: Wrench },
  { key: "recovery", label: "Recovery estimate", color: "#8bd8a7", icon: Clock3 },
  { key: "confidence", label: "Data confidence", color: "#d7dde0", icon: Gauge },
  { key: "safeZones", label: "Modelled safe", color: "#43d17d", icon: ShieldCheck },
  { key: "unavailableZones", label: "Unavailable", color: "#73797d", icon: Ban },
  { key: "warnings", label: "Warnings", color: "#efb84e", icon: AlertTriangle },
  { key: "incidents", label: "Global incidents", color: "#ff4d67", icon: Radio },
];

const INSPECTION_PRIORITY = [
  "geometryStatus",
  "attributeStatus",
  "centerEvidence",
  "currentExternalDepthM",
  "currentInternalDepthM",
  "maximumDepthM",
  "depthM",
  "damageBand",
  "damageIndex",
  "impactIndex",
  "damageState",
  "accessStatus",
  "operationalStatus",
  "floorsAffected",
  "occupantsInExposureEnvelope",
  "peopleWithinExposureEnvelope",
  "populationImpactBand",
  "utilityStatus",
  "recoveryHours",
  "confidence01",
  "evidenceClass",
  "recommendedAction",
  "status",
  "etaMinutes",
];

function asAny<G extends Geometry, P>(
  collection: FeatureCollection<G, P> | undefined,
): AnyFeatureCollection {
  return (collection ?? EMPTY_FEATURE_COLLECTION) as AnyFeatureCollection;
}

function combineCollections(
  ...collections: Array<FeatureCollection<Geometry, unknown> | undefined>
): AnyFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((collection) => collection?.features ?? []),
  } as AnyFeatureCollection;
}

function staticBuildingData(): AnyFeatureCollection {
  return {
    type: "FeatureCollection",
    features: EIT_CAMPUS_BUILDINGS.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        function: feature.properties.use,
        currentExternalDepthM: 0,
        currentInternalDepthM: 0,
        damageIndex: 0,
        damageBand: "none",
        accessStatus: "open",
        floorsAffected: 0,
        geometryEvidenceClass: "IMPORTED",
        impactEvidenceClass: "SIMULATED",
        centerEvidence: "INSTITUTE CONTACT-MAP REFERENCE",
      },
    })),
  };
}

const STATIC_BUILDINGS = staticBuildingData();

function emptySourceData(): SourceData {
  return {
    waterSurface: EMPTY_FEATURE_COLLECTION,
    waterSamples: EMPTY_FEATURE_COLLECTION,
    waterContours: EMPTY_FEATURE_COLLECTION,
    flow: EMPTY_FEATURE_COLLECTION,
    roads: EMPTY_FEATURE_COLLECTION,
    routes: EMPTY_FEATURE_COLLECTION,
    routeMovers: EMPTY_FEATURE_COLLECTION,
    resources: EMPTY_FEATURE_COLLECTION,
    hospitals: EMPTY_FEATURE_COLLECTION,
    shelters: EMPTY_FEATURE_COLLECTION,
    impactSamples: EMPTY_FEATURE_COLLECTION,
    damage: EMPTY_FEATURE_COLLECTION,
    populationSamples: EMPTY_FEATURE_COLLECTION,
    utilityImpact: EMPTY_FEATURE_COLLECTION,
    recovery: EMPTY_FEATURE_COLLECTION,
    confidence: EMPTY_FEATURE_COLLECTION,
    safeZones: EMPTY_FEATURE_COLLECTION,
    unavailableZones: EMPTY_FEATURE_COLLECTION,
    warnings: EMPTY_FEATURE_COLLECTION,
    impactedRoads: EMPTY_FEATURE_COLLECTION,
    impactedBridges: EMPTY_FEATURE_COLLECTION,
    criticalFacilities: EMPTY_FEATURE_COLLECTION,
    utilityPoints: EMPTY_FEATURE_COLLECTION,
    responseCoverage: EMPTY_FEATURE_COLLECTION,
    recoveryPoints: EMPTY_FEATURE_COLLECTION,
    incidents: EMPTY_FEATURE_COLLECTION,
    selection: EMPTY_FEATURE_COLLECTION,
    campusBoundary: asAny(EIT_CAMPUS_BOUNDARY),
    campusBuildings: STATIC_BUILDINGS,
    campusRoads: asAny(EIT_CAMPUS_ROADS),
    twinAgents: EMPTY_FEATURE_COLLECTION,
    twinFacilities: EMPTY_FEATURE_COLLECTION,
    terrainPoints: EMPTY_FEATURE_COLLECTION,
    externalOverlays: EMPTY_FEATURE_COLLECTION,
  };
}

function buildSourceData(
  layers: AegisMapLayers,
  flood: FloodVisualData,
  twin: TwinVisualData | null,
  incidents: AegisIncident[],
  selection: AegisMapSelection,
  draftArea: AegisCoordinate[],
  overlays: AegisExternalOverlay[],
  overlayOverrides: ReadonlyMap<string, AegisCoordinate>,
): SourceData {
  return {
    waterSurface: asAny(flood.surface),
    waterSamples: asAny(flood.samples),
    waterContours: asAny(twin?.contours),
    flow: asAny(layers.floodFlow),
    roads: asAny(layers.roads),
    routes: asAny(twin?.routes ?? layers.evacuationRoutes),
    routeMovers: EMPTY_FEATURE_COLLECTION,
    resources: asAny(layers.resources),
    hospitals: asAny(layers.hospitals),
    shelters: asAny(layers.shelters),
    impactSamples: polygonCollectionToPoints(layers.impactZones),
    damage: combineCollections(
      twin?.damage as FeatureCollection<Geometry, unknown> | undefined,
      layers.damagedBuildings as FeatureCollection<Geometry, unknown> | undefined,
      layers.damage as FeatureCollection<Geometry, unknown> | undefined,
    ),
    populationSamples: polygonCollectionToPoints(
      combineCollections(
        twin?.populationImpact as FeatureCollection<Geometry, unknown> | undefined,
        layers.populationImpacts as FeatureCollection<Geometry, unknown> | undefined,
        layers.populationImpact as FeatureCollection<Geometry, unknown> | undefined,
      ) as FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>,
    ),
    utilityImpact: asAny(
      (twin?.utilityImpact ?? layers.utilityImpact) as FeatureCollection<Geometry, unknown> | undefined,
    ),
    recovery: asAny(
      (twin?.recovery ?? layers.recovery) as FeatureCollection<Geometry, unknown> | undefined,
    ),
    confidence: asAny(
      (twin?.confidence ?? layers.confidence) as FeatureCollection<Geometry, unknown> | undefined,
    ),
    safeZones: asAny(
      (twin?.safeZones ?? layers.safeZones) as FeatureCollection<Geometry, unknown> | undefined,
    ),
    unavailableZones: asAny(
      (twin?.unavailableZones ?? layers.unavailableZones) as FeatureCollection<Geometry, unknown> | undefined,
    ),
    warnings: asAny(
      (twin?.warnings ?? layers.warnings) as FeatureCollection<Geometry, unknown> | undefined,
    ),
    impactedRoads: asAny(layers.impactedRoads),
    impactedBridges: asAny(layers.impactedBridges),
    criticalFacilities: asAny(layers.criticalFacilities),
    utilityPoints: asAny(layers.utilityImpacts),
    responseCoverage: asAny(layers.responseCoverageZones),
    recoveryPoints: asAny(layers.recoveryPriorities),
    incidents: incidentsToGeoJSON(incidents),
    selection: selectionToGeoJSON(selection, draftArea),
    campusBoundary: asAny(EIT_CAMPUS_BOUNDARY),
    campusBuildings: twin ? asAny(twin.buildings) : STATIC_BUILDINGS,
    campusRoads: asAny(EIT_CAMPUS_ROADS),
    twinAgents: asAny(twin?.agents),
    twinFacilities: asAny(twin?.facilities),
    terrainPoints: asAny(twin?.terrainPoints),
    externalOverlays: externalOverlaysToGeoJSON(overlays, overlayOverrides),
  };
}

function firstSymbolLayerId(map: MapLibreMap): string | undefined {
  return map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
}

function addLayer(map: MapLibreMap, layer: LayerSpecification, before?: string): void {
  if (!map.getLayer(layer.id)) map.addLayer(layer, before);
}

function promoteProviderContextLabels(map: MapLibreMap): number {
  const labels = map.getStyle().layers?.filter((candidate) => {
    const value = candidate as LayerSpecification & {
      "source-layer"?: string;
      layout?: Record<string, unknown>;
    };
    return isProviderContextLabelLayer({
      id: candidate.id,
      type: candidate.type,
      sourceLayer: value["source-layer"],
      hasTextField: Boolean(value.layout && "text-field" in value.layout),
    });
  }) ?? [];
  labels.forEach((layer) => {
    try {
      // Provider labels must remain readable over AEGIS heatmaps, water and
      // operational fills, especially during a high-zoom WORLD search.
      map.moveLayer(layer.id);
    } catch {
      // A provider may reject moving a generated or symbol-placement layer.
    }
  });
  return labels.length;
}

function stabilizeWorldCountryLabels(map: MapLibreMap): number {
  const labels = map.getStyle().layers?.filter((candidate) => {
    const value = candidate as LayerSpecification & {
      "source-layer"?: string;
      filter?: unknown;
      layout?: Record<string, unknown>;
    };
    return isProviderCountryLabelLayer({
      id: candidate.id,
      type: candidate.type,
      sourceLayer: value["source-layer"],
      hasTextField: Boolean(value.layout && "text-field" in value.layout),
      filter: value.filter,
    });
  }) ?? [];

  labels.forEach((layer) => {
    try {
      // Viewport alignment keeps names upright while the spherical surface moves.
      map.setLayoutProperty(layer.id, "text-pitch-alignment", "viewport");
      map.setLayoutProperty(layer.id, "text-rotation-alignment", "viewport");
      map.setPaintProperty(layer.id, "text-color", "#f4f7f5");
      map.setPaintProperty(layer.id, "text-halo-color", "rgba(2, 5, 7, 0.96)");
      map.setPaintProperty(layer.id, "text-halo-width", 1.6);
      map.setPaintProperty(layer.id, "text-halo-blur", 0.2);
      map.moveLayer(layer.id);
    } catch {
      // Custom providers may expose immutable generated label layers.
    }
  });
  if (labels.length || map.getLayer("aegis-world-country-labels")) return labels.length || 1;

  const placeLayer = providerLayerReference(map, /place|settlement/i);
  if (!placeLayer) return 0;
  try {
    addLayer(map, {
      id: "aegis-world-country-labels",
      type: "symbol",
      source: placeLayer.source,
      "source-layer": placeLayer.sourceLayer,
      minzoom: 0,
      maxzoom: 7,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["any", ["==", ["get", "class"], "country"], ["==", ["get", "place"], "country"]],
      ],
      layout: {
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name:en"], ["get", "name"], ""],
        "text-font": MAP_FONT_STACK,
        "text-size": ["interpolate", ["linear"], ["zoom"], 0, 9, 3, 12, 6, 14],
        "text-transform": "uppercase",
        "text-max-width": 12,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-optional": true,
      },
      paint: {
        "text-color": "#f4f7f5",
        "text-halo-color": "rgba(2, 5, 7, 0.96)",
        "text-halo-width": 1.6,
        "text-halo-blur": 0.2,
      },
    } as LayerSpecification);
    return 1;
  } catch {
    return 0;
  }
}

function applyLayerVisibility(
  map: MapLibreMap,
  visibility: Record<AegisMapLayerKey, boolean>,
): void {
  const visibilityByLayer = new Map<string, boolean>();
  (Object.keys(visibility) as AegisMapLayerKey[]).forEach((key) => {
    LAYER_IDS[key].forEach((id) => {
      visibilityByLayer.set(id, (visibilityByLayer.get(id) ?? true) && visibility[key]);
    });
  });
  visibilityByLayer.forEach((visible, id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
}

function addSources(map: MapLibreMap, data: SourceData, enableTerrain: boolean): void {
  (Object.keys(SOURCE_IDS) as SourceKey[]).forEach((key) => {
    if (map.getSource(SOURCE_IDS[key])) return;
    map.addSource(SOURCE_IDS[key], {
      type: "geojson",
      data: data[key],
      generateId: true,
      lineMetrics: key === "flow" || key === "routes",
      ...(key === "incidents" ? {
        cluster: true,
        clusterMaxZoom: 7,
        clusterRadius: 44,
        clusterProperties: {
          live_count: ["+", ["case", ["==", ["get", "live"], true], 1, 0]],
        },
      } : {}),
    });
  });
  if (enableTerrain) {
    try {
      if (!map.getSource("aegis-terrain-dem")) {
        map.addSource("aegis-terrain-dem", {
          type: "raster-dem",
          tiles: TERRAIN_TILES,
          tileSize: 256,
          maxzoom: 15,
          encoding: "terrarium",
          attribution: "Mapzen terrain tiles / SRTM and contributing elevation sources",
        });
      }
      // MapLibre warns when one DEM source drives both terrain and hillshade.
      // Keep the visual hillshade cache independent from the terrain mesh.
      if (!map.getSource("aegis-terrain-hillshade-dem")) {
        map.addSource("aegis-terrain-hillshade-dem", {
          type: "raster-dem",
          tiles: TERRAIN_TILES,
          tileSize: 256,
          maxzoom: 15,
          encoding: "terrarium",
          attribution: "Mapzen terrain tiles / SRTM and contributing elevation sources",
        });
      }
    } catch {
      // The digital twin remains available without remote terrain.
    }
  }
}

function pointLayers(
  map: MapLibreMap,
  prefix: string,
  source: string,
  color: string,
  label: string,
): void {
  addLayer(map, {
    id: `${prefix}-ring`,
    type: "circle",
    source,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 17, 10],
      "circle-color": "rgba(4, 14, 19, 0.88)",
      "circle-stroke-color": color,
      "circle-stroke-width": 1.35,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: `${prefix}-core`,
    type: "circle",
    source,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 17, 5.2],
      "circle-color": color,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: `${prefix}-label`,
    type: "symbol",
    source,
    minzoom: 12,
    layout: {
      "text-field": label,
      "text-font": MAP_FONT_STACK,
      "text-size": 9,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#061117" },
  } as LayerSpecification);
}

function addMapLayers(
  map: MapLibreMap,
  waterVerticalExaggeration: number,
  enableTerrain: boolean,
): void {
  const beforeLabels = firstSymbolLayerId(map);

  if (enableTerrain && map.getSource("aegis-terrain-hillshade-dem")) {
    addLayer(map, {
      id: "aegis-terrain-hillshade",
      type: "hillshade",
      source: "aegis-terrain-hillshade-dem",
      minzoom: 8,
      paint: {
        "hillshade-shadow-color": "#031016",
        "hillshade-highlight-color": "#5c8f94",
        "hillshade-accent-color": "#183e47",
        "hillshade-exaggeration": 0.28,
      },
    } as LayerSpecification, beforeLabels);
  }

  addLayer(map, {
    id: "aegis-terrain-relief",
    type: "heatmap",
    source: SOURCE_IDS.terrainPoints,
    minzoom: 14,
    maxzoom: 19,
    paint: {
      "heatmap-weight": 0.2,
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 14, 18, 18, 55],
      "heatmap-intensity": 0.32,
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(23, 66, 64, 0)",
        0.5, "rgba(45, 105, 87, 0.15)",
        1, "rgba(109, 149, 101, 0.28)",
      ],
      "heatmap-opacity": 0.5,
    },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-campus-ground",
    type: "fill",
    source: SOURCE_IDS.campusBoundary,
    paint: {
      "fill-color": "#143127",
      "fill-opacity": 0.42,
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-campus-perimeter",
    type: "line",
    source: SOURCE_IDS.campusBoundary,
    paint: {
      "line-color": "rgba(105, 225, 237, 0.62)",
      "line-width": 1.35,
      "line-dasharray": [3, 2],
    },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-campus-road-casing",
    type: "line",
    source: SOURCE_IDS.campusRoads,
    minzoom: 14,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#061014",
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2.5, 18, 10],
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-campus-road-line",
    type: "line",
    source: SOURCE_IDS.campusRoads,
    minzoom: 14,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": [
        "match", ["get", "class"],
        "walkway", "#809c98",
        "service", "#526b6d",
        "#6a8586",
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.1, 18, 5.2],
    },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-impact-field",
    type: "heatmap",
    source: SOURCE_IDS.impactSamples,
    paint: {
      "heatmap-weight": ["to-number", ["coalesce", ["get", "damageIndex"], ["get", "impactIndex"], 0.2]],
      "heatmap-intensity": 0.78,
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 13, 17, 42],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(255, 107, 75, 0)",
        0.35, "rgba(255, 178, 68, 0.14)",
        0.7, "rgba(255, 91, 67, 0.27)",
        1, "rgba(214, 38, 79, 0.42)",
      ],
      "heatmap-opacity": 0.72,
    },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-safe-fill",
    type: "fill",
    source: SOURCE_IDS.safeZones,
    minzoom: 10,
    paint: { "fill-color": "#32c875", "fill-opacity": 0.16 },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-safe-outline",
    type: "line",
    source: SOURCE_IDS.safeZones,
    minzoom: 10,
    paint: { "line-color": "#55de91", "line-width": 2, "line-opacity": 0.92 },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-unavailable-fill",
    type: "fill",
    source: SOURCE_IDS.unavailableZones,
    minzoom: 10,
    paint: { "fill-color": "#686d70", "fill-opacity": 0.42 },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-unavailable-outline",
    type: "line",
    source: SOURCE_IDS.unavailableZones,
    minzoom: 10,
    paint: { "line-color": "#9a9fa2", "line-width": 2, "line-dasharray": [2, 1.4] },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-warning-fill",
    type: "fill",
    source: SOURCE_IDS.warnings,
    minzoom: 10,
    paint: { "fill-color": "#e4a93f", "fill-opacity": 0.18 },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-warning-outline",
    type: "line",
    source: SOURCE_IDS.warnings,
    minzoom: 10,
    paint: { "line-color": "#efbd58", "line-width": 1.8, "line-dasharray": [3, 1.5] },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-damage-fill",
    type: "fill-extrusion",
    source: SOURCE_IDS.damage,
    minzoom: 10,
    paint: {
      "fill-extrusion-color": [
        "interpolate", ["linear"], ["to-number", ["coalesce", ["get", "damageIndex"], ["get", "impactIndex"], ["get", "value"], 0]],
        0, "#9b653f",
        0.35, "#dd523f",
        0.7, "#f22f42",
        1, "#ff1739",
      ],
      "fill-extrusion-height": [
        "max",
        1.2,
        ["to-number", ["coalesce", ["get", "buildingHeightM"], ["get", "heightM"], 1.2]],
      ],
      "fill-extrusion-base": 0.35,
      "fill-extrusion-opacity": 0.52,
      "fill-extrusion-vertical-gradient": true,
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-damage-outline",
    type: "line",
    source: SOURCE_IDS.damage,
    minzoom: 10,
    paint: { "line-color": "#ff5664", "line-width": 2.3, "line-opacity": 0.98 },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-population-impact",
    type: "heatmap",
    source: SOURCE_IDS.populationSamples,
    minzoom: 11,
    paint: {
      "heatmap-weight": [
        "interpolate", ["linear"], ["to-number", ["coalesce", ["get", "peopleExposed"], ["get", "peopleWithinExposureEnvelope"], ["get", "value"], 0]],
        0, 0,
        500, 1,
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 12, 18, 42],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(239,184,78,0)",
        0.45, "rgba(239,184,78,0.22)",
        1, "rgba(255,99,65,0.58)",
      ],
      "heatmap-opacity": 0.75,
    },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-utility-fill",
    type: "fill",
    source: SOURCE_IDS.utilityImpact,
    minzoom: 10,
    paint: { "fill-color": "#df6e3c", "fill-opacity": 0.32 },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-utility-outline",
    type: "line",
    source: SOURCE_IDS.utilityImpact,
    minzoom: 10,
    paint: { "line-color": "#ff9a61", "line-width": 2.1 },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-recovery-fill",
    type: "fill",
    source: SOURCE_IDS.recovery,
    minzoom: 10,
    paint: {
      "fill-color": [
        "interpolate", ["linear"], ["to-number", ["coalesce", ["get", "recoveryHours"], ["get", "value"], 0]],
        0, "#4bd28a",
        96, "#c8a84d",
        192, "#d95a47",
      ],
      "fill-opacity": 0.24,
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-recovery-outline",
    type: "line",
    source: SOURCE_IDS.recovery,
    minzoom: 10,
    paint: { "line-color": "#8fd8aa", "line-width": 1.6 },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-confidence-outline",
    type: "line",
    source: SOURCE_IDS.confidence,
    minzoom: 10,
    paint: {
      "line-color": [
        "interpolate", ["linear"], ["to-number", ["coalesce", ["get", "confidence01"], 0]],
        0, "#777b7e",
        0.5, "#c0c5c7",
        1, "#ffffff",
      ],
      "line-width": 1.4,
      "line-dasharray": [1.5, 1.5],
      "line-opacity": 0.86,
    },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-response-coverage-fill",
    type: "fill",
    source: SOURCE_IDS.responseCoverage,
    minzoom: 10,
    paint: {
      "fill-color": [
        "match", ["get", "evacuationStatus"],
        "covered", "#36c879",
        "partially-covered", "#2f8fff",
        "uncovered", "#e4a93f",
        "#686d70",
      ],
      "fill-opacity": 0.14,
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-response-coverage-outline",
    type: "line",
    source: SOURCE_IDS.responseCoverage,
    minzoom: 10,
    paint: {
      "line-color": [
        "match", ["get", "evacuationStatus"],
        "covered", "#55de91",
        "partially-covered", "#62a8ff",
        "uncovered", "#efbd58",
        "#969b9e",
      ],
      "line-width": 1.8,
      "line-dasharray": [3, 1.5],
    },
  } as LayerSpecification, beforeLabels);

  addLayer(map, {
    id: "aegis-impacted-road-casing",
    type: "line",
    source: SOURCE_IDS.impactedRoads,
    minzoom: 10,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#09090a", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 18, 11] },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-impacted-road-line",
    type: "line",
    source: SOURCE_IDS.impactedRoads,
    minzoom: 10,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": [
        "match", ["get", "operationalStatus"],
        "unavailable", "#656a6d",
        "degraded", "#e4a93f",
        "#d94a45",
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 18, 5.5],
      "line-opacity": 0.96,
    },
  } as LayerSpecification, beforeLabels);

  const addImpactPoint = (
    idPrefix: string,
    source: string,
    color: string,
    strokeColor: string,
    radius = 5,
  ) => {
    addLayer(map, {
      id: `${idPrefix}-ring`,
      type: "circle",
      source,
      minzoom: 10,
      paint: {
        "circle-radius": radius + 5,
        "circle-color": color,
        "circle-opacity": 0.14,
        "circle-blur": 0.35,
      },
    } as LayerSpecification, beforeLabels);
    addLayer(map, {
      id: `${idPrefix}-core`,
      type: "circle",
      source,
      minzoom: 10,
      paint: {
        "circle-radius": radius,
        "circle-color": color,
        "circle-stroke-color": strokeColor,
        "circle-stroke-width": 1.8,
      },
    } as LayerSpecification, beforeLabels);
  };
  addImpactPoint("aegis-impacted-bridge", SOURCE_IDS.impactedBridges, "#d94a45", "#ff6674", 5.2);
  addImpactPoint("aegis-critical-facility", SOURCE_IDS.criticalFacilities, "#e5aa3f", "#ffe09a", 5.8);
  addImpactPoint("aegis-utility-point", SOURCE_IDS.utilityPoints, "#df6d3d", "#ffad78", 5.2);
  addImpactPoint("aegis-recovery-point", SOURCE_IDS.recoveryPoints, "#63bd83", "#b4efc8", 5.4);

  addLayer(map, {
    id: "aegis-critical-facility-label",
    type: "symbol",
    source: SOURCE_IDS.criticalFacilities,
    minzoom: 13,
    layout: {
      "text-field": ["coalesce", ["get", "entityName"], ["get", "name"], "CRITICAL FACILITY"],
      "text-font": MAP_FONT_STACK,
      "text-size": 10,
      "text-offset": [0, 1.5],
      "text-allow-overlap": false,
    },
    paint: { "text-color": "#f5f2e9", "text-halo-color": "#050506", "text-halo-width": 1.3 },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-recovery-point-label",
    type: "symbol",
    source: SOURCE_IDS.recoveryPoints,
    minzoom: 13,
    layout: {
      "text-field": ["concat", "RECOVERY #", ["to-string", ["coalesce", ["get", "rank"], "-"]]],
      "text-font": MAP_FONT_STACK,
      "text-size": 9.5,
      "text-offset": [0, 1.45],
      "text-allow-overlap": false,
    },
    paint: { "text-color": "#dcece1", "text-halo-color": "#050506", "text-halo-width": 1.2 },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-depth-field",
    type: "heatmap",
    source: SOURCE_IDS.waterSamples,
    minzoom: 8,
    paint: {
      "heatmap-weight": [
        "interpolate", ["linear"], ["to-number", ["get", "depthM"]],
        0, 0,
        0.3, 0.35,
        1.5, 1,
      ],
      "heatmap-intensity": 0.82,
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 13, 17, 38],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(93, 190, 255, 0)",
        0.25, "rgba(93, 190, 255, 0.18)",
        0.55, "rgba(47, 143, 255, 0.32)",
        0.82, "rgba(21, 91, 178, 0.45)",
        1, "rgba(6, 36, 82, 0.68)",
      ],
      "heatmap-opacity": 0.8,
    },
  } as LayerSpecification, beforeLabels);

  const waterHeight: ExpressionSpecification = [
    "+",
    0.35,
    ["*", ["to-number", ["coalesce", ["get", "depthM"], 0]], waterVerticalExaggeration],
  ];
  addLayer(map, {
    id: "aegis-water-volume",
    type: "fill-extrusion",
    source: SOURCE_IDS.waterSurface,
    paint: {
      "fill-extrusion-color": [
        "interpolate", ["linear"], ["to-number", ["get", "maximumDepthM"]],
        0, "#72c9ff",
        0.4, "#359cff",
        1, "#1767c4",
        1.8, "#0c407f",
        3, "#041d42",
      ],
      "fill-extrusion-height": waterHeight,
      "fill-extrusion-base": 0.1,
      "fill-extrusion-opacity": 0.55,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-height-transition": { duration: 850, delay: 0 },
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-water-sheen",
    type: "fill",
    source: SOURCE_IDS.waterSurface,
    paint: {
      "fill-color": "#9af5ff",
      "fill-opacity": 0.13,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-water-shoreline",
    type: "line",
    source: SOURCE_IDS.waterSurface,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#b7f7ff",
      "line-width": 2.2,
      "line-opacity": 0.88,
      "line-blur": 0.45,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-water-contours",
    type: "line",
    source: SOURCE_IDS.waterContours,
    paint: {
      "line-color": [
        "interpolate", ["linear"], ["to-number", ["get", "depthM"]],
        0.05, "rgba(159, 220, 255, 0.4)",
        1.5, "rgba(84, 150, 255, 0.88)",
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.6, 18, 1.6],
      "line-dasharray": [2, 2],
    },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-flow-line",
    type: "line",
    source: SOURCE_IDS.flow,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": [
        "interpolate", ["linear"],
        ["to-number", ["coalesce", ["get", "velocityMps"], ["get", "velocity"], 0]],
        0, 1,
        4, 5,
      ],
      "line-gradient": [
        "interpolate", ["linear"], ["line-progress"],
        0, "rgba(125, 237, 255, 0.05)",
        0.42, "#adf6ff",
        0.72, "#ffffff",
        1, "rgba(125, 237, 255, 0.08)",
      ],
      "line-opacity": 0.9,
    },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-road-casing",
    type: "line",
    source: SOURCE_IDS.roads,
    paint: {
      "line-color": "rgba(2, 8, 12, 0.92)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 18, 9],
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-road-line",
    type: "line",
    source: SOURCE_IDS.roads,
    paint: {
      "line-color": [
        "match", ["get", "status"],
        "closed", "#51575b",
        "restricted", "#777d81",
        "#c4d4da",
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.1, 18, 5],
    },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-route-casing",
    type: "line",
    source: SOURCE_IDS.routes,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "rgba(1, 9, 12, 0.94)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 5, 18, 12],
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-route-line",
    type: "line",
    source: SOURCE_IDS.routes,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": [
        "match", ["get", "status"],
        "blocked", "#545a5e",
        "warning", "#7a858d",
        "#2f8fff",
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 2, 18, 6.5],
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-route-direction",
    type: "symbol",
    source: SOURCE_IDS.routes,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 72,
      "text-field": "›",
      "text-font": MAP_FONT_STACK,
      "text-size": 20,
      "text-keep-upright": false,
      "text-rotation-alignment": "map",
    },
    paint: { "text-color": "#f3fff9", "text-opacity": 0.92 },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-route-mover-glow",
    type: "circle",
    source: SOURCE_IDS.routeMovers,
    paint: {
      "circle-radius": 10,
      "circle-color": "#2f8fff",
      "circle-opacity": 0.2,
      "circle-blur": 0.5,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-route-mover-core",
    type: "circle",
    source: SOURCE_IDS.routeMovers,
    paint: {
      "circle-radius": 4.2,
      "circle-color": "#f4fff9",
      "circle-stroke-color": "#2f8fff",
      "circle-stroke-width": 1.7,
    },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-campus-building-shadow",
    type: "fill",
    source: SOURCE_IDS.campusBuildings,
    minzoom: 13.8,
    paint: {
      "fill-color": "#01070a",
      "fill-opacity": 0.35,
      "fill-translate": [7, 10],
      "fill-translate-anchor": "viewport",
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-campus-buildings",
    type: "fill-extrusion",
    source: SOURCE_IDS.campusBuildings,
    minzoom: 13.8,
    paint: {
      "fill-extrusion-color": [
        "case",
        ["==", ["get", "damageBand"], "critical"], "#ff1739",
        ["==", ["get", "damageBand"], "severe"], "#e62f42",
        ["==", ["get", "damageBand"], "moderate"], "#c74b42",
        ["==", ["get", "damageBand"], "minor"], "#b57b3f",
        ["==", ["get", "accessStatus"], "closed"], "#5f6467",
        ["==", ["get", "accessStatus"], "restricted"], "#81785f",
        ["==", ["get", "function"], "utility"], "#555c60",
        "#343a3d",
      ],
      "fill-extrusion-height": ["to-number", ["coalesce", ["get", "heightM"], 8]],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.92,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-color-transition": { duration: 700, delay: 0 },
    },
  } as LayerSpecification, beforeLabels);
  addLayer(map, {
    id: "aegis-campus-building-waterline",
    type: "fill-extrusion",
    source: SOURCE_IDS.campusBuildings,
    minzoom: 14,
    filter: [">", ["to-number", ["get", "currentExternalDepthM"]], 0.015],
    paint: {
      "fill-extrusion-color": [
        "interpolate", ["linear"], ["to-number", ["get", "currentExternalDepthM"]],
        0, "#57e5f5",
        0.6, "#298bdc",
        1.5, "#754bd0",
      ],
      "fill-extrusion-height": [
        "*",
        ["to-number", ["get", "currentExternalDepthM"]],
        waterVerticalExaggeration,
      ],
      "fill-extrusion-base": 0.05,
      "fill-extrusion-opacity": 0.58,
      "fill-extrusion-height-transition": { duration: 850, delay: 0 },
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-campus-building-label",
    type: "symbol",
    source: SOURCE_IDS.campusBuildings,
    minzoom: 16,
    layout: {
      "text-field": ["coalesce", ["get", "name"], "CAMPUS BUILDING"],
      "text-font": MAP_FONT_STACK,
      "text-size": 10,
      "text-anchor": "top",
      "text-offset": [0, 1.15],
      "text-max-width": 14,
      "text-optional": true,
    },
    paint: {
      "text-color": "#e8f8fb",
      "text-halo-color": "rgba(3, 11, 15, 0.92)",
      "text-halo-width": 1.2,
    },
  } as LayerSpecification);

  pointLayers(map, "aegis-resource", SOURCE_IDS.resources, "#f0c858", "R");
  pointLayers(map, "aegis-hospital", SOURCE_IDS.hospitals, "#ff6579", "H");
  pointLayers(map, "aegis-shelter", SOURCE_IDS.shelters, "#94e777", "S");

  addLayer(map, {
    id: "aegis-twin-agent-glow",
    type: "circle",
    source: SOURCE_IDS.twinAgents,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 7, 18, 13],
      "circle-color": [
        "match", ["get", "status"],
        "en-route", "#59efb4",
        "arrived", "#62dff0",
        "#f0c858",
      ],
      "circle-opacity": 0.22,
      "circle-blur": 0.42,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-twin-agent-core",
    type: "circle",
    source: SOURCE_IDS.twinAgents,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 18, 5.5],
      "circle-color": [
        "match", ["get", "kind"],
        "ambulance", "#ff6579",
        "bus", "#f0c858",
        "evacuation-group", "#eefcf6",
        "#59efb4",
      ],
      "circle-stroke-color": "#061116",
      "circle-stroke-width": 1.4,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-twin-facility-core",
    type: "circle",
    source: SOURCE_IDS.twinFacilities,
    paint: {
      "circle-radius": 6,
      "circle-color": [
        "match", ["get", "status"],
        "unavailable", "#ff5269",
        "degraded", "#efc153",
        "#71e1b1",
      ],
      "circle-stroke-color": "#edfaff",
      "circle-stroke-width": 1.2,
    },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-incident-cluster-glow",
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 40, 30],
      "circle-color": ["case", [">", ["get", "live_count"], 0], "#ff263f", "#efc153"],
      "circle-opacity": 0.16,
      "circle-blur": 0.45,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-incident-cluster-core",
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 10, 10, 13, 40, 16],
      "circle-color": "#17191a",
      "circle-stroke-color": ["case", [">", ["get", "live_count"], 0], "#ff263f", "#efc153"],
      "circle-stroke-width": 2,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-incident-cluster-count",
    type: "symbol",
    source: SOURCE_IDS.incidents,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": MAP_FONT_STACK,
      "text-size": 11,
    },
    paint: { "text-color": "#ffffff" },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-incident-glow",
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "match", ["get", "severity"],
        "critical", 20,
        "high", 16,
        "moderate", 13,
        10,
      ],
      "circle-color": [
        "case",
        ["==", ["get", "live"], true], "#ff334f",
        ["==", ["get", "status"], "simulated"], "#efc153",
        "#6c929d",
      ],
      "circle-opacity": 0.18,
      "circle-blur": 0.5,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-incident-live-pulse",
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: [
      "all",
      [
        "any",
        ["all", ["!", ["has", "point_count"]], ["==", ["get", "live"], true]],
        ["all", ["has", "point_count"], [">", ["get", "live_count"], 0]],
      ],
    ],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 8, 10, 15],
      "circle-color": "rgba(255, 38, 69, 0.12)",
      "circle-opacity": 0.72,
      "circle-stroke-color": "#ff263f",
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": 0.92,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-incident-core",
    type: "circle",
    source: SOURCE_IDS.incidents,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 4, 10, 7],
      "circle-color": [
        "case",
        ["==", ["get", "live"], true], "#ff263f",
        ["==", ["get", "status"], "simulated"], "#efc153",
        "#6c929d",
      ],
      "circle-stroke-color": "#f4fbff",
      "circle-stroke-width": 1.2,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-incident-label",
    type: "symbol",
    source: SOURCE_IDS.incidents,
    filter: ["!", ["has", "point_count"]],
    minzoom: 1,
    layout: {
      "text-field": [
        "case",
        ["==", ["get", "live"], true],
        ["concat", "LIVE | ", ["coalesce", ["get", "title"], "ACTIVE DISASTER"]],
        ["coalesce", ["get", "title"], "INCIDENT"],
      ],
      "text-font": MAP_FONT_STACK,
      "text-size": 10,
      "text-offset": [0, 1.45],
      "text-anchor": "top",
      "text-max-width": 15,
      "text-optional": true,
    },
    paint: {
      "text-color": "#eff8fb",
      "text-halo-color": "rgba(3, 10, 14, 0.94)",
      "text-halo-width": 1.25,
    },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-external-glow",
    type: "circle",
    source: SOURCE_IDS.externalOverlays,
    paint: {
      "circle-radius": 13,
      "circle-color": ["coalesce", ["get", "color"], "#6fe4f4"],
      "circle-opacity": 0.15,
      "circle-blur": 0.45,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-external-core",
    type: "circle",
    source: SOURCE_IDS.externalOverlays,
    paint: {
      "circle-radius": 5.5,
      "circle-color": "#07151b",
      "circle-stroke-color": ["coalesce", ["get", "color"], "#6fe4f4"],
      "circle-stroke-width": 2,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-external-label",
    type: "symbol",
    source: SOURCE_IDS.externalOverlays,
    minzoom: 9,
    layout: {
      "text-field": ["coalesce", ["get", "label"], "OVERLAY"],
      "text-font": MAP_FONT_STACK,
      "text-size": 10,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
    },
    paint: {
      "text-color": "#e8f8fb",
      "text-halo-color": "#061117",
      "text-halo-width": 1.2,
    },
  } as LayerSpecification);

  addLayer(map, {
    id: "aegis-selection-area-fill",
    type: "fill",
    source: SOURCE_IDS.selection,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#56e0f4", "fill-opacity": 0.1 },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-selection-lines",
    type: "line",
    source: SOURCE_IDS.selection,
    filter: [
      "any",
      ["==", ["geometry-type"], "Polygon"],
      ["==", ["geometry-type"], "LineString"],
    ],
    paint: { "line-color": "#68e6f8", "line-width": 2, "line-dasharray": [2, 1.5] },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-selection-points",
    type: "circle",
    source: SOURCE_IDS.selection,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": ["case", ["boolean", ["get", "draft"], false], 4.5, 7.5],
      "circle-color": [
        "match", ["get", "role"],
        "origin", "#51d8f1",
        "destination", "#5cebb0",
        "hazard-source", "#ff5970",
        "#edfaff",
      ],
      "circle-stroke-color": "#061117",
      "circle-stroke-width": 2,
    },
  } as LayerSpecification);
  addLayer(map, {
    id: "aegis-selection-labels",
    type: "symbol",
    source: SOURCE_IDS.selection,
    filter: ["==", ["geometry-type"], "Point"],
    layout: {
      "text-field": ["coalesce", ["get", "label"], "POINT"],
      "text-font": MAP_FONT_STACK,
      "text-size": 9,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#effcff", "text-halo-color": "#061117", "text-halo-width": 1.2 },
  } as LayerSpecification);
}

function enableBaseBuildings(map: MapLibreMap): boolean {
  if (map.getStyle().layers?.some(
    (layer) => layer.type === "fill-extrusion" && !layer.id.startsWith("aegis-"),
  )) return true;
  const layer = map.getStyle().layers?.find((candidate) => {
    const value = candidate as LayerSpecification & { "source-layer"?: string };
    return value["source-layer"] === "building" && "source" in value;
  }) as (LayerSpecification & { source: string; "source-layer": string }) | undefined;
  if (!layer) return false;
  try {
    addLayer(map, {
      id: "aegis-world-buildings-3d",
      type: "fill-extrusion",
      source: layer.source,
      "source-layer": layer["source-layer"],
      minzoom: 14.2,
      paint: {
        "fill-extrusion-color": [
          "interpolate", ["linear"],
          ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"], 6]],
          0, "#151719",
          40, "#24282a",
          120, "#3b3a34",
        ],
        "fill-extrusion-height": [
          "to-number", ["coalesce", ["get", "render_height"], ["get", "height"], 6],
        ],
        "fill-extrusion-base": [
          "to-number", ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        ],
        "fill-extrusion-opacity": 0.72,
        "fill-extrusion-vertical-gradient": true,
      },
    } as LayerSpecification, firstSymbolLayerId(map));
    return true;
  } catch {
    return false;
  }
}

function installWorldImagery(map: MapLibreMap): boolean {
  let installed = false;
  for (const source of WORLD_IMAGERY_SOURCES) {
    try {
      if (!map.getSource(source.id)) {
        map.addSource(source.id, {
          type: "raster",
          tiles: [...source.tiles],
          tileSize: 256,
          minzoom: 0,
          maxzoom: source.maxzoom,
          attribution: source.attribution,
        });
      }
      installed = true;
    } catch {
      // The second independent imagery source and vector provider remain usable.
    }
  }

  // Satellite is a base surface, not an opaque overlay. Keeping it directly
  // above the style background lets provider roads, buildings, boundaries and
  // labels remain active and prevents vector tiles being culled at local zoom.
  const beforeBaseContext = map.getStyle().layers?.find((layer) => layer.type !== "background")?.id;
  try {
    addLayer(map, {
      id: WORLD_IMAGERY_LAYER_IDS[0],
      type: "raster",
      source: WORLD_IMAGERY_SOURCES[0].id,
      minzoom: 0,
      maxzoom: 9,
      paint: {
        "raster-opacity": [
          "interpolate", ["linear"], ["zoom"],
          0, 0.94,
          5.8, 0.82,
          7.2, 0.34,
          8.6, 0,
        ],
        "raster-saturation": -0.1,
        "raster-contrast": 0.08,
        "raster-brightness-min": 0.05,
        "raster-brightness-max": 0.88,
        "raster-fade-duration": 0,
      },
    } as LayerSpecification, beforeBaseContext);
    addLayer(map, {
      id: WORLD_IMAGERY_LAYER_IDS[1],
      type: "raster",
      source: WORLD_IMAGERY_SOURCES[1].id,
      minzoom: 0,
      // The EOX source publishes through z14. Keeping the layer active above
      // that level lets MapLibre overzoom the last good tile underneath the
      // provider's vector streets, labels and buildings instead of exposing a
      // black background between imagery and local detail.
      maxzoom: WORLD_DETAIL_IMAGERY_LAYER_MAX_ZOOM,
      paint: {
        "raster-opacity": [
          "interpolate", ["linear"], ["zoom"],
          ...WORLD_DETAIL_IMAGERY_OPACITY_STOPS,
        ],
        "raster-saturation": -0.06,
        "raster-contrast": 0.13,
        "raster-brightness-min": 0.035,
        "raster-brightness-max": 0.92,
        "raster-fade-duration": 0,
      },
    } as LayerSpecification, beforeBaseContext);
  } catch {
    // Vector land remains visible if a limited WebGL runtime rejects raster reprojection.
  }
  return installed;
}

/**
 * Transparent, pre-rendered labels remain readable when a browser/GPU drops
 * vector glyph buckets. Insertion before provider symbols means the later
 * AEGIS operational layers stay visually and semantically dominant.
 */
function installRasterLabelFallback(map: MapLibreMap): boolean {
  try {
    if (!map.getSource(WORLD_RASTER_LABELS.sourceId)) {
      map.addSource(WORLD_RASTER_LABELS.sourceId, {
        type: "raster",
        tiles: [...WORLD_RASTER_LABELS.tiles],
        tileSize: 256,
        minzoom: WORLD_RASTER_LABELS.minzoom,
        maxzoom: WORLD_RASTER_LABELS.maxzoom,
        attribution: WORLD_RASTER_LABELS.attribution,
      });
    }
    addLayer(map, {
      id: WORLD_RASTER_LABELS.layerId,
      type: "raster",
      source: WORLD_RASTER_LABELS.sourceId,
      minzoom: WORLD_RASTER_LABELS.minzoom,
      maxzoom: WORLD_RASTER_LABELS.maxzoom,
      paint: {
        "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 5, 0.94, 20, 0.98],
        "raster-fade-duration": 0,
      },
    } as LayerSpecification, firstSymbolLayerId(map));
    return true;
  } catch {
    // Vector labels remain the primary path; this independent fallback is optional.
    return false;
  }
}

/** Guarantees a neutral visible surface even if optional imagery is delayed. */
function stabilizeProviderStreetContext(map: MapLibreMap): void {
  map.getStyle().layers?.forEach((layer) => {
    try {
      if (layer.type === "background") {
        map.setPaintProperty(layer.id, "background-color", "#111411");
        map.setPaintProperty(layer.id, "background-opacity", 1);
        return;
      }
      const value = layer as LayerSpecification & {
        "source-layer"?: string;
        layout?: Record<string, unknown>;
      };
      if (
        layer.type === "symbol"
        && isProviderContextLabelLayer({
          id: layer.id,
          type: layer.type,
          sourceLayer: value["source-layer"],
          hasTextField: Boolean(value.layout && "text-field" in value.layout),
        })
      ) {
        map.setLayoutProperty(layer.id, "visibility", "visible");
      }
    } catch {
      // Provider styles may expose immutable generated properties.
    }
  });
}

function providerLayerReference(
  map: MapLibreMap,
  sourceLayerPattern: RegExp,
): { source: string; sourceLayer: string } | null {
  const layer = map.getStyle().layers?.find((candidate) => {
    const value = candidate as LayerSpecification & { source?: string; "source-layer"?: string };
    return typeof value.source === "string"
      && typeof value["source-layer"] === "string"
      && sourceLayerPattern.test(value["source-layer"]);
  }) as (LayerSpecification & { source: string; "source-layer": string }) | undefined;
  return layer ? { source: layer.source, sourceLayer: layer["source-layer"] } : null;
}

function contextRoadWidth(): ExpressionSpecification {
  return [
    "interpolate", ["linear"], ["zoom"],
    5, ["match", ["get", "class"], ["motorway", "trunk"], 0.8, ["primary", "secondary"], 0.5, 0.2],
    10, ["match", ["get", "class"], ["motorway", "trunk"], 2.4, ["primary", "secondary"], 1.75, 0.85],
    16, ["match", ["get", "class"], ["motorway", "trunk"], 8.5, ["primary", "secondary"], 6.2, 3.2],
  ] as ExpressionSpecification;
}

/**
 * Provider-independent geographic context drawn from the style's own
 * OpenMapTiles-compatible vector source. These layers sit above imagery but
 * are installed before AEGIS operational layers, preserving route/hazard
 * priority even when a provider's bundled dark-style paint is too subtle.
 */
function enableProviderVectorContext(map: MapLibreMap): number {
  let installed = 0;
  const beforeProviderSymbols = firstSymbolLayerId(map);
  const roads = providerLayerReference(map, /^(?:transportation|road)$/i)
    ?? providerLayerReference(map, /transportation|road/i);
  if (roads) {
    const roadFilter: ExpressionSpecification = [
      "all",
      ["==", ["geometry-type"], "LineString"],
      [
        "in", ["get", "class"],
        ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "path", "track", "street"]],
      ],
    ] as ExpressionSpecification;
    try {
      addLayer(map, {
        id: WORLD_CONTEXT_LAYER_IDS.roadCasing,
        type: "line",
        source: roads.source,
        "source-layer": roads.sourceLayer,
        minzoom: 5,
        filter: roadFilter,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "rgba(12,15,15,0.94)",
          "line-width": ["+", contextRoadWidth(), ["interpolate", ["linear"], ["zoom"], 5, 0.5, 16, 2.2]],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.32, 8, 0.72, 14, 0.9],
        },
      } as LayerSpecification, beforeProviderSymbols);
      addLayer(map, {
        id: WORLD_CONTEXT_LAYER_IDS.roads,
        type: "line",
        source: roads.source,
        "source-layer": roads.sourceLayer,
        minzoom: 5,
        filter: roadFilter,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match", ["get", "class"],
            ["motorway", "trunk"], "#d2b278",
            ["primary", "secondary"], "#c5b99c",
            ["tertiary", "minor"], "#9ea39d",
            "#737b78",
          ],
          "line-width": contextRoadWidth(),
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.38, 8, 0.76, 14, 0.94],
        },
      } as LayerSpecification, beforeProviderSymbols);
      installed += 2;
    } catch {
      // Provider geometry remains available through its native style layers.
    }
  }

  const roadNames = providerLayerReference(map, /transportation_name|road.*name/i);
  if (roadNames) {
    try {
      addLayer(map, {
        id: WORLD_CONTEXT_LAYER_IDS.roadLabels,
        type: "symbol",
        source: roadNames.source,
        "source-layer": roadNames.sourceLayer,
        minzoom: 9,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 340,
          "text-field": ["coalesce", ["get", "name_en"], ["get", "name:en"], ["get", "name"], ["get", "ref"], ""],
          "text-font": MAP_FONT_STACK,
          "text-size": ["interpolate", ["linear"], ["zoom"], 9, 9, 14, 11.5, 18, 13],
          "text-max-angle": 35,
          "text-padding": 3,
          "text-optional": true,
        },
        paint: {
          "text-color": "#e4e4dd",
          "text-halo-color": "rgba(13,16,15,0.96)",
          "text-halo-width": 1.35,
          "text-halo-blur": 0.25,
        },
      } as LayerSpecification);
      installed += 1;
    } catch {
      // Street geometry remains usable if a provider omits road-name fields.
    }
  }

  const places = providerLayerReference(map, /^(?:place|settlement)$/i)
    ?? providerLayerReference(map, /place|settlement/i);
  if (places) {
    const placeName: ExpressionSpecification = [
      "coalesce", ["get", "name_en"], ["get", "name:en"], ["get", "name"], "",
    ] as ExpressionSpecification;
    try {
      addLayer(map, {
        id: WORLD_CONTEXT_LAYER_IDS.countryLabels,
        type: "symbol",
        source: places.source,
        "source-layer": places.sourceLayer,
        minzoom: 0,
        maxzoom: 7.8,
        filter: ["any", ["==", ["get", "class"], "country"], ["==", ["get", "place"], "country"]],
        layout: {
          "text-field": placeName,
          "text-font": MAP_FONT_STACK,
          "text-size": ["interpolate", ["linear"], ["zoom"], 0, 9.5, 3, 12, 7, 15],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.08,
          "text-max-width": 12,
          "text-allow-overlap": false,
          "text-optional": true,
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "viewport",
        },
        paint: {
          "text-color": "#f1f0e9",
          "text-halo-color": "rgba(9,12,12,0.98)",
          "text-halo-width": 1.7,
          "text-halo-blur": 0.2,
        },
      } as LayerSpecification);
      addLayer(map, {
        id: WORLD_CONTEXT_LAYER_IDS.cityLabels,
        type: "symbol",
        source: places.source,
        "source-layer": places.sourceLayer,
        minzoom: 3,
        maxzoom: 17,
        filter: [
          "any",
          ["in", ["get", "class"], ["literal", ["city", "town", "village", "suburb", "neighbourhood"]]],
          ["in", ["get", "place"], ["literal", ["city", "town", "village", "suburb", "neighbourhood"]]],
          ["has", "capital"],
        ],
        layout: {
          "text-field": placeName,
          "text-font": MAP_FONT_STACK,
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9.5, 8, 12, 14, 15],
          "text-max-width": 10,
          "text-padding": 4,
          "text-allow-overlap": false,
          "text-optional": true,
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "viewport",
        },
        paint: {
          "text-color": "#f4f2e9",
          "text-halo-color": "rgba(9,12,12,0.97)",
          "text-halo-width": 1.55,
          "text-halo-blur": 0.25,
        },
      } as LayerSpecification);
      installed += 2;
    } catch {
      // Country boundaries and native provider symbols remain as fallbacks.
    }
  }
  return installed;
}

function enableWorldBoundaries(map: MapLibreMap): boolean {
  if (map.getLayer("aegis-world-country-boundaries")) return true;
  const layer = providerLayerReference(map, /boundary|admin/i);
  if (!layer) return false;
  try {
    addLayer(map, {
      id: "aegis-world-country-boundaries",
      type: "line",
      source: layer.source,
      "source-layer": layer.sourceLayer,
      minzoom: 0,
      maxzoom: 8.8,
      filter: [
        "any",
        ["==", ["get", "admin_level"], 2],
        ["==", ["get", "admin_level"], "2"],
        ["==", ["get", "class"], "country"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "rgba(229,238,235,0.76)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 4, 0.8, 8, 1.15],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 0.72, 8.8, 0],
      },
    } as LayerSpecification, firstSymbolLayerId(map));
    return true;
  } catch {
    return false;
  }
}

function enableCityLights(map: MapLibreMap): boolean {
  if (map.getLayer("aegis-city-lights-core")) return true;
  const layer = providerLayerReference(map, /place|settlement/i);
  if (!layer) return false;
  try {
    addLayer(map, {
      id: "aegis-city-lights-glow",
      type: "circle",
      source: layer.source,
      "source-layer": layer.sourceLayer,
      minzoom: 0,
      maxzoom: 8.5,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        [
          "any",
          ["==", ["get", "class"], "city"],
          ["==", ["get", "class"], "town"],
          ["has", "capital"],
        ],
      ],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 2.4, 4, 5.5, 8, 9],
        "circle-color": "#ffca69",
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.28, 3, 0.34, 8.5, 0],
        "circle-blur": 0.92,
      },
    } as LayerSpecification, firstSymbolLayerId(map));
    addLayer(map, {
      id: "aegis-city-lights-core",
      type: "circle",
      source: layer.source,
      "source-layer": layer.sourceLayer,
      minzoom: 1,
      maxzoom: 8.5,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        [
          "any",
          ["==", ["get", "class"], "city"],
          ["==", ["get", "class"], "town"],
          ["has", "capital"],
        ],
      ],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 5, 1.55, 8, 2.2],
        "circle-color": "#ffe5a7",
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.72, 6, 0.82, 8.5, 0],
        "circle-stroke-color": "rgba(255,190,83,0.55)",
        "circle-stroke-width": 0.55,
      },
    } as LayerSpecification, firstSymbolLayerId(map));

    map.getStyle().layers
      ?.filter((candidate) => {
        const value = candidate as LayerSpecification & { "source-layer"?: string };
        return candidate.type === "symbol" && /place|settlement/i.test(value["source-layer"] ?? "");
      })
      .forEach((candidate) => {
        try {
          map.setPaintProperty(candidate.id, "text-color", "#f1f3ee");
          map.setPaintProperty(candidate.id, "text-halo-color", "rgba(2,5,7,0.94)");
          map.setPaintProperty(candidate.id, "text-halo-width", 1.25);
          map.setPaintProperty(candidate.id, "text-halo-blur", 0.35);
        } catch {
          // A provider may expose icon-only place layers; those remain unchanged.
        }
      });
    return true;
  } catch {
    return false;
  }
}

function setAtmosphere(map: MapLibreMap, world: boolean): void {
  try {
    // Street-level globe rendering can turn the canvas black when terrain is
    // enabled, so hand close-range views to Mercator before the camera flight.
    map.setProjection({ type: world ? "globe" : "mercator" });
    map.setSky(world ? {
      "sky-color": "#010305",
      "horizon-color": "#7094a3",
      "fog-color": "#1b2d35",
      "fog-ground-blend": 0.56,
      "horizon-fog-blend": 0.52,
      "sky-horizon-blend": 0.68,
      "atmosphere-blend": [
        "interpolate", ["linear"], ["zoom"],
        0, 1,
        5, 0.92,
        7, 0,
      ],
    } : {
      "sky-color": "#030404",
      "horizon-color": "#030404",
      "fog-color": "#030404",
      "fog-ground-blend": 0,
      "horizon-fog-blend": 0,
      "sky-horizon-blend": 0,
      "atmosphere-blend": 0,
    });
    map.setLight({ anchor: "map", color: "#fff5dc", intensity: world ? 0.72 : 0.5, position: [1.35, 210, 42] });
  } catch {
    // Projection, sky and light gracefully degrade on limited WebGL implementations.
  }
}

function setCampusLayerVisibility(map: MapLibreMap, visible: boolean): void {
  CAMPUS_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
}

function flyWorld(map: MapLibreMap, duration = 2_400): void {
  setAtmosphere(map, true);
  try {
    if (map.getTerrain()) map.setTerrain(null);
  } catch {
    // Remote terrain may already be unavailable.
  }
  setCampusLayerVisibility(map, false);
  const container = map.getContainer();
  const camera = worldCameraForViewport(container.clientWidth, container.clientHeight);
  map.flyTo({
    ...camera,
    duration,
    curve: 1.15,
    essential: false,
  });
}

function flyTwin(
  map: MapLibreMap,
  center: AegisCoordinate,
  duration = 3_500,
  enableTerrain = true,
  showEstimatedCampusMassing = true,
  zoom = 17.15,
  pitch = 68,
  bearing = -30,
): void {
  setAtmosphere(map, false);
  setCampusLayerVisibility(map, showEstimatedCampusMassing);
  if (enableTerrain && map.getSource("aegis-terrain-dem")) {
    try {
      map.setTerrain({ source: "aegis-terrain-dem", exaggeration: 1.18 });
    } catch {
      // The close-range 3D massing remains functional without DEM terrain.
    }
  }
  map.flyTo({
    center,
    zoom,
    pitch,
    bearing,
    duration,
    curve: 1.52,
    essential: false,
  });
}

function featureInspection(
  feature: MapGeoJSONFeature,
  coordinate: AegisCoordinate,
): AegisFeatureInspection {
  return {
    id: feature.id,
    sourceId: feature.source,
    layerId: feature.layer.id,
    geometryType: feature.geometry.type,
    coordinate,
    properties: { ...(feature.properties ?? {}) },
  };
}

function isInspectableBaseFeature(feature: MapGeoJSONFeature): boolean {
  const sourceLayer = feature.sourceLayer ?? "";
  const layerId = feature.layer.id.toLowerCase();
  const featureClass = String(feature.properties?.class ?? feature.properties?.type ?? "").toLowerCase();
  return (
    feature.layer.type === "fill-extrusion" ||
    /building|water|transportation|road/.test(sourceLayer) ||
    /building|water|road|river|street/.test(layerId) ||
    /building|water|road|river|street/.test(featureClass)
  );
}

function pointForTool(
  tool: AegisMapTool,
  coordinate: AegisCoordinate,
  sequence: number,
): AegisSelectionPoint | null {
  if (tool !== "origin" && tool !== "destination" && tool !== "hazard-source") return null;
  return {
    id: `${tool}-${sequence}`,
    coordinates: coordinate,
    role: tool,
    label: tool === "origin" ? "EVAC ORIGIN" : tool === "destination" ? "SAFE POINT" : "FLOOD SOURCE",
  };
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function titleForInspection(inspection: AegisFeatureInspection): string {
  const value = inspection.properties.name ?? inspection.properties.title ?? inspection.properties.label;
  return typeof value === "string" && value ? value : "Mapped feature";
}

function orderedInspectionProperties(
  properties: Record<string, unknown>,
): Array<[string, unknown]> {
  const entries = Object.entries(properties)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined);
  const order = new Map(INSPECTION_PRIORITY.map((key, index) => [key, index]));
  return entries
    .sort(([first], [second]) => (order.get(first) ?? 999) - (order.get(second) ?? 999))
    .slice(0, 10);
}

export function AegisMap({
  layers = EMPTY_LAYERS,
  twinScene,
  showEstimatedCampusMassing = true,
  incidents = EMPTY_INCIDENTS,
  selection,
  onSelectionChange,
  onFeatureInspect,
  onLocationPick,
  onMapReady,
  viewMode,
  defaultViewMode = "world",
  onViewModeChange,
  showViewModeControl = true,
  focusRequest,
  relocateLegacyEitGeometry = false,
  initialCamera,
  autoFlyToEit = true,
  autoRotateGlobe = true,
  autoRotateSpeedDegPerSecond = 0.65,
  globeIdleResumeMs = 6_500,
  defaultTool = "inspect",
  initialLayerVisibility,
  externalOverlays = EMPTY_OVERLAYS,
  onOverlayMove,
  waterVerticalExaggeration = 12,
  enableTerrain = true,
  mapStyleUrl,
  forceOffline = false,
  className,
  ariaLabel = "AEGIS cinematic global map and EIT digital twin",
}: AegisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const callbacksRef = useRef({
    onSelectionChange,
    onFeatureInspect,
    onLocationPick,
    onMapReady,
    onViewModeChange,
    onOverlayMove,
  });
  const controlledSelectionRef = useRef(selection);
  const currentSelectionRef = useRef<AegisMapSelection>(selection ?? { points: [] });
  const activeToolRef = useRef<AegisMapTool>(defaultTool);
  const activeViewRef = useRef<AegisMapViewMode>(viewMode ?? defaultViewMode);
  const controlledViewRef = useRef(viewMode !== undefined);
  const sourceDataRef = useRef<SourceData>(emptySourceData());
  const routeDataRef = useRef<FeatureCollection<LineString | MultiLineString> | undefined>(undefined);
  const visibilityRef = useRef<Record<AegisMapLayerKey, boolean>>({
    ...DEFAULT_VISIBILITY,
    ...initialLayerVisibility,
  });
  const interactionRef = useRef<(coordinate: AegisCoordinate) => void>(() => undefined);
  const previousSourceDataRef = useRef<Partial<SourceData>>({});
  const draftAreaRef = useRef<AegisCoordinate[]>([]);
  const pointSequenceRef = useRef(0);
  const activeTwinCenterRef = useRef<AegisCoordinate>(EIT_FARIDABAD);
  const overlayOverridesRef = useRef(new Map<string, AegisCoordinate>());
  const overlayDataRef = useRef(externalOverlays);
  const dragRef = useRef<{
    id: string;
    coordinate: AegisCoordinate;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const autoFlightRef = useRef<number | null>(null);
  const globeIdleUntilRef = useRef(0);
  const globeRotationEnabledRef = useRef(autoRotateGlobe);
  const reducedMotionRef = useRef(false);
  const appliedViewModeRef = useRef<AegisMapViewMode>(viewMode ?? defaultViewMode);

  const [internalSelection, setInternalSelection] = useState<AegisMapSelection>(
    selection ?? { points: [] },
  );
  const [draftArea, setDraftArea] = useState<AegisCoordinate[]>([]);
  const [activeTool, setActiveTool] = useState<AegisMapTool>(defaultTool);
  const [internalViewMode, setInternalViewMode] = useState<AegisMapViewMode>(defaultViewMode);
  const [inspection, setInspection] = useState<AegisFeatureInspection | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(forceOffline ? "offline" : "loading");
  const [connectionMessage, setConnectionMessage] = useState(
    forceOffline ? "Offline continuity renderer" : "Initializing global globe",
  );
  const [mapReady, setMapReady] = useState(false);
  const [terrainAvailable, setTerrainAvailable] = useState(false);
  const [buildingsAvailable, setBuildingsAvailable] = useState(false);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [globeRotationOverride, setGlobeRotationOverride] = useState<boolean | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [providerState, setProviderState] = useState<MapProviderState>({
    providerId: "openfreemap-dark",
    providerLabel: "OpenFreeMap Dark",
    attempt: 1,
    stage: "style-loading",
  });
  const [layerVisibility, setLayerVisibility] = useState<Record<AegisMapLayerKey, boolean>>({
    ...DEFAULT_VISIBILITY,
    ...initialLayerVisibility,
  });

  const activeSelection = selection ?? internalSelection;
  const activeViewMode = viewMode ?? internalViewMode;
  const showCampusMassing = Boolean(twinScene) || showEstimatedCampusMassing;
  const globeRotationEnabled = globeRotationOverride ?? autoRotateGlobe;

  useEffect(() => {
    globeRotationEnabledRef.current = globeRotationEnabled;
  }, [globeRotationEnabled]);

  const normalizedLayers = useMemo<AegisMapLayers>(() => {
    if (!relocateLegacyEitGeometry) return layers;
    return {
      floodDepth: relocateLegacyEitCollection(layers.floodDepth),
      floodFlow: relocateLegacyEitCollection(layers.floodFlow),
      roads: relocateLegacyEitCollection(layers.roads),
      evacuationRoutes: relocateLegacyEitCollection(layers.evacuationRoutes),
      resources: relocateLegacyEitCollection(layers.resources),
      hospitals: relocateLegacyEitCollection(layers.hospitals),
      shelters: relocateLegacyEitCollection(layers.shelters),
      impactZones: relocateLegacyEitCollection(layers.impactZones),
      damage: relocateLegacyEitCollection(layers.damage),
      populationImpact: relocateLegacyEitCollection(layers.populationImpact),
      utilityImpact: relocateLegacyEitCollection(layers.utilityImpact),
      recovery: relocateLegacyEitCollection(layers.recovery),
      confidence: relocateLegacyEitCollection(layers.confidence),
      safeZones: relocateLegacyEitCollection(layers.safeZones),
      unavailableZones: relocateLegacyEitCollection(layers.unavailableZones),
      warnings: relocateLegacyEitCollection(layers.warnings),
      damagedBuildings: relocateLegacyEitCollection(layers.damagedBuildings),
      impactedRoads: relocateLegacyEitCollection(layers.impactedRoads),
      impactedBridges: relocateLegacyEitCollection(layers.impactedBridges),
      criticalFacilities: relocateLegacyEitCollection(layers.criticalFacilities),
      utilityImpacts: relocateLegacyEitCollection(layers.utilityImpacts),
      populationImpacts: relocateLegacyEitCollection(layers.populationImpacts),
      responseCoverageZones: relocateLegacyEitCollection(layers.responseCoverageZones),
      recoveryPriorities: relocateLegacyEitCollection(layers.recoveryPriorities),
    };
  }, [layers, relocateLegacyEitGeometry]);
  const twinVisual = useMemo(
    () => twinScene ? twinSceneToMapData(twinScene) : null,
    [twinScene],
  );
  const floodVisual = useMemo(
    () => twinVisual?.flood ?? prepareFloodVisuals(normalizedLayers.floodDepth),
    [normalizedLayers.floodDepth, twinVisual],
  );
  // Incidents are imported or user-selected world coordinates. They must not
  // inherit the legacy EIT geometry migration used by old simulation layers.
  const normalizedIncidents = incidents;
  const sourceData = useMemo(
    () => buildSourceData(
      normalizedLayers,
      floodVisual,
      twinVisual,
      normalizedIncidents,
      activeSelection,
      draftArea,
      externalOverlays,
      EMPTY_OVERLAY_OVERRIDES,
    ),
    [
      activeSelection,
      draftArea,
      externalOverlays,
      floodVisual,
      normalizedIncidents,
      normalizedLayers,
      twinVisual,
    ],
  );

  useEffect(() => {
    callbacksRef.current = {
      onSelectionChange,
      onFeatureInspect,
      onLocationPick,
      onMapReady,
      onViewModeChange,
      onOverlayMove,
    };
    controlledSelectionRef.current = selection;
    currentSelectionRef.current = activeSelection;
    activeToolRef.current = activeTool;
    activeViewRef.current = activeViewMode;
    controlledViewRef.current = viewMode !== undefined;
    sourceDataRef.current = sourceData;
    routeDataRef.current = (twinVisual?.routes ?? normalizedLayers.evacuationRoutes) as
      | FeatureCollection<LineString | MultiLineString>
      | undefined;
    visibilityRef.current = layerVisibility;
    draftAreaRef.current = draftArea;
    overlayDataRef.current = externalOverlays;
  }, [
    activeSelection,
    activeTool,
    activeViewMode,
    draftArea,
    externalOverlays,
    layerVisibility,
    normalizedLayers.evacuationRoutes,
    onFeatureInspect,
    onLocationPick,
    onMapReady,
    onOverlayMove,
    onSelectionChange,
    onViewModeChange,
    selection,
    sourceData,
    twinVisual,
    viewMode,
  ]);

  const commitSelection = useCallback((next: AegisMapSelection) => {
    currentSelectionRef.current = next;
    if (controlledSelectionRef.current === undefined) setInternalSelection(next);
    callbacksRef.current.onSelectionChange?.(next);
  }, []);

  const inspectCoordinate = useCallback((coordinate: AegisCoordinate) => {
    const next: AegisFeatureInspection = {
      geometryType: "Point",
      coordinate,
      properties: {
        name: "Selected coordinate",
        longitude: coordinate[0],
        latitude: coordinate[1],
      },
    };
    setInspection(next);
    callbacksRef.current.onFeatureInspect?.(next);
  }, []);

  const handleOperationalClick = useCallback((coordinate: AegisCoordinate) => {
    const tool = activeToolRef.current;
    if (tool === "inspect") {
      inspectCoordinate(coordinate);
      return;
    }
    if (tool === "area") {
      const nextDraft = [...draftAreaRef.current, coordinate];
      draftAreaRef.current = nextDraft;
      setDraftArea(nextDraft);
      if (nextDraft.length >= 3) {
        commitSelection({
          ...currentSelectionRef.current,
          area: {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [closePolygon(nextDraft)] },
            properties: { name: "Selected operating area" },
          },
        });
      }
      return;
    }
    pointSequenceRef.current += 1;
    const point = pointForTool(tool, coordinate, pointSequenceRef.current);
    if (!point) return;
    const current = currentSelectionRef.current;
    commitSelection({
      ...current,
      points: [...current.points.filter((item) => item.role !== point.role), point],
    });
  }, [commitSelection, inspectCoordinate]);

  useEffect(() => {
    interactionRef.current = handleOperationalClick;
  }, [handleOperationalClick]);

  const pauseOrbit = useCallback((activeFlightMs = 0) => {
    globeIdleUntilRef.current = orbitResumeDeadline(
      performance.now(),
      globeIdleResumeMs,
      activeFlightMs,
    );
  }, [globeIdleResumeMs]);

  const requestView = useCallback((mode: AegisMapViewMode, center = EIT_FARIDABAD) => {
    if (autoFlightRef.current !== null) {
      window.clearTimeout(autoFlightRef.current);
      autoFlightRef.current = null;
    }
    activeTwinCenterRef.current = center;
    pauseOrbit(mode === "world" ? 2_400 : 3_500);
    activeViewRef.current = mode;
    appliedViewModeRef.current = mode;
    if (viewMode === undefined) setInternalViewMode(mode);
    callbacksRef.current.onViewModeChange?.(mode);
    const map = mapRef.current;
    if (!map) return;
    if (mode === "world") flyWorld(map);
    else flyTwin(map, center, 3_500, enableTerrain, showCampusMassing);
  }, [enableTerrain, pauseOrbit, showCampusMassing, viewMode]);

  useEffect(() => {
    if (forceOffline) return;
    const container = mapContainerRef.current;
    if (!container) return;
    let disposed = false;
    let map: MapLibreMap | null = null;
    let styleLoaded = false;
    let resourceErrorTimes: number[] = [];
    let providerIndex = 0;
    let providerSwitching = false;
    let styleTimer: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame = 0;
    let lastAnimation = 0;
    let lastWorldRotation = 0;
    let autoTimer: number | null = null;
    let worldProjectionMode: WorldProjectionMode = "globe";
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      reducedMotionRef.current = motionQuery.matches;
    };
    updateMotionPreference();
    motionQuery.addEventListener?.("change", updateMotionPreference);
    const pauseIdleRotation = () => pauseOrbit();
    const candidates = buildProviderCandidates(mapStyleUrl);
    const startTimer = window.setTimeout(() => {
      if (disposed) return;
      setConnection("loading");
      setConnectionMessage("Initializing cinematic globe");
      setMapReady(false);
    }, 0);

    const fallback = (message: string) => {
      if (disposed) return;
      setProviderState({
        providerId: "continuity",
        providerLabel: "AEGIS continuity renderer",
        attempt: providerIndex + 1,
        stage: "continuity",
        errorCode: "ALL_BASEMAPS_UNAVAILABLE",
        errorMessage: message,
      });
      setConnection("offline");
      setConnectionMessage(message);
      setMapReady(false);
      window.setTimeout(() => {
        if (disposed) return;
        map?.remove();
        if (mapRef.current === map) mapRef.current = null;
        map = null;
      }, 0);
    };

    let switchProvider: (reason: string) => void = () => undefined;
    const armStyleTimeout = () => {
      if (styleTimer !== null) window.clearTimeout(styleTimer);
      styleTimer = window.setTimeout(() => {
        if (!styleLoaded) switchProvider("Style load timed out");
      }, 8_000);
    };
    switchProvider = (reason: string) => {
      if (disposed || providerSwitching) return;
      const next = candidates[providerIndex + 1];
      if (!next || !map) {
        fallback("Free map providers unavailable · world continuity active");
        return;
      }
      providerSwitching = true;
      providerIndex += 1;
      styleLoaded = false;
      resourceErrorTimes = [];
      setMapReady(false);
      setConnection("loading");
      setConnectionMessage(`Switching to ${next.label}`);
      setProviderState({
        providerId: next.id,
        providerLabel: next.label,
        attempt: providerIndex + 1,
        stage: "failover",
        errorCode: "UPSTREAM_STYLE_FAILURE",
        errorMessage: reason,
      });
      try {
        map.setStyle(next.styleUrl, { diff: false });
        armStyleTimeout();
      } catch {
        providerSwitching = false;
        window.setTimeout(() => switchProvider("Provider style could not be applied"), 0);
        return;
      }
      window.setTimeout(() => { providerSwitching = false; }, 250);
    };
    const browserOffline = () => {
      if (disposed) return;
      setConnection("degraded");
      setConnectionMessage("Network interrupted · retaining last rendered world state");
    };
    window.addEventListener("offline", browserOffline);

    void (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (disposed || !mapContainerRef.current) return;
        maplibre.setWorkerCount(Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4)));
        const initialProvider = candidates[0];
        setProviderState({
          providerId: initialProvider.id,
          providerLabel: initialProvider.label,
          attempt: 1,
          stage: "style-loading",
        });
        const defaultWorldCamera = worldCameraForViewport(container.clientWidth, container.clientHeight);
        map = new maplibre.Map({
          container: mapContainerRef.current,
          style: initialProvider.styleUrl,
          center: initialCamera?.center ?? defaultWorldCamera.center,
          zoom: initialCamera?.zoom ?? defaultWorldCamera.zoom,
          pitch: initialCamera?.pitch ?? defaultWorldCamera.pitch,
          bearing: initialCamera?.bearing ?? defaultWorldCamera.bearing,
          minZoom: 0.65,
          maxZoom: 20,
          maxPitch: 84,
          renderWorldCopies: false,
          attributionControl: false,
          // Symbol placement stays deterministic during continuous globe motion.
          fadeDuration: 0,
          maxTileCacheSize: 150,
          refreshExpiredTiles: false,
          collectResourceTiming: false,
          crossSourceCollisions: false,
          canvasContextAttributes: { antialias: true, powerPreference: "high-performance" },
        });
        mapRef.current = map;
        map.dragPan.enable();
        map.dragRotate.enable();
        map.scrollZoom.enable();
        map.touchZoomRotate.enable();
        map.keyboard.enable();
        map.doubleClickZoom.enable();
        armStyleTimeout();
        const mapCanvas = map.getCanvas();
        const interactionEvents: Array<keyof HTMLElementEventMap> = [
          "pointerdown",
          "touchstart",
          "wheel",
          "keydown",
        ];
        interactionEvents.forEach((eventName) =>
          mapCanvas.addEventListener(eventName, pauseIdleRotation, { passive: true }));
        map.on("dragstart", pauseIdleRotation);
        map.on("zoomstart", pauseIdleRotation);
        map.on("rotatestart", pauseIdleRotation);
        map.on("pitchstart", pauseIdleRotation);

        map.on("error", (event) => {
          const sourceId = (event as typeof event & { sourceId?: string }).sourceId;
          const message = event.error?.message ?? "Map resource error";
          const failureClass = classifyMapFailure({ sourceId, message, styleReady: styleLoaded });
          if (failureClass === "optional") {
            const terrainFailure = Boolean(sourceId?.startsWith("aegis-terrain"))
              || /\b(terrain|hillshade|raster-dem|dem tile)\b/i.test(message);
            if (terrainFailure) {
              setTerrainAvailable(false);
              try { map?.setTerrain(null); } catch { /* Terrain already disabled. */ }
            }
            if (styleLoaded) {
              const provider = candidates[providerIndex];
              setConnection("degraded");
              setConnectionMessage(
                terrainFailure
                  ? `${provider.label} · terrain unavailable`
                  : `${provider.label} · alternate world imagery active`,
              );
              setProviderState({
                providerId: provider.id,
                providerLabel: provider.label,
                attempt: providerIndex + 1,
                stage: "degraded",
                errorCode: terrainFailure
                  ? "OPTIONAL_TERRAIN_UNAVAILABLE"
                  : "OPTIONAL_WORLD_IMAGERY_UNAVAILABLE",
                errorMessage: message,
                sourceId,
              });
            }
            return;
          }
          if (failureClass === "operational") {
            if (styleLoaded) {
              const provider = candidates[providerIndex];
              setConnection("degraded");
              setConnectionMessage(`${provider.label} · an operational overlay is unavailable`);
              setProviderState({
                providerId: provider.id,
                providerLabel: provider.label,
                attempt: providerIndex + 1,
                stage: "degraded",
                errorCode: "OPERATIONAL_LAYER_UNAVAILABLE",
                errorMessage: message,
                sourceId,
              });
            }
            return;
          }
          const now = performance.now();
          resourceErrorTimes = [...resourceErrorTimes.filter((time) => now - time < 12_000), now];
          const errorCount = resourceErrorTimes.length;
          if (!styleLoaded && failureClass === "engine") {
            fallback(`3D engine unavailable · ${message}`);
          } else if (!styleLoaded && errorCount >= 5) {
            switchProvider(message);
          } else if (styleLoaded && errorCount >= 24) {
            switchProvider(message);
          } else if (styleLoaded && errorCount >= 8) {
            const provider = candidates[providerIndex];
            setConnection("degraded");
            setConnectionMessage(`${provider.label} · some tiles unavailable`);
            setProviderState({
              providerId: provider.id,
              providerLabel: provider.label,
              attempt: providerIndex + 1,
              stage: "degraded",
              errorCode: "PARTIAL_TILE_FAILURE",
              errorMessage: message,
              sourceId,
            });
          }
        });

        map.on("style.load", () => {
          if (!map || disposed) return;
          styleLoaded = true;
          providerSwitching = false;
          resourceErrorTimes = [];
          if (styleTimer !== null) window.clearTimeout(styleTimer);
          const mode = activeViewRef.current;
          const globeOverview = mode === "world" && worldFocusUsesGlobe(map.getZoom());
          worldProjectionMode = globeOverview ? "globe" : "mercator";
          setAtmosphere(map, globeOverview);
          stabilizeProviderStreetContext(map);
          installWorldImagery(map);
          enableWorldBoundaries(map);
          enableCityLights(map);
          enableProviderVectorContext(map);
          // Install provider-backed buildings before operational extrusions so
          // damage, flood waterlines and the campus twin remain visually on top.
          const baseBuildings = enableBaseBuildings(map);
          installRasterLabelFallback(map);
          addSources(map, sourceDataRef.current, enableTerrain);
          addMapLayers(map, waterVerticalExaggeration, enableTerrain);
          promoteProviderContextLabels(map);
          stabilizeWorldCountryLabels(map);
          if (!showCampusMassing) {
            [
              "aegis-campus-building-shadow",
              "aegis-campus-buildings",
              "aegis-campus-building-waterline",
              "aegis-campus-building-label",
              "aegis-campus-ground",
              "aegis-campus-perimeter",
              "aegis-campus-road-casing",
              "aegis-campus-road-line",
            ].forEach((id) => {
              if (map?.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
            });
          }
          setBuildingsAvailable(baseBuildings || Boolean(map.getLayer("aegis-campus-buildings")));
          setTerrainAvailable(Boolean(enableTerrain && map.getSource("aegis-terrain-dem")));

          applyLayerVisibility(map, visibilityRef.current);
          previousSourceDataRef.current = { ...sourceDataRef.current };
          const provider = candidates[providerIndex];
          setConnection("live");
          setConnectionMessage(`${provider.label} · live global globe`);
          setProviderState({
            providerId: provider.id,
            providerLabel: provider.label,
            attempt: providerIndex + 1,
            stage: "style-ready",
          });
          setMapReady(true);
          callbacksRef.current.onMapReady?.();

          if (mode === "twin") {
            pauseOrbit(1_200);
            flyTwin(map, EIT_FARIDABAD, 1_700, enableTerrain, showCampusMassing);
          } else {
            setCampusLayerVisibility(map, false);
            // Start the presentation orbit quickly after the first stable
            // frame. User interactions still use the longer configured pause.
            lastWorldRotation = performance.now();
            globeIdleUntilRef.current = initialOrbitResumeDeadline(lastWorldRotation);
            if (shouldAutoFlyToTwin({
              enabled: autoFlyToEit,
              hasInitialCamera: Boolean(initialCamera),
              controlledView: controlledViewRef.current,
            })) {
              autoTimer = window.setTimeout(() => {
                if (disposed || !map || controlledViewRef.current) return;
                pauseOrbit(4_200);
                activeTwinCenterRef.current = EIT_FARIDABAD;
                activeViewRef.current = "twin";
                if (!controlledViewRef.current) setInternalViewMode("twin");
                callbacksRef.current.onViewModeChange?.("twin");
                flyTwin(map, EIT_FARIDABAD, 4_200, enableTerrain, showCampusMassing);
              }, 2_150);
              autoFlightRef.current = autoTimer;
            }
          }
        });

        map.on("mousedown", (event: MapMouseEvent) => {
          if (!map) return;
          const features = map.queryRenderedFeatures(event.point, { layers: ["aegis-external-core"] });
          const feature = features[0];
          const id = String(feature?.properties?.id ?? "");
          const overlay = overlayDataRef.current.find((item) => item.id === id);
          if (!overlay?.draggable) return;
          event.originalEvent.preventDefault();
          dragRef.current = { id, coordinate: [event.lngLat.lng, event.lngLat.lat], moved: false };
          map.dragPan.disable();
          map.getCanvas().style.cursor = "grabbing";
        });

        map.on("mousemove", (event: MapMouseEvent) => {
          if (!map) return;
          const drag = dragRef.current;
          if (drag) {
            const coordinate: AegisCoordinate = [event.lngLat.lng, event.lngLat.lat];
            drag.coordinate = coordinate;
            drag.moved = true;
            overlayOverridesRef.current.set(drag.id, coordinate);
            const source = map.getSource(SOURCE_IDS.externalOverlays) as GeoJSONSource | undefined;
            source?.setData(externalOverlaysToGeoJSON(overlayDataRef.current, overlayOverridesRef.current));
            return;
          }
          if (activeToolRef.current !== "inspect") return;
          const available = INTERACTIVE_LAYER_IDS.filter((id) => map?.getLayer(id));
          const overFeature = available.length
            ? map.queryRenderedFeatures(event.point, { layers: available }).length > 0
            : false;
          map.getCanvas().style.cursor = overFeature ? "pointer" : "grab";
        });

        map.on("mouseup", () => {
          if (!map) return;
          const drag = dragRef.current;
          if (!drag) return;
          dragRef.current = null;
          map.dragPan.enable();
          map.getCanvas().style.cursor = "grab";
          if (drag.moved) {
            suppressClickRef.current = true;
            const overlay = overlayDataRef.current.find((item) => item.id === drag.id);
            if (overlay) callbacksRef.current.onOverlayMove?.({ id: drag.id, coordinates: drag.coordinate, overlay });
          }
        });

        map.on("click", (event: MapMouseEvent) => {
          if (!map) return;
          pauseOrbit();
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          const coordinate: AegisCoordinate = [event.lngLat.lng, event.lngLat.lat];
          if (activeToolRef.current !== "inspect") {
            interactionRef.current(coordinate);
            return;
          }
          const cluster = map.getLayer("aegis-incident-cluster-core")
            ? map.queryRenderedFeatures(event.point, { layers: ["aegis-incident-cluster-core"] })[0]
            : undefined;
          const clusterId = Number(cluster?.properties?.cluster_id);
          if (cluster?.geometry.type === "Point" && Number.isFinite(clusterId)) {
            const source = map.getSource(SOURCE_IDS.incidents) as GeoJSONSource | undefined;
            const clusterCenter = cluster.geometry.coordinates as [number, number];
            void source?.getClusterExpansionZoom(clusterId)
              .then((zoom) => map?.easeTo({ center: clusterCenter, zoom, duration: 700 }))
              .catch(() => undefined);
            return;
          }
          const available = INTERACTIVE_LAYER_IDS.filter((id) => map?.getLayer(id));
          let target = available.length
            ? map.queryRenderedFeatures(event.point, { layers: available })[0]
            : undefined;
          // WORLD clicks select the geographic position. Base-map roads,
          // buildings and water cover most of a detailed globe, so inspecting
          // them first would make click-to-focus appear broken. Operational
          // AEGIS features above are still inspectable; provider features are
          // inspected only in the close-range twin view.
          if (!target && activeViewRef.current !== "world") {
            target = map.queryRenderedFeatures(event.point).find(isInspectableBaseFeature);
          }
          if (target) {
            const next = featureInspection(target, coordinate);
            setInspection(next);
            callbacksRef.current.onFeatureInspect?.(next);
            return;
          }
          if (activeViewRef.current === "world") {
            callbacksRef.current.onLocationPick?.(coordinate);
            if (callbacksRef.current.onLocationPick || controlledViewRef.current) return;
            activeTwinCenterRef.current = coordinate;
            activeViewRef.current = "twin";
            if (!controlledViewRef.current) setInternalViewMode("twin");
            callbacksRef.current.onViewModeChange?.("twin");
            pauseOrbit(3_500);
            flyTwin(map, coordinate, 3_500, enableTerrain, showCampusMassing, 16.4, 64, -24);
          } else {
            inspectCoordinate(coordinate);
          }
        });

        const syncWorldProjection = (finalizeTerrain = false) => {
          if (!map || !styleLoaded || activeViewRef.current !== "world") return;
          const nextProjection = worldProjectionModeForZoom(map.getZoom(), worldProjectionMode);
          try {
            if (nextProjection !== worldProjectionMode) {
              // Detach the terrain mesh before changing projection. This is the
              // critical ordering that prevents a black WebGL frame during a
              // continuous wheel/trackpad zoom.
              if (map.getTerrain()) map.setTerrain(null);
              worldProjectionMode = nextProjection;
              setAtmosphere(map, nextProjection === "globe");
            }
            if (
              finalizeTerrain
              && nextProjection === "mercator"
              && enableTerrain
              && map.getSource("aegis-terrain-dem")
            ) {
              map.setTerrain({ source: "aegis-terrain-dem", exaggeration: 0.78 });
            }
          } catch {
            // Projection remains usable if optional terrain cannot be toggled.
          }
        };
        // Switch before zoomend so the renderer never spends local-detail
        // frames in spherical projection. Terrain is restored only once the
        // gesture has settled.
        map.on("zoom", () => syncWorldProjection(false));
        map.on("zoomend", () => syncWorldProjection(true));

        const animate = (time: number) => {
          if (disposed || !map) return;
          const visible = document.visibilityState === "visible";
          const orbitCanRun = activeViewRef.current === "world"
            && globeRotationEnabledRef.current
            && map.getZoom() <= WORLD_GLOBE_ORBIT_MAX_ZOOM
            && worldProjectionMode === "globe"
            && !reducedMotionRef.current
            && visible
            && time >= globeIdleUntilRef.current;
          const mapMoving = map.isMoving();
          if (shouldAdvanceOrbit({
            worldView: activeViewRef.current === "world",
            // Orbit is an overview presentation affordance. Once search or a
            // click has descended into regional/street detail, keep that
            // operational location fixed even after the idle timer expires.
            enabled: globeRotationEnabledRef.current
              && map.getZoom() <= WORLD_GLOBE_ORBIT_MAX_ZOOM
              && worldProjectionMode === "globe",
            reducedMotion: reducedMotionRef.current,
            documentVisible: visible,
            nowMs: time,
            resumeAtMs: globeIdleUntilRef.current,
            lastFrameMs: lastWorldRotation,
            moving: mapMoving,
          })) {
            const elapsedSeconds = lastWorldRotation === 0
              ? 0
              : Math.min(0.12, (time - lastWorldRotation) / 1_000);
            lastWorldRotation = time;
            if (elapsedSeconds > 0) {
              const center = map.getCenter();
              const longitude = nextOrbitLongitude(
                center.lng,
                autoRotateSpeedDegPerSecond,
                elapsedSeconds,
              );
              map.setCenter([longitude, center.lat]);
            }
          } else if (!orbitCanRun || mapMoving) {
            // Reset the time base while paused so resuming never jumps.
            lastWorldRotation = time;
          }
          if (time - lastAnimation >= 90 && visible) {
            lastAnimation = time;
            const pulse = (Math.sin(time / 430) + 1) / 2;
            if (map.getLayer("aegis-incident-live-pulse")) {
              map.setPaintProperty(
                "aegis-incident-live-pulse",
                "circle-radius",
                ["interpolate", ["linear"], ["zoom"], 1, 7 + pulse * 7, 10, 13 + pulse * 10],
              );
              map.setPaintProperty("aegis-incident-live-pulse", "circle-opacity", 0.72 - pulse * 0.5);
              map.setPaintProperty("aegis-incident-live-pulse", "circle-stroke-opacity", 0.95 - pulse * 0.72);
            }
            if (activeViewRef.current === "twin") {
              if (map.getLayer("aegis-water-shoreline")) {
                map.setPaintProperty("aegis-water-shoreline", "line-opacity", 0.64 + pulse * 0.32);
                map.setPaintProperty("aegis-water-shoreline", "line-width", 1.8 + pulse * 1.05);
              }
              if (map.getLayer("aegis-water-sheen")) {
                map.setPaintProperty("aegis-water-sheen", "fill-opacity", 0.08 + pulse * 0.1);
              }
              if (map.getLayer("aegis-campus-building-waterline")) {
                map.setPaintProperty(
                  "aegis-campus-building-waterline",
                  "fill-extrusion-opacity",
                  0.48 + pulse * 0.16,
                );
              }
              if (routeDataRef.current?.features.length) {
                const movers = map.getSource(SOURCE_IDS.routeMovers) as GeoJSONSource | undefined;
                movers?.setData(buildRouteMovers(routeDataRef.current, (time / 6_500) % 1));
              }
            }
          }
          animationFrame = window.requestAnimationFrame(animate);
        };
        animationFrame = window.requestAnimationFrame(animate);

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(() => map?.resize()));
          resizeObserver.observe(container);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "MapLibre engine unavailable";
        fallback(`3D engine unavailable · ${message}`);
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      if (styleTimer !== null) window.clearTimeout(styleTimer);
      if (autoTimer !== null) window.clearTimeout(autoTimer);
      if (autoFlightRef.current === autoTimer) autoFlightRef.current = null;
      window.cancelAnimationFrame(animationFrame);
      motionQuery.removeEventListener?.("change", updateMotionPreference);
      const canvas = map?.getCanvas();
      if (canvas) {
        (["pointerdown", "touchstart", "wheel", "keydown"] as Array<keyof HTMLElementEventMap>)
          .forEach((eventName) => canvas.removeEventListener(eventName, pauseIdleRotation));
      }
      window.removeEventListener("offline", browserOffline);
      resizeObserver?.disconnect();
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [
    autoFlyToEit,
    autoRotateSpeedDegPerSecond,
    enableTerrain,
    forceOffline,
    initialCamera,
    inspectCoordinate,
    mapStyleUrl,
    pauseOrbit,
    retryKey,
    showCampusMassing,
    waterVerticalExaggeration,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const frame = window.requestAnimationFrame(() => {
      (Object.keys(sourceData) as SourceKey[]).forEach((key) => {
        if (key === "routeMovers" || previousSourceDataRef.current[key] === sourceData[key]) return;
        const source = map.getSource(SOURCE_IDS[key]) as GeoJSONSource | undefined;
        source?.setData(sourceData[key]);
        previousSourceDataRef.current[key] = sourceData[key];
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mapReady, sourceData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyLayerVisibility(map, layerVisibility);
  }, [layerVisibility, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (appliedViewModeRef.current === activeViewMode) return;
    appliedViewModeRef.current = activeViewMode;
    const duration = activeViewMode === "world" ? 2_200 : 2_800;
    pauseOrbit(duration);
    if (activeViewMode === "world") flyWorld(map, duration);
    else flyTwin(map, activeTwinCenterRef.current, duration, enableTerrain, showCampusMassing);
  }, [activeViewMode, enableTerrain, mapReady, pauseOrbit, showCampusMassing]);

  const focusCenter = focusRequest?.center;
  const focusRequestId = focusRequest?.requestId;
  const focusDuration = focusRequest?.durationMs;
  const focusZoom = focusRequest?.zoom;
  const focusPitch = focusRequest?.pitch;
  const focusBearing = focusRequest?.bearing;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusCenter) return;
    // Focus requests carry authoritative user/search coordinates. Keep them
    // exact; legacy simulation migration is limited to opt-in layer data.
    const center = focusCenter;
    const duration = focusDuration ?? 3_200;
    pauseOrbit(duration);
    if (activeViewMode === "world") {
      const targetZoom = focusZoom ?? 8.5;
      const globeOverview = worldFocusUsesGlobe(targetZoom);
      activeViewRef.current = "world";
      // Keep the spherical Earth for global/regional framing, then hand off to
      // Mercator for reliable provider streets, terrain and 3D buildings.
      // Staying in the WORLD product mode must not force the globe projection
      // at landmark zooms: some zero-cost vector styles render a black canvas
      // there even though their tiles remain healthy.
      setCampusLayerVisibility(map, false);
      try {
        // Always detach the terrain mesh before projection/camera changes.
        // The zoomend synchronizer restores terrain after a local flight.
        if (map.getTerrain()) map.setTerrain(null);
      } catch {
        // Street detail remains available when terrain state cannot be changed.
      }
      setAtmosphere(map, globeOverview);
      map.flyTo({
        center,
        zoom: targetZoom,
        pitch: worldPitchForFocus(targetZoom, focusPitch),
        bearing: focusBearing ?? 0,
        duration,
        curve: 1.32,
        essential: false,
      });
      return;
    }
    activeTwinCenterRef.current = center;
    activeViewRef.current = "twin";
    const viewStateTimer = viewMode === undefined
      ? window.setTimeout(() => setInternalViewMode("twin"), 0)
      : null;
    callbacksRef.current.onViewModeChange?.("twin");
    flyTwin(
      map,
      center,
      duration,
      enableTerrain,
      showCampusMassing,
      focusZoom ?? 16.7,
      focusPitch ?? 66,
      focusBearing ?? -27,
    );
    return () => {
      if (viewStateTimer !== null) window.clearTimeout(viewStateTimer);
    };
  }, [
    enableTerrain,
    focusBearing,
    focusCenter,
    focusDuration,
    focusPitch,
    focusRequestId,
    focusZoom,
    mapReady,
    pauseOrbit,
    showCampusMassing,
    activeViewMode,
    viewMode,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = activeTool === "inspect" ? "grab" : "crosshair";
    if (activeTool === "area") map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [activeTool, mapReady]);

  const finishArea = () => {
    const points = draftAreaRef.current;
    if (points.length >= 3) {
      commitSelection({
        ...currentSelectionRef.current,
        area: {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [closePolygon(points)] },
          properties: { name: "Selected operating area" },
        },
      });
    }
    draftAreaRef.current = [];
    setDraftArea([]);
    setActiveTool("inspect");
  };

  const clearSelection = () => {
    draftAreaRef.current = [];
    setDraftArea([]);
    commitSelection({ points: [] });
    setInspection(null);
    callbacksRef.current.onFeatureInspect?.(null);
  };

  const zoom = (direction: 1 | -1) => {
    const map = mapRef.current;
    if (map) map.easeTo({ zoom: map.getZoom() + direction, duration: 280 });
  };

  const visibleConnection: ConnectionState = forceOffline ? "offline" : connection;
  const visibleMessage = forceOffline
    ? activeViewMode === "world"
      ? "Offline world continuity"
      : "Offline isometric campus continuity"
    : connectionMessage;
  const inspectionProperties = inspection ? orderedInspectionProperties(inspection.properties) : [];
  const wrapperClass = className ? `${styles.wrapper} ${className}` : styles.wrapper;
  const sceneMinute = twinVisual?.minute;

  return (
    <section className={wrapperClass} aria-label={ariaLabel} data-view={activeViewMode}>
      <div
        ref={mapContainerRef}
        className={styles.mapHost}
        aria-hidden={visibleConnection === "offline"}
      />

      {visibleConnection === "offline" && activeViewMode === "world" ? <WorldContinuity /> : null}

      {activeViewMode === "twin" ? (
        <OfflineCampusTwin
          layers={normalizedLayers}
          flood={floodVisual}
          incidents={normalizedIncidents}
          externalOverlays={externalOverlays}
          selection={activeSelection}
          draftArea={draftArea}
          visibility={layerVisibility}
          waterVerticalExaggeration={waterVerticalExaggeration}
          tool={activeTool}
          onMapClick={handleOperationalClick}
          displayMode={visibleConnection === "offline" ? "continuity" : "operational"}
          buildings={twinVisual?.buildings}
        />
      ) : null}

      {visibleConnection === "loading" ? (
        <div className={styles.loadingOverlay} role="status">
          <span className={styles.loadingGlobe} aria-hidden="true"><Globe2 size={28} /></span>
          <strong>INITIALIZING 3D WORLD</strong>
          <small>Globe / terrain / OSM footprints / simulation surface</small>
        </div>
      ) : null}

      <header className={styles.statusBar}>
        <span className={styles.connectionDot} data-state={visibleConnection} />
        <span>{visibleMessage}</span>
        {visibleConnection !== "offline" ? <i>{providerState.providerLabel.toUpperCase()}</i> : null}
        {terrainAvailable && visibleConnection !== "offline" ? <i>TERRAIN</i> : null}
        {buildingsAvailable && visibleConnection !== "offline" ? <i>3D</i> : null}
        {activeViewMode === "world" && globeRotationEnabled ? <i>AUTO ORBIT</i> : null}
      </header>

      {showViewModeControl ? <div className={styles.modeSwitch} role="group" aria-label="Map view mode">
        <button
          type="button"
          data-active={activeViewMode === "world"}
          aria-pressed={activeViewMode === "world"}
          onClick={() => requestView("world")}
        >
          <Globe2 size={15} />
          <span>WORLD</span>
        </button>
        <button
          type="button"
          data-active={activeViewMode === "twin"}
          aria-pressed={activeViewMode === "twin"}
          onClick={() => requestView("twin", EIT_FARIDABAD)}
        >
          <Building2 size={15} />
          <span>CAMPUS TWIN</span>
        </button>
      </div> : null}

      <nav className={styles.toolRail} aria-label="Map tools">
        {TOOL_OPTIONS.map(({ key, label, title, icon: Icon }) => (
          <button
            key={key}
            type="button"
            data-active={activeTool === key}
            aria-label={title}
            title={title}
            aria-pressed={activeTool === key}
            onClick={() => {
              setActiveTool(key);
              if (key !== "area" && draftArea.length) {
                draftAreaRef.current = [];
                setDraftArea([]);
              }
            }}
          >
            <Icon size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
        <i />
        <button type="button" onClick={clearSelection} title="Clear selection" aria-label="Clear selection">
          <Trash2 size={16} /><span>Clear</span>
        </button>
      </nav>

      {activeTool === "area" ? (
        <div className={styles.areaPrompt} role="status">
          <Crosshair size={14} />
          <span>{draftArea.length < 3 ? `Place ${3 - draftArea.length} more points` : `${draftArea.length} vertices ready`}</span>
          <button type="button" onClick={finishArea} disabled={draftArea.length < 3}>Complete</button>
        </div>
      ) : null}

      <div className={styles.mapControls}>
        {activeViewMode === "world" ? (
          <button
            type="button"
            onClick={() => setGlobeRotationOverride((override) => !(override ?? autoRotateGlobe))}
            aria-label={globeRotationEnabled ? "Pause automatic globe rotation" : "Resume automatic globe rotation"}
            aria-pressed={globeRotationEnabled}
            title={globeRotationEnabled ? "Pause globe rotation" : "Resume globe rotation"}
          ><RotateCw size={17} /></button>
        ) : null}
        <button type="button" onClick={() => zoom(1)} aria-label="Zoom in" title="Zoom in"><ZoomIn size={17} /></button>
        <button type="button" onClick={() => zoom(-1)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={17} /></button>
        <button
          type="button"
          onClick={() => requestView("twin", EIT_FARIDABAD)}
          aria-label="Fly to EIT map reference"
          title="Fly to EIT map reference"
          disabled={visibleConnection === "offline"}
        ><LocateFixed size={17} /></button>
      </div>

      <div className={styles.layerControl}>
        <button
          type="button"
          className={styles.layerTrigger}
          onClick={() => setLayerPanelOpen((value) => !value)}
          aria-expanded={layerPanelOpen}
          aria-label="Operational layers"
        ><Layers3 size={16} /><span>LAYERS</span></button>
        {layerPanelOpen ? (
          <div className={styles.layerPanel}>
            <div className={styles.panelHeading}>
              <div><strong>OPERATIONAL LAYERS</strong><small>Live-render controls</small></div>
              <button type="button" onClick={() => setLayerPanelOpen(false)} aria-label="Close layers"><X size={15} /></button>
            </div>
            <div className={styles.layerList}>
              {LAYER_OPTIONS.map(({ key, label, color, icon: Icon }) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layerVisibility[key]}
                    onChange={(event) => setLayerVisibility((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span className={styles.layerIcon} style={{ "--layer-color": color } as CSSProperties}><Icon size={14} /></span>
                  <span>{label}</span>
                  <i><b /></i>
                </label>
              ))}
            </div>
            <div className={styles.depthLegend}>
              <span>MODELLED DEPTH</span><i /><div><small>0 m</small><small>0.5</small><small>1.5</small><small>3+ m</small></div>
            </div>
          </div>
        ) : null}
      </div>

      {activeViewMode === "twin" && floodVisual.maximumDepthM > 0 ? (
        <div className={styles.waterTelemetry}>
          <span className={styles.waterPulse}><Waves size={15} /></span>
          <div><small>CONTINUOUS WATER SURFACE</small><strong>{floodVisual.maximumDepthM.toFixed(2)} m peak</strong></div>
          <i />
          <div><small>VISUAL HEIGHT</small><strong>{waterVerticalExaggeration}x exaggeration</strong></div>
          {sceneMinute !== undefined ? <b>T+{sceneMinute.toFixed(0)} MIN</b> : null}
        </div>
      ) : null}

      {activeViewMode === "twin" ? (
        <div className={styles.twinDisclosure}>
          <span>CONTACT-MAP REFERENCE</span>
          <i />
          <span>{twinScene?.campus.prototypeLabel ?? "OSM FOOTPRINTS IMPORTED / HEIGHTS + OCCUPANCY ESTIMATED / NOT BIM"}</span>
        </div>
      ) : null}

      {inspection ? (
        <aside className={styles.inspectionPanel} aria-label="Feature inspection">
          <div className={styles.inspectionHeading}>
            <span><Focus size={16} /></span>
            <div><small>FEATURE INSPECTION</small><strong>{titleForInspection(inspection)}</strong></div>
            <button
              type="button"
              onClick={() => { setInspection(null); callbacksRef.current.onFeatureInspect?.(null); }}
              aria-label="Close inspection"
            ><X size={15} /></button>
          </div>
          {inspection.properties.geometryStatus ? (
            <div className={styles.estimateWarning}>{String(inspection.properties.geometryStatus)}</div>
          ) : null}
          <dl>
            {inspectionProperties.map(([key, value]) => (
              <div key={key}><dt>{key.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}</dt><dd>{formatValue(value)}</dd></div>
            ))}
          </dl>
          <footer><MapPin size={12} />{inspection.coordinate[1].toFixed(5)} deg N / {inspection.coordinate[0].toFixed(5)} deg E</footer>
        </aside>
      ) : null}

      {visibleConnection === "offline" && !forceOffline ? (
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => {
            setConnection("loading");
            setConnectionMessage("Reconnecting to global globe");
            setRetryKey((value) => value + 1);
          }}
        ><WifiOff size={14} />Retry live globe</button>
      ) : null}

      <div className={styles.attribution}>
        {visibleConnection === "offline" ? "AEGIS local continuity renderer" : (
          activeViewMode === "world" ? (
            <>
              <a href="https://maps.eox.at" target="_blank" rel="noreferrer">EOX Sentinel-2 cloudless 2020</a>
              {" (modified Copernicus Sentinel data 2020)"}
              {" / "}<a href="https://www.earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">NASA EOSDIS GIBS</a>
              {providerState.providerId === "openfreemap-dark" ? (
                <>{" / "}<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap / OpenMapTiles</a></>
              ) : null}
              {" / "}<a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO labels</a>
              {" / "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
            </>
          ) : providerState.providerId === "carto-dark" ? (
            <><a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>{" / "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></>
          ) : (
            <><a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>{" / OpenMapTiles / "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></>
          )
        )}
      </div>
    </section>
  );
}
