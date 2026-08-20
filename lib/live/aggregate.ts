import { withMemoryCache } from "./cache";
import { getOfflineScenarioPreviews, getVerifiedSourceSnapshots } from "./fallback";
import { fetchGoogleNewsIncidents } from "./google-news";
import { fetchGdacsEvents } from "./gdacs";
import { publicErrorMessage } from "./http";
import { searchIncidentMedia } from "./media";
import { fetchNasaEonetEvents } from "./nasa-eonet";
import { fetchReliefWebReports } from "./reliefweb";
import type {
  AdapterResult,
  AggregateLiveOptions,
  LiveIncident,
  LiveIntelligenceResponse,
  LiveSourceId,
  SourceTelemetry,
} from "./types";
import { fetchUsgsEarthquakes } from "./usgs";
import {
  clampInteger,
  deduplicateIncidents,
  filterIncidentsByArea,
  sanitizeQuery,
} from "./utils";

const DEFAULT_QUERY = "(flood OR earthquake OR wildfire OR cyclone OR landslide) when:7d";

async function guardedAdapter(
  id: LiveSourceId,
  name: string,
  upstreamUrl: string,
  loader: () => Promise<AdapterResult>
): Promise<AdapterResult> {
  const startedAt = Date.now();
  try {
    return await loader();
  } catch (error) {
    return {
      source: {
        id,
        name,
        status: "degraded",
        retrievedAt: new Date().toISOString(),
        recordCount: 0,
        upstreamUrl,
        latencyMs: Date.now() - startedAt,
        message: publicErrorMessage(error),
      },
      incidents: [],
    };
  }
}

function severityRank(incident: LiveIncident) {
  return { critical: 5, high: 4, medium: 3, low: 2, unknown: 1 }[incident.severity];
}

function sortIncidents(incidents: LiveIncident[]) {
  return [...incidents].sort((left, right) => {
    const severityDifference = severityRank(right) - severityRank(left);
    if (severityDifference) return severityDifference;
    const rightTime = Date.parse(right.updatedAt ?? right.observedAt ?? "") || 0;
    const leftTime = Date.parse(left.updatedAt ?? left.observedAt ?? "") || 0;
    return rightTime - leftTime;
  });
}

function shouldIncludeAssamSnapshot(explicitQuery: string | undefined) {
  if (!explicitQuery) return true;
  return /assam|brahmaputra|flood|monsoon|disaster/i.test(explicitQuery);
}

function hasAssamFlood(incidents: LiveIncident[]) {
  return incidents.some(
    (incident) => incident.category === "flood" && /assam|brahmaputra/i.test(`${incident.title} ${incident.summary}`)
  );
}

export async function aggregateLiveIntelligence(
  options: AggregateLiveOptions = {}
): Promise<LiveIntelligenceResponse> {
  const generatedAt = new Date().toISOString();
  const limitPerSource = clampInteger(options.limitPerSource, 1, 30, 15);
  const eonetDays = clampInteger(options.eonetDays, 1, 90, 30);
  const query = sanitizeQuery(options.query, DEFAULT_QUERY);
  const nasaKey = `live:nasa:${limitPerSource}:${eonetDays}`;
  const usgsKey = `live:usgs:${limitPerSource}`;
  const reliefKey = `live:reliefweb:${query}:${limitPerSource}`;
  const newsKey = `live:google-news:${query}:${limitPerSource}`;
  const gdacsKey = `live:gdacs:${limitPerSource}:${eonetDays}`;

  const publicAdapters = [
    guardedAdapter("nasa-eonet", "NASA EONET", "https://eonet.gsfc.nasa.gov/", () =>
      withMemoryCache(nasaKey, 120_000, () =>
        fetchNasaEonetEvents({ limit: limitPerSource, days: eonetDays })
      )
    ),
    guardedAdapter(
      "usgs-earthquakes",
      "USGS Earthquake Hazards Program",
      "https://earthquake.usgs.gov/earthquakes/feed/",
      () => withMemoryCache(usgsKey, 60_000, () => fetchUsgsEarthquakes(limitPerSource))
    ),
    guardedAdapter("google-news", "Google News RSS", "https://news.google.com/", () =>
      withMemoryCache(newsKey, 180_000, () =>
        fetchGoogleNewsIncidents({ query: options.query, limit: limitPerSource })
      )
    ),
    guardedAdapter("gdacs", "Global Disaster Alert and Coordination System", "https://www.gdacs.org/", () =>
      withMemoryCache(gdacsKey, 120_000, () => fetchGdacsEvents(limitPerSource, eonetDays))
    ),
  ];
  // ReliefWeb requires a pre-approved app name. Omitting it from the default
  // zero-configuration request avoids advertising a predictable failure as a
  // degraded live feed; the adapter becomes active immediately when the owner
  // provides the free approved identifier.
  if (process.env.RELIEFWEB_APPNAME?.trim()) {
    publicAdapters.push(
      guardedAdapter("reliefweb", "UN OCHA ReliefWeb", "https://reliefweb.int/updates", () =>
        withMemoryCache(reliefKey, 300_000, () =>
          fetchReliefWebReports({ query: options.query, limit: limitPerSource })
        )
      ),
    );
  }
  const adapterResults = await Promise.all(publicAdapters);

  const externalIncidents = adapterResults.flatMap((result) => result.incidents);
  const allSnapshots = getVerifiedSourceSnapshots(generatedAt);
  const relevantSnapshots = shouldIncludeAssamSnapshot(options.query) ? allSnapshots : [];
  const snapshotsToAdd = hasAssamFlood(externalIncidents) ? [] : relevantSnapshots;
  const observed = filterIncidentsByArea(
    deduplicateIncidents([...externalIncidents, ...snapshotsToAdd]),
    options.boundingBox,
    options.proximity
  );
  const offlineScenarioPreviews = filterIncidentsByArea(
    getOfflineScenarioPreviews(generatedAt),
    options.boundingBox,
    options.proximity
  );

  const sources: SourceTelemetry[] = adapterResults.map((result) => result.source);
  if (snapshotsToAdd.length) {
    sources.push({
      id: "aegis-verified-cache",
      name: "AEGIS verified source cache",
      status: "cached",
      retrievedAt: generatedAt,
      recordCount: snapshotsToAdd.length,
      upstreamUrl: snapshotsToAdd[0]?.provenance.upstreamUrl,
      message: "Dated, source-backed fallback snapshot; never labelled as live",
    });
  }

  const liveSources = sources.filter((source) => source.status === "live").length;
  const degradedSources = sources.filter(
    (source) => source.status === "degraded" || source.status === "unavailable"
  ).length;
  const mode: LiveIntelligenceResponse["mode"] =
    liveSources === 0 ? "offline-fallback" : degradedSources > 0 ? "mixed" : "live";
  const media = options.includeMedia
    ? await searchIncidentMedia(options.mediaQuery ?? options.query ?? "Assam floods", 5)
    : undefined;

  return {
    schemaVersion: "1.0",
    generatedAt,
    mode,
    query,
    sources,
    incidents: sortIncidents(observed),
    verifiedSnapshots: filterIncidentsByArea(snapshotsToAdd, options.boundingBox, options.proximity),
    offlineScenarioPreviews,
    media,
    counts: {
      observed: observed.length,
      simulated: offlineScenarioPreviews.length,
      liveSources,
      degradedSources,
    },
    notices: [
      "Observed incidents and simulated rehearsals are returned in separate collections.",
      "Freshness describes the upstream observation/publication timestamp, not merely the time AEGIS fetched it.",
      "Cached snapshots are dated and source-backed; they are never promoted to live status.",
      "News and video metadata require source, time, location and rights verification before operational use.",
      "This feed supports situational awareness and demonstration; follow competent authorities for emergency instructions.",
    ],
  };
}
