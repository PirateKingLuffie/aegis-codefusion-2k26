type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { type: "LineString"; coordinates: number[][] };
};

function coordinate(value: string | null): [number, number] | null {
  if (!value) return null;
  const values = value.split(",").map(Number);
  if (values.length !== 2 || values.some((item) => !Number.isFinite(item))) return null;
  const [longitude, latitude] = values;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [longitude, latitude];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = coordinate(url.searchParams.get("origin"));
  const destination = coordinate(url.searchParams.get("destination"));
  const requestedMode = url.searchParams.get("mode") ?? "car";
  if (!["pedestrian", "car", "bus", "ambulance", "heavy_rescue"].includes(requestedMode)) {
    return Response.json({ error: "Unsupported movement mode." }, { status: 400 });
  }
  if (!origin || !destination) {
    return Response.json({ error: "Valid origin and destination are required as longitude,latitude." }, { status: 400 });
  }

  const upstream = new URL(
    `https://router.project-osrm.org/route/v1/driving/${origin.join(",")};${destination.join(",")}`,
  );
  upstream.searchParams.set("overview", "full");
  upstream.searchParams.set("geometries", "geojson");
  upstream.searchParams.set("steps", "true");
  upstream.searchParams.set("alternatives", "true");

  try {
    const response = await fetch(upstream, {
      headers: { "User-Agent": "AEGIS-Emergency-Planning-Prototype/0.1" },
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) throw new Error("Routing provider unavailable");
    const payload = await response.json() as { code: string; routes?: OsrmRoute[] };
    if (payload.code !== "Ok" || !payload.routes?.length) throw new Error("No drivable route found");
    return Response.json({
      source: "OSRM · OpenStreetMap road network",
      dataClass: "IMPORTED",
      requestedMode,
      providerProfile: "driving",
      routes: payload.routes.slice(0, 3).map((route, index) => ({
        type: "Feature",
        id: `live-road-route-${index + 1}`,
        geometry: route.geometry,
        properties: {
          name: index === 0 ? "Shortest live-road candidate" : `Live-road candidate ${index + 1}`,
          status: "candidate",
          routeType: index === 0 ? "shortest-candidate" : "alternate-candidate",
          distanceKm: Number((route.distance / 1_000).toFixed(2)),
          etaMinutes: Math.ceil(route.duration / 60),
          evidenceClass: "IMPORTED",
          geometryEvidenceClass: "IMPORTED · OSRM/OPENSTREETMAP",
          hazardScreening: "NOT_APPLIED",
          notice: "Candidate geometry only. AEGIS must screen it against the selected simulation minute before presenting it as an evacuation option.",
          requestedMode,
        },
      })),
    }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch {
    return Response.json({
      source: "OSRM · OpenStreetMap road network",
      dataClass: "UNAVAILABLE",
      routes: [],
      notice: "Live-road routing is unavailable. The deterministic AEGIS route remains active.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
