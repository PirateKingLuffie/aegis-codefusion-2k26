import { fetchJson } from "./http";
import type { MediaVideo } from "./types";
import { safeHttpsUrl, sanitizeQuery, stripMarkup } from "./utils";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

interface CommonsResponse {
  query?: {
    pages?: Record<string, {
      pageid?: number;
      title?: string;
      canonicalurl?: string;
      imageinfo?: Array<{
        url?: string;
        descriptionurl?: string;
        mime?: string;
        timestamp?: string;
        user?: string;
        extmetadata?: {
          Artist?: { value?: string };
          LicenseShortName?: { value?: string };
          Credit?: { value?: string };
        };
      }>;
    }>;
  };
}

export async function searchCommonsDisasterMedia(queryValue: string, limit = 5): Promise<{
  videos: MediaVideo[];
  retrievedAt: string;
}> {
  const query = sanitizeQuery(queryValue, "disaster response").replace(/\b(current|official|field|report)\b/gi, " ").trim();
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrsearch", `filetype:video ${query}`);
  url.searchParams.set("gsrlimit", String(Math.max(1, Math.min(10, limit))));
  url.searchParams.set("prop", "imageinfo|info");
  url.searchParams.set("iiprop", "url|mime|timestamp|user|extmetadata");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  const payload = await fetchJson<CommonsResponse>(url.toString(), 7_000);
  const videos = Object.values(payload.data.query?.pages ?? {}).flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info) return [];
    const directUrl = safeHttpsUrl(info.url);
    const watchUrl = safeHttpsUrl(info.descriptionurl ?? page.canonicalurl);
    const mimeType = info.mime;
    if (!page.pageid || !page.title || !directUrl || !watchUrl || !mimeType?.startsWith("video/")) return [];
    const license = stripMarkup(info.extmetadata?.LicenseShortName?.value ?? "See Commons file page");
    const artist = stripMarkup(info.extmetadata?.Artist?.value ?? info.user ?? "Wikimedia Commons contributor");
    return [{
      id: `commons-${page.pageid}`,
      title: page.title.replace(/^File:/, ""),
      channelTitle: artist,
      publishedAt: info.timestamp ?? payload.retrievedAt,
      watchUrl,
      directUrl,
      mimeType,
      license,
      provenance: {
        sourceId: "wikimedia-commons",
        sourceName: "Wikimedia Commons",
        dataset: "MediaWiki API file metadata",
        upstreamUrl: watchUrl,
        apiUrl: url.toString(),
        retrievedAt: payload.retrievedAt,
        publishedAt: info.timestamp,
        status: "cached",
        license,
        notice: "Open-media search result, not a verified live camera. Confirm the file description, date, location and licence before use.",
      },
    } satisfies MediaVideo];
  });
  return { videos, retrievedAt: payload.retrievedAt };
}
