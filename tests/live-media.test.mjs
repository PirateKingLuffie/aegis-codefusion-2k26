import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSafeDirectVideoUrl,
  deriveSafeYouTubeEmbedUrl,
  resolveMediaPlayback,
  youtubeVideoIdFromUrl,
} from "../lib/live/embed.ts";
import { buildSafeMediaLinks } from "../lib/live/media.ts";
import { readFile } from "node:fs/promises";

const ID = "dQw4w9WgXcQ";

test("YouTube playback accepts known HTTPS URL forms and uses privacy-enhanced embeds", () => {
  assert.equal(youtubeVideoIdFromUrl(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youtubeVideoIdFromUrl(`https://youtu.be/${ID}?feature=shared`), ID);
  assert.equal(youtubeVideoIdFromUrl(`https://m.youtube.com/shorts/${ID}`), ID);
  assert.equal(youtubeVideoIdFromUrl(`https://www.youtube-nocookie.com/embed/${ID}`), ID);
  assert.equal(
    deriveSafeYouTubeEmbedUrl({ watchUrl: `https://youtube.com/watch?v=${ID}` }),
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0&modestbranding=1`
  );
});

test("YouTube playback rejects non-HTTPS, lookalike hosts and malformed ids", () => {
  assert.equal(youtubeVideoIdFromUrl(`http://youtube.com/watch?v=${ID}`), undefined);
  assert.equal(youtubeVideoIdFromUrl(`https://youtube.com.evil.example/watch?v=${ID}`), undefined);
  assert.equal(youtubeVideoIdFromUrl("https://youtube.com/watch?v=not-valid"), undefined);
  assert.equal(youtubeVideoIdFromUrl("javascript:alert(1)"), undefined);
});

test("direct playback requires an HTTPS video resource", () => {
  assert.equal(
    deriveSafeDirectVideoUrl({ directUrl: "https://upload.wikimedia.org/example.webm", mimeType: "video/webm" }),
    "https://upload.wikimedia.org/example.webm"
  );
  assert.equal(deriveSafeDirectVideoUrl({ directUrl: "http://example.com/clip.mp4", mimeType: "video/mp4" }), undefined);
  assert.equal(deriveSafeDirectVideoUrl({ directUrl: "https://example.com/image.jpg", mimeType: "image/jpeg" }), undefined);
});

test("playback prefers direct open media and degrades safely", () => {
  assert.deepEqual(resolveMediaPlayback({
    directUrl: "https://upload.wikimedia.org/example.webm",
    mimeType: "video/webm",
    embedUrl: `https://youtube.com/embed/${ID}`,
    watchUrl: `https://youtube.com/watch?v=${ID}`,
  }), { kind: "direct", url: "https://upload.wikimedia.org/example.webm" });

  assert.deepEqual(resolveMediaPlayback({
    watchUrl: "https://example.com/not-embeddable",
  }), { kind: "unavailable" });
});

test("safe incident media links never imply that a search result is live footage", () => {
  const links = buildSafeMediaLinks("Assam monsoon flood");
  assert.ok(links.some((link) => link.kind === "youtube-search"));
  assert.ok(links.every((link) => link.notice === undefined || /search|verify|dated/i.test(link.notice)));
});

test("zero-key media has no generic curated clip substitution", async () => {
  const source = await readFile(new URL("../lib/live/media.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /CURATED_OPEN_MEDIA|Curated open-media fallback/);
  assert.match(source, /Do not substitute another disaster/);
  assert.match(source, /isIncidentMediaMatch/);
});
