import { searchIncidentMedia } from "@/lib/live";
import { clampInteger, sanitizeQuery } from "@/lib/live/utils";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=1800",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = sanitizeQuery(url.searchParams.get("q"), "Assam floods");
  const maxResults = clampInteger(url.searchParams.get("limit"), 1, 10, 5);
  const result = await searchIncidentMedia(query, maxResults);
  return Response.json(result, {
    headers: {
      ...RESPONSE_HEADERS,
      "X-AEGIS-Media-Mode": result.mode,
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
}
