export type ProviderReadiness =
  | "ready"
  | "optional"
  | "needs-configuration"
  | "degraded";

export type ProviderMode =
  | "public-online"
  | "configured-online"
  | "deterministic-fallback"
  | "link-only"
  | "unavailable";

export type ProviderCapability =
  | "base-map"
  | "terrain"
  | "buildings"
  | "routing"
  | "weather"
  | "natural-events"
  | "multi-hazard-alerts"
  | "earthquakes"
  | "relief-reports"
  | "publisher-media"
  | "operations-brief"
  | "agent-narrative"
  | "audit-ledger"
  | "durable-operations";

export type AegisProviderStatus = {
  id: string;
  label: string;
  capability: ProviderCapability;
  readiness: ProviderReadiness;
  mode: ProviderMode;
  configured: boolean;
  requiredEnvironment?: string[];
  detail: string;
};

/**
 * Configuration readiness only. It deliberately does not issue upstream
 * network probes, expose credentials, or claim that a provider is healthy.
 */
export function getProviderReadiness(): AegisProviderStatus[] {
  return [
    {
      id: "openfreemap-map",
      label: "OpenFreeMap / OpenStreetMap",
      capability: "base-map",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Primary zero-key online world map and OpenStreetMap road context.",
    },
    {
      id: "carto-map-fallback",
      label: "CARTO Dark Matter fallback",
      capability: "base-map",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Independent zero-key basemap used automatically if OpenFreeMap cannot load.",
    },
    {
      id: "maplibre-terrain",
      label: "Public Terrarium DEM",
      capability: "terrain",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Keyless global Terrain-RGB tiles derived from public elevation sources; not survey-grade.",
    },
    {
      id: "open-meteo-elevation",
      label: "Copernicus DEM via Open-Meteo",
      capability: "terrain",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Imports a 90 m elevation grid into the EIT twin; drainage and campus micro-topography remain estimated.",
    },
    {
      id: "overpass",
      label: "Overpass / OpenStreetMap Buildings",
      capability: "buildings",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Imports mapped footprints; untagged heights remain estimates.",
    },
    {
      id: "osrm",
      label: "OSRM",
      capability: "routing",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Provides road geometry; AEGIS remains responsible for hazard and capacity screening.",
    },
    {
      id: "open-meteo",
      label: "Open-Meteo",
      capability: "weather",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Weather-model context, never represented as an on-site sensor observation.",
    },
    {
      id: "nasa-eonet",
      label: "NASA EONET",
      capability: "natural-events",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Public natural-event feed with source timestamps.",
    },
    {
      id: "usgs",
      label: "USGS",
      capability: "earthquakes",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Public earthquake event feed.",
    },
    {
      id: "gdacs",
      label: "GDACS",
      capability: "multi-hazard-alerts",
      readiness: "ready",
      mode: "public-online",
      configured: true,
      detail: "Official free multi-hazard alert and event geometry feed with timestamps.",
    },
    {
      id: "publisher-media-links",
      label: "Publisher and open-media links",
      capability: "publisher-media",
      readiness: "ready",
      mode: "link-only",
      configured: true,
      detail: "Keyless official, publisher and search links; operators must verify relevance, date and location, and footage is never labelled as a live camera.",
    },
    {
      id: "operations-brief",
      label: "Deterministic Operations Brief",
      capability: "operations-brief",
      readiness: "ready",
      mode: "deterministic-fallback",
      configured: true,
      detail: "Instant structured analysis from current simulation state; no model key, card or hosted usage.",
    },
  ];
}

export function summarizeProviderReadiness(providers = getProviderReadiness()) {
  return providers.reduce(
    (summary, provider) => {
      summary.total += 1;
      summary[provider.readiness] += 1;
      return summary;
    },
    {
      total: 0,
      ready: 0,
      optional: 0,
      "needs-configuration": 0,
      degraded: 0,
    },
  );
}
