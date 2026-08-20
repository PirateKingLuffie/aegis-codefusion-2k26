import type { LiveIncident } from "./types";
import { buildFreshness } from "./utils";

const ASSAM_AP_SOURCE =
  "https://apnews.com/article/india-floods-monsoon-assam-brahmaputra-river-042b23c3945161454c0d836439124d9c";
const ASSAM_OFFICIAL_REPORTS =
  "https://asdma.assam.gov.in/information-services/assam-flood-report";
const ASSAM_OBSERVED_AT = "2026-07-24T07:35:12.000Z";

export function getVerifiedSourceSnapshots(retrievedAt = new Date().toISOString()): LiveIncident[] {
  return [
    {
      id: "aegis-cache:assam-flood-2026-07-24-ap",
      title: "Assam monsoon floods — verified 24 July source snapshot",
      summary:
        "A cached AP report recorded severe Brahmaputra flooding across Assam. This is a source-backed historical snapshot, not a claim that conditions remain unchanged today.",
      category: "flood",
      severity: "critical",
      state: "monitoring",
      reality: "observed",
      dataMode: "cached-source-snapshot",
      observedAt: ASSAM_OBSERVED_AT,
      updatedAt: ASSAM_OBSERVED_AT,
      freshness: buildFreshness(ASSAM_OBSERVED_AT, retrievedAt),
      location: {
        name: "Assam, India",
        country: "India",
        countryCode: "IND",
        coordinates: { latitude: 26.2006, longitude: 92.9376 },
      },
      geometry: { type: "Point", coordinates: [92.9376, 26.2006] },
      impactMetrics: [
        {
          key: "reported-deaths",
          label: "Reported deaths",
          value: 50,
          unit: "people",
          qualifier: "at least, as reported 24 July 2026",
          sourceUrl: ASSAM_AP_SOURCE,
        },
        {
          key: "reported-displaced",
          label: "Reported displaced",
          value: 700_000,
          unit: "people",
          qualifier: "as reported 24 July 2026",
          sourceUrl: ASSAM_AP_SOURCE,
        },
        {
          key: "reported-relief-camps",
          label: "People in government relief camps",
          value: 300_000,
          unit: "people",
          qualifier: "nearly, as reported 24 July 2026",
          sourceUrl: ASSAM_AP_SOURCE,
        },
        {
          key: "reported-villages-submerged",
          label: "Villages submerged",
          value: 900,
          unit: "villages",
          qualifier: "nearly, as reported 24 July 2026",
          sourceUrl: ASSAM_AP_SOURCE,
        },
        {
          key: "reported-homes-without-power",
          label: "Homes without electricity",
          value: 7_000,
          unit: "homes",
          qualifier: "more than, as reported 24 July 2026",
          sourceUrl: ASSAM_AP_SOURCE,
        },
      ],
      links: [
        { label: "AP verified report", url: ASSAM_AP_SOURCE, kind: "news" },
        { label: "Assam disaster authority reports", url: ASSAM_OFFICIAL_REPORTS, kind: "official" },
        {
          label: "Current Assam flood coverage",
          url: "https://news.google.com/search?q=Assam%20floods&hl=en-IN&gl=IN&ceid=IN%3Aen",
          kind: "media-search",
        },
      ],
      provenance: {
        sourceId: "aegis-verified-cache",
        sourceName: "AEGIS verified source cache",
        dataset: "AP Assam flood report snapshot",
        upstreamUrl: ASSAM_AP_SOURCE,
        retrievedAt,
        publishedAt: ASSAM_OBSERVED_AT,
        status: "cached",
        notice:
          "Real observed event, cached from a dated source. Open the official/news links to verify current conditions before operational use.",
      },
      tags: ["assam", "india", "brahmaputra", "flood", "verified-cache", "real-event"],
    },
  ];
}

export function getOfflineScenarioPreviews(retrievedAt = new Date().toISOString()): LiveIncident[] {
  return [
    {
      id: "aegis-simulation:eit-campus-flash-flood-v1",
      title: "SIMULATION — EIT Faridabad campus flash-flood rehearsal",
      summary:
        "Deterministic offline rehearsal fixture for interface continuity. Every depth, route, impact and timeline value must come from the simulation engine; this record is not a real alert.",
      category: "flood",
      severity: "high",
      state: "closed",
      reality: "simulated",
      dataMode: "simulated-demo",
      observedAt: "2026-08-09T06:00:00.000Z",
      updatedAt: "2026-08-09T06:45:00.000Z",
      freshness: buildFreshness("2026-08-09T06:45:00.000Z", retrievedAt),
      location: {
        name: "Echelon Institute of Technology, Faridabad",
        country: "India",
        countryCode: "IND",
        coordinates: { latitude: 28.3912265, longitude: 77.4398682 },
      },
      geometry: { type: "Point", coordinates: [77.4398682, 28.3912265] },
      impactMetrics: [],
      links: [
        {
          label: "EIT official location disclosure",
          url: "https://eitfaridabad.com/blog/mandatory-disclosure/",
          kind: "official",
        },
      ],
      provenance: {
        sourceId: "aegis-simulation",
        sourceName: "AEGIS deterministic offline fixture",
        dataset: "EIT campus flood rehearsal v1",
        retrievedAt,
        status: "cached",
        notice: "SIMULATED DATA — never present this fixture as an observed disaster.",
      },
      tags: ["simulation", "offline", "eit", "faridabad", "flood-rehearsal"],
    },
  ];
}
