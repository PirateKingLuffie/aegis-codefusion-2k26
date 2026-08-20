const GRID_SIZE = 7;
const SPACING_METERS = 90;

function finiteCoordinate(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const latitude = finiteCoordinate(url.searchParams.get("lat"), -84, 84);
  const longitude = finiteCoordinate(url.searchParams.get("lon"), -180, 180);
  if (latitude === null || longitude === null) {
    return Response.json({ error: "Valid lat and lon parameters are required." }, { status: 400 });
  }

  const points = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    const eastM = (column - Math.floor(GRID_SIZE / 2)) * SPACING_METERS;
    const northM = (Math.floor(GRID_SIZE / 2) - row) * SPACING_METERS;
    return {
      row,
      column,
      lat: latitude + northM / 111_320,
      lon: longitude + eastM / (111_320 * Math.cos(latitude * Math.PI / 180)),
    };
  });
  const upstream = new URL("https://api.open-meteo.com/v1/elevation");
  upstream.searchParams.set("latitude", points.map((point) => point.lat.toFixed(7)).join(","));
  upstream.searchParams.set("longitude", points.map((point) => point.lon.toFixed(7)).join(","));

  try {
    const response = await fetch(upstream, {
      signal: AbortSignal.timeout(7_000),
      headers: { Accept: "application/json", "User-Agent": "AEGIS-Geospatial-Decision-Support/1.0" },
    });
    if (!response.ok) throw new Error(`Elevation provider returned ${response.status}`);
    const payload = await response.json() as { elevation?: unknown };
    if (!Array.isArray(payload.elevation) || payload.elevation.length !== points.length) {
      throw new Error("Elevation provider returned an incomplete grid");
    }
    const elevations = payload.elevation.map(Number);
    if (elevations.some((value) => !Number.isFinite(value))) {
      throw new Error("Elevation provider returned invalid values");
    }
    const minimum = Math.min(...elevations);
    const maximum = Math.max(...elevations);
    const range = Math.max(0.1, maximum - minimum);
    const retrievedAt = new Date().toISOString();
    const terrainControlPoints = points.map((point, index) => ({
      id: `copernicus-dem-${point.row}-${point.column}`,
      coordinate: { lat: point.lat, lon: point.lon },
      elevationM: elevations[index],
      // GLO-90 does not supply these campus-scale attributes. They remain
      // explicit planning estimates while the elevation itself is imported.
      roughness: 0.03,
      drainageIndex: Number((0.25 + (maximum - elevations[index]) / range * 0.65).toFixed(3)),
      provenance: {
        classification: "IMPORTED" as const,
        sourceId: "open-meteo-copernicus-dem-glo90",
        sourceLabel: "Open-Meteo Elevation API · Copernicus DEM GLO-90",
        sourceUrl: "https://open-meteo.com/en/docs/elevation-api",
        observedAtIso: retrievedAt,
        license: "Copernicus DEM 2021 GLO-90; attribution required",
        note: "Elevation is imported at 90 m resolution. Roughness and drainage index are derived planning estimates, not a campus survey.",
      },
    }));
    return Response.json({
      source: "Open-Meteo Elevation API · Copernicus DEM 2021 GLO-90",
      dataClass: "IMPORTED_ELEVATION_WITH_DERIVED_ATTRIBUTES",
      resolutionMeters: 90,
      retrievedAt,
      center: { lat: latitude, lon: longitude },
      terrainControlPoints,
      notice: "Global 90 m DEM context is not a campus survey and cannot resolve drains, kerbs, floors or local flow barriers.",
    }, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    return Response.json({
      source: "Open-Meteo Elevation API",
      dataClass: "UNAVAILABLE",
      terrainControlPoints: [],
      notice: error instanceof Error ? error.message : "Elevation context unavailable.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
