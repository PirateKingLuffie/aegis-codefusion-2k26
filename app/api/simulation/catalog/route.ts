import { getSimulationCatalog } from "@/lib/simulation";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    apiVersion: "2026-08-11",
    classification: "MODEL_CATALOG",
    persistence: "NONE",
    flagship: "flood",
    hazards: getSimulationCatalog(),
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" },
  });
}
