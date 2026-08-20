import { z } from "zod";
import type {
  EvacuationRequest,
  HazardKind,
  ScenarioDefinition,
} from "../domain/types";
import {
  createEitFaridabadScenario,
  createLocationScenario,
} from "./index";

export const apiHazardSchema = z.enum([
  "flood",
  "earthquake",
  "wildfire",
  "cyclone",
  "chemical",
]);

export const apiCoordinateSchema = z.object({
  lat: z.number().finite().min(-84).max(84),
  lon: z.number().finite().min(-180).max(180),
}).strict();

const parameterValueSchema = z.union([
  z.number().finite(),
  z.string().trim().min(1).max(80),
  z.boolean(),
]);

const parameterOverridesSchema = z.record(
  z.string().trim().min(1).max(48),
  parameterValueSchema,
).refine((value) => Object.keys(value).length <= 16, {
  message: "At most 16 parameter overrides are accepted.",
});

const operatingAreaSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("polygon"),
    boundary: z.array(apiCoordinateSchema).min(3).max(128),
    label: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  z.object({
    kind: z.literal("bounds"),
    bounds: z.object({
      north: z.number().finite().min(-84).max(84),
      south: z.number().finite().min(-84).max(84),
      east: z.number().finite().min(-180).max(180),
      west: z.number().finite().min(-180).max(180),
    }).strict(),
    label: z.string().trim().min(1).max(120).optional(),
  }).strict(),
]);

export const apiScenarioSchema = z.object({
  hazard: apiHazardSchema.default("flood"),
  seed: z.string().trim().min(1).max(80).default("aegis-api-scenario-v1"),
  location: z.object({
    lat: z.number().finite().min(-84).max(84),
    lon: z.number().finite().min(-180).max(180),
    label: z.string().trim().min(1).max(120),
  }).strict().optional(),
  operatingArea: operatingAreaSchema.optional(),
  parameterOverrides: parameterOverridesSchema.optional(),
}).strict();

const endpointSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  coordinate: apiCoordinateSchema.optional(),
  nodeId: z.string().trim().min(1).max(80).optional(),
}).strict().refine((endpoint) => Boolean(endpoint.coordinate || endpoint.nodeId), {
  message: "Each endpoint requires a coordinate or nodeId.",
});

export const apiEvacuationOptionsSchema = z.object({
  startPoints: z.array(endpointSchema).max(8).optional(),
  endPoints: z.array(endpointSchema).max(8).optional(),
  departureMinute: z.number().finite().min(0).max(120).optional(),
  maxRoutesPerOrigin: z.number().int().min(1).max(4).optional(),
  stagedWindowMinutes: z.number().int().min(5).max(30).optional(),
  preferredMode: z.enum(["bus", "car", "pedestrian"]).optional(),
  includeHospitals: z.boolean().optional(),
  minimumRouteReliability: z.number().finite().min(0).max(1).optional(),
  maximumRouteRisk: z.number().finite().min(0).max(1).optional(),
  reserveShelterFraction: z.number().finite().min(0).max(0.5).optional(),
  routeCapacitySafetyFactor: z.number().finite().min(0.25).max(1).optional(),
  avoidRoadIds: z.array(z.string().trim().min(1).max(80)).max(64).optional(),
}).strict();

export const simulationApiRequestSchema = z.object({
  scenario: apiScenarioSchema.default({
    hazard: "flood",
    seed: "aegis-api-scenario-v1",
  }),
  selectedMinute: z.number().finite().min(0).max(120).default(0),
  includeField: z.boolean().default(false),
  includeMapLayers: z.boolean().default(true),
  includeImpactTimeline: z.boolean().default(false),
  maxImpactTimelinePoints: z.number().int().min(2).max(48).default(25),
  evacuation: z.union([z.literal(false), apiEvacuationOptionsSchema]).optional(),
}).strict();

export const evacuationApiRequestSchema = z.object({
  scenario: apiScenarioSchema.default({
    hazard: "flood",
    seed: "aegis-api-evacuation-v1",
  }),
  evacuation: apiEvacuationOptionsSchema.default({}),
  selectedMinute: z.number().finite().min(0).max(120).default(15),
  includeMapLayers: z.boolean().default(true),
}).strict();

type ScenarioApiInput = z.infer<typeof apiScenarioSchema>;

type NumericBounds = Record<string, readonly [minimum: number, maximum: number]>;

const NUMERIC_BOUNDS: Record<HazardKind, NumericBounds> = {
  flood: {
    rainfallMmPerHour: [0, 500],
    rainfallDurationMinutes: [1, 120],
    antecedentSaturation: [0, 1],
    drainageBlockageFraction: [0, 1],
    upstreamRiseM: [0, 10],
    sourceSpreadMPerMinute: [1, 500],
    recessionRate: [0, 1],
    initialWaterDepthM: [0, 5],
  },
  earthquake: {
    magnitudeMw: [0, 10],
    focalDepthKm: [0.1, 700],
    soilAmplification: [0.1, 3],
    aftershockFactor: [0, 1],
  },
  wildfire: {
    windSpeedKph: [0, 300],
    windDirectionDeg: [0, 360],
    relativeHumidityPct: [0, 100],
    fuelDryness: [0, 1],
    ignitionIntensity: [0, 1],
  },
  cyclone: {
    peakWindKph: [0, 400],
    trackDirectionDeg: [0, 360],
    forwardSpeedKph: [0, 100],
    centralPressureHpa: [850, 1_100],
    rainfallMmPerHour: [0, 500],
    coastalSurgeM: [0, 20],
  },
  chemical: {
    releaseKgPerMinute: [0.001, 10_000],
    releaseDurationMinutes: [1, 120],
    windSpeedKph: [0.1, 300],
    windDirectionDeg: [0, 360],
    toxicityThresholdMgM3: [0.0001, 1_000_000],
  },
};

export function validatedParameterOverrides(
  hazard: HazardKind,
  overrides?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> | undefined {
  if (!overrides) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const numericBounds = NUMERIC_BOUNDS[hazard][key];
    if (numericBounds) {
      if (typeof value !== "number" || value < numericBounds[0] || value > numericBounds[1]) {
        throw new Error(`${key} must be a number between ${numericBounds[0]} and ${numericBounds[1]} for ${hazard}.`);
      }
      result[key] = value;
      continue;
    }
    if (hazard === "chemical" && key === "materialName" && typeof value === "string") {
      result[key] = value;
      continue;
    }
    if (hazard === "chemical" && key === "atmosphericStability" &&
      typeof value === "string" && ["A", "B", "C", "D", "E", "F"].includes(value)) {
      result[key] = value;
      continue;
    }
    throw new Error(`Unsupported parameter override '${key}' for ${hazard}.`);
  }
  return result;
}

export function scenarioFromApi(input: ScenarioApiInput): ScenarioDefinition {
  const parameterOverrides = validatedParameterOverrides(input.hazard, input.parameterOverrides);
  if (input.location) {
    return createLocationScenario({
      hazard: input.hazard,
      center: { lat: input.location.lat, lon: input.location.lon },
      locationLabel: input.location.label,
      seed: input.seed,
      parameterOverrides,
      operatingArea: input.operatingArea
        ? input.operatingArea.kind === "polygon"
          ? {
              kind: "polygon",
              boundary: input.operatingArea.boundary.map((point) => ({ ...point })),
              label: input.operatingArea.label,
            }
          : {
              kind: "bounds",
              bounds: { ...input.operatingArea.bounds },
              label: input.operatingArea.label,
            }
        : undefined,
    });
  }
  return createEitFaridabadScenario(input.hazard, {
    seed: input.seed,
    parameterOverrides,
  });
}

export function evacuationRequestFromApi(
  input: z.infer<typeof apiEvacuationOptionsSchema>,
): EvacuationRequest {
  return {
    startPoints: input.startPoints?.map((point) => ({
      ...point,
      coordinate: point.coordinate ? { ...point.coordinate } : undefined,
    })),
    endPoints: input.endPoints?.map((point) => ({
      ...point,
      coordinate: point.coordinate ? { ...point.coordinate } : undefined,
    })),
    departureMinute: input.departureMinute,
    maxRoutesPerOrigin: input.maxRoutesPerOrigin,
    stagedWindowMinutes: input.stagedWindowMinutes,
    preferredMode: input.preferredMode,
    includeHospitals: input.includeHospitals,
    minimumRouteReliability: input.minimumRouteReliability,
    maximumRouteRisk: input.maximumRouteRisk,
    reserveShelterFraction: input.reserveShelterFraction,
    routeCapacitySafetyFactor: input.routeCapacitySafetyFactor,
    avoidRoadIds: input.avoidRoadIds ? [...new Set(input.avoidRoadIds)] : undefined,
  };
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = 64 * 1024,
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RangeError("Request body exceeds the 64 KiB limit.");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new RangeError("Request body exceeds the 64 KiB limit.");
  }
  if (!body.trim()) return {};
  return JSON.parse(body) as unknown;
}

export function validationIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.slice(0, 12).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
