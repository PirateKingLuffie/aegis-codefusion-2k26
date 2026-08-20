import { readServerEnvironment } from "./env";
import { fetchJson } from "./http";
import type { AdapterResult, IncidentLocation, LiveIncident } from "./types";
import {
  buildFreshness,
  inferCategory,
  inferSeverity,
  safeHttpsUrl,
  sanitizeQuery,
  stableId,
  stripMarkup,
  toIsoDate,
} from "./utils";

const RELIEFWEB_ENDPOINT = "https://api.reliefweb.int/v2/reports";

interface ReliefWebReference {
  id?: number;
  name?: string;
  shortname?: string;
  iso3?: string;
  location?: { lat?: number; lon?: number };
}

interface ReliefWebRecord {
  id?: number | string;
  href?: string;
  fields?: {
    title?: string;
    body?: string;
    url?: string;
    url_alias?: string;
    date?: { created?: string; original?: string; changed?: string };
    primary_country?: ReliefWebReference;
    country?: ReliefWebReference[];
    disaster_type?: ReliefWebReference[];
    source?: ReliefWebReference[];
    format?: ReliefWebReference[];
    status?: string;
  };
}

interface ReliefWebResponse {
  data?: ReliefWebRecord[];
}

function reportLocation(record: ReliefWebRecord): IncidentLocation {
  const primary = record.fields?.primary_country ?? record.fields?.country?.[0];
  const latitude = primary?.location?.lat;
  const longitude = primary?.location?.lon;
  return {
    name: primary?.name ?? "Location specified in report",
    country: primary?.name,
    countryCode: primary?.iso3,
    coordinates:
      typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : undefined,
  };
}

export async function fetchReliefWebReports(options?: {
  query?: string;
  limit?: number;
}): Promise<AdapterResult> {
  const appName = readServerEnvironment("RELIEFWEB_APPNAME");
  const retrievedAt = new Date().toISOString();
  if (!appName) {
    return {
      source: {
        id: "reliefweb",
        name: "UN OCHA ReliefWeb",
        status: "unavailable",
        retrievedAt,
        recordCount: 0,
        upstreamUrl: "https://reliefweb.int/updates",
        message:
          "ReliefWeb now requires a pre-approved appname. Set RELIEFWEB_APPNAME to enable the read-only feed.",
      },
      incidents: [],
    };
  }

  const query = sanitizeQuery(options?.query, "disaster");
  const limit = Math.max(1, Math.min(30, Math.trunc(options?.limit ?? 12)));
  const url = new URL(RELIEFWEB_ENDPOINT);
  url.searchParams.set("appname", appName);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("profile", "full");
  url.searchParams.append("sort[]", "date.created:desc");
  if (query !== "disaster") {
    url.searchParams.set("query[value]", query);
  }

  const payload = await fetchJson<ReliefWebResponse>(url.toString());
  const incidents: LiveIncident[] = (payload.data.data ?? []).flatMap((record) => {
    const fields = record.fields ?? {};
    if (!fields.title) return [];
    const reportUrl = safeHttpsUrl(fields.url_alias) ?? safeHttpsUrl(fields.url) ?? safeHttpsUrl(record.href);
    const observedAt = toIsoDate(fields.date?.original ?? fields.date?.created);
    const updatedAt = toIsoDate(fields.date?.changed ?? fields.date?.created);
    const disasterNames = (fields.disaster_type ?? []).map((item) => item.name).filter(Boolean).join(", ");
    const sourceNames = (fields.source ?? []).map((item) => item.shortname ?? item.name).filter(Boolean).join(", ");
    const summary = stripMarkup(fields.body ?? "").slice(0, 420);
    const combinedText = `${fields.title} ${disasterNames} ${summary}`;
    const id = String(record.id ?? stableId("reliefweb", `${fields.title}|${observedAt ?? ""}`));

    return [
      {
        id: `reliefweb:${id}`,
        title: stripMarkup(fields.title),
        summary:
          summary ||
          `Recent ReliefWeb situation report${disasterNames ? ` covering ${disasterNames}` : ""}${
            sourceNames ? ` from ${sourceNames}` : ""
          }.`,
        category: inferCategory(combinedText),
        severity: inferSeverity(combinedText),
        state: fields.status === "current" ? "active" : "monitoring",
        reality: "observed",
        dataMode: "recent-report",
        observedAt,
        updatedAt,
        freshness: buildFreshness(updatedAt ?? observedAt, payload.retrievedAt),
        location: reportLocation(record),
        impactMetrics: [],
        links: reportUrl ? [{ label: "ReliefWeb report", url: reportUrl, kind: "report" }] : [],
        provenance: {
          sourceId: "reliefweb",
          sourceName: "UN OCHA ReliefWeb",
          dataset: "ReliefWeb reports API v2",
          upstreamUrl: reportUrl,
          apiUrl: `${RELIEFWEB_ENDPOINT}?appname=[configured]`,
          retrievedAt: payload.retrievedAt,
          publishedAt: observedAt,
          status: "live",
          notice: "ReliefWeb republishes partner reports; claims remain attributable to the named report source.",
        },
        tags: [
          "reliefweb",
          ...(fields.disaster_type ?? [])
            .map((item) => item.name)
            .filter((item): item is string => Boolean(item)),
          ...(fields.country ?? [])
            .map((item) => item.iso3)
            .filter((item): item is string => Boolean(item)),
        ],
      },
    ];
  });

  return {
    source: {
      id: "reliefweb",
      name: "UN OCHA ReliefWeb",
      status: "live",
      retrievedAt: payload.retrievedAt,
      recordCount: incidents.length,
      upstreamUrl: "https://reliefweb.int/updates",
      latencyMs: payload.latencyMs,
      message: "Recent partner situation reports curated by ReliefWeb",
    },
    incidents,
  };
}
