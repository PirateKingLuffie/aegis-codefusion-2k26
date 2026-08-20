const MAX_BODY_BYTES = 2_000_000;

function serviceUrl(path: string): URL | null {
  const base = process.env.AEGIS_OPERATIONS_API_URL?.trim().replace(/\/$/, "");
  return base ? new URL(`${base}${path}`) : null;
}

function browserStreamUrl(request: Request): string {
  const configuredBase = process.env.AEGIS_OPERATIONS_API_URL?.trim().replace(/\/$/, "");
  if (!configuredBase) return "";
  const configured = new URL(configuredBase);
  const loopback = configured.hostname === "127.0.0.1" || configured.hostname === "localhost";
  if (loopback) {
    configured.protocol = configured.protocol === "https:" ? "wss:" : "ws:";
    configured.pathname = "/api/v1/stream";
    configured.search = "";
    configured.hash = "";
    return configured.toString();
  }
  const publicOrigin = new URL(request.url);
  publicOrigin.protocol = publicOrigin.protocol === "https:" ? "wss:" : "ws:";
  publicOrigin.pathname = "/operations-api/api/v1/stream";
  publicOrigin.search = "";
  publicOrigin.hash = "";
  return publicOrigin.toString();
}

async function proxy(upstream: URL | null, init?: RequestInit): Promise<Response> {
  if (!upstream) {
    return Response.json({
      ready: false,
      persistence: "local-browser-only",
      notice: "No durable operations service is configured; browser-local scenario versions and receipts remain available.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const response = await fetch(upstream, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(3_500),
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-AEGIS-Persistence": response.ok ? "connected" : "degraded",
      },
    });
  } catch {
    return Response.json({
      ready: false,
      persistence: "local-browser-only",
      notice: "The durable operations service is not running. Local scenario versions and receipts remain available in this browser.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("mode") === "health") {
    const response = await proxy(serviceUrl("/health"));
    if (!response.ok) return response;
    const payload = await response.json() as Record<string, unknown>;
    return Response.json({
      ready: true,
      ...payload,
      streamPath: "/operations-api/api/v1/stream",
      streamUrl: browserStreamUrl(request),
    }, { headers: { "Cache-Control": "no-store" } });
  }
  const upstream = serviceUrl("/api/v1/records");
  if (!upstream) return proxy(null);
  for (const key of ["kind", "limit", "offset"]) {
    const value = url.searchParams.get(key);
    if (value) upstream.searchParams.set(key, value);
  }
  return proxy(upstream);
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Persistence payload exceeds 2 MB." }, { status: 413 });
  }
  try {
    JSON.parse(raw);
  } catch {
    return Response.json({ error: "Persistence payload must be valid JSON." }, { status: 400 });
  }
  return proxy(serviceUrl("/api/v1/records"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}
