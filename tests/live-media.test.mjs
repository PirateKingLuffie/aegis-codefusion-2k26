import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSafeDirectVideoUrl,
  deriveSafeYouTubeEmbedUrl,
  resolveMediaPlayback,
  youtubeVideoIdFromUrl,
} from "../lib/live/embed.ts";
import { getCuratedOpenMediaContext } from "../lib/live/media.ts";

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

test("curated zero-key media stays playable and truth-labelled by hazard", () => {
  const cyclone = getCuratedOpenMediaContext("Tropical Cyclone SAUDEL official footage", 2);
  const flood = getCuratedOpenMediaContext("Assam monsoon flood", 2);

  assert.equal(cyclone.length, 1);
  assert.match(cyclone[0].title, /Cyclone/i);
  assert.equal(resolveMediaPlayback(cyclone[0]).kind, "direct");
  assert.equal(cyclone[0].provenance.status, "cached");
  assert.match(cyclone[0].provenance.notice ?? "", /not live|not live,/i);

  assert.equal(flood.length, 1);
  assert.match(flood[0].title, /flood/i);
  assert.equal(resolveMediaPlayback(flood[0]).kind, "direct");
});
