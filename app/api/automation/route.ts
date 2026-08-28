import { aggregateLiveIntelligence, getOfflineScenarioPreviews } from "@/lib/live";
import {
  AUTOMATION_CAPABILITIES,
  DEFAULT_AUTOMATION_REGIONS,
  evaluateAutomation,
  automationRequestSchema,
  requestToEvaluationInput,
} from "@/lib/automation";
import type { LiveIncident } from "@/lib/live/types";

export const runtime = "nodejs";

const HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

function rateLimitResponse(request: Request) {
  const now = Date.now();
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = (forwarded || "unknown-client").slice(0, 96);
  const existing = rateWindows.get(client);
  const entry = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + RATE_WINDOW_MS } : existing;
  entry.count += 1;
  rateWindows.set(client, entry);
  if (rateWindows.size > 2_000) {
    for (const [key, value] of rateWindows) if (value.resetAt <= now) rateWindows.delete(key);
  }
  if (entry.count <= RATE_LIMIT) return undefined;
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
  return json({ error: "Automation evaluation rate limit exceeded." }, 429, { "Retry-After": String(retryAfterSeconds) });
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...HEADERS, ...headers } });
}

async function boundedJson(request: Request) {
  const raw = await request.text();
  if (raw.length > 768_000) throw new RangeError("Automation request exceeds the 768 KB limit.");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

export async function GET() {
  return json({
    apiVersion: "2026-08-29",
    capabilities: AUTOMATION_CAPABILITIES,
    defaultPolicy: {
      requireOfficialSource: true,
      maxAgeMinutes: 24 * 60,
      maxRetrievalAgeMinutes: 45,
      maxRegions: AUTOMATION_CAPABILITIES.maxRegions,
      maxIncidents: AUTOMATION_CAPABILITIES.maxIncidents,
    },
    defaultRegions: DEFAULT_AUTOMATION_REGIONS,
    notice: "This endpoint describes and evaluates watches; it does not register a server-side subscription or send notifications.",
  }, 200, { "Cache-Control": "public, max-age=60, s-maxage=300" });
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  let parsedBody: ReturnType<typeof automationRequestSchema.parse>;
  try {
    parsedBody = automationRequestSchema.parse(await boundedJson(request));
  } catch (error) {
    if (error instanceof RangeError) return json({ error: error.message }, 413);
    if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON." }, 400);
    const issues = error && typeof error === "object" && "issues" in error ? (error as { issues: unknown }).issues : undefined;
    return json({ error: "Automation request validation failed.", issues }, 422);
  }

  if (parsedBody.mode === "live" && parsedBody.incidents) {
    return json({
      error: "Caller-supplied incidents are accepted only in demo mode.",
      notice: "Live mode obtains observed records from the configured public feed adapters.",
    }, 422);
  }

  const now = new Date();
  let incidents: LiveIncident[];
  let feedSources;
  try {
    if (parsedBody.mode === "live") {
      const feed = await aggregateLiveIntelligence({
        limitPerSource: 15,
        eonetDays: 30,
        includeMedia: false,
      });
      incidents = feed.incidents;
      feedSources = feed.sources.map((source) => ({
        sourceId: source.id,
        sourceName: source.name,
        recordCount: source.recordCount,
        retrievedAt: source.retrievedAt,
        status: source.status,
      }));
    } else {
      incidents = parsedBody.incidents
        ? (parsedBody.incidents as unknown as LiveIncident[])
        : getOfflineScenarioPreviews(now.toISOString());
      feedSources = undefined;
    }
  } catch (error) {
    return json({
      error: "Automation feed could not be assembled.",
      detail: error instanceof Error ? error.message : "Unknown feed error.",
    }, 503);
  }

  const evaluation = evaluateAutomation(requestToEvaluationInput(
    parsedBody,
    incidents,
    parsedBody.regions ?? DEFAULT_AUTOMATION_REGIONS,
    feedSources,
  ));
  return json({
    apiVersion: "2026-08-29",
    ...evaluation,
    sources: feedSources ?? evaluation.sources,
    notificationDispatch: {
      enabled: false,
      attempted: false,
      reason: "Dry-run endpoint; no external notification provider is configured or called.",
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
