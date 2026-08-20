import { fetchText } from "./http";
import type { AdapterResult, LiveIncident } from "./types";
import {
  buildFreshness,
  inferCategory,
  inferSeverity,
  parseRssItems,
  sanitizeQuery,
  stableId,
  stripMarkup,
} from "./utils";

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

export async function fetchGoogleNewsIncidents(options?: {
  query?: string;
  limit?: number;
}): Promise<AdapterResult> {
  const query = sanitizeQuery(
    options?.query,
    "(flood OR earthquake OR wildfire OR cyclone OR landslide) when:7d"
  );
  const limit = Math.max(1, Math.min(30, Math.trunc(options?.limit ?? 15)));
  const url = new URL(GOOGLE_NEWS_RSS);
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-IN");
  url.searchParams.set("gl", "IN");
  url.searchParams.set("ceid", "IN:en");

  const payload = await fetchText(url.toString());
  const items = parseRssItems(payload.data, limit);
  const incidents: LiveIncident[] = items.map((item) => {
    const title = stripMarkup(item.title);
    const summary = stripMarkup(item.description ?? "").slice(0, 420);
    const category = inferCategory(`${title} ${summary}`);
    const sourceName = item.source ?? "Publisher indexed by Google News";
    return {
      id: stableId("google-news", item.guid ?? `${item.link}|${item.publishedAt ?? title}`),
      title,
      summary: summary || `Recent incident coverage from ${sourceName}. Open the linked report for verified details.`,
      category,
      severity: inferSeverity(`${title} ${summary}`),
      state: "monitoring",
      reality: "observed",
      dataMode: "recent-report",
      observedAt: item.publishedAt,
      updatedAt: item.publishedAt,
      freshness: buildFreshness(item.publishedAt, payload.retrievedAt),
      location: { name: "Location described in linked report" },
      impactMetrics: [],
      links: [
        { label: `Read coverage from ${sourceName}`, url: item.link, kind: "news" },
        ...(item.sourceUrl ? [{ label: sourceName, url: item.sourceUrl, kind: "source" as const }] : []),
      ],
      provenance: {
        sourceId: "google-news",
        sourceName: "Google News RSS",
        dataset: "Google News search RSS metadata",
        upstreamUrl: item.link,
        apiUrl: url.toString(),
        retrievedAt: payload.retrievedAt,
        publishedAt: item.publishedAt,
        status: "live",
        notice:
          "Google News provides headline metadata and a publisher link. AEGIS does not scrape article or search-result pages.",
      },
      tags: ["news", "google-news-rss", category, sourceName],
    };
  });

  return {
    source: {
      id: "google-news",
      name: "Google News RSS",
      status: "live",
      retrievedAt: payload.retrievedAt,
      recordCount: incidents.length,
      upstreamUrl: url.toString(),
      latencyMs: payload.latencyMs,
      message: "RSS metadata only; linked publisher reports remain the source of record",
    },
    incidents,
  };
}
