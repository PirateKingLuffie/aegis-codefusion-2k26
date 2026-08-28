import { z } from "zod";
import type { AutomationEvaluationInput } from "./types";

const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const geometrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("circle"),
    center: coordinateSchema,
    radiusKm: z.number().finite().min(0.1).max(20_000),
  }).strict(),
  z.object({
    kind: z.literal("bounds"),
    west: z.number().finite().min(-180).max(180),
    south: z.number().finite().min(-90).max(90),
    east: z.number().finite().min(-180).max(180),
    north: z.number().finite().min(-90).max(90),
  }).strict(),
]);

const severitySchema = z.enum(["low", "medium", "high", "critical"]);
const categorySchema = z.enum([
  "flood",
  "earthquake",
  "wildfire",
  "cyclone",
  "severe-storm",
  "volcano",
  "landslide",
  "drought",
  "extreme-temperature",
  "industrial",
  "humanitarian",
  "other",
]);

export const automationRegionSchema = z.object({
  id: z.string().trim().min(1).max(96),
  name: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
  geometry: geometrySchema,
  hazards: z.array(categorySchema).max(12).default([]),
  minimumSeverity: severitySchema.default("medium"),
  maxAgeMinutes: z.number().finite().min(1).max(7 * 24 * 60).default(24 * 60),
  cooldownMinutes: z.number().finite().min(1).max(7 * 24 * 60).default(60),
}).strict();

export const automationPolicySchema = z.object({
  requireOfficialSource: z.boolean().optional(),
  maxAgeMinutes: z.number().finite().min(1).max(7 * 24 * 60).optional(),
  maxRetrievalAgeMinutes: z.number().finite().min(1).max(24 * 60).optional(),
  maxRegions: z.number().int().min(1).max(32).optional(),
  maxIncidents: z.number().int().min(1).max(500).optional(),
}).strict();

const receiptSchema = z.object({
  dedupeKey: z.string().trim().min(1).max(240),
  regionId: z.string().trim().min(1).max(96),
  incidentId: z.string().trim().min(1).max(160),
  sourceId: z.string().trim().min(1).max(96),
  fingerprint: z.string().max(64),
  severity: z.enum(["unknown", "low", "medium", "high", "critical"]),
  firstSeenAt: z.string().max(80),
  lastSeenAt: z.string().max(80),
  lastProposedAt: z.string().max(80).optional(),
  lastAlertId: z.string().max(160).optional(),
}).strict();

/**
 * Deliberately validates only the stable incident envelope. Extra provider
 * fields are retained by passthrough and are never executed as code.
 */
export const automationIncidentSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().max(400),
  summary: z.string().max(2_000),
  category: categorySchema,
  severity: z.enum(["critical", "high", "medium", "low", "unknown"]),
  state: z.enum(["active", "monitoring", "closed", "unknown"]),
  reality: z.enum(["observed", "simulated"]),
  dataMode: z.enum(["near-real-time", "recent-report", "cached-source-snapshot", "simulated-demo"]),
  observedAt: z.string().max(80).optional(),
  updatedAt: z.string().max(80).optional(),
  freshness: z.object({
    band: z.string().max(40),
    label: z.string().max(120),
    observedAt: z.string().max(80).optional(),
    retrievedAt: z.string().max(80),
    ageMinutes: z.number().finite().optional(),
  }).passthrough(),
  location: z.object({
    name: z.string().max(240),
    country: z.string().max(120).optional(),
    countryCode: z.string().max(8).optional(),
    coordinates: coordinateSchema.optional(),
  }).passthrough(),
  links: z.array(z.object({ url: z.string().max(2_000) }).passthrough()).max(32),
  provenance: z.object({
    sourceId: z.string().max(120),
    sourceName: z.string().max(240),
    dataset: z.string().max(300),
    retrievedAt: z.string().max(80),
    publishedAt: z.string().max(80).optional(),
    status: z.string().max(40),
  }).passthrough(),
  tags: z.array(z.string().max(80)).max(64),
}).passthrough();

export const automationRequestSchema = z.object({
  mode: z.enum(["live", "demo"]).default("live"),
  regions: z.array(automationRegionSchema).min(1).max(32).optional(),
  policy: automationPolicySchema.optional(),
  previousReceipts: z.array(receiptSchema).max(512).optional(),
  incidents: z.array(automationIncidentSchema).max(500).optional(),
}).strict();

export type AutomationRequest = z.infer<typeof automationRequestSchema>;

export function requestToEvaluationInput(
  request: AutomationRequest,
  incidents: AutomationEvaluationInput["incidents"],
  regions: AutomationEvaluationInput["regions"],
): AutomationEvaluationInput {
  return {
    mode: request.mode,
    policy: request.policy,
    previousReceipts: request.previousReceipts,
    incidents,
    regions,
  };
}
