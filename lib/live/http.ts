export class UpstreamHttpError extends Error {
  readonly status: number;
  readonly upstream: string;

  constructor(message: string, status: number, upstream: string) {
    super(message);
    this.name = "UpstreamHttpError";
    this.status = status;
    this.upstream = upstream;
  }
}

export interface FetchPayload<T> {
  data: T;
  retrievedAt: string;
  latencyMs: number;
}

async function fetchPayload(url: string, accept: string, timeoutMs: number) {
  const startedAt = Date.now();
  const boundedTimeoutMs = Math.max(500, Math.min(timeoutMs, 3_000));
  const maximumAttempts = 2;
  let finalError: UpstreamHttpError | null = null;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    const attemptTimeoutMs = attempt === 0 ? boundedTimeoutMs : Math.min(1_000, boundedTimeoutMs);
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: accept,
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) {
        finalError = new UpstreamHttpError(`Upstream returned HTTP ${response.status}`, response.status, url);
        if (response.status !== 429 && response.status < 500) throw finalError;
      } else {
        return {
          response,
          retrievedAt: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
        };
      }
    } catch (error) {
      if (error instanceof UpstreamHttpError) {
        finalError = error;
        if (error.status !== 429 && error.status < 500) throw error;
      } else if (error instanceof Error && error.name === "AbortError") {
        finalError = new UpstreamHttpError(`Upstream timed out after ${attemptTimeoutMs} ms`, 504, url);
      } else {
        finalError = new UpstreamHttpError(
          error instanceof Error ? error.message : "Upstream request failed",
          502,
          url,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < maximumAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw finalError ?? new UpstreamHttpError("Upstream request failed", 502, url);
}

export async function fetchJson<T>(url: string, timeoutMs = 6_000): Promise<FetchPayload<T>> {
  const { response, retrievedAt, latencyMs } = await fetchPayload(
    url,
    "application/json, application/geo+json;q=0.9",
    timeoutMs
  );
  const text = await response.text();
  try {
    return { data: JSON.parse(text) as T, retrievedAt, latencyMs };
  } catch {
    throw new UpstreamHttpError("Upstream returned invalid JSON", 502, url);
  }
}

export async function fetchText(url: string, timeoutMs = 6_000): Promise<FetchPayload<string>> {
  const { response, retrievedAt, latencyMs } = await fetchPayload(
    url,
    "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, text/plain;q=0.5",
    timeoutMs
  );
  return { data: await response.text(), retrievedAt, latencyMs };
}

export function publicErrorMessage(error: unknown) {
  if (error instanceof UpstreamHttpError) return error.message;
  return error instanceof Error ? error.message : "Unknown upstream error";
}
