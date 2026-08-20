import { z } from "zod";
import type { TwinCampusDataset } from "./types";

const finite = z.number().finite();
const coordinate = z.object({ lat: finite.min(-90).max(90), lon: finite.min(-180).max(180) }).strict();
const position = z.tuple([finite.min(-180).max(180), finite.min(-90).max(90)]);
const provenance = z.object({
  classification: z.enum(["OBSERVED", "IMPORTED", "ESTIMATED", "SIMULATED"]),
  sourceId: z.string().min(1).max(160),
  sourceLabel: z.string().min(1).max(240),
  sourceUrl: z.string().url().optional(),
  observedAtIso: z.string().datetime({ offset: true }).optional(),
  license: z.string().max(240).optional(),
  note: z.string().min(1).max(1_200),
}).strict();
const polygon = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(position).min(4)).min(1),
}).strict();
const point = z.object({ type: z.literal("Point"), coordinates: position }).strict();

const campusDatasetSchema = z.object({
  id: z.string().min(3).max(120),
  version: z.string().min(1).max(40),
  label: z.string().min(3).max(240),
  center: coordinate,
  bounds: z.object({ north: finite, south: finite, east: finite, west: finite }).strict(),
  buildings: z.array(z.object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(240),
    function: z.enum(["academic", "administration", "laboratory", "library", "auditorium", "workshop", "hostel", "dining", "sports", "utility", "unknown"]),
    footprint: polygon,
    centroid: coordinate,
    baseElevationM: finite,
    heightM: finite.positive().max(500),
    floors: z.number().int().positive().max(150),
    floorHeightM: finite.positive().max(20),
    plinthHeightM: finite.min(0).max(20),
    roofStyle: z.enum(["flat", "sawtooth", "barrel"]),
    vulnerability: finite.min(0).max(1),
    daytimeOccupancyEstimate: z.number().int().min(0).max(250_000),
    nighttimeOccupancyEstimate: z.number().int().min(0).max(250_000),
    facadeTone: z.string().min(1).max(80),
    provenance,
    attributeProvenance: provenance.optional(),
    footprintAreaM2: finite.positive().optional(),
    dataConfidence: z.object({
      geometry01: finite.min(0).max(1),
      height01: finite.min(0).max(1),
      occupancy01: finite.min(0).max(1),
    }).strict().optional(),
  }).strict()).max(5_000),
  terrainControlPoints: z.array(z.object({
    id: z.string().min(1).max(120),
    coordinate,
    elevationM: finite.min(-500).max(9_000),
    roughness: finite.min(0).max(5),
    drainageIndex: finite.min(0).max(1),
    provenance,
  }).strict()).max(50_000),
  landmarks: z.array(z.object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(240),
    kind: z.enum(["gate", "assembly-area", "sports-field", "water-body"]),
    geometry: z.union([point, polygon]),
    provenance,
  }).strict()).max(5_000),
  provenance: z.array(provenance).min(1).max(100),
  prototypeLabel: z.string().min(1).max(320),
  disclaimer: z.string().min(1).max(2_000),
}).strict().superRefine((value, context) => {
  if (value.bounds.north <= value.bounds.south || value.bounds.east <= value.bounds.west) {
    context.addIssue({ code: "custom", message: "Campus bounds must have north > south and east > west." });
  }
  const ids = new Set<string>();
  for (const entity of [...value.buildings, ...value.terrainControlPoints, ...value.landmarks]) {
    if (ids.has(entity.id)) context.addIssue({ code: "custom", message: `Duplicate campus entity id: ${entity.id}` });
    ids.add(entity.id);
  }
});

export type CampusImportResult =
  | { ok: true; dataset: TwinCampusDataset; summary: string }
  | { ok: false; issues: string[] };

export function parseTwinCampusDataset(value: unknown): CampusImportResult {
  const parsed = campusDatasetSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".") || "dataset"}: ${issue.message}`),
    };
  }
  const dataset = parsed.data as TwinCampusDataset;
  return {
    ok: true,
    dataset,
    summary: `${dataset.buildings.length} buildings · ${dataset.terrainControlPoints.length} terrain points · ${dataset.landmarks.length} landmarks`,
  };
}
