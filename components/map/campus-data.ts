import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";

import {
  EIT_MAP_REFERENCE,
  EIT_OSM_BUILDINGS,
  EIT_OSM_CAPTURED_AT,
  EIT_OSM_DATA_QUALITY,
  EIT_OSM_LICENSE,
  EIT_OSM_OPERATING_BOUNDS,
  EIT_OSM_ROADS,
  EIT_OSM_SOURCE_URL,
} from "../../datasets/faridabad/eit-osm";
import type { AegisCoordinate } from "./types";

/** Institute contact-map reference; this is not a surveyed campus centroid. */
export const EIT_FARIDABAD: AegisCoordinate = [...EIT_MAP_REFERENCE];
/** Earlier coarse disclosure coordinate used by the bundled prototype scenario. */
export const LEGACY_EIT_SCENARIO_CENTER: AegisCoordinate = [77.22, 28.25];
export const EIT_TWIN_BOUNDS: [AegisCoordinate, AegisCoordinate] = [
  [EIT_OSM_OPERATING_BOUNDS.west, EIT_OSM_OPERATING_BOUNDS.south],
  [EIT_OSM_OPERATING_BOUNDS.east, EIT_OSM_OPERATING_BOUNDS.north],
];

export interface CampusBuildingProperties {
  id: string;
  name: string;
  shortName: string;
  use: string;
  floors: number;
  heightM: number;
  minHeightM: number;
  occupants: number;
  risk: number;
  footprintAreaM2: number;
  geometryStatus: string;
  attributeStatus: string;
  evidenceClass: "IMPORTED";
  confidence01: number;
  sourceId: string;
  sourceCapturedAt: string;
  sourceLicense: string;
  sourceUrl: string;
  [key: string]: unknown;
}

export interface CampusRoadProperties {
  id: string;
  name: string;
  class: "campus-road" | "service" | "walkway";
  status: "open";
  geometryStatus: string;
  evidenceClass: "IMPORTED";
  sourceId: string;
  [key: string]: unknown;
}

function inferredFloors(areaM2: number, importedLevels: number | null): number {
  if (importedLevels) return Math.min(8, importedLevels);
  if (areaM2 >= 2_400) return 4;
  if (areaM2 >= 750) return 3;
  if (areaM2 >= 320) return 2;
  return 1;
}

function planningOccupancy(areaM2: number, floors: number): number {
  return Math.max(12, Math.round(areaM2 * floors / 11));
}

export const EIT_CAMPUS_BUILDINGS: FeatureCollection<
  Polygon,
  CampusBuildingProperties
> = {
  type: "FeatureCollection",
  features: EIT_OSM_BUILDINGS.map((building, index): Feature<Polygon, CampusBuildingProperties> => {
    const floors = inferredFloors(building.footprintAreaM2, building.levels);
    const inferredHeight = Number((floors * 3.35 + 0.8).toFixed(1));
    return {
      type: "Feature",
      id: `osm-building-${building.osmId}`,
      geometry: { type: "Polygon", coordinates: [building.coordinates] },
      properties: {
        id: `osm-building-${building.osmId}`,
        name: `Imported building footprint ${building.osmId}`,
        shortName: index === 0 ? "LARGEST OSM FOOTPRINT" : `OSM ${building.osmId}`,
        use: "unknown",
        floors,
        heightM: inferredHeight,
        minHeightM: 0,
        occupants: planningOccupancy(building.footprintAreaM2, floors),
        risk: Number(Math.min(0.66, 0.38 + 160 / Math.max(500, building.footprintAreaM2)).toFixed(2)),
        footprintAreaM2: Math.round(building.footprintAreaM2),
        geometryStatus: "IMPORTED OSM FOOTPRINT",
        attributeStatus: building.levels
          ? "OSM LEVELS IMPORTED; HEIGHT AND OCCUPANCY ESTIMATED"
          : "HEIGHT, FLOORS, USE AND OCCUPANCY ESTIMATED",
        evidenceClass: "IMPORTED",
        confidence01: building.levels ? 0.72 : 0.58,
        sourceId: `openstreetmap-way-${building.osmId}`,
        sourceCapturedAt: EIT_OSM_CAPTURED_AT,
        sourceLicense: EIT_OSM_LICENSE,
        sourceUrl: EIT_OSM_SOURCE_URL,
      },
    };
  }),
};

export const EIT_CAMPUS_BOUNDARY: FeatureCollection<
  Polygon,
  {
    name: string;
    geometryStatus: string;
    centerEvidence: string;
    evidenceClass: "ESTIMATED";
    sourceCapturedAt: string;
    [key: string]: unknown;
  }
> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "eit-osm-operating-envelope",
      properties: {
        name: "EIT map-reference operating envelope",
        geometryStatus: "ESTIMATED ENVELOPE AROUND IMPORTED OSM FOOTPRINT SUBSET; NOT A CADASTRAL CAMPUS BOUNDARY",
        centerEvidence: "INSTITUTE CONTACT-MAP REFERENCE",
        evidenceClass: "ESTIMATED",
        sourceCapturedAt: EIT_OSM_CAPTURED_AT,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [EIT_OSM_OPERATING_BOUNDS.west, EIT_OSM_OPERATING_BOUNDS.south],
          [EIT_OSM_OPERATING_BOUNDS.east, EIT_OSM_OPERATING_BOUNDS.south],
          [EIT_OSM_OPERATING_BOUNDS.east, EIT_OSM_OPERATING_BOUNDS.north],
          [EIT_OSM_OPERATING_BOUNDS.west, EIT_OSM_OPERATING_BOUNDS.north],
          [EIT_OSM_OPERATING_BOUNDS.west, EIT_OSM_OPERATING_BOUNDS.south],
        ]],
      },
    },
  ],
};

function roadClass(highway: string): CampusRoadProperties["class"] {
  if (/footway|path|pedestrian|track|steps/.test(highway)) return "walkway";
  if (/service|residential|living_street/.test(highway)) return "service";
  return "campus-road";
}

export const EIT_CAMPUS_ROADS: FeatureCollection<LineString, CampusRoadProperties> = {
  type: "FeatureCollection",
  features: EIT_OSM_ROADS.map((road): Feature<LineString, CampusRoadProperties> => ({
    type: "Feature",
    id: `osm-road-${road.osmId}`,
    properties: {
      id: `osm-road-${road.osmId}`,
      name: road.name ?? `Imported OSM road ${road.osmId}`,
      class: roadClass(road.highway),
      status: "open",
      geometryStatus: "IMPORTED OSM CENTERLINE",
      evidenceClass: "IMPORTED",
      sourceId: `openstreetmap-way-${road.osmId}`,
    },
    geometry: { type: "LineString", coordinates: road.coordinates },
  })),
};

export const EIT_CAMPUS_DATA_QUALITY = {
  ...EIT_OSM_DATA_QUALITY,
  capturedAt: EIT_OSM_CAPTURED_AT,
  footprintCount: EIT_CAMPUS_BUILDINGS.features.length,
  roadCount: EIT_CAMPUS_ROADS.features.length,
} as const;
