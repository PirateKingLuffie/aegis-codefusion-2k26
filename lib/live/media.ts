import { readServerEnvironment } from "./env";
import { fetchJson, publicErrorMessage } from "./http";
import type { IncidentMediaResult, MediaLink, MediaVideo } from "./types";
import { safeHttpsUrl, sanitizeQuery } from "./utils";
import { searchCommonsDisasterMedia } from "./wikimedia";

const YOUTUBE_SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const ASSAM_AP_SOURCE =
  "https://apnews.com/article/india-floods-monsoon-assam-brahmaputra-river-042b23c3945161454c0d836439124d9c";

interface YouTubeSearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
}

export function buildSafeMediaLinks(queryValue: string): MediaLink[] {
  const query = sanitizeQuery(queryValue, "disaster response");
  const encoded = encodeURIComponent(query);
  const links: MediaLink[] = [
    {
      label: `Search YouTube for “${query}”`,
      url: `https://www.youtube.com/results?search_query=${encoded}`,
      kind: "youtube-search",
      notice: "Search link only; AEGIS does not scrape YouTube pages.",
    },
    {
      label: `Search Google News for “${query}”`,
      url: `https://news.google.com/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN%3Aen`,
      kind: "news-search",
      notice: "Search link only; verify publisher, capture time and location before using footage as evidence.",
    },
    {
      label: "Search ReliefWeb situation reports",
      url: `https://reliefweb.int/updates?search=${encoded}`,
      kind: "relief-search",
      publisher: "UN OCHA ReliefWeb",
    },
  ];

  if (/assam/i.test(query) && /flood|monsoon|brahmaputra/i.test(query)) {
    links.push(
      {
        label: "Assam State Disaster Management Authority reports",
        url: "https://www.asdma.gov.in/cumulative_reports.html",
        kind: "official",
        publisher: "ASDMA",
      },
      {
        label: "AP Assam flood report — 24 July 2026",
        url: ASSAM_AP_SOURCE,
        kind: "news-report",
        publisher: "Associated Press",
        publishedAt: "2026-07-24T07:35:12.000Z",
        notice: "Dated source-backed report; do not present its footage or figures as live without re-verification.",
      }
    );
  }

  return links;
}

export async function searchIncidentMedia(queryValue: string, maxResults = 5): Promise<IncidentMediaResult> {
  const query = sanitizeQuery(queryValue, "disaster response");
  const apiKey = readServerEnvironment("YOUTUBE_API_KEY");
  const safeLinks = buildSafeMediaLinks(query);
  const fallback = (retrievedAt: string, notice: string): IncidentMediaResult => ({
    query,
    mode: "safe-search-links",
    status: "cached",
    retrievedAt,
    videos: [],
    links: safeLinks,
    notice,
  });

  if (!apiKey) {
    try {
      const commons = await searchCommonsDisasterMedia(query, maxResults);
      if (commons.videos.length) {
        return {
          query,
          mode: "open-media",
          status: "live",
          retrievedAt: commons.retrievedAt,
          videos: commons.videos,
          links: safeLinks,
          notice: "Keyless open-licensed media is provided for visual context. It is not a verified live camera; confirm date, place and licence on the source page.",
        };
      }
    } catch {
      // Safe links below remain available when Commons has no usable result.
    }
    return fallback(
      new Date().toISOString(),
      "No keyless open-media result was available. Safe publisher, official and search links remain active."
    );
  }

  const url = new URL(YOUTUBE_SEARCH_ENDPOINT);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("safeSearch", "strict");
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("videoSyndicated", "true");
  url.searchParams.set("maxResults", String(Math.max(1, Math.min(10, Math.trunc(maxResults)))));
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);

  try {
    const payload = await fetchJson<YouTubeSearchResponse>(url.toString());
    const videos: MediaVideo[] = (payload.data.items ?? []).flatMap((item) => {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;
      if (!videoId || !snippet?.title || !snippet.publishedAt) return [];
      const thumbnailUrl = safeHttpsUrl(
        snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url
      );
      return [
        {
          id: videoId,
          title: snippet.title,
          channelTitle: snippet.channelTitle ?? "YouTube publisher",
          publishedAt: snippet.publishedAt,
          thumbnailUrl,
          watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
          provenance: {
            sourceId: "youtube-data",
            sourceName: "YouTube Data API",
            dataset: "YouTube search.list metadata",
            upstreamUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
            apiUrl: YOUTUBE_SEARCH_ENDPOINT,
            retrievedAt: payload.retrievedAt,
            publishedAt: snippet.publishedAt,
            status: "live",
            notice:
              "Metadata is live from YouTube. AEGIS does not certify that footage is live, authentic or captured at the incident location.",
          },
        },
      ];
    });

    return {
      query,
      mode: "youtube-api",
      status: "live",
      retrievedAt: payload.retrievedAt,
      videos,
      links: safeLinks,
      notice:
        "Verify publisher, recording time, location and reuse rights before treating any video as operational evidence.",
    };
  } catch (error) {
    return fallback(
      new Date().toISOString(),
      `YouTube metadata could not be retrieved (${publicErrorMessage(error)}). Safe source links are available.`
    );
  }
}
