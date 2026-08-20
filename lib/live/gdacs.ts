import { fetchJson } from "./http";
import type { AdapterResult, IncidentCategory, IncidentSeverity, LiveIncident } from "./types";
import { buildFreshness, normalizeGeometry, safeHttpsUrl, stripMarkup } from "./utils";

const GDACS_API = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";

interface GdacsFeature {
  type?: "Feature";
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    eventtype?: string;
    eventid?: number | string;
    episodeid?: number | string;
    name?: string;
    description?: string;
    alertlevel?: string;
    iscurrent?: string;
    country?: string;
    iso3?: string;
    fromdate?: string;
    todate?: string;
    datemodified?: string;
    source?: string;
    url?: { report?: string; details?: string; geometry?: string };
    severitydata?: { severity?: number; severitytext?: string; severityunit?: string };
  };
}

interface GdacsResponse { type?: "FeatureCollection"; features?: GdacsFeature[] }

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function category(code = ""): IncidentCategory {
  const categories: Record<string, IncidentCategory> = {
    EQ: "earthquake",
    TC: "cyclone",
    FL: "flood",
    WF: "wildfire",
    VO: "volcano",
    DR: "drought",
  };
  return categories[code] ?? "other";
}

function severity(alert = ""): IncidentSeverity {
  if (alert.toLowerCase() === "red") return "critical";
  if (alert.toLowerCase() === "orange") return "high";
  if (alert.toLowerCase() === "green") return "low";
  return "unknown";
}

export async function fetchGdacsEvents(limit = 20, days = 14): Promise<AdapterResult> {
  const now = new Date();
  const from = new Date(now.getTime() - Math.max(1, Math.min(90, days)) * 86_400_000);
  const url = new URL(GDACS_API);
  url.searchParams.set("eventlist", "EQ;TC;FL;WF;VO;DR");
  url.searchParams.set("fromdate", isoDateOnly(from));
  url.searchParams.set("todate", isoDateOnly(now));
  url.searchParams.set("alertlevel", "red;orange;green");
  const payload = await fetchJson<GdacsResponse>(url.toString(), 8_000);
  const incidents: LiveIncident[] = (payload.data.features ?? [])
    .toSorted((left, right) => {
      const rank = (value?: string) => ({ red: 3, orange: 2, green: 1 }[value?.toLowerCase() ?? ""] ?? 0);
      return rank(right.properties?.alertlevel) - rank(left.properties?.alertlevel)
        || Date.parse(right.properties?.datemodified ?? "") - Date.parse(left.properties?.datemodified ?? "");
    })
    .slice(0, Math.max(1, Math.min(50, limit)))
    .flatMap((feature) => {
      const properties = feature.properties ?? {};
      if (properties.eventid === undefined) return [];
      const geometry = normalizeGeometry(feature.geometry?.type, feature.geometry?.coordinates);
      const coordinates = geometry?.type === "Point" && Array.isArray(geometry.coordinates)
        ? geometry.coordinates as unknown[]
        : [];
      const longitude = typeof coordinates[0] === "number" ? coordinates[0] : undefined;
      const latitude = typeof coordinates[1] === "number" ? coordinates[1] : undefined;
      const reportUrl = safeHttpsUrl(properties.url?.report);
      const detailUrl = safeHttpsUrl(properties.url?.details);
      const geometryUrl = safeHttpsUrl(properties.url?.geometry);
      const eventCategory = category(properties.eventtype);
      const title = stripMarkup(properties.name ?? properties.description ?? `GDACS ${eventCategory} event`);
      const observedAt = properties.fromdate;
      const updatedAt = properties.datemodified ?? properties.todate;
      const numericSeverity = properties.severitydata?.severity;
      return [{
        id: `gdacs:${properties.eventtype ?? "event"}:${properties.eventid}:${properties.episodeid ?? "0"}`,
        title,
        summary: stripMarkup(properties.severitydata?.severitytext ?? properties.description ?? title),
        category: eventCategory,
        severity: severity(properties.alertlevel),
        state: properties.iscurrent === "true" ? "active" : "monitoring",
        reality: "observed",
        dataMode: "near-real-time",
        observedAt,
        updatedAt,
        freshness: buildFreshness(updatedAt ?? observedAt, payload.retrievedAt),
        location: {
          name: properties.country || title,
          country: properties.country || undefined,
          countryCode: properties.iso3 || undefined,
          coordinates: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
        },
        geometry,
        magnitude: typeof numericSeverity === "number" ? {
          value: numericSeverity,
          unit: properties.severitydata?.severityunit,
          description: properties.severitydata?.severitytext,
        } : undefined,
        impactMetrics: typeof numericSeverity === "number" ? [{
          key: "gdacs-severity",
          label: "GDACS event severity measure",
          value: numericSeverity,
          unit: properties.severitydata?.severityunit,
          qualifier: properties.severitydata?.severitytext,
          sourceUrl: reportUrl,
        }] : [],
        links: [
          ...(reportUrl ? [{ label: "GDACS event report", url: reportUrl, kind: "official" as const }] : []),
          ...(detailUrl ? [{ label: "GDACS event data", url: detailUrl, kind: "source" as const }] : []),
          ...(geometryUrl ? [{ label: "GDACS geometry", url: geometryUrl, kind: "map" as const }] : []),
        ],
        provenance: {
          sourceId: "gdacs",
          sourceName: "Global Disaster Alert and Coordination System",
          dataset: "GDACS MHEWS event-list GeoJSON API",
          upstreamUrl: reportUrl,
          apiUrl: url.toString(),
          retrievedAt: payload.retrievedAt,
          publishedAt: observedAt,
          status: "live",
          license: "GDACS terms of use; source acknowledgement required",
          notice: "GDACS alert levels are early-warning context and can be revised. Follow the linked event report and responsible authorities.",
        },
        tags: ["gdacs", properties.eventtype ?? "event", properties.alertlevel ?? "unrated", properties.source ?? "multi-source"],
      } satisfies LiveIncident];
    });
  return {
    source: {
      id: "gdacs",
      name: "Global Disaster Alert and Coordination System",
      status: "live",
      retrievedAt: payload.retrievedAt,
      recordCount: incidents.length,
      upstreamUrl: url.toString(),
      latencyMs: payload.latencyMs,
      message: "Official multi-hazard event feed; source acknowledgement retained",
    },
    incidents,
  };
}
