import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateLiveIntelligence,
  buildFreshness,
  buildSafeMediaLinks,
  clearLiveMemoryCache,
  getOfflineScenarioPreviews,
  getVerifiedSourceSnapshots,
  parseBoundingBox,
  parseLiveOptions,
  parseRssItems,
} from "../lib/live/index.ts";

test("RSS parsing decodes metadata without scraping linked pages", () => {
  const xml = `
    <rss><channel><item>
      <title>Assam &amp; Brahmaputra flood update</title>
      <link>https://example.com/report</link>
      <guid>report-1</guid>
      <pubDate>Fri, 24 Jul 2026 07:35:12 GMT</pubDate>
      <source url="https://example.com">Example News</source>
    </item></channel></rss>`;
  const [item] = parseRssItems(xml);
  assert.equal(item.title, "Assam & Brahmaputra flood update");
  assert.equal(item.link, "https://example.com/report");
  assert.equal(item.source, "Example News");
  assert.equal(item.publishedAt, "2026-07-24T07:35:12.000Z");
});

test("freshness and fallback records keep real and simulated data explicit", () => {
  const asOf = "2026-08-09T12:00:00.000Z";
  const freshness = buildFreshness("2026-07-24T07:35:12.000Z", asOf);
  assert.equal(freshness.band, "aging");
  assert.match(freshness.label, /days old/i);

  const [assam] = getVerifiedSourceSnapshots(asOf);
  assert.equal(assam.reality, "observed");
  assert.equal(assam.dataMode, "cached-source-snapshot");
  assert.equal(assam.provenance.status, "cached");
  assert.match(assam.provenance.upstreamUrl, /^https:\/\/apnews\.com\//);

  const [eit] = getOfflineScenarioPreviews(asOf);
  assert.equal(eit.reality, "simulated");
  assert.match(eit.title, /^SIMULATION/);
  assert.match(eit.provenance.notice, /SIMULATED DATA/);
});

test("query parsing supports world, bounding-box and proximity views", () => {
  assert.deepEqual(parseBoundingBox("70,20,80,30"), {
    west: 70,
    south: 20,
    east: 80,
    north: 30,
  });
  assert.equal(parseBoundingBox("200,20,80,30"), undefined);
  const options = parseLiveOptions(
    "https://aegis.local/api/live?q=Assam%20floods&lat=26.2&lon=92.9&radiusKm=300&includeMedia=true"
  );
  assert.equal(options.query, "Assam floods");
  assert.deepEqual(options.proximity, { latitude: 26.2, longitude: 92.9, radiusKm: 300 });
  assert.equal(options.includeMedia, true);
});

test("safe media fallback uses links and source metadata only", () => {
  const links = buildSafeMediaLinks("Assam floods");
  assert.ok(links.some((link) => link.kind === "youtube-search"));
  assert.ok(links.some((link) => link.kind === "official" && link.publisher === "ASDMA"));
  assert.ok(links.some((link) => link.kind === "news-report" && link.publisher === "Associated Press"));
  assert.ok(links.every((link) => link.url.startsWith("https://")));
});

test("aggregator normalizes all adapters and separates simulation fixtures", async () => {
  const originalFetch = globalThis.fetch;
  const previousAppName = process.env.RELIEFWEB_APPNAME;
  process.env.RELIEFWEB_APPNAME = "approved-test-app";
  clearLiveMemoryCache();

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("eonet.gsfc.nasa.gov")) {
      return Response.json({
        events: [
          {
            id: "EONET-1",
            title: "Open wildfire event",
            categories: [{ id: "wildfires", title: "Wildfires" }],
            sources: [{ id: "TEST", url: "https://example.com/eonet" }],
            geometry: [{ date: "2026-08-09T10:00:00Z", type: "Point", coordinates: [10, 20] }],
          },
        ],
      });
    }
    if (url.includes("earthquake.usgs.gov")) {
      return Response.json({
        features: [
          {
            id: "us-test-1",
            geometry: { type: "Point", coordinates: [30, 40, 12] },
            properties: {
              mag: 6.1,
              title: "M 6.1 test earthquake",
              place: "Test Region",
              time: Date.parse("2026-08-09T09:00:00Z"),
              updated: Date.parse("2026-08-09T10:00:00Z"),
              url: "https://earthquake.usgs.gov/test",
              status: "reviewed",
              sig: 600,
            },
          },
        ],
      });
    }
    if (url.includes("api.reliefweb.int")) {
      return Response.json({
        data: [
          {
            id: 7,
            fields: {
              title: "Cyclone situation report",
              url_alias: "https://reliefweb.int/report/test",
              date: { created: "2026-08-09T08:00:00Z" },
              primary_country: { name: "Testland", iso3: "TST", location: { lat: 5, lon: 6 } },
              disaster_type: [{ name: "Tropical Cyclone" }],
              country: [{ name: "Testland", iso3: "TST" }],
              source: [{ shortname: "OCHA" }],
            },
          },
        ],
      });
    }
    if (url.includes("news.google.com/rss")) {
      return new Response(
        "<rss><channel><item><title>Flood warning issued</title><link>https://example.com/news</link><pubDate>Sun, 09 Aug 2026 10:00:00 GMT</pubDate><source url=\"https://example.com\">Example News</source></item></channel></rss>",
        { headers: { "Content-Type": "application/rss+xml" } }
      );
    }
    if (url.includes("gdacs.org/gdacsapi")) {
      return Response.json({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "Point", coordinates: [77, 28] },
          properties: {
            eventtype: "FL",
            eventid: 99,
            episodeid: 1,
            name: "Flood in Testland",
            alertlevel: "Orange",
            iscurrent: "true",
            country: "Testland",
            fromdate: "2026-08-09T08:00:00Z",
            datemodified: "2026-08-09T10:00:00Z",
            source: "GLOFAS",
            url: { report: "https://www.gdacs.org/report.aspx?eventid=99" },
            severitydata: { severity: 2, severitytext: "Orange flood alert", severityunit: "index" },
          },
        }],
      });
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const result = await aggregateLiveIntelligence({ limitPerSource: 5, eonetDays: 30 });
    assert.equal(result.sources.filter((source) => source.status === "live").length, 5);
    assert.ok(result.incidents.length >= 5);
    assert.ok(result.incidents.every((incident) => incident.reality === "observed"));
    assert.ok(result.offlineScenarioPreviews.every((incident) => incident.reality === "simulated"));
    assert.ok(result.verifiedSnapshots.some((incident) => /Assam/i.test(incident.title)));
    const activeGdacs = result.incidents.find((incident) => incident.provenance.sourceId === "gdacs");
    assert.equal(activeGdacs?.state, "active");
    assert.equal(activeGdacs?.dataMode, "near-real-time");
    assert.deepEqual(activeGdacs?.location.coordinates, { latitude: 28, longitude: 77 });
    assert.equal(activeGdacs?.provenance.status, "live");
  } finally {
    globalThis.fetch = originalFetch;
    clearLiveMemoryCache();
    if (previousAppName === undefined) delete process.env.RELIEFWEB_APPNAME;
    else process.env.RELIEFWEB_APPNAME = previousAppName;
  }
});

test(
  "official public feeds return at least one live source",
  { skip: process.env.AEGIS_LIVE_NETWORK_TEST !== "1", timeout: 25_000 },
  async () => {
    clearLiveMemoryCache();
    const result = await aggregateLiveIntelligence({ limitPerSource: 3, eonetDays: 30 });
    assert.ok(result.counts.liveSources >= 1);
    assert.notEqual(result.mode, "offline-fallback");
    assert.ok(result.incidents.every((incident) => incident.reality === "observed"));
  }
);
