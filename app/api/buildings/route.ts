type OverpassWay = {
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function heightMeters(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2] === "ft" || match[2] === "feet" || match[2] === "'"
    ? amount * 0.3048
    : amount;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = boundedNumber(url.searchParams.get("lat"), 28.3912265, -90, 90);
  const longitude = boundedNumber(url.searchParams.get("lon"), 77.4398682, -180, 180);
  const radius = Math.round(boundedNumber(url.searchParams.get("radius"), 1_100, 250, 2_000));
  const query = `[out:json][timeout:18];way(around:${radius},${latitude},${longitude})["building"];out tags geom;`;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "AEGIS-Emergency-Planning-Prototype/0.1",
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Building footprint provider unavailable");
    const payload = await response.json() as { elements?: OverpassWay[] };
    const features = (payload.elements ?? []).flatMap((way) => {
      const geometry = way.geometry ?? [];
      if (geometry.length < 3) return [];
      const ring = geometry.map((point) => [point.lon, point.lat]);
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
      const levels = Number(way.tags?.["building:levels"] ?? 0);
      const taggedHeight = heightMeters(way.tags?.height);
      const heightM = taggedHeight !== null ? taggedHeight : levels > 0 ? levels * 3.2 : 8;
      const importedHeight = taggedHeight !== null || levels > 0;
      return [{
        type: "Feature",
        id: `osm-building-${way.id}`,
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          osmId: way.id,
          name: way.tags?.name ?? "Mapped building",
          buildingType: way.tags?.building ?? "yes",
          heightM: Math.min(500, Math.max(3, heightM)),
          levels: levels > 0 ? levels : null,
          evidenceClass: "IMPORTED",
          geometryEvidenceClass: "IMPORTED · OPENSTREETMAP FOOTPRINT",
          heightEvidenceClass: importedHeight ? "IMPORTED" : "ESTIMATED",
          heightBasis: taggedHeight !== null
            ? "OpenStreetMap height tag"
            : levels > 0
              ? "OpenStreetMap levels tag × 3.2 m"
              : "8 m display fallback; not a surveyed height",
        },
      }];
    });
    return Response.json({
      type: "FeatureCollection",
      source: "OpenStreetMap contributors · Overpass API",
      dataClass: "IMPORTED",
      notice: "Footprints are imported OpenStreetMap geometry. Each feature separately labels whether its display height is imported or estimated.",
      features: features.slice(0, 500),
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
  } catch {
    return Response.json({
      type: "FeatureCollection",
      source: "OpenStreetMap contributors · Overpass API",
      dataClass: "UNAVAILABLE",
      features: [],
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
