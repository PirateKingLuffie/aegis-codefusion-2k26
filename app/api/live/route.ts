import { aggregateLiveIntelligence, parseLiveOptions } from "@/lib/live";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=900",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  try {
    const response = await aggregateLiveIntelligence(parseLiveOptions(request.url));
    return Response.json(response, {
      headers: {
        ...RESPONSE_HEADERS,
        "X-AEGIS-Data-Mode": response.mode,
      },
    });
  } catch {
    return Response.json(
      {
        error: "Live intelligence could not be assembled.",
        generatedAt: new Date().toISOString(),
        status: "degraded",
      },
      { status: 500, headers: { ...RESPONSE_HEADERS, "Cache-Control": "no-store" } }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
}
