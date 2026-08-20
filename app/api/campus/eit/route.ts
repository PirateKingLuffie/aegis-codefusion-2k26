import manifest from "@/datasets/faridabad/eit-authoritative-manifest.json";
import { EIT_OSM_BUILDINGS, EIT_OSM_CAPTURED_AT, EIT_OSM_ROADS } from "@/datasets/faridabad/eit-osm";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return Response.json({
    institution: manifest.institution,
    officialSources: manifest.officialSources,
    operationalDataStatus: manifest.operationalDataStatus,
    currentContext: {
      ...manifest.activePrototypeContext,
      osmSnapshotAt: EIT_OSM_CAPTURED_AT,
      importedFootprints: EIT_OSM_BUILDINGS.length,
      importedRoadWays: EIT_OSM_ROADS.length,
    },
    importTemplate: "/api/campus/eit/template",
    readiness: "PROTOTYPE_CONTEXT_ONLY",
    notice: "AEGIS will not invent a surveyed boundary, BIM, gate, drain, occupancy or utility record. A validated campus JSON import replaces the estimated twin at runtime.",
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
