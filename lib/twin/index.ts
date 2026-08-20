import type {
  Coordinate,
  EvacuationPlan,
  EvacuationRoute,
  FacilityImpact,
  HazardCellSample,
  ScenarioDefinition,
  SimulationResult,
  SpatialCellSeries,
} from "../domain/types";
import {
  EIT_MAP_REFERENCE,
  EIT_OSM_BUILDINGS,
  EIT_OSM_CAPTURED_AT,
  EIT_OSM_LICENSE,
  EIT_OSM_OPERATING_BOUNDS,
  EIT_OSM_SOURCE_URL,
} from "../../datasets/faridabad/eit-osm";
import type {
  BuildTwinSceneInput,
  TwinBuildingDefinition,
  TwinBuildingImpactState,
  TwinCampusDataset,
  TwinCampusLandmark,
  TwinCriticalFacilityState,
  TwinEvacuationAgent,
  TwinEvacuationRouteState,
  TwinFloodContour,
  TwinFloodExtentPolygon,
  TwinFloodSurface,
  TwinImpactLayers,
  TwinProvenance,
  TwinScene,
  TwinSceneOptions,
  TwinTerrainControlPoint,
} from "./types";

export type * from "./types";
export { parseTwinCampusDataset, type CampusImportResult } from "./import";

const EARTH_RADIUS_M = 6_371_000;
const EIT_CENTER: Coordinate = { lat: EIT_MAP_REFERENCE[1], lon: EIT_MAP_REFERENCE[0] };
const DEFAULT_CONTOURS = [0.05, 0.15, 0.3, 0.6, 1, 1.5];

const IMPORTED_EIT_CENTER_PROVENANCE: TwinProvenance = {
  classification: "IMPORTED",
  sourceId: "eit-official-contact-map-center",
  sourceLabel: "Official EIT Contact page embedded map",
  sourceUrl: "https://eitfaridabad.com/contact-us.php",
  note:
    "Imported center coordinate only: latitude 28.3912265, longitude 77.4398682. This source does not validate prototype footprints, heights, terrain or occupancy.",
};

const IMPORTED_OSM_FOOTPRINT_PROVENANCE: TwinProvenance = {
  classification: "IMPORTED",
  sourceId: "eit-overpass-osm-snapshot",
  sourceLabel: "Bundled OpenStreetMap / Overpass footprint snapshot",
  sourceUrl: EIT_OSM_SOURCE_URL,
  observedAtIso: EIT_OSM_CAPTURED_AT === "unknown" ? undefined : EIT_OSM_CAPTURED_AT,
  license: EIT_OSM_LICENSE,
  note:
    "Building polygon geometry and nearby road centerlines are imported from OSM. The tight visual subset does not prove ownership or full campus membership.",
};

const ESTIMATED_CAMPUS_PROVENANCE: TwinProvenance = {
  classification: "ESTIMATED",
  sourceId: "aegis-eit-estimated-attributes-v2",
  sourceLabel: "AEGIS inferred building and terrain attributes",
  note:
    "Heights, floor counts where OSM levels are absent, use, terrain, plinth, vulnerability and occupancy are planning estimates; they are not survey, BIM or facilities records.",
};

type Position = [longitude: number, latitude: number];
type Segment = [Position, Position];

interface ScalarPoint {
  coordinate: Position;
  value: number;
}

interface ScalarGrid {
  points: ScalarPoint[][];
  lowerMinute: number;
  upperMinute: number;
  fraction: number;
  fineRows: number;
  fineColumns: number;
}

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

function toDegrees(value: number): number {
  return value * 180 / Math.PI;
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

function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const longitudeDelta = toRadians(b.lon - a.lon);
  const y = Math.sin(longitudeDelta) * Math.cos(latitudeB);
  const x =
    Math.cos(latitudeA) * Math.sin(latitudeB) -
    Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(longitudeDelta);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function offsetCoordinate(center: Coordinate, eastM: number, northM: number): Coordinate {
  return {
    lat: round(center.lat + northM / 111_320, 7),
    lon: round(
      center.lon + eastM / (111_320 * Math.max(0.2, Math.cos(toRadians(center.lat)))),
      7,
    ),
  };
}

function asPosition(value: Coordinate): Position {
  return [value.lon, value.lat];
}

function estimatedElevation(eastM: number, northM: number): number {
  const basin = Math.exp(-((eastM / 230) ** 2 + (northM / 190) ** 2));
  return round(206.2 + northM * 0.006 - eastM * 0.0018 - basin * 1.35, 2);
}

function cloneProvenance(value: TwinProvenance): TwinProvenance {
  return { ...value };
}

function buildCampusBuildings(): TwinBuildingDefinition[] {
  return EIT_OSM_BUILDINGS.map((record, index) => {
    const importedFloors = record.levels;
    const floors = importedFloors ?? (
      record.footprintAreaM2 >= 2_400 ? 4 : record.footprintAreaM2 >= 750 ? 3 : record.footprintAreaM2 >= 320 ? 2 : 1
    );
    const heightM = round(floors * 3.35 + 0.8, 1);
    const eastM = (record.centroid[0] - EIT_CENTER.lon) *
      111_320 * Math.cos(toRadians(EIT_CENTER.lat));
    const northM = (record.centroid[1] - EIT_CENTER.lat) * 111_320;
    const dayOccupancy = Math.max(12, Math.round(record.footprintAreaM2 * floors / 11));
    return {
      id: `osm-building-${record.osmId}`,
      name: `Imported building footprint ${record.osmId}`,
      function: "unknown",
      footprint: { type: "Polygon", coordinates: [record.coordinates] },
      centroid: { lat: record.centroid[1], lon: record.centroid[0] },
      baseElevationM: estimatedElevation(eastM, northM),
      heightM,
      floors,
      floorHeightM: round(heightM / floors, 2),
      plinthHeightM: 0.22,
      roofStyle: "flat",
      vulnerability: round(Math.min(0.66, 0.38 + 160 / Math.max(500, record.footprintAreaM2)), 2),
      daytimeOccupancyEstimate: dayOccupancy,
      nighttimeOccupancyEstimate: Math.max(2, Math.round(dayOccupancy * 0.04)),
      facadeTone: index === 0 ? "large-imported-footprint" : "osm-neutral",
      footprintAreaM2: round(record.footprintAreaM2, 1),
      provenance: cloneProvenance(IMPORTED_OSM_FOOTPRINT_PROVENANCE),
      attributeProvenance: cloneProvenance(ESTIMATED_CAMPUS_PROVENANCE),
      dataConfidence: {
        geometry01: 0.82,
        height01: importedFloors ? 0.7 : 0.42,
        occupancy01: 0.28,
      },
    };
  });
}

function buildTerrainControlPoints(): TwinTerrainControlPoint[] {
  const points: TwinTerrainControlPoint[] = [];
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const eastM = -360 + column * 120;
      const northM = 360 - row * 120;
      const localVariation = Math.sin((row + 1) * 1.7 + column * 0.83) * 0.16;
      points.push({
        id: `terrain-control-${row}-${column}`,
        coordinate: offsetCoordinate(EIT_CENTER, eastM, northM),
        elevationM: round(estimatedElevation(eastM, northM) + localVariation, 2),
        roughness: round(0.025 + ((row * 3 + column * 5) % 7) * 0.006, 3),
        drainageIndex: round(clamp(0.72 - Math.abs(eastM) / 1_500 + northM / 2_800, 0.25, 0.9), 2),
        provenance: cloneProvenance(ESTIMATED_CAMPUS_PROVENANCE),
      });
    }
  }
  return points;
}

function buildLandmarks(): TwinCampusLandmark[] {
  // The bundled OSM snapshot has no verified gate, assembly-area or sports-
  // field geometry. Keep these empty instead of drawing invented assets.
  return [];
}

/** Returns a fresh twin with imported OSM footprints and estimated attributes. */
export function createEitCampusDataset(): TwinCampusDataset {
  return {
    id: "aegis-eit-osm-twin-v2",
    version: "2.0.0",
    label: "EIT map-reference 3D twin - OSM footprint edition",
    center: { ...EIT_CENTER },
    bounds: {
      north: EIT_OSM_OPERATING_BOUNDS.north,
      south: EIT_OSM_OPERATING_BOUNDS.south,
      east: EIT_OSM_OPERATING_BOUNDS.east,
      west: EIT_OSM_OPERATING_BOUNDS.west,
    },
    buildings: buildCampusBuildings(),
    terrainControlPoints: buildTerrainControlPoints(),
    landmarks: buildLandmarks(),
    provenance: [
      cloneProvenance(IMPORTED_EIT_CENTER_PROVENANCE),
      cloneProvenance(IMPORTED_OSM_FOOTPRINT_PROVENANCE),
      cloneProvenance(ESTIMATED_CAMPUS_PROVENANCE),
    ],
    prototypeLabel:
      "OSM FOOTPRINTS IMPORTED - HEIGHT, TERRAIN, USE AND OCCUPANCY ESTIMATED - NOT BIM",
    disclaimer:
      "The rendered polygons are a tight subset of bundled OSM building footprints near the EIT map reference. Campus membership is unverified; heights, use, terrain, vulnerability and occupancy remain planning estimates. Replace them with a surveyed boundary, BIM, DEM and verified facilities records before operational use.",
  };
}

function simulationProvenance(result: SimulationResult): TwinProvenance {
  return {
    classification: "SIMULATED",
    sourceId: result.model.id,
    sourceLabel: `${result.model.name} ${result.model.version}`,
    note: `${result.estimateLabel}. ${result.disclaimer}`,
  };
}

function scenarioAssetProvenance(scenario: ScenarioDefinition): TwinProvenance {
  const observed = scenario.provenance.find((source) => source.kind === "observed");
  if (observed) {
    return {
      classification: "OBSERVED",
      sourceId: observed.id,
      sourceLabel: observed.label,
      sourceUrl: observed.sourceUrl,
      observedAtIso: observed.observedAtIso,
      license: observed.license,
      note: observed.note ?? "Observed scenario asset record.",
    };
  }
  const imported = scenario.provenance.find((source) =>
    source.kind === "open-data" &&
    /asset|facility|road|population|building/i.test(`${source.id} ${source.label}`));
  if (imported) {
    return {
      classification: "IMPORTED",
      sourceId: imported.id,
      sourceLabel: imported.label,
      sourceUrl: imported.sourceUrl,
      observedAtIso: imported.observedAtIso,
      license: imported.license,
      note: imported.note ?? "Imported open-data scenario asset record.",
    };
  }
  return {
    classification: "ESTIMATED",
    sourceId: "scenario-prototype-assets",
    sourceLabel: "AEGIS prototype scenario assets",
    note: "Facilities, roads, resources and capacities are prototype estimates unless replaced by provenance-backed imports.",
  };
}

function floodDepth(sample: HazardCellSample): number {
  return sample.hazard === "flood" ? sample.depthM : 0;
}

function depthAtSeries(series: SpatialCellSeries, minute: number): number {
  if (series.samples.length === 0) return 0;
  if (minute <= series.samples[0].minute) return floodDepth(series.samples[0]);
  if (minute >= series.samples.at(-1)!.minute) return floodDepth(series.samples.at(-1)!);
  let lower = series.samples[0];
  let upper = series.samples.at(-1)!;
  for (let index = 1; index < series.samples.length; index += 1) {
    if (series.samples[index].minute >= minute) {
      lower = series.samples[index - 1];
      upper = series.samples[index];
      break;
    }
  }
  const fraction = clamp(
    (minute - lower.minute) / Math.max(0.0001, upper.minute - lower.minute),
    0,
    1,
  );
  return floodDepth(lower) + (floodDepth(upper) - floodDepth(lower)) * fraction;
}

function frameBounds(result: SimulationResult, minute: number): {
  lowerMinute: number;
  upperMinute: number;
  fraction: number;
} {
  if (result.timeline.length === 0) return { lowerMinute: 0, upperMinute: 0, fraction: 0 };
  const bounded = clamp(minute, result.timeline[0].minute, result.timeline.at(-1)!.minute);
  let lowerMinute = result.timeline[0].minute;
  let upperMinute = result.timeline.at(-1)!.minute;
  for (let index = 1; index < result.timeline.length; index += 1) {
    if (result.timeline[index].minute >= bounded) {
      lowerMinute = result.timeline[index - 1].minute;
      upperMinute = result.timeline[index].minute;
      break;
    }
  }
  return {
    lowerMinute,
    upperMinute,
    fraction: upperMinute === lowerMinute ? 0 : (bounded - lowerMinute) / (upperMinute - lowerMinute),
  };
}

function sourceDepthMatrix(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
): number[][] {
  const matrix = Array.from({ length: scenario.gridRows }, () =>
    Array.from({ length: scenario.gridColumns }, () => 0));
  for (const series of result.field) {
    if (
      series.cell.row >= 0 &&
      series.cell.row < scenario.gridRows &&
      series.cell.column >= 0 &&
      series.cell.column < scenario.gridColumns
    ) {
      matrix[series.cell.row][series.cell.column] = depthAtSeries(series, minute);
    }
  }
  return matrix;
}

function smoothValues(points: ScalarPoint[][], passes: number): ScalarPoint[][] {
  let current = points;
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((row, rowIndex) => row.map((point, columnIndex) => {
      if (
        rowIndex === 0 ||
        columnIndex === 0 ||
        rowIndex === current.length - 1 ||
        columnIndex === row.length - 1
      ) {
        return { ...point, coordinate: [...point.coordinate] as Position, value: 0 };
      }
      let weighted = current[rowIndex][columnIndex].value * 4;
      let weight = 4;
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          if (rowOffset === 0 && columnOffset === 0) continue;
          const localWeight = rowOffset === 0 || columnOffset === 0 ? 2 : 1;
          weighted += current[rowIndex + rowOffset][columnIndex + columnOffset].value * localWeight;
          weight += localWeight;
        }
      }
      return {
        coordinate: [...point.coordinate] as Position,
        value: weighted / weight,
      };
    }));
  }
  return current;
}

function buildScalarGrid(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  resolution: number,
): ScalarGrid {
  const matrix = sourceDepthMatrix(scenario, result, minute);
  const interiorRows = Math.max(1, (scenario.gridRows - 1) * resolution + 1);
  const interiorColumns = Math.max(1, (scenario.gridColumns - 1) * resolution + 1);
  const padding = 2;
  const latitudeStep = (scenario.area.north - scenario.area.south) / scenario.gridRows;
  const longitudeStep = (scenario.area.east - scenario.area.west) / scenario.gridColumns;
  const points: ScalarPoint[][] = [];
  for (let fineRow = -padding; fineRow < interiorRows + padding; fineRow += 1) {
    const rowParameter = fineRow / resolution;
    const sourceRow = clamp(Math.floor(rowParameter), 0, scenario.gridRows - 1);
    const nextRow = clamp(sourceRow + 1, 0, scenario.gridRows - 1);
    const rowFraction = clamp(rowParameter - sourceRow, 0, 1);
    const row: ScalarPoint[] = [];
    for (let fineColumn = -padding; fineColumn < interiorColumns + padding; fineColumn += 1) {
      const columnParameter = fineColumn / resolution;
      const sourceColumn = clamp(Math.floor(columnParameter), 0, scenario.gridColumns - 1);
      const nextColumn = clamp(sourceColumn + 1, 0, scenario.gridColumns - 1);
      const columnFraction = clamp(columnParameter - sourceColumn, 0, 1);
      const outside =
        fineRow < 0 ||
        fineColumn < 0 ||
        fineRow >= interiorRows ||
        fineColumn >= interiorColumns;
      const top =
        matrix[sourceRow][sourceColumn] * (1 - columnFraction) +
        matrix[sourceRow][nextColumn] * columnFraction;
      const bottom =
        matrix[nextRow][sourceColumn] * (1 - columnFraction) +
        matrix[nextRow][nextColumn] * columnFraction;
      const value = outside ? 0 : top * (1 - rowFraction) + bottom * rowFraction;
      row.push({
        coordinate: [
          scenario.area.west + (columnParameter + 0.5) * longitudeStep,
          scenario.area.north - (rowParameter + 0.5) * latitudeStep,
        ],
        value,
      });
    }
    points.push(row);
  }
  const bounds = frameBounds(result, minute);
  return {
    points: smoothValues(points, 2),
    lowerMinute: bounds.lowerMinute,
    upperMinute: bounds.upperMinute,
    fraction: bounds.fraction,
    fineRows: interiorRows,
    fineColumns: interiorColumns,
  };
}

function interpolateContourPoint(
  a: ScalarPoint,
  b: ScalarPoint,
  threshold: number,
): Position {
  const fraction = Math.abs(b.value - a.value) < 1e-9
    ? 0.5
    : clamp((threshold - a.value) / (b.value - a.value), 0, 1);
  return [
    a.coordinate[0] + (b.coordinate[0] - a.coordinate[0]) * fraction,
    a.coordinate[1] + (b.coordinate[1] - a.coordinate[1]) * fraction,
  ];
}

function marchingSegments(points: ScalarPoint[][], threshold: number): Segment[] {
  const segments: Segment[] = [];
  for (let row = 0; row < points.length - 1; row += 1) {
    for (let column = 0; column < points[row].length - 1; column += 1) {
      const topLeft = points[row][column];
      const topRight = points[row][column + 1];
      const bottomRight = points[row + 1][column + 1];
      const bottomLeft = points[row + 1][column];
      const code =
        (topLeft.value >= threshold ? 8 : 0) |
        (topRight.value >= threshold ? 4 : 0) |
        (bottomRight.value >= threshold ? 2 : 0) |
        (bottomLeft.value >= threshold ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = () => interpolateContourPoint(topLeft, topRight, threshold);
      const right = () => interpolateContourPoint(topRight, bottomRight, threshold);
      const bottom = () => interpolateContourPoint(bottomLeft, bottomRight, threshold);
      const left = () => interpolateContourPoint(topLeft, bottomLeft, threshold);
      const push = (a: Position, b: Position) => segments.push([a, b]);
      if (code === 1) push(left(), bottom());
      else if (code === 2) push(bottom(), right());
      else if (code === 3) push(left(), right());
      else if (code === 4) push(top(), right());
      else if (code === 5) {
        const center = (topLeft.value + topRight.value + bottomRight.value + bottomLeft.value) / 4;
        if (center >= threshold) {
          push(top(), left());
          push(bottom(), right());
        } else {
          push(top(), right());
          push(left(), bottom());
        }
      } else if (code === 6) push(top(), bottom());
      else if (code === 7) push(top(), left());
      else if (code === 8) push(left(), top());
      else if (code === 9) push(top(), bottom());
      else if (code === 10) {
        const center = (topLeft.value + topRight.value + bottomRight.value + bottomLeft.value) / 4;
        if (center >= threshold) {
          push(left(), bottom());
          push(top(), right());
        } else {
          push(left(), top());
          push(bottom(), right());
        }
      } else if (code === 11) push(top(), right());
      else if (code === 12) push(left(), right());
      else if (code === 13) push(bottom(), right());
      else if (code === 14) push(left(), bottom());
    }
  }
  return segments;
}

function positionKey(position: Position): string {
  return `${position[0].toFixed(8)},${position[1].toFixed(8)}`;
}

function stitchSegments(segments: Segment[]): Position[][] {
  const sorted = [...segments].sort((a, b) => {
    const keyA = `${positionKey(a[0])}|${positionKey(a[1])}`;
    const keyB = `${positionKey(b[0])}|${positionKey(b[1])}`;
    return keyA.localeCompare(keyB);
  });
  const endpointMap = new Map<string, number[]>();
  sorted.forEach((segment, index) => {
    for (const point of segment) {
      const key = positionKey(point);
      endpointMap.set(key, [...(endpointMap.get(key) ?? []), index]);
    }
  });
  const used = new Set<number>();
  const paths: Position[][] = [];
  const extend = (path: Position[], atEnd: boolean) => {
    while (true) {
      const endpoint = atEnd ? path.at(-1)! : path[0];
      const candidateIndex = (endpointMap.get(positionKey(endpoint)) ?? [])
        .find((index) => !used.has(index));
      if (candidateIndex === undefined) break;
      used.add(candidateIndex);
      const segment = sorted[candidateIndex];
      const next = positionKey(segment[0]) === positionKey(endpoint) ? segment[1] : segment[0];
      if (atEnd) path.push(next);
      else path.unshift(next);
      if (path.length > 3 && positionKey(path[0]) === positionKey(path.at(-1)!)) break;
    }
  };
  sorted.forEach((segment, index) => {
    if (used.has(index)) return;
    used.add(index);
    const path: Position[] = [segment[0], segment[1]];
    extend(path, true);
    extend(path, false);
    paths.push(path);
  });
  return paths;
}

function smoothPath(path: Position[], iterations = 2): Position[] {
  if (path.length < 4) return path.map((point) => [...point] as Position);
  const closed = positionKey(path[0]) === positionKey(path.at(-1)!);
  let points = closed ? path.slice(0, -1) : [...path];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next: Position[] = [];
    if (!closed) next.push(points[0]);
    const edgeCount = closed ? points.length : points.length - 1;
    for (let index = 0; index < edgeCount; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      next.push([
        a[0] * 0.75 + b[0] * 0.25,
        a[1] * 0.75 + b[1] * 0.25,
      ]);
      next.push([
        a[0] * 0.25 + b[0] * 0.75,
        a[1] * 0.25 + b[1] * 0.75,
      ]);
    }
    if (!closed) next.push(points.at(-1)!);
    points = next;
  }
  if (closed) points.push([...points[0]] as Position);
  return points;
}

function signedArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function ringCenter(ring: Position[]): Position {
  const points = ring.slice(0, -1);
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const xCurrent = ring[current][0];
    const yCurrent = ring[current][1];
    const xPrevious = ring[previous][0];
    const yPrevious = ring[previous][1];
    const intersects =
      (yCurrent > point[1]) !== (yPrevious > point[1]) &&
      point[0] <
        (xPrevious - xCurrent) * (point[1] - yCurrent) /
          (yPrevious - yCurrent) +
        xCurrent;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientedRing(ring: Position[], counterClockwise: boolean): Position[] {
  const isCounterClockwise = signedArea(ring) > 0;
  return isCounterClockwise === counterClockwise
    ? ring
    : [...ring].reverse().map((point) => [...point] as Position);
}

function ringsToPolygons(rings: Position[][]): Position[][][] {
  const closed = rings
    .filter((ring) => ring.length >= 5 && positionKey(ring[0]) === positionKey(ring.at(-1)!))
    .map((ring) => ({ ring, area: Math.abs(signedArea(ring)), parent: -1, depth: 0 }))
    .sort((a, b) => b.area - a.area);
  for (let index = 0; index < closed.length; index += 1) {
    const center = ringCenter(closed[index].ring);
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      if (pointInRing(center, closed[candidate].ring)) {
        closed[index].parent = candidate;
        closed[index].depth = closed[candidate].depth + 1;
        break;
      }
    }
  }
  const polygons: Position[][][] = [];
  closed.forEach((entry, index) => {
    if (entry.depth % 2 !== 0) return;
    const polygon = [orientedRing(entry.ring, true)];
    closed.forEach((candidate) => {
      if (candidate.parent === index && candidate.depth === entry.depth + 1) {
        polygon.push(orientedRing(candidate.ring, false));
      }
    });
    polygons.push(polygon);
  });
  return polygons;
}

function contourPaths(grid: ScalarGrid, threshold: number): Position[][] {
  return stitchSegments(marchingSegments(grid.points, threshold))
    .map((path) => smoothPath(path, 2))
    .filter((path) => path.length >= 4);
}

function scenarioAreaSquareKm(scenario: ScenarioDefinition): number {
  const northWest = { lat: scenario.area.north, lon: scenario.area.west };
  const northEast = { lat: scenario.area.north, lon: scenario.area.east };
  const southWest = { lat: scenario.area.south, lon: scenario.area.west };
  return distanceMeters(northWest, northEast) * distanceMeters(northWest, southWest) / 1_000_000;
}

function buildFloodSurface(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
  dataset: TwinCampusDataset,
  options: Required<TwinSceneOptions>,
): TwinFloodSurface {
  const provenance = simulationProvenance(result);
  if (result.hazard !== "flood") {
    return {
      minute,
      lowerFrameMinute: frameBounds(result, minute).lowerMinute,
      upperFrameMinute: frameBounds(result, minute).upperMinute,
      interpolationFraction: frameBounds(result, minute).fraction,
      renderMode: "continuous-interpolated-surface",
      gridVisible: false,
      maximumDepthM: 0,
      meanWetDepthM: 0,
      affectedAreaSqKm: 0,
      extentPolygons: [],
      contours: [],
      contourDepthsM: options.contourDepthsM,
      provenance,
    };
  }
  const grid = buildScalarGrid(scenario, result, minute, options.surfaceResolution);
  const extentThreshold = 0.025;
  const extentPaths = contourPaths(grid, extentThreshold);
  const polygons = ringsToPolygons(extentPaths);
  const meanTerrain = dataset.terrainControlPoints.reduce((sum, point) => sum + point.elevationM, 0) /
    dataset.terrainControlPoints.length;
  const extentPolygons: TwinFloodExtentPolygon[] = polygons.map((coordinates, index) => ({
    id: `flood-extent-${index}`,
    minimumDepthM: extentThreshold,
    geometry: { type: "Polygon", coordinates },
    surfaceElevationM: round(meanTerrain + extentThreshold, 3),
    provenance: cloneProvenance(provenance),
  }));
  const contours: TwinFloodContour[] = [];
  const maximumDepthM = Math.max(0, ...grid.points.flatMap((row) => row.map((point) => point.value)));
  const activeContourDepths = options.contourDepthsM.filter((depth) => depth <= maximumDepthM + 1e-9);
  for (const depth of activeContourDepths) {
    contourPaths(grid, depth).forEach((path, index) => {
      contours.push({
        id: `flood-contour-${depth.toFixed(2)}-${index}`,
        depthM: depth,
        geometry: { type: "LineString", coordinates: path },
        provenance: cloneProvenance(provenance),
      });
    });
  }
  const interiorValues = grid.points.slice(2, -2).flatMap((row) => row.slice(2, -2).map((point) => point.value));
  const wetValues = interiorValues.filter((value) => value >= extentThreshold);
  const affectedFraction = wetValues.length / Math.max(1, interiorValues.length);
  return {
    minute,
    lowerFrameMinute: grid.lowerMinute,
    upperFrameMinute: grid.upperMinute,
    interpolationFraction: round(grid.fraction, 4),
    renderMode: "continuous-interpolated-surface",
    gridVisible: false,
    maximumDepthM: round(maximumDepthM, 3),
    meanWetDepthM: wetValues.length === 0
      ? 0
      : round(wetValues.reduce((sum, value) => sum + value, 0) / wetValues.length, 3),
    affectedAreaSqKm: round(scenarioAreaSquareKm(scenario) * affectedFraction, 3),
    extentPolygons,
    contours,
    contourDepthsM: activeContourDepths,
    provenance,
  };
}

function nearestSeries(result: SimulationResult, coordinate: Coordinate): SpatialCellSeries {
  return result.field.reduce((nearest, series) =>
    distanceMeters(series.cell.center, coordinate) < distanceMeters(nearest.cell.center, coordinate)
      ? series
      : nearest,
  result.field[0]);
}

function interpolatedDepthAt(
  result: SimulationResult,
  coordinate: Coordinate,
  minute: number,
): number {
  if (result.hazard !== "flood" || result.field.length === 0) return 0;
  const nearest = [...result.field]
    .sort((a, b) => distanceMeters(a.cell.center, coordinate) - distanceMeters(b.cell.center, coordinate))
    .slice(0, 4);
  let weighted = 0;
  let totalWeight = 0;
  for (const series of nearest) {
    const distance = distanceMeters(series.cell.center, coordinate);
    const weight = 1 / (distance ** 2 + 2_500);
    weighted += depthAtSeries(series, minute) * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weighted / totalWeight;
}

function nearestRoadState(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  coordinate: Coordinate,
  minute: number,
): { roadId: string | null; status: "open" | "restricted" | "closed"; depthM: number } {
  if (scenario.assets.roads.length === 0) return { roadId: null, status: "closed", depthM: 0 };
  const nearest = scenario.assets.roads.reduce((best, road) => {
    const roadCenter = {
      lat: road.geometry.reduce((sum, point) => sum + point.lat, 0) / road.geometry.length,
      lon: road.geometry.reduce((sum, point) => sum + point.lon, 0) / road.geometry.length,
    };
    const bestCenter = {
      lat: best.geometry.reduce((sum, point) => sum + point.lat, 0) / best.geometry.length,
      lon: best.geometry.reduce((sum, point) => sum + point.lon, 0) / best.geometry.length,
    };
    return distanceMeters(roadCenter, coordinate) < distanceMeters(bestCenter, coordinate) ? road : best;
  }, scenario.assets.roads[0]);
  const roadCenter = {
    lat: nearest.geometry.reduce((sum, point) => sum + point.lat, 0) / nearest.geometry.length,
    lon: nearest.geometry.reduce((sum, point) => sum + point.lon, 0) / nearest.geometry.length,
  };
  const depthM = Math.max(
    0,
    interpolatedDepthAt(result, roadCenter, minute) -
      nearest.elevationOffsetM -
      nearest.drainageQuality * 0.055,
  );
  return {
    roadId: nearest.id,
    status: depthM > 0.45 ? "closed" : depthM > 0.18 ? "restricted" : "open",
    depthM,
  };
}

function damageBand(index: number): TwinBuildingImpactState["damageBand"] {
  if (index >= 0.82) return "critical";
  if (index >= 0.62) return "severe";
  if (index >= 0.38) return "moderate";
  if (index >= 0.12) return "minor";
  return "none";
}

function populationImpactBand(
  exposed: number,
): NonNullable<TwinBuildingImpactState["populationImpactBand"]> {
  if (exposed >= 500) return "critical";
  if (exposed >= 220) return "high";
  if (exposed >= 80) return "elevated";
  if (exposed > 0) return "limited";
  return "none";
}

function utilityStatus(
  building: TwinBuildingDefinition,
  index: number,
): NonNullable<TwinBuildingImpactState["utilityStatus"]> {
  if (building.function !== "utility") return "unknown";
  if (index >= 0.82) return "unavailable";
  if (index >= 0.55) return "degraded";
  if (index >= 0.18) return "at-risk";
  return "normal";
}

function buildingStates(
  dataset: TwinCampusDataset,
  scenario: ScenarioDefinition,
  result: SimulationResult,
  minute: number,
): TwinBuildingImpactState[] {
  const simulationSource = simulationProvenance(result);
  return dataset.buildings.map((building) => {
    const currentExternalDepthM = interpolatedDepthAt(result, building.centroid, minute);
    let peakExternalDepthM = 0;
    let peakMinute = 0;
    // Damage is cumulative only through the selected minute. Looking across
    // the complete future timeline made buildings appear fully damaged before
    // the water arrived and defeated playback as an explanatory sequence.
    for (const frame of result.timeline) {
      if (frame.minute > minute) break;
      const depth = interpolatedDepthAt(result, building.centroid, frame.minute);
      if (depth > peakExternalDepthM) {
        peakExternalDepthM = depth;
        peakMinute = frame.minute;
      }
    }
    const currentInternalDepthM = Math.max(0, currentExternalDepthM - building.plinthHeightM);
    const peakInternalDepthM = Math.max(0, peakExternalDepthM - building.plinthHeightM);
    const index = clamp(
      peakInternalDepthM / 1.2 * (0.55 + building.vulnerability * 0.65),
      0,
      1,
    );
    const series = nearestSeries(result, building.centroid);
    const access = nearestRoadState(scenario, result, building.centroid, minute);
    const floorImpacts = Array.from({ length: building.floors }, (_, floorIndex) => {
      const elevation = floorIndex * building.floorHeightM + building.plinthHeightM;
      const waterDepthM = Math.max(0, peakExternalDepthM - elevation);
      return {
        floor: floorIndex + 1,
        elevationAboveGroundM: round(elevation, 2),
        waterDepthM: round(waterDepthM, 3),
        status: waterDepthM > 0.03
          ? "affected" as const
          : floorIndex > 0 && access.status === "closed"
            ? "isolated" as const
            : "dry" as const,
        safeRefugeCandidate: floorIndex > 0 && waterDepthM === 0,
      };
    });
    const floorsAffected = floorImpacts.filter((floor) => floor.status === "affected").length;
    const occupantsInExposureEnvelope = Math.round(
      building.daytimeOccupancyEstimate * clamp(peakInternalDepthM / 0.75, 0, 1),
    );
    const confidence01 = round(
      Math.min(
        building.dataConfidence?.geometry01 ?? 0.45,
        building.dataConfidence?.height01 ?? 0.35,
        0.68,
      ),
      2,
    );
    const action = access.status === "closed" && floorImpacts.some((floor) => floor.safeRefugeCandidate)
      ? "Use upper-floor refuge while high-water rescue verifies access."
      : peakInternalDepthM > 0.15
        ? "Evacuate before the listed arrival window and isolate ground-floor electrical systems."
        : access.status === "restricted"
          ? "Restrict entry and verify the nearest access route."
          : "Monitor; no internal inundation is modelled at the selected threshold.";
    return {
      buildingId: building.id,
      buildingName: building.name,
      currentExternalDepthM: round(currentExternalDepthM, 3),
      currentInternalDepthM: round(currentInternalDepthM, 3),
      peakExternalDepthM: round(peakExternalDepthM, 3),
      peakInternalDepthM: round(peakInternalDepthM, 3),
      arrivalMinute: series.arrivalMinute,
      peakMinute,
      recessionMinute: series.recessionMinute,
      damageIndex: round(index, 3),
      damageBand: damageBand(index),
      accessStatus: access.status,
      nearestAccessRoadId: access.roadId,
      floorsAffected,
      floorImpacts,
      occupantsInExposureEnvelope,
      populationImpactBand: populationImpactBand(occupantsInExposureEnvelope),
      utilityStatus: utilityStatus(building, index),
      recoveryEstimateHours: index <= 0.05 ? 0 : Math.round(8 + index * 184),
      confidence01,
      recommendedAction: action,
      explanation: [
        `Peak-to-date external depth ${round(peakExternalDepthM, 2)} m minus estimated ${building.plinthHeightM} m plinth gives ${round(peakInternalDepthM, 2)} m potential internal depth.`,
        `Cumulative damage index ${round(index * 100, 0)}% combines peak-to-date internal depth and ${round(building.vulnerability * 100, 0)}% prototype vulnerability.`,
        `Nearest route ${access.roadId ?? "unavailable"} is ${access.status} at T+${round(minute, 1)} min with ${round(access.depthM, 2)} m modelled carriageway depth.`,
        `${occupantsInExposureEnvelope} daytime occupants are inside a planning exposure envelope; this is not an injury or casualty estimate.`,
      ],
      geometryProvenance: cloneProvenance(building.provenance),
      impactProvenance: cloneProvenance(simulationSource),
    };
  });
}

function impactSeverity(
  band: TwinBuildingImpactState["damageBand"],
): "low" | "moderate" | "high" | "critical" {
  if (band === "critical") return "critical";
  if (band === "severe") return "high";
  if (band === "moderate") return "moderate";
  return "low";
}

function buildImpactLayers(
  dataset: TwinCampusDataset,
  impacts: TwinBuildingImpactState[],
): TwinImpactLayers {
  const buildings = new Map(dataset.buildings.map((building) => [building.id, building]));
  const layers: TwinImpactLayers = {
    damage: [],
    population: [],
    utility: [],
    recovery: [],
    confidence: [],
    safe: [],
    unavailable: [],
    warning: [],
  };

  for (const impact of impacts) {
    const building = buildings.get(impact.buildingId);
    if (!building) continue;
    const severity = impactSeverity(impact.damageBand);
    const confidence01 = impact.confidence01 ?? 0.35;
    const common = {
      geometry: building.footprint,
      severity,
      evidenceClass: impact.impactProvenance.classification,
      confidence01,
      provenance: cloneProvenance(impact.impactProvenance),
    };

    layers.confidence.push({
      ...common,
      id: `confidence-${building.id}`,
      kind: "confidence",
      status: confidence01 >= 0.7 ? "higher" : confidence01 >= 0.45 ? "medium" : "limited",
      value: confidence01,
      unit: "ratio",
      label: `${building.name} data confidence`,
      evidenceClass: building.provenance.classification,
      provenance: cloneProvenance(building.provenance),
    });

    if (impact.damageIndex > 0.01) {
      layers.damage.push({
        ...common,
        id: `damage-${building.id}`,
        kind: "damage",
        status: impact.damageBand,
        value: impact.damageIndex,
        unit: "index",
        label: `${building.name} simulated damage`,
      });
    }
    if (impact.occupantsInExposureEnvelope > 0) {
      layers.population.push({
        ...common,
        id: `population-${building.id}`,
        kind: "population",
        status: impact.populationImpactBand ?? "limited",
        value: impact.occupantsInExposureEnvelope,
        unit: "people in planning exposure envelope",
        label: `${building.name} population exposure`,
      });
    }
    if (impact.utilityStatus && !["unknown", "normal"].includes(impact.utilityStatus)) {
      layers.utility.push({
        ...common,
        id: `utility-${building.id}`,
        kind: "utility",
        status: impact.utilityStatus,
        value: impact.damageIndex,
        unit: "impact index",
        label: `${building.name} utility condition`,
      });
    }
    if ((impact.recoveryEstimateHours ?? 0) > 0) {
      layers.recovery.push({
        ...common,
        id: `recovery-${building.id}`,
        kind: "recovery",
        status: "screening-estimate",
        value: impact.recoveryEstimateHours ?? 0,
        unit: "hours",
        label: `${building.name} indicative recovery time`,
      });
    }

    if (impact.damageBand === "none" && impact.accessStatus === "open") {
      layers.safe.push({
        ...common,
        id: `safe-${building.id}`,
        kind: "safe",
        status: "modelled-unaffected-at-selected-time",
        value: 1,
        unit: "state",
        label: `${building.name} modelled unaffected`,
      });
    } else if (
      impact.accessStatus === "closed" ||
      impact.damageBand === "critical" ||
      impact.damageBand === "severe"
    ) {
      layers.unavailable.push({
        ...common,
        id: `unavailable-${building.id}`,
        kind: "unavailable",
        status: impact.accessStatus === "closed" ? "access-closed" : "severe-impact",
        value: Math.max(impact.damageIndex, impact.accessStatus === "closed" ? 1 : 0),
        unit: "state",
        label: `${building.name} unavailable`,
      });
    } else {
      layers.warning.push({
        ...common,
        id: `warning-${building.id}`,
        kind: "warning",
        status: impact.accessStatus === "restricted" ? "restricted-access" : impact.damageBand,
        value: impact.damageIndex,
        unit: "impact index",
        label: `${building.name} warning`,
      });
    }
  }
  return layers;
}

function routePosition(
  route: EvacuationRoute,
  progress: number,
): { coordinate: Coordinate; headingDeg: number } {
  if (route.polyline.length === 0) return { coordinate: { ...EIT_CENTER }, headingDeg: 0 };
  if (route.polyline.length === 1) return { coordinate: { ...route.polyline[0] }, headingDeg: 0 };
  const lengths = route.polyline.slice(1).map((point, index) =>
    distanceMeters(route.polyline[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = clamp(progress, 0, 1) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const fraction = length === 0 ? 0 : remaining / length;
      const start = route.polyline[index];
      const end = route.polyline[index + 1];
      return {
        coordinate: {
          lat: start.lat + (end.lat - start.lat) * fraction,
          lon: start.lon + (end.lon - start.lon) * fraction,
        },
        headingDeg: bearingDegrees(start, end),
      };
    }
    remaining -= length;
  }
  return {
    coordinate: { ...route.polyline.at(-1)! },
    headingDeg: bearingDegrees(route.polyline.at(-2)!, route.polyline.at(-1)!),
  };
}

function animationStatus(
  minute: number,
  startMinute: number,
  endMinute: number,
  before: "queued" | "staged",
): { progress: number; status: TwinEvacuationAgent["status"] } {
  if (minute < startMinute) return { progress: 0, status: before };
  if (minute >= endMinute) return { progress: 1, status: "arrived" };
  return {
    progress: clamp((minute - startMinute) / Math.max(0.1, endMinute - startMinute), 0, 1),
    status: "en-route",
  };
}

function evacuationScene(
  scenario: ScenarioDefinition,
  result: SimulationResult,
  plan: EvacuationPlan | undefined,
  minute: number,
  maximumAgents: number,
): { agents: TwinEvacuationAgent[]; routes: TwinEvacuationRouteState[] } {
  const source = simulationProvenance(result);
  const routeById = new Map(plan?.routes.map((route) => [route.id, route]) ?? []);
  const assignedByRoute = new Map<string, number>();
  for (const stage of plan?.stages ?? []) {
    assignedByRoute.set(
      stage.routeId,
      (assignedByRoute.get(stage.routeId) ?? 0) + stage.populationAssigned,
    );
  }
  const routes: TwinEvacuationRouteState[] = (plan?.routes ?? []).map((route) => ({
    id: route.id,
    geometry: {
      type: "LineString",
      coordinates: route.polyline.map(asPosition),
    },
    status: route.status,
    riskScore: route.riskScore,
    reliability: route.reliability,
    etaMinutes: route.etaMinutes,
    assignedPopulation: assignedByRoute.get(route.id) ?? 0,
    provenance: cloneProvenance(source),
  }));

  const agents: TwinEvacuationAgent[] = [];
  const nodeById = new Map(scenario.assets.network.nodes.map((node) => [node.id, node]));
  for (const unit of scenario.assets.responders) {
    const assignments = (plan?.resourceAssignments ?? [])
      .filter((assignment) => assignment.unitId === unit.id)
      .sort((a, b) => a.dispatchMinute - b.dispatchMinute);
    const active = assignments.find((assignment) =>
      minute >= assignment.dispatchMinute && minute <= assignment.estimatedArrivalMinute);
    const future = assignments.find((assignment) => minute < assignment.dispatchMinute);
    const past = [...assignments].reverse().find((assignment) => minute > assignment.estimatedArrivalMinute);
    const assignment = active ?? future ?? past;
    const route = assignment ? routeById.get(assignment.routeId) : undefined;
    const home = nodeById.get(unit.homeNodeId)?.coordinate ?? EIT_CENTER;
    let coordinate = { ...home };
    let headingDeg = 0;
    let progress = 0;
    let status: TwinEvacuationAgent["status"] = assignment ? "staged" : "unassigned";
    if (assignment && route) {
      const animation = animationStatus(
        minute,
        assignment.dispatchMinute,
        assignment.estimatedArrivalMinute,
        "staged",
      );
      progress = animation.progress;
      status = animation.status;
      const position = routePosition(route, progress);
      coordinate = position.coordinate;
      headingDeg = position.headingDeg;
    }
    agents.push({
      id: `agent-${unit.id}`,
      kind: unit.type,
      label: unit.name,
      modelKey: `vehicle-${unit.type}`,
      coordinate,
      headingDeg: round(headingDeg, 1),
      altitudeM: 0.35,
      status,
      progress: round(progress, 4),
      routeId: route?.id,
      stageId: assignment?.stageId,
      representedPeople: assignment?.assignedPopulationCapacity ?? unit.seats,
      animation: assignment && route
        ? {
            path: route.polyline.map((point) => ({ ...point })),
            startMinute: assignment.dispatchMinute,
            endMinute: assignment.estimatedArrivalMinute,
            easing: "linear-distance",
            loop: false,
          }
        : undefined,
      provenance: cloneProvenance(source),
    });
  }

  for (const stage of plan?.stages ?? []) {
    if (stage.populationAssigned <= 0 || agents.length >= maximumAgents) continue;
    const route = routeById.get(stage.routeId);
    if (!route) continue;
    const groupCount = clamp(Math.ceil(stage.populationAssigned / 360), 1, 4);
    let assigned = 0;
    for (let groupIndex = 0; groupIndex < groupCount && agents.length < maximumAgents; groupIndex += 1) {
      const representedPeople = groupIndex === groupCount - 1
        ? stage.populationAssigned - assigned
        : Math.floor(stage.populationAssigned / groupCount);
      assigned += representedPeople;
      const stagger = groupIndex * Math.min(2.5, (stage.departureWindow.endMinute - stage.departureWindow.startMinute) / Math.max(1, groupCount));
      const startMinute = stage.departureWindow.startMinute + stagger;
      const endMinute = startMinute + route.etaMinutes;
      const animation = animationStatus(minute, startMinute, endMinute, "queued");
      const position = routePosition(route, animation.progress);
      agents.push({
        id: `agent-${stage.id}-group-${groupIndex + 1}`,
        kind: "evacuation-group",
        label: `${stage.zoneName} evacuation group ${groupIndex + 1}`,
        modelKey: stage.transportMode === "pedestrian" ? "people-group" : "mixed-evacuation-group",
        coordinate: position.coordinate,
        headingDeg: round(position.headingDeg, 1),
        altitudeM: 0.15,
        status: animation.status,
        progress: round(animation.progress, 4),
        routeId: route.id,
        stageId: stage.id,
        representedPeople,
        animation: {
          path: route.polyline.map((point) => ({ ...point })),
          startMinute,
          endMinute,
          easing: "linear-distance",
          loop: false,
        },
        provenance: cloneProvenance(source),
      });
    }
  }
  return { agents: agents.slice(0, maximumAgents), routes };
}

function criticalFacilityStates(
  scenario: ScenarioDefinition,
  result: SimulationResult,
): TwinCriticalFacilityState[] {
  const scenarioSource = scenarioAssetProvenance(scenario);
  const impactById = new Map<string, FacilityImpact>([
    ...result.impacts.hospitals.map((impact) => [impact.facilityId, impact] as const),
    ...result.impacts.shelters.map((impact) => [impact.facilityId, impact] as const),
  ]);
  return scenario.assets.facilities
    .filter((facility) =>
      facility.type === "hospital" ||
      facility.type === "shelter" ||
      facility.type === "command_post")
    .map((facility) => {
      const impact = impactById.get(facility.id);
      return {
        id: facility.id,
        name: facility.name,
        type: facility.type,
        coordinate: { ...facility.coordinate },
        status: impact?.status ?? "operational",
        accessStatus: impact?.accessStatus ?? "advisory",
        capacity: facility.capacity,
        projectedOccupancy: impact?.projectedOccupancy ?? facility.baselineOccupancy,
        provenance: cloneProvenance(scenarioSource),
      };
    });
}

function validateDataset(
  dataset: TwinCampusDataset,
  scenario: ScenarioDefinition,
): void {
  if (dataset.buildings.length === 0 || dataset.terrainControlPoints.length < 4) {
    throw new Error("Twin campus dataset requires buildings and at least four terrain control points.");
  }
  if (dataset.buildings.some((building) => !building.provenance)) {
    throw new Error("Every twin building requires explicit provenance.");
  }
  const scenarioCenter = {
    lat: (scenario.area.north + scenario.area.south) / 2,
    lon: (scenario.area.east + scenario.area.west) / 2,
  };
  if (distanceMeters(dataset.center, scenarioCenter) > 25_000) {
    throw new Error(
      "Campus dataset is outside the simulation area. Do not reuse the estimated EIT twin at another world location; provide a local provenance-backed dataset.",
    );
  }
}

function resolvedOptions(options: TwinSceneOptions | undefined): Required<TwinSceneOptions> {
  const contours = (options?.contourDepthsM ?? DEFAULT_CONTOURS)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  return {
    surfaceResolution: clamp(Math.round(options?.surfaceResolution ?? 4), 2, 8),
    contourDepthsM: [...new Set(contours)],
    maximumAnimatedAgents: clamp(Math.round(options?.maximumAnimatedAgents ?? 72), 6, 160),
    terrainVerticalExaggeration: clamp(options?.terrainVerticalExaggeration ?? 1.35, 0.5, 3),
    lodProfile: options?.lodProfile ?? "laptop-balanced",
  };
}

/**
 * Builds the deterministic EIT 3D-twin scene for one possibly fractional minute.
 * Calling again with a new minute advances the continuous flood and all agents.
 */
export function buildTwinScene({
  scenario,
  result,
  selectedMinute: requestedMinute,
  evacuationPlan,
  campusDataset,
  options: suppliedOptions,
}: BuildTwinSceneInput): TwinScene {
  if (scenario.metadata.id !== result.scenarioId) {
    throw new Error("Twin scene scenario and simulation result do not match.");
  }
  if (evacuationPlan && evacuationPlan.simulationRunId !== result.runId) {
    throw new Error("Twin scene evacuation plan belongs to a different simulation run.");
  }
  if (result.timeline.length === 0 || result.field.length === 0) {
    throw new Error("Twin scene requires a non-empty simulation timeline and field.");
  }
  const dataset = campusDataset ?? createEitCampusDataset();
  validateDataset(dataset, scenario);
  const options = resolvedOptions(suppliedOptions);
  const minute = clamp(
    requestedMinute,
    result.timeline[0].minute,
    result.timeline.at(-1)!.minute,
  );
  const flood = buildFloodSurface(scenario, result, minute, dataset, options);
  const buildings = buildingStates(dataset, scenario, result, minute);
  const impactLayers = buildImpactLayers(dataset, buildings);
  const evacuation = evacuationScene(
    scenario,
    result,
    evacuationPlan,
    minute,
    options.maximumAnimatedAgents,
  );
  const simulationSource = simulationProvenance(result);
  const campusSource = dataset.provenance.find((source) => source.classification === "ESTIMATED") ??
    dataset.provenance[0] ??
    cloneProvenance(ESTIMATED_CAMPUS_PROVENANCE);
  return {
    metadata: {
      id: `twin-${result.runId}`,
      version: "2.0.0",
      title: "AEGIS EIT map-reference flood digital twin",
      hazard: result.hazard,
      selectedMinute: round(minute, 3),
      timeRangeMinutes: [result.timeline[0].minute, result.timeline.at(-1)!.minute],
      prototypeLabel: dataset.prototypeLabel,
      disclaimer: `${dataset.disclaimer} ${result.disclaimer}`,
      globe: {
        crs: "EPSG:4326",
        projection: "globe",
        worldMapEnabled: true,
        center: { ...dataset.center },
        overviewCamera: {
          center: { ...dataset.center },
          altitudeM: 1_800_000,
          pitchDeg: 22,
          bearingDeg: 0,
        },
        campusCamera: {
          center: { ...dataset.center },
          altitudeM: 920,
          pitchDeg: 58,
          bearingDeg: -22,
        },
        flyToDurationMs: 4_800,
      },
      lod: {
        profile: options.lodProfile,
        buildingLodDistancesM:
          options.lodProfile === "high-fidelity"
            ? [900, 3_000, 12_000]
            : options.lodProfile === "mobile-efficient"
              ? [350, 1_300, 5_000]
              : [650, 2_200, 8_000],
        maximumAnimatedAgents: options.maximumAnimatedAgents,
        terrainVerticalExaggeration: options.terrainVerticalExaggeration,
        floodSurfaceResolution: options.surfaceResolution,
      },
      provenance: [
        ...dataset.provenance.map(cloneProvenance),
        cloneProvenance(simulationSource),
      ],
    },
    campus: dataset,
    terrain: {
      controlPoints: dataset.terrainControlPoints,
      interpolation: "smooth-bicubic-ready",
      verticalExaggeration: options.terrainVerticalExaggeration,
      provenance: cloneProvenance(campusSource),
    },
    flood,
    buildings,
    evacuation: {
      planId: evacuationPlan?.id ?? null,
      agents: evacuation.agents,
      routes: evacuation.routes,
      provenance: cloneProvenance(simulationSource),
    },
    criticalFacilities: criticalFacilityStates(scenario, result),
    impactLayers,
    timeline: result.timeline.map((frame) => ({
      minute: frame.minute,
      severity: frame.severity,
      maximumDepthM: frame.hazardSummary.maximumDepthM ?? 0,
      exposedPopulation: frame.exposedPopulation,
      unavailableRoads: frame.unavailableRoads,
    })),
  };
}
