import type { MediaVideo } from "./types";

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function asHttpsUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts a YouTube video id only from known HTTPS YouTube hosts and paths.
 * The strict allow-list prevents a lookalike URL from reaching an in-app iframe.
 */
export function youtubeVideoIdFromUrl(value: string | undefined): string | undefined {
  const url = asHttpsUrl(value);
  if (!url) return undefined;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate: string | null | undefined;

  if (host === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0];
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else if (["embed", "shorts", "live"].includes(parts[0] ?? "")) candidate = parts[1];
  }

  return candidate && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : undefined;
}

/** Returns a privacy-enhanced YouTube embed URL, or undefined for untrusted URLs. */
export function deriveSafeYouTubeEmbedUrl(video: Pick<MediaVideo, "embedUrl" | "watchUrl">): string | undefined {
  const videoId = youtubeVideoIdFromUrl(video.embedUrl) ?? youtubeVideoIdFromUrl(video.watchUrl);
  return videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`
    : undefined;
}

/** Accepts only HTTPS direct video resources. */
export function deriveSafeDirectVideoUrl(video: Pick<MediaVideo, "directUrl" | "mimeType">): string | undefined {
  if (video.mimeType && !video.mimeType.startsWith("video/")) return undefined;
  return asHttpsUrl(video.directUrl)?.toString();
}

export type MediaPlayback =
  | { kind: "direct"; url: string }
  | { kind: "youtube"; url: string }
  | { kind: "unavailable" };

export function resolveMediaPlayback(
  video: Pick<MediaVideo, "directUrl" | "mimeType" | "embedUrl" | "watchUrl">
): MediaPlayback {
  const directUrl = deriveSafeDirectVideoUrl(video);
  if (directUrl) return { kind: "direct", url: directUrl };

  const embedUrl = deriveSafeYouTubeEmbedUrl(video);
  if (embedUrl) return { kind: "youtube", url: embedUrl };

  return { kind: "unavailable" };
}
