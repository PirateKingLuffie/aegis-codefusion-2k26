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

type CuratedOpenMedia = {
  terms: RegExp;
  id: string;
  title: string;
  directUrl: string;
  watchUrl: string;
  publishedAt: string;
  license: string;
  contributor: string;
};

/**
 * Small, source-linked Commons safety set for when a live search provider is
 * unavailable at the edge. These clips are hazard context only: never live or
 * incident-specific evidence. Keeping the metadata here guarantees that the
 * in-product viewer remains demonstrable without a paid key or a redirect.
 */
const CURATED_OPEN_MEDIA: CuratedOpenMedia[] = [
  {
    terms: /cyclone|hurricane|typhoon|storm|surge/i,
    id: "commons-cyclone-dudzai-eye-2026",
    title: "Tropical Cyclone Dudzai eye — CIRA satellite loop",
    directUrl: "https://upload.wikimedia.org/wikipedia/commons/7/73/Tropical_Cyclone_Dudzai%E2%80%99s_Eye_%28CIRA_2026-01-12_-_labels%29.webm",
    watchUrl: "https://commons.wikimedia.org/wiki/File:Tropical_Cyclone_Dudzai%E2%80%99s_Eye_(CIRA_2026-01-12_-_labels).webm",
    publishedAt: "2026-01-15T09:38:44.000Z",
    license: "Public domain",
    contributor: "CIRA / Wikimedia Commons",
  },
  {
    terms: /earthquake|seismic|quake/i,
    id: "commons-earthquake-plant-shaking",
    title: "Plant shaking after an earthquake",
    directUrl: "https://upload.wikimedia.org/wikipedia/commons/d/db/Plant_shaking_after_earthquake.mpg",
    watchUrl: "https://commons.wikimedia.org/wiki/File:Plant_shaking_after_earthquake.mpg",
    publishedAt: "2024-10-19T02:08:38.000Z",
    license: "CC BY-SA 4.0",
    contributor: "Panamitsu / Wikimedia Commons",
  },
  {
    terms: /wildfire|forest fire|bushfire|fire/i,
    id: "commons-wildfire-pyrocumulus",
    title: "Pyrocumulus over a wildfire in Czechia",
    directUrl: "https://upload.wikimedia.org/wikipedia/commons/9/9f/Pyrocumulus_2022_Czechia.webm",
    watchUrl: "https://commons.wikimedia.org/wiki/File:Pyrocumulus_2022_Czechia.webm",
    publishedAt: "2024-07-29T07:26:00.000Z",
    license: "CC BY 4.0",
    contributor: "Phoenix CZE / Wikimedia Commons",
  },
  {
    terms: /landslide|mudslide|debris flow/i,
    id: "commons-landslide-shuicheng-2019",
    title: "2019 Shuicheng County landslide",
    directUrl: "https://upload.wikimedia.org/wikipedia/commons/7/77/2019_China_Guizhou_Shuicheng_County_Jichang_Town_Landslide.webm",
    watchUrl: "https://commons.wikimedia.org/wiki/File:2019_China_Guizhou_Shuicheng_County_Jichang_Town_Landslide.webm",
    publishedAt: "2019-07-24T09:43:57.000Z",
    license: "CC0",
    contributor: "Huangdan2060 / Wikimedia Commons",
  },
  {
    terms: /flood|inundation|monsoon|tsunami|disaster/i,
    id: "commons-flood-azraq-2023",
    title: "Azraq flooding — May 2023",
    directUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c2/Azraq_flooding_May_2023.webm",
    watchUrl: "https://commons.wikimedia.org/wiki/File:Azraq_flooding_May_2023.webm",
    publishedAt: "2024-02-22T19:25:12.000Z",
    license: "CC0",
    contributor: "Iainsimpsonstewart / Wikimedia Commons",
  },
];

export function getCuratedOpenMediaContext(queryValue: string, maxResults = 2): MediaVideo[] {
  const query = sanitizeQuery(queryValue, "disaster response");
  const matching = CURATED_OPEN_MEDIA.filter((item) => item.terms.test(query));
  const selected = matching.length ? matching : CURATED_OPEN_MEDIA.slice(-1);
  const retrievedAt = new Date().toISOString();
  return selected.slice(0, Math.max(1, Math.min(2, maxResults))).map((item) => ({
    id: item.id,
    title: item.title,
    channelTitle: item.contributor,
    publishedAt: item.publishedAt,
    watchUrl: item.watchUrl,
    directUrl: item.directUrl,
    mimeType: item.directUrl.endsWith(".mpg") ? "video/mpeg" : "video/webm",
    license: item.license,
    provenance: {
      sourceId: "aegis-verified-cache",
      sourceName: "Wikimedia Commons context set",
      dataset: "Curated open-media fallback",
      upstreamUrl: item.watchUrl,
      retrievedAt,
      publishedAt: item.publishedAt,
      status: "cached",
      license: item.license,
      notice: "Context footage only. It is not live, incident-specific or proof of the selected event; verify the Commons file page before operational use.",
    },
  }));
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
      // The source-linked open-media context set below remains available when
      // the edge cannot complete a live Commons API query.
    }
    const retrievedAt = new Date().toISOString();
    return {
      query,
      mode: "open-media",
      status: "cached",
      retrievedAt,
      videos: getCuratedOpenMediaContext(query, maxResults),
      links: safeLinks,
      notice: "The live open-media search returned no playable clip, so AEGIS is showing source-linked hazard context from Wikimedia Commons. It is not live or incident-specific evidence.",
    };
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
