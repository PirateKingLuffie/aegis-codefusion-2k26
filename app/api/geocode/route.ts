import {
  formatCoordinate,
  parseCoordinateQuery,
  searchOfflineWorldPlaces,
} from "@/components/command-center/world-search";

type NominatimPlace = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
  boundingbox?: [string, string, string, string];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);

  if (query.length < 2) {
    return Response.json({
      results: [],
      source: "OpenStreetMap Nominatim",
      dataClass: "IMPORTED",
      degraded: false,
      providerStatus: "not-requested",
    });
  }

  const coordinate = parseCoordinateQuery(query);
  if (coordinate) {
    return Response.json({
      source: "Direct coordinate parser",
      dataClass: "USER INPUT",
      results: [{
        id: `coordinates-${coordinate.latitude.toFixed(6)}-${coordinate.longitude.toFixed(6)}`,
        label: formatCoordinate(coordinate.latitude, coordinate.longitude),
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        type: "coordinates",
        importance: 1,
        bounds: null,
        source: "Direct coordinate parser",
        dataClass: "USER INPUT",
      }],
      degraded: false,
      providerStatus: "not-requested",
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const upstream = new URL("https://nominatim.openstreetmap.org/search");
  upstream.searchParams.set("q", query);
  upstream.searchParams.set("format", "jsonv2");
  upstream.searchParams.set("limit", "6");
  upstream.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent":
          process.env.AEGIS_PUBLIC_DATA_USER_AGENT ??
          "AEGIS-Geospatial-Decision-Support/1.0",
      },
      signal: AbortSignal.timeout(4_500),
      next: { revalidate: 3_600 },
    });
    if (!response.ok) throw new Error("Geocoder unavailable");
    const places = (await response.json()) as NominatimPlace[];
    if (places.length) {
      return Response.json(
        {
          source: "OpenStreetMap Nominatim",
          dataClass: "IMPORTED",
          degraded: false,
          providerStatus: "available",
          results: places.map((place) => ({
            id: String(place.place_id),
            label: place.display_name,
            latitude: Number(place.lat),
            longitude: Number(place.lon),
            type: place.type ?? "place",
            importance: place.importance ?? 0,
            bounds: place.boundingbox?.map(Number) ?? null,
            source: "OpenStreetMap Nominatim",
            dataClass: "IMPORTED",
          })),
        },
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
      );
    }

    const fallbackResults = searchOfflineWorldPlaces(query);
    return Response.json(
      {
        source: fallbackResults.length ? "AEGIS offline gazetteer" : "OpenStreetMap Nominatim",
        dataClass: fallbackResults.length ? "REFERENCE" : "IMPORTED",
        degraded: false,
        providerStatus: "available",
        results: fallbackResults,
        notice: fallbackResults.length
          ? "No live place matched. Showing a built-in reference location."
          : undefined,
      },
      { headers: { "Cache-Control": fallbackResults.length ? "public, max-age=3600" : "public, max-age=300" } },
    );
  } catch {
    const fallbackResults = searchOfflineWorldPlaces(query);
    return Response.json(
      {
        source: fallbackResults.length ? "AEGIS offline gazetteer" : "OpenStreetMap Nominatim",
        dataClass: fallbackResults.length ? "REFERENCE" : "UNAVAILABLE",
        degraded: true,
        providerStatus: "unavailable",
        results: fallbackResults,
        notice: fallbackResults.length
          ? "Live OpenStreetMap search is unavailable. Showing built-in reference locations; exact addresses and other buildings require connectivity."
          : "Live OpenStreetMap search is unavailable and this place is not in the built-in reference index. Exact coordinates and map selection still work.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
