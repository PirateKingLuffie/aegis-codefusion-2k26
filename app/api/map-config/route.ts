export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      preferredProvider: "openfreemap-dark",
      fallbackProvider: "carto-dark",
      operatingMode: "online-first",
      mode: "ZERO_COST_3D_GLOBE",
      terrainProvider: "Public Terrarium Terrain-RGB / SRTM-derived elevation tiles",
      buildings: "Vector-tile extrusion plus imported OSM EIT footprints",
      notice: "OpenFreeMap is primary and CARTO is the independent free fallback. No browser API key is exposed.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
