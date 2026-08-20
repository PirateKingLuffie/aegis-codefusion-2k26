import overpassSnapshot from "./osm/eit-overpass.json";

export type EitCoordinate = [longitude: number, latitude: number];

interface OverpassGeometryPoint {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  geometry?: OverpassGeometryPoint[];
  tags?: Record<string, string>;
}

interface OverpassSnapshot {
  osm3s?: {
    timestamp_osm_base?: string;
    copyright?: string;
  };
  elements: OverpassElement[];
}

export interface EitOsmBuildingRecord {
  osmId: number;
  coordinates: EitCoordinate[];
  centroid: EitCoordinate;
  footprintAreaM2: number;
  buildingTag: string;
  levels: number | null;
}

export interface EitOsmRoadRecord {
  osmId: number;
  coordinates: EitCoordinate[];
  highway: string;
  name: string | null;
}

const snapshot = overpassSnapshot as unknown as OverpassSnapshot;

/**
 * Reference center used by the institute's contact-map embed. It is a location
 * reference, not a surveyed campus centroid or boundary.
 */
export const EIT_MAP_REFERENCE: EitCoordinate = [77.4398682, 28.3912265];
export const EIT_OSM_CAPTURED_AT = snapshot.osm3s?.timestamp_osm_base ?? "unknown";
export const EIT_OSM_LICENSE = "OpenStreetMap contributors, ODbL 1.0";
export const EIT_OSM_SOURCE_URL = "https://www.openstreetmap.org/copyright";

const longitudeMeters = 111_320 * Math.cos(EIT_MAP_REFERENCE[1] * Math.PI / 180);

function closeRing(coordinates: EitCoordinate[]): EitCoordinate[] {
  if (coordinates.length === 0) return coordinates;
  const first = coordinates[0];
  const last = coordinates.at(-1)!;
  return first[0] === last[0] && first[1] === last[1]
    ? coordinates
    : [...coordinates, [...first] as EitCoordinate];
}

function centroid(coordinates: EitCoordinate[]): EitCoordinate {
  const open = coordinates.length > 1 &&
    coordinates[0][0] === coordinates.at(-1)![0] &&
    coordinates[0][1] === coordinates.at(-1)![1]
    ? coordinates.slice(0, -1)
    : coordinates;
  const total = open.reduce(
    (sum, coordinate) => [sum[0] + coordinate[0], sum[1] + coordinate[1]] as EitCoordinate,
    [0, 0] as EitCoordinate,
  );
  return [total[0] / Math.max(1, open.length), total[1] / Math.max(1, open.length)];
}

function distanceFromReferenceM(coordinate: EitCoordinate): number {
  const eastM = (coordinate[0] - EIT_MAP_REFERENCE[0]) * longitudeMeters;
  const northM = (coordinate[1] - EIT_MAP_REFERENCE[1]) * 111_320;
  return Math.hypot(eastM, northM);
}

function footprintAreaM2(coordinates: EitCoordinate[]): number {
  let area = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const first = coordinates[index];
    const second = coordinates[index + 1];
    const x1 = (first[0] - EIT_MAP_REFERENCE[0]) * longitudeMeters;
    const y1 = (first[1] - EIT_MAP_REFERENCE[1]) * 111_320;
    const x2 = (second[0] - EIT_MAP_REFERENCE[0]) * longitudeMeters;
    const y2 = (second[1] - EIT_MAP_REFERENCE[1]) * 111_320;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function numericLevels(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : null;
}

/**
 * Tight, deterministic extraction from the bundled Overpass snapshot. OSM
 * supplies the footprints. The filter only creates a visual operating subset;
 * it does not assert that every polygon belongs to EIT.
 */
export const EIT_OSM_BUILDINGS: EitOsmBuildingRecord[] = snapshot.elements
  .filter((element) => element.type === "way" && element.tags?.building && element.geometry?.length)
  .map((element) => {
    const coordinates = closeRing(
      element.geometry!.map((point) => [point.lon, point.lat] as EitCoordinate),
    );
    return {
      osmId: element.id,
      coordinates,
      centroid: centroid(coordinates),
      footprintAreaM2: footprintAreaM2(coordinates),
      buildingTag: element.tags?.building ?? "yes",
      levels: numericLevels(element.tags?.["building:levels"]),
    };
  })
  .filter((building) =>
    distanceFromReferenceM(building.centroid) <= 260 && building.footprintAreaM2 >= 180)
  .sort((first, second) => second.footprintAreaM2 - first.footprintAreaM2)
  .slice(0, 32);

export const EIT_OSM_ROADS: EitOsmRoadRecord[] = snapshot.elements
  .filter((element) => element.type === "way" && element.tags?.highway && element.geometry?.length)
  .map((element) => {
    const coordinates = element.geometry!.map((point) => [point.lon, point.lat] as EitCoordinate);
    return {
      osmId: element.id,
      coordinates,
      highway: element.tags?.highway ?? "road",
      name: element.tags?.name ?? null,
    };
  })
  .filter((road) => distanceFromReferenceM(centroid(road.coordinates)) <= 500)
  .slice(0, 28);

const importedFootprintCoordinates = EIT_OSM_BUILDINGS.flatMap((building) => building.coordinates);
const allFootprintCoordinates = importedFootprintCoordinates.length
  ? importedFootprintCoordinates
  : [EIT_MAP_REFERENCE];
const west = Math.min(...allFootprintCoordinates.map((coordinate) => coordinate[0]));
const east = Math.max(...allFootprintCoordinates.map((coordinate) => coordinate[0]));
const south = Math.min(...allFootprintCoordinates.map((coordinate) => coordinate[1]));
const north = Math.max(...allFootprintCoordinates.map((coordinate) => coordinate[1]));
const horizontalPadding = 32 / longitudeMeters;
const verticalPadding = 32 / 111_320;

/** Estimated operating envelope derived from the imported footprint subset. */
export const EIT_OSM_OPERATING_BOUNDS = {
  west: west - horizontalPadding,
  east: east + horizontalPadding,
  south: south - verticalPadding,
  north: north + verticalPadding,
};

export const EIT_OSM_DATA_QUALITY = {
  geometry: "IMPORTED OSM FOOTPRINT",
  ownership: "UNVERIFIED CAMPUS MEMBERSHIP",
  height: "ESTIMATED UNLESS OSM LEVELS PRESENT",
  occupancy: "ESTIMATED PLANNING ENVELOPE",
  terrain: "ESTIMATED UNTIL DEM OR SURVEY IS CONNECTED",
} as const;
