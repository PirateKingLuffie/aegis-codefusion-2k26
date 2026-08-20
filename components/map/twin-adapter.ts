import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
} from "geojson";
import type { TwinScene } from "../../lib/twin";

import type {
  FloodSurfaceProperties,
  FloodVisualData,
} from "./geometry";

export interface TwinBuildingMapProperties {
  id: string;
  name: string;
  function: string;
  heightM: number;
  baseElevationM: number;
  floors: number;
  facadeTone: string;
  currentExternalDepthM: number;
  currentInternalDepthM: number;
  peakExternalDepthM: number;
  damageIndex: number;
  damageBand: string;
  accessStatus: string;
  floorsAffected: number;
  occupantsInExposureEnvelope: number;
  recommendedAction: string;
  geometryStatus: string;
  centerEvidence: string;
  attributeStatus: string;
  confidence01: number;
  populationImpactBand: string;
  utilityStatus: string;
  recoveryHours: number;
  [key: string]: unknown;
}

export interface TwinImpactMapProperties {
  id: string;
  kind: string;
  status: string;
  severity: string;
  value: number;
  unit: string;
  label: string;
  evidenceClass: string;
  confidence01: number;
  [key: string]: unknown;
}

export interface TwinAgentMapProperties {
  id: string;
  label: string;
  kind: string;
  status: string;
  progress: number;
  representedPeople: number;
  headingDeg: number;
  routeId: string;
  [key: string]: unknown;
}

export interface TwinVisualData {
  buildings: FeatureCollection<Polygon, TwinBuildingMapProperties>;
  flood: FloodVisualData;
  contours: FeatureCollection<LineString, { depthM: number; evidenceClass: string }>;
  routes: FeatureCollection<LineString, Record<string, unknown>>;
  agents: FeatureCollection<Point, TwinAgentMapProperties>;
  facilities: FeatureCollection<Point, Record<string, unknown>>;
  terrainPoints: FeatureCollection<Point, Record<string, unknown>>;
  damage: FeatureCollection<Polygon, TwinImpactMapProperties>;
  populationImpact: FeatureCollection<Polygon, TwinImpactMapProperties>;
  utilityImpact: FeatureCollection<Polygon, TwinImpactMapProperties>;
  recovery: FeatureCollection<Polygon, TwinImpactMapProperties>;
  confidence: FeatureCollection<Polygon, TwinImpactMapProperties>;
  safeZones: FeatureCollection<Polygon, TwinImpactMapProperties>;
  unavailableZones: FeatureCollection<Polygon, TwinImpactMapProperties>;
  warnings: FeatureCollection<Polygon, TwinImpactMapProperties>;
  minute: number;
  prototypeLabel: string;
}

export function twinSceneToMapData(scene: TwinScene): TwinVisualData {
  const impactByBuilding = new Map(scene.buildings.map((impact) => [impact.buildingId, impact]));
  const buildingFeatures: Array<Feature<Polygon, TwinBuildingMapProperties>> =
    scene.campus.buildings.map((building) => {
      const impact = impactByBuilding.get(building.id);
      return {
        type: "Feature",
        id: building.id,
        geometry: building.footprint,
        properties: {
          id: building.id,
          name: building.name,
          function: building.function,
          heightM: building.heightM,
          baseElevationM: building.baseElevationM,
          floors: building.floors,
          facadeTone: building.facadeTone,
          currentExternalDepthM: impact?.currentExternalDepthM ?? 0,
          currentInternalDepthM: impact?.currentInternalDepthM ?? 0,
          peakExternalDepthM: impact?.peakExternalDepthM ?? 0,
          damageIndex: impact?.damageIndex ?? 0,
          damageBand: impact?.damageBand ?? "none",
          accessStatus: impact?.accessStatus ?? "open",
          floorsAffected: impact?.floorsAffected ?? 0,
          occupantsInExposureEnvelope: impact?.occupantsInExposureEnvelope ?? 0,
          recommendedAction: impact?.recommendedAction ?? "Monitor building access.",
          geometryStatus: building.provenance.classification === "IMPORTED"
            ? "IMPORTED OSM FOOTPRINT - CAMPUS MEMBERSHIP UNVERIFIED"
            : "ESTIMATED FOOTPRINT - NOT SURVEYED/BIM",
          centerEvidence: "INSTITUTE CONTACT-MAP REFERENCE",
          attributeStatus: building.attributeProvenance?.classification === "ESTIMATED"
            ? "HEIGHT, USE, TERRAIN AND OCCUPANCY ESTIMATED"
            : "SOURCE-BACKED ATTRIBUTES",
          confidence01: impact?.confidence01 ?? building.dataConfidence?.geometry01 ?? 0.35,
          populationImpactBand: impact?.populationImpactBand ?? "none",
          utilityStatus: impact?.utilityStatus ?? "unknown",
          recoveryHours: impact?.recoveryEstimateHours ?? 0,
          geometryEvidenceClass: building.provenance.classification,
          geometrySource: building.provenance.sourceLabel,
          impactEvidenceClass: impact?.impactProvenance.classification ?? "SIMULATED",
          minute: scene.metadata.selectedMinute,
        },
      };
    });

  const floodFeatures: Array<Feature<Polygon, FloodSurfaceProperties>> =
    scene.flood.extentPolygons.map((extent, index) => ({
      type: "Feature",
      id: extent.id,
      geometry: extent.geometry,
      properties: {
        name: `Continuous flood surface ${index + 1}`,
        depthM: Math.min(
          scene.flood.maximumDepthM,
          Math.max(extent.minimumDepthM, extent.minimumDepthM * 1.75),
        ),
        maximumDepthM: scene.flood.maximumDepthM,
        minimumDepthM: extent.minimumDepthM,
        velocityMps: 0,
        wetCellCount: 0,
        riskLevel: scene.flood.maximumDepthM >= 1
          ? "critical"
          : scene.flood.maximumDepthM >= 0.5
            ? "high"
            : "moderate",
        phase: "interpolated",
        visualGeometry: "Continuous interpolated surface - grid hidden",
        affectedAreaSqKm: scene.flood.affectedAreaSqKm,
        surfaceElevationM: extent.surfaceElevationM,
        minute: scene.flood.minute,
        evidenceClass: extent.provenance.classification,
        provenance: extent.provenance.sourceLabel,
      },
    }));

  const contourFeatures = scene.flood.contours.map((contour) => ({
    type: "Feature" as const,
    id: contour.id,
    geometry: contour.geometry,
    properties: {
      depthM: contour.depthM,
      evidenceClass: contour.provenance.classification,
    },
  }));

  const routeFeatures = scene.evacuation.routes.map((route) => ({
    type: "Feature" as const,
    id: route.id,
    geometry: route.geometry,
    properties: {
      id: route.id,
      name: `Evacuation route ${route.id}`,
      status: route.status === "recommended" ? "safe" : "warning",
      routeType: route.status,
      riskScore: route.riskScore,
      reliability: route.reliability,
      etaMinutes: route.etaMinutes,
      assignedPopulation: route.assignedPopulation,
      evidenceClass: route.provenance.classification,
    },
  }));

  const agentFeatures: Array<Feature<Point, TwinAgentMapProperties>> =
    scene.evacuation.agents.map((agent) => ({
      type: "Feature",
      id: agent.id,
      geometry: {
        type: "Point",
        coordinates: [agent.coordinate.lon, agent.coordinate.lat],
      },
      properties: {
        id: agent.id,
        label: agent.label,
        kind: agent.kind,
        status: agent.status,
        progress: agent.progress,
        representedPeople: agent.representedPeople,
        headingDeg: agent.headingDeg,
        routeId: agent.routeId ?? "",
        evidenceClass: agent.provenance.classification,
      },
    }));

  const facilityFeatures = scene.criticalFacilities.map((facility) => ({
    type: "Feature" as const,
    id: facility.id,
    geometry: {
      type: "Point" as const,
      coordinates: [facility.coordinate.lon, facility.coordinate.lat],
    },
    properties: {
      id: facility.id,
      name: facility.name,
      type: facility.type,
      status: facility.status,
      accessStatus: facility.accessStatus,
      capacity: facility.capacity,
      projectedOccupancy: facility.projectedOccupancy,
      evidenceClass: facility.provenance.classification,
    },
  }));

  const terrainFeatures = scene.terrain.controlPoints.map((point) => ({
    type: "Feature" as const,
    id: point.id,
    geometry: {
      type: "Point" as const,
      coordinates: [point.coordinate.lon, point.coordinate.lat],
    },
    properties: {
      elevationM: point.elevationM,
      roughness: point.roughness,
      drainageIndex: point.drainageIndex,
      evidenceClass: point.provenance.classification,
    },
  }));

  const impactCollection = (
    key: keyof NonNullable<TwinScene["impactLayers"]>,
  ): FeatureCollection<Polygon, TwinImpactMapProperties> => ({
    type: "FeatureCollection",
    features: (scene.impactLayers?.[key] ?? []).map((feature) => ({
      type: "Feature" as const,
      id: feature.id,
      geometry: feature.geometry,
      properties: {
        id: feature.id,
        kind: feature.kind,
        status: feature.status,
        severity: feature.severity,
        value: feature.value,
        unit: feature.unit,
        label: feature.label,
        evidenceClass: feature.evidenceClass,
        confidence01: feature.confidence01,
      },
    })),
  });

  return {
    buildings: { type: "FeatureCollection", features: buildingFeatures },
    flood: {
      surface: { type: "FeatureCollection", features: floodFeatures },
      samples: { type: "FeatureCollection", features: [] },
      maximumDepthM: scene.flood.maximumDepthM,
      averageDepthM: scene.flood.meanWetDepthM,
      wetCellCount: 0,
    },
    contours: { type: "FeatureCollection", features: contourFeatures },
    routes: { type: "FeatureCollection", features: routeFeatures },
    agents: { type: "FeatureCollection", features: agentFeatures },
    facilities: { type: "FeatureCollection", features: facilityFeatures },
    terrainPoints: { type: "FeatureCollection", features: terrainFeatures },
    damage: impactCollection("damage"),
    populationImpact: impactCollection("population"),
    utilityImpact: impactCollection("utility"),
    recovery: impactCollection("recovery"),
    confidence: impactCollection("confidence"),
    safeZones: impactCollection("safe"),
    unavailableZones: impactCollection("unavailable"),
    warnings: impactCollection("warning"),
    minute: scene.metadata.selectedMinute,
    prototypeLabel: scene.metadata.prototypeLabel,
  };
}
