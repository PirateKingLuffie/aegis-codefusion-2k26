import { fetchJson } from "./http";
import type { AdapterResult, IncidentSeverity, LiveIncident } from "./types";
import { buildFreshness, normalizeGeometry, safeHttpsUrl, stripMarkup, toIsoDate } from "./utils";

const USGS_FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";

interface UsgsFeature {
  id?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    mag?: number | null;
    place?: string | null;
    title?: string | null;
    time?: number | null;
    updated?: number | null;
    url?: string | null;
    detail?: string | null;
    felt?: number | null;
    cdi?: number | null;
    mmi?: number | null;
    alert?: "green" | "yellow" | "orange" | "red" | null;
    status?: string | null;
    tsunami?: number | null;
    sig?: number | null;
    magType?: string | null;
    type?: string | null;
  };
}

interface UsgsResponse {
  metadata?: { generated?: number; title?: string; count?: number; url?: string };
  features?: UsgsFeature[];
}

function earthquakeSeverity(magnitude: number | undefined, alert: string | null | undefined): IncidentSeverity {
  if (alert === "red" || (magnitude ?? 0) >= 7) return "critical";
  if (alert === "orange" || (magnitude ?? 0) >= 6) return "high";
  if (alert === "yellow" || (magnitude ?? 0) >= 4.5) return "medium";
  if (alert === "green" || magnitude !== undefined) return "low";
  return "unknown";
}

export async function fetchUsgsEarthquakes(limit = 25): Promise<AdapterResult> {
  const payload = await fetchJson<UsgsResponse>(USGS_FEED);
  const incidents: LiveIncident[] = (payload.data.features ?? []).slice(0, Math.max(1, Math.min(50, limit))).flatMap(
    (feature) => {
      const properties = feature.properties ?? {};
      const title = stripMarkup(properties.title ?? properties.place ?? "Significant earthquake");
      if (!feature.id || !title) return [];
      const geometry = normalizeGeometry(feature.geometry?.type, feature.geometry?.coordinates);
      const coordinateArray = geometry?.type === "Point" && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
      const longitude = typeof coordinateArray[0] === "number" ? coordinateArray[0] : undefined;
      const latitude = typeof coordinateArray[1] === "number" ? coordinateArray[1] : undefined;
      const depthKm = typeof coordinateArray[2] === "number" ? coordinateArray[2] : undefined;
      const observedAt = toIsoDate(properties.time ?? undefined);
      const updatedAt = toIsoDate(properties.updated ?? undefined);
      const magnitude = typeof properties.mag === "number" ? properties.mag : undefined;
      const eventUrl = safeHttpsUrl(properties.url);
      const detailUrl = safeHttpsUrl(properties.detail);
      const impactMetrics = [
        ...(typeof properties.felt === "number"
          ? [{ key: "felt-reports", label: "Public felt reports", value: properties.felt, unit: "reports" }]
          : []),
        ...(typeof properties.mmi === "number"
          ? [{ key: "mmi", label: "Maximum estimated intensity", value: properties.mmi, unit: "MMI" }]
          : []),
        ...(typeof properties.cdi === "number"
          ? [{ key: "cdi", label: "Community reported intensity", value: properties.cdi, unit: "CDI" }]
          : []),
        ...(typeof properties.sig === "number"
          ? [{ key: "significance", label: "USGS significance", value: properties.sig }]
          : []),
        ...(typeof depthKm === "number"
          ? [{ key: "depth", label: "Hypocentral depth", value: depthKm, unit: "km" }]
          : []),
        ...(properties.tsunami
          ? [{ key: "tsunami-flag", label: "USGS tsunami flag", value: true, qualifier: "Review official warning centres" }]
          : []),
      ];

      return [
        {
          id: `usgs:${feature.id}`,
          title,
          summary: `${magnitude !== undefined ? `Magnitude ${magnitude.toFixed(1)} ` : ""}earthquake${
            properties.place ? ` near ${stripMarkup(properties.place)}` : ""
          }. Status: ${properties.status ?? "review pending"}.`,
          category: "earthquake",
          severity: earthquakeSeverity(magnitude, properties.alert),
          state: "monitoring",
          reality: "observed",
          dataMode: "near-real-time",
          observedAt,
          updatedAt,
          freshness: buildFreshness(updatedAt ?? observedAt, payload.retrievedAt),
          location: {
            name: stripMarkup(properties.place ?? title),
            coordinates:
              latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
          },
          geometry,
          magnitude:
            magnitude !== undefined
              ? { value: magnitude, unit: properties.magType ?? undefined, description: "Earthquake magnitude" }
              : undefined,
          impactMetrics,
          links: [
            ...(eventUrl ? [{ label: "USGS event page", url: eventUrl, kind: "official" as const }] : []),
            ...(detailUrl ? [{ label: "USGS detail feed", url: detailUrl, kind: "source" as const }] : []),
          ],
          provenance: {
            sourceId: "usgs-earthquakes",
            sourceName: "U.S. Geological Survey",
            dataset: "Significant Earthquakes, Past Week GeoJSON feed",
            upstreamUrl: eventUrl,
            apiUrl: USGS_FEED,
            retrievedAt: payload.retrievedAt,
            publishedAt: observedAt,
            status: "live",
            license: "USGS public data",
            notice: "USGS event parameters may be revised as additional observations arrive.",
          },
          tags: [
            "usgs",
            "earthquake",
            properties.alert ? `${properties.alert}-alert` : "unrated-alert",
            properties.tsunami ? "tsunami-flag" : "no-tsunami-flag",
          ],
        },
      ];
    }
  );

  return {
    source: {
      id: "usgs-earthquakes",
      name: "USGS Earthquake Hazards Program",
      status: "live",
      retrievedAt: payload.retrievedAt,
      recordCount: incidents.length,
      upstreamUrl: USGS_FEED,
      latencyMs: payload.latencyMs,
      message: "Official significant-earthquakes feed; updated by USGS as events are reviewed",
    },
    incidents,
  };
}
