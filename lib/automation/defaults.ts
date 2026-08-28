import type { IncidentCategory } from "@/lib/live/types";
import type { AutomationCapabilities, AutomationPolicy, AutomationRegion } from "./types";

export const AUTOMATION_POLICY_DEFAULTS: AutomationPolicy = {
  requireOfficialSource: true,
  maxAgeMinutes: 24 * 60,
  maxRetrievalAgeMinutes: 45,
  maxRegions: 16,
  maxIncidents: 240,
};

/** Ready-to-use examples. They are watches, not evacuation orders or subscriptions. */
export const DEFAULT_AUTOMATION_REGIONS: AutomationRegion[] = [
  {
    id: "eit-faridabad",
    name: "EIT Faridabad campus",
    enabled: true,
    geometry: { kind: "circle", center: { latitude: 28.3912265, longitude: 77.4398682 }, radiusKm: 8 },
    hazards: ["flood", "severe-storm", "earthquake", "industrial"],
    minimumSeverity: "medium",
    maxAgeMinutes: 24 * 60,
    cooldownMinutes: 60,
  },
  {
    id: "assam-brahmaputra",
    name: "Assam · Brahmaputra corridor",
    enabled: false,
    geometry: { kind: "bounds", west: 89.5, south: 24.0, east: 96.5, north: 28.5 },
    hazards: ["flood", "landslide", "severe-storm"],
    minimumSeverity: "medium",
    maxAgeMinutes: 24 * 60,
    cooldownMinutes: 60,
  },
  {
    id: "global-monitor",
    name: "Global incident watch",
    enabled: false,
    geometry: { kind: "bounds", west: -180, south: -84, east: 180, north: 84 },
    hazards: [],
    minimumSeverity: "high",
    maxAgeMinutes: 6 * 60,
    cooldownMinutes: 120,
  },
];

export const AUTOMATION_SUPPORTED_HAZARDS: IncidentCategory[] = [
  "flood",
  "earthquake",
  "wildfire",
  "cyclone",
  "severe-storm",
  "volcano",
  "landslide",
  "drought",
  "extreme-temperature",
  "industrial",
  "humanitarian",
  "other",
];

export const AUTOMATION_CAPABILITIES: AutomationCapabilities = {
  schemaVersion: "1.0",
  dryRun: true,
  notificationsEnabled: false,
  persistence: "browser-or-caller-managed",
  maxRegions: AUTOMATION_POLICY_DEFAULTS.maxRegions,
  maxIncidents: AUTOMATION_POLICY_DEFAULTS.maxIncidents,
  supportedHazards: AUTOMATION_SUPPORTED_HAZARDS,
  supportedChannels: ["in-app"],
  notes: [
    "Calculations run deterministically from the supplied feed and watch regions.",
    "No SMS, phone call, email, push notification or dispatch action is sent by this endpoint.",
    "A caller may persist returned receipts and send a proposed alert only after human review and an authorized provider is configured.",
    "Observed, cached and simulated records remain explicitly labelled.",
  ],
};
