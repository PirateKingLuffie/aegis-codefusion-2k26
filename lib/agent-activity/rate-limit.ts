const WINDOW_MS = 60_000;
const POST_LIMIT = 10;
const MAX_BUCKETS = 4_096;

type Bucket = { startedAt: number; count: number };
type RateLimitGlobal = typeof globalThis & { __aegisAgentRateLimits?: Map<string, Bucket> };

export type AgentRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

function buckets(): Map<string, Bucket> {
  const shared = globalThis as RateLimitGlobal;
  shared.__aegisAgentRateLimits ??= new Map<string, Bucket>();
  return shared.__aegisAgentRateLimits;
}

function requestIdentity(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unidentified-client";
}

function prune(entries: Map<string, Bucket>, now: number): void {
  if (entries.size < MAX_BUCKETS) return;
  for (const [key, bucket] of entries) {
    if (now - bucket.startedAt >= WINDOW_MS) entries.delete(key);
  }
  if (entries.size < MAX_BUCKETS) return;
  const oldest = [...entries].sort((left, right) => left[1].startedAt - right[1].startedAt)[0];
  if (oldest) entries.delete(oldest[0]);
}

export function consumeAgentPostLimit(
  request: Request,
  now = Date.now(),
): AgentRateLimitResult {
  const entries = buckets();
  prune(entries, now);
  const key = requestIdentity(request);
  const existing = entries.get(key);
  const bucket = !existing || now - existing.startedAt >= WINDOW_MS
    ? { startedAt: now, count: 0 }
    : existing;
  bucket.count += 1;
  entries.set(key, bucket);
  return {
    allowed: bucket.count <= POST_LIMIT,
    limit: POST_LIMIT,
    remaining: Math.max(0, POST_LIMIT - bucket.count),
    resetAt: bucket.startedAt + WINDOW_MS,
  };
}

export function agentRateLimitHeaders(result: AgentRateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000)),
  };
}

export function clearAgentRateLimits(): void {
  buckets().clear();
}
