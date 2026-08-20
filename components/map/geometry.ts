import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

import type {
  AegisCoordinate,
  AegisExternalOverlay,
  AegisIncident,
  AegisMapSelection,
} from "./types";
import { EIT_FARIDABAD, LEGACY_EIT_SCENARIO_CENTER } from "./campus-data";

export type AnyFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

export interface FloodSurfaceProperties {
  name: string;
  depthM: number;
  maximumDepthM: number;
  minimumDepthM: number;
  velocityMps: number;
  wetCellCount: number;
  riskLevel: string;
  phase: string;
  visualGeometry: string;
  [key: string]: unknown;
}

export interface FloodSampleProperties {
  depthM: number;
  velocityMps: number;
  riskLevel: string;
  [key: string]: unknown;
}

export interface FloodVisualData {
  surface: FeatureCollection<Polygon, FloodSurfaceProperties>;
  samples: FeatureCollection<Point, FloodSampleProperties>;
  maximumDepthM: number;
  averageDepthM: number;
  wetCellCount: number;
}

interface FloodCell {
  ring: AegisCoordinate[];
  depthM: number;
  velocityMps: number;
  riskLevel: string;
  phase: string;
}

interface BoundaryEdge {
  id: string;
  a: AegisCoordinate;
  b: AegisCoordinate;
  aKey: string;
  bKey: string;
}

export const EMPTY_FEATURE_COLLECTION: AnyFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const EIT_RELOCATION_DELTA: AegisCoordinate = [
  EIT_FARIDABAD[0] - LEGACY_EIT_SCENARIO_CENTER[0],
  EIT_FARIDABAD[1] - LEGACY_EIT_SCENARIO_CENTER[1],
];

function isLegacyEitCoordinate(coordinate: Position): boolean {
  return (
    Math.abs(coordinate[0] - LEGACY_EIT_SCENARIO_CENTER[0]) < 0.055 &&
    Math.abs(coordinate[1] - LEGACY_EIT_SCENARIO_CENTER[1]) < 0.055
  );
}

function firstCoordinate(value: unknown): Position | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    return value as Position;
  }
  for (const child of value) {
    const coordinate = firstCoordinate(child);
    if (coordinate) return coordinate;
  }
  return null;
}

function translateCoordinates(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    const position = value as Position;
    return [
      position[0] + EIT_RELOCATION_DELTA[0],
      position[1] + EIT_RELOCATION_DELTA[1],
      ...position.slice(2),
    ];
  }
  return value.map(translateCoordinates);
}

function translateGeometry<G extends Geometry>(geometry: G): G {
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map((child) => translateGeometry(child)),
    } as G;
  }
  return {
    ...geometry,
    coordinates: translateCoordinates(geometry.coordinates),
  } as G;
}

/**
 * Aligns the bundled coarse EIT scenario to the official campus map center.
 * Non-EIT collections are returned by reference without cloning.
 */
export function relocateLegacyEitCollection<G extends Geometry, P>(
  collection: FeatureCollection<G, P> | undefined,
): FeatureCollection<G, P> | undefined {
  if (!collection?.features.length) return collection;
  const first = collection.features
    .map((feature) => feature.geometry.type === "GeometryCollection"
      ? firstCoordinate(feature.geometry.geometries.map((geometry) =>
          geometry.type === "GeometryCollection" ? [] : geometry.coordinates))
      : firstCoordinate(feature.geometry.coordinates))
    .find((coordinate): coordinate is Position => Boolean(coordinate));
  if (!first || !isLegacyEitCoordinate(first)) return collection;
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: translateGeometry(feature.geometry),
    })),
  };
}

function coordinateKey(coordinate: Position): string {
  return `${Number(coordinate[0]).toFixed(7)},${Number(coordinate[1]).toFixed(7)}`;
}

function edgeKey(a: Position, b: Position): string {
  const aKey = coordinateKey(a);
  const bKey = coordinateKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function toCoordinate(position: Position): AegisCoordinate {
  return [Number(position[0]), Number(position[1])];
}

function openRing(ring: Position[]): AegisCoordinate[] {
  const coordinates = ring.map(toCoordinate);
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    coordinates.pop();
  }
  return coordinates;
}

function closeRing(ring: AegisCoordinate[]): AegisCoordinate[] {
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring.at(-1)!;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function polygonArea(ring: AegisCoordinate[]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function ringCentroid(ring: AegisCoordinate[]): AegisCoordinate {
  if (!ring.length) return [0, 0];
  let longitude = 0;
  let latitude = 0;
  const limit = ring.length > 1 && coordinateKey(ring[0]) === coordinateKey(ring.at(-1)!)
    ? ring.length - 1
    : ring.length;
  for (let index = 0; index < limit; index += 1) {
    longitude += ring[index][0];
    latitude += ring[index][1];
  }
  return [longitude / Math.max(1, limit), latitude / Math.max(1, limit)];
}

function chaikinSmooth(input: AegisCoordinate[], iterations = 2): AegisCoordinate[] {
  let ring = closeRing(input);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const open = ring.slice(0, -1);
    if (open.length < 4) return ring;
    const next: AegisCoordinate[] = [];
    for (let index = 0; index < open.length; index += 1) {
      const current = open[index];
      const following = open[(index + 1) % open.length];
      next.push([
        current[0] * 0.76 + following[0] * 0.24,
        current[1] * 0.76 + following[1] * 0.24,
      ]);
      next.push([
        current[0] * 0.24 + following[0] * 0.76,
        current[1] * 0.24 + following[1] * 0.76,
      ]);
    }
    ring = closeRing(next);
  }
  return ring;
}

function convexHull(points: AegisCoordinate[]): AegisCoordinate[] {
  const unique = [...new Map(points.map((point) => [coordinateKey(point), point])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 4) return closeRing(unique);
  const cross = (origin: AegisCoordinate, a: AegisCoordinate, b: AegisCoordinate) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) -
    (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower: AegisCoordinate[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: AegisCoordinate[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return closeRing([...lower, ...upper]);
}

function cellsFromFlood(
  collection: FeatureCollection<Polygon | MultiPolygon> | undefined,
): FloodCell[] {
  if (!collection) return [];
  const cells: FloodCell[] = [];
  for (const feature of collection.features) {
    const properties = feature.properties ?? {};
    const depthM = Number(properties.depthM ?? properties.depth ?? 0);
    if (!Number.isFinite(depthM) || depthM <= 0) continue;
    const velocityMps = Number(properties.velocityMps ?? properties.velocity ?? 0);
    const riskLevel = String(properties.riskLevel ?? "moderate");
    const phase = String(properties.phase ?? "active");
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    for (const polygon of polygons) {
      const ring = openRing(polygon[0] ?? []);
      if (ring.length >= 3) cells.push({ ring, depthM, velocityMps, riskLevel, phase });
    }
  }
  return cells;
}

function connectedCellGroups(cells: FloodCell[]): number[][] {
  const ownersByEdge = new Map<string, number[]>();
  cells.forEach((cell, cellIndex) => {
    cell.ring.forEach((coordinate, index) => {
      const next = cell.ring[(index + 1) % cell.ring.length];
      const key = edgeKey(coordinate, next);
      const owners = ownersByEdge.get(key) ?? [];
      owners.push(cellIndex);
      ownersByEdge.set(key, owners);
    });
  });

  const neighbors = cells.map(() => new Set<number>());
  ownersByEdge.forEach((owners) => {
    if (owners.length < 2) return;
    for (let first = 0; first < owners.length; first += 1) {
      for (let second = first + 1; second < owners.length; second += 1) {
        neighbors[owners[first]].add(owners[second]);
        neighbors[owners[second]].add(owners[first]);
      }
    }
  });

  const visited = new Set<number>();
  const groups: number[][] = [];
  cells.forEach((_, start) => {
    if (visited.has(start)) return;
    const group: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      neighbors[current].forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    groups.push(group);
  });
  return groups;
}

function boundaryLoops(cells: FloodCell[], indexes: number[]): AegisCoordinate[][] {
  const boundary = new Map<string, BoundaryEdge>();
  for (const index of indexes) {
    const ring = cells[index].ring;
    ring.forEach((a, edgeIndex) => {
      const b = ring[(edgeIndex + 1) % ring.length];
      const key = edgeKey(a, b);
      if (boundary.has(key)) {
        boundary.delete(key);
      } else {
        boundary.set(key, {
          id: key,
          a,
          b,
          aKey: coordinateKey(a),
          bKey: coordinateKey(b),
        });
      }
    });
  }

  const edgesAtPoint = new Map<string, BoundaryEdge[]>();
  boundary.forEach((edge) => {
    edgesAtPoint.set(edge.aKey, [...(edgesAtPoint.get(edge.aKey) ?? []), edge]);
    edgesAtPoint.set(edge.bKey, [...(edgesAtPoint.get(edge.bKey) ?? []), edge]);
  });

  const unused = new Set(boundary.keys());
  const loops: AegisCoordinate[][] = [];
  while (unused.size) {
    const firstId = unused.values().next().value as string;
    const firstEdge = boundary.get(firstId)!;
    unused.delete(firstId);
    const loop: AegisCoordinate[] = [firstEdge.a, firstEdge.b];
    const startKey = firstEdge.aKey;
    let currentKey = firstEdge.bKey;

    while (currentKey !== startKey && loop.length <= boundary.size + 2) {
      const candidates = edgesAtPoint.get(currentKey) ?? [];
      const nextEdge = candidates.find((edge) => unused.has(edge.id));
      if (!nextEdge) break;
      unused.delete(nextEdge.id);
      if (nextEdge.aKey === currentKey) {
        loop.push(nextEdge.b);
        currentKey = nextEdge.bKey;
      } else {
        loop.push(nextEdge.a);
        currentKey = nextEdge.aKey;
      }
    }
    if (currentKey === startKey && loop.length >= 4) {
      loops.push(closeRing(loop));
    }
  }
  return loops;
}

function severityRank(value: string): number {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "moderate") return 2;
  return 1;
}

export function prepareFloodVisuals(
  collection: FeatureCollection<Polygon | MultiPolygon> | undefined,
): FloodVisualData {
  const cells = cellsFromFlood(collection);
  if (!cells.length) {
    return {
      surface: { type: "FeatureCollection", features: [] },
      samples: { type: "FeatureCollection", features: [] },
      maximumDepthM: 0,
      averageDepthM: 0,
      wetCellCount: 0,
    };
  }

  let maximumDepthM = 0;
  let depthTotal = 0;
  const samples: Array<Feature<Point, FloodSampleProperties>> = [];
  cells.forEach((cell, index) => {
    maximumDepthM = Math.max(maximumDepthM, cell.depthM);
    depthTotal += cell.depthM;
    samples.push({
      type: "Feature",
      id: `water-sample-${index}`,
      geometry: { type: "Point", coordinates: ringCentroid(cell.ring) },
      properties: {
        depthM: cell.depthM,
        velocityMps: cell.velocityMps,
        riskLevel: cell.riskLevel,
      },
    });
  });

  const surfaceFeatures: Array<Feature<Polygon, FloodSurfaceProperties>> = [];
  connectedCellGroups(cells).forEach((group, groupIndex) => {
    const groupCells = group.map((index) => cells[index]);
    const loops = boundaryLoops(cells, group);
    const outer = loops.reduce<AegisCoordinate[] | null>((largest, loop) => {
      if (!largest || Math.abs(polygonArea(loop)) > Math.abs(polygonArea(largest))) return loop;
      return largest;
    }, null) ?? convexHull(groupCells.flatMap((cell) => cell.ring));
    if (outer.length < 4) return;

    let depthSum = 0;
    let groupMaximum = 0;
    let groupMinimum = Number.POSITIVE_INFINITY;
    let maximumVelocity = 0;
    let riskLevel = "low";
    let phase = "active";
    groupCells.forEach((cell) => {
      depthSum += cell.depthM;
      groupMaximum = Math.max(groupMaximum, cell.depthM);
      groupMinimum = Math.min(groupMinimum, cell.depthM);
      maximumVelocity = Math.max(maximumVelocity, cell.velocityMps);
      if (severityRank(cell.riskLevel) > severityRank(riskLevel)) riskLevel = cell.riskLevel;
      if (cell.depthM === groupMaximum) phase = cell.phase;
    });

    const meanDepth = depthSum / groupCells.length;
    surfaceFeatures.push({
      type: "Feature",
      id: `continuous-water-${groupIndex}`,
      geometry: {
        type: "Polygon",
        coordinates: [chaikinSmooth(outer, outer.length > 10 ? 2 : 1)],
      },
      properties: {
        name: `Continuous flood surface ${groupIndex + 1}`,
        depthM: Math.min(groupMaximum, meanDepth * 1.24),
        maximumDepthM: groupMaximum,
        minimumDepthM: Number.isFinite(groupMinimum) ? groupMinimum : 0,
        velocityMps: maximumVelocity,
        wetCellCount: groupCells.length,
        riskLevel,
        phase,
        visualGeometry: "Smoothed connected shoreline derived from simulation cells",
      },
    });
  });

  return {
    surface: { type: "FeatureCollection", features: surfaceFeatures },
    samples: { type: "FeatureCollection", features: samples },
    maximumDepthM,
    averageDepthM: depthTotal / cells.length,
    wetCellCount: cells.length,
  };
}

export function polygonCollectionToPoints(
  collection: FeatureCollection<Polygon | MultiPolygon> | undefined,
): AnyFeatureCollection {
  if (!collection) return EMPTY_FEATURE_COLLECTION;
  const features: Array<Feature<Point, GeoJsonProperties>> = [];
  collection.features.forEach((feature, index) => {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    polygons.forEach((polygon, polygonIndex) => {
      const ring = openRing(polygon[0] ?? []);
      if (!ring.length) return;
      features.push({
        type: "Feature",
        id: `${String(feature.id ?? index)}-${polygonIndex}`,
        geometry: { type: "Point", coordinates: ringCentroid(ring) },
        properties: { ...(feature.properties ?? {}) },
      });
    });
  });
  return { type: "FeatureCollection", features };
}

export function incidentsToGeoJSON(incidents: AegisIncident[]): AnyFeatureCollection {
  return {
    type: "FeatureCollection",
    features: incidents.map((incident) => ({
      type: "Feature",
      id: incident.id,
      geometry: { type: "Point", coordinates: incident.coordinates },
      properties: {
        id: incident.id,
        title: incident.title,
        type: incident.type,
        severity: incident.severity,
        live: incident.live ?? false,
        status: incident.status ?? "active",
        occurredAt: incident.occurredAt ?? "",
        description: incident.description ?? "",
        source: incident.source ?? "",
      },
    })),
  };
}

export function externalOverlaysToGeoJSON(
  overlays: AegisExternalOverlay[],
  coordinateOverrides: ReadonlyMap<string, AegisCoordinate> = new Map(),
): AnyFeatureCollection {
  return {
    type: "FeatureCollection",
    features: overlays.map((overlay) => ({
      type: "Feature",
      id: overlay.id,
      geometry: {
        type: "Point",
        coordinates: coordinateOverrides.get(overlay.id) ?? overlay.coordinates,
      },
      properties: {
        id: overlay.id,
        label: overlay.label,
        kind: overlay.kind ?? "custom",
        status: overlay.status ?? "active",
        color: overlay.color ?? "#70e6f7",
        draggable: overlay.draggable ?? false,
        ...(overlay.properties ?? {}),
      },
    })),
  };
}

export function selectionToGeoJSON(
  selection: AegisMapSelection,
  draftArea: AegisCoordinate[],
): AnyFeatureCollection {
  const features: Array<Feature<Geometry, GeoJsonProperties>> = selection.points.map(
    (point) => ({
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: point.coordinates },
      properties: {
        id: point.id,
        role: point.role,
        label: point.label ?? (
          point.role === "origin"
            ? "EVAC ORIGIN"
            : point.role === "destination"
              ? "SAFE POINT"
              : point.role === "hazard-source"
                ? "FLOOD SOURCE"
                : "WAYPOINT"
        ),
      },
    }),
  );
  if (selection.area) features.push(selection.area);
  if (draftArea.length > 1) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: draftArea },
      properties: { draft: true },
    });
  }
  draftArea.forEach((coordinates, index) => {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { draft: true, label: String(index + 1) },
    });
  });
  return { type: "FeatureCollection", features };
}

function lineCoordinates(
  geometry: LineString | MultiLineString,
): Position[][] {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

function coordinateAlongLine(coordinates: Position[], progress: number): AegisCoordinate {
  if (coordinates.length < 2) return toCoordinate(coordinates[0] ?? [0, 0]);
  const lengths: number[] = [];
  let total = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const latitude = (coordinates[index][1] + coordinates[index + 1][1]) / 2;
    const longitudeScale = Math.cos(latitude * Math.PI / 180);
    const dx = (coordinates[index + 1][0] - coordinates[index][0]) * longitudeScale;
    const dy = coordinates[index + 1][1] - coordinates[index][1];
    const length = Math.hypot(dx, dy);
    lengths.push(length);
    total += length;
  }
  let target = (((progress % 1) + 1) % 1) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index] || index === lengths.length - 1) {
      const ratio = lengths[index] <= 0 ? 0 : target / lengths[index];
      return [
        coordinates[index][0] + (coordinates[index + 1][0] - coordinates[index][0]) * ratio,
        coordinates[index][1] + (coordinates[index + 1][1] - coordinates[index][1]) * ratio,
      ];
    }
    target -= lengths[index];
  }
  return toCoordinate(coordinates.at(-1)!);
}

export function buildRouteMovers(
  routes: FeatureCollection<LineString | MultiLineString> | undefined,
  progress: number,
): AnyFeatureCollection {
  if (!routes) return EMPTY_FEATURE_COLLECTION;
  const features: Array<Feature<Point, GeoJsonProperties>> = [];
  routes.features.forEach((feature, routeIndex) => {
    lineCoordinates(feature.geometry).forEach((line, lineIndex) => {
      if (line.length < 2) return;
      for (let moverIndex = 0; moverIndex < 2; moverIndex += 1) {
        features.push({
          type: "Feature",
          id: `route-mover-${routeIndex}-${lineIndex}-${moverIndex}`,
          geometry: {
            type: "Point",
            coordinates: coordinateAlongLine(
              line,
              progress + moverIndex * 0.43 + routeIndex * 0.17,
            ),
          },
          properties: {
            routeId: feature.id ?? routeIndex,
            status: feature.properties?.status ?? "safe",
            type: moverIndex === 0 ? "lead" : "support",
          },
        });
      }
    });
  });
  return { type: "FeatureCollection", features };
}

export function closePolygon(points: AegisCoordinate[]): Position[] {
  return closeRing(points);
}
