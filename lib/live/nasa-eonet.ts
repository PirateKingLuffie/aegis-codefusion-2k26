import { fetchJson } from "./http";
import type { AdapterResult, IncidentCategory, LiveIncident } from "./types";
import {
  buildFreshness,
  centerOfGeometry,
  clampInteger,
  inferSeverity,
  normalizeGeometry,
  safeHttpsUrl,
  stripMarkup,
  toIsoDate,
} from "./utils";

const EONET_ENDPOINT = "https://eonet.gsfc.nasa.gov/api/v3/events";

interface EonetCategory {
  id?: string;
  title?: string;
}

interface EonetSource {
  id?: string;
  url?: string;
}

interface EonetGeometry {
  date?: string;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number;
  magnitudeUnit?: string;
  magnitudeDescription?: string;
}

interface EonetEvent {
  id?: string;
  title?: string;
  description?: string;
  link?: string;
  closed?: string | null;
  categories?: EonetCategory[];
  sources?: EonetSource[];
  geometry?: EonetGeometry[];
}

interface EonetResponse {
  events?: EonetEvent[];
}

function categoryFromEonet(categories: EonetCategory[]): IncidentCategory {
  const value = categories.map((category) => `${category.id ?? ""} ${category.title ?? ""}`).join(" ").toLowerCase();
  if (value.includes("wildfire")) return "wildfire";
  if (value.includes("severe storm")) return "severe-storm";
  if (value.includes("flood")) return "flood";
  if (value.includes("volcan")) return "volcano";
  if (value.includes("landslide")) return "landslide";
  if (value.includes("drought")) return "drought";
  if (value.includes("temperature")) return "extreme-temperature";
  return "other";
}

export async function fetchNasaEonetEvents(options?: {
  limit?: number;
  days?: number;
}): Promise<AdapterResult> {
  const limit = clampInteger(options?.limit, 1, 50, 20);
  const days = clampInteger(options?.days, 1, 90, 30);
  const url = new URL(EONET_ENDPOINT);
  url.searchParams.set("status", "open");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("days", String(days));

  const payload = await fetchJson<EonetResponse>(url.toString());
  const incidents: LiveIncident[] = (payload.data.events ?? []).flatMap((event) => {
    if (!event.id || !event.title) return [];
    const geometries = event.geometry ?? [];
    const latestRawGeometry = geometries.at(-1);
    const geometry = normalizeGeometry(latestRawGeometry?.type, latestRawGeometry?.coordinates);
    const observedAt = toIsoDate(latestRawGeometry?.date);
    const categories = event.categories ?? [];
    const category = categoryFromEonet(categories);
    const sourceLinks = (event.sources ?? [])
      .map((source) => ({ id: source.id, url: safeHttpsUrl(source.url) }))
      .filter((source): source is { id: string | undefined; url: string } => Boolean(source.url));
    const apiEventUrl = safeHttpsUrl(event.link);
    const magnitude =
      typeof latestRawGeometry?.magnitudeValue === "number"
        ? {
            value: latestRawGeometry.magnitudeValue,
            unit: latestRawGeometry.magnitudeUnit,
            description: latestRawGeometry.magnitudeDescription,
          }
        : undefined;

    return [
      {
        id: `nasa-eonet:${event.id}`,
        title: stripMarkup(event.title),
        summary:
          stripMarkup(event.description ?? "") ||
          `NASA EONET open ${categories.map((item) => item.title).filter(Boolean).join(", ") || "natural event"}.`,
        category,
        severity: inferSeverity(`${event.title} ${event.description ?? ""}`),
        state: event.closed ? "closed" : "active",
        reality: "observed",
        dataMode: "near-real-time",
        observedAt,
        updatedAt: observedAt,
        freshness: buildFreshness(observedAt, payload.retrievedAt),
        location: {
          name: stripMarkup(event.title),
          coordinates: centerOfGeometry(geometry),
        },
        geometry,
        magnitude,
        impactMetrics: magnitude
          ? [
              {
                key: "source-magnitude",
                label: magnitude.description || "Source magnitude",
                value: magnitude.value,
                unit: magnitude.unit,
              },
            ]
          : [],
        links: [
          ...(apiEventUrl ? [{ label: "NASA EONET event", url: apiEventUrl, kind: "official" as const }] : []),
          ...sourceLinks.map((source) => ({
            label: source.id ? `Event source: ${source.id}` : "Event source",
            url: source.url,
            kind: "source" as const,
          })),
        ],
        provenance: {
          sourceId: "nasa-eonet",
          sourceName: "NASA Earth Observatory Natural Event Tracker",
          dataset: "EONET v3 open events",
          upstreamUrl: apiEventUrl ?? sourceLinks[0]?.url,
          apiUrl: url.toString(),
          retrievedAt: payload.retrievedAt,
          publishedAt: observedAt,
          status: "live",
          license: "NASA open data; upstream source rights may vary",
          notice: "EONET is near-real-time event metadata; geometry dates vary by source.",
        },
        tags: [
          "nasa",
          "eonet",
          category,
          ...categories.map((item) => item.id).filter((item): item is string => Boolean(item)),
        ],
      },
    ];
  });

  return {
    source: {
      id: "nasa-eonet",
      name: "NASA EONET",
      status: "live",
      retrievedAt: payload.retrievedAt,
      recordCount: incidents.length,
      upstreamUrl: url.toString(),
      latencyMs: payload.latencyMs,
      message: `Open events from the previous ${days} days`,
    },
    incidents,
  };
}
