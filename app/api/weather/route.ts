type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  current?: {
    time: string;
    temperature_2m?: number;
    precipitation?: number;
    rain?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: number[];
    precipitation?: number[];
  };
};

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = boundedNumber(url.searchParams.get("lat"), 28.3912265, -90, 90);
  const longitude = boundedNumber(url.searchParams.get("lon"), 77.4398682, -180, 180);
  const upstream = new URL("https://api.open-meteo.com/v1/forecast");
  upstream.searchParams.set("latitude", String(latitude));
  upstream.searchParams.set("longitude", String(longitude));
  upstream.searchParams.set(
    "current",
    "temperature_2m,precipitation,rain,wind_speed_10m,wind_direction_10m",
  );
  upstream.searchParams.set("hourly", "precipitation_probability,precipitation");
  upstream.searchParams.set("forecast_days", "2");
  upstream.searchParams.set("timezone", "auto");

  try {
    const response = await fetch(upstream, {
      headers: { Accept: "application/json", "User-Agent": "AEGIS-Hackathon-Prototype/1.0" },
      signal: AbortSignal.timeout(4_500),
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error("Weather source unavailable");
    const data = (await response.json()) as OpenMeteoResponse;
    return Response.json(
      {
        mode: "live-model-feed",
        source: "Open-Meteo",
        dataClass: "IMPORTED_MODEL_OUTPUT",
        retrievedAt: new Date().toISOString(),
        latitude: data.latitude,
        longitude: data.longitude,
        current: data.current ?? null,
        hourly: {
          time: data.hourly?.time?.slice(0, 24) ?? [],
          precipitationProbability:
            data.hourly?.precipitation_probability?.slice(0, 24) ?? [],
          precipitation: data.hourly?.precipitation?.slice(0, 24) ?? [],
        },
        notice: "Weather model data is imported context, not an AEGIS observation.",
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
    );
  } catch {
    return Response.json({
      mode: "unavailable",
      source: "Open-Meteo",
      dataClass: "UNAVAILABLE",
      retrievedAt: new Date().toISOString(),
      latitude,
      longitude,
      current: null,
      hourly: { time: [], precipitationProbability: [], precipitation: [] },
      notice: "Live weather is unavailable. AEGIS has not substituted synthetic or cached weather values.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
