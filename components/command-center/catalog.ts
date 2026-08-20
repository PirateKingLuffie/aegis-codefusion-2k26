import {
  CloudRain,
  Flame,
  FlaskConical,
  RadioTower,
  Waves,
} from "lucide-react";

export type HazardId = "flood" | "earthquake" | "wildfire" | "cyclone" | "industrial";

export type HazardDefinition = {
  id: HazardId;
  label: string;
  shortLabel: string;
  status: "READY" | "BETA";
  accent: string;
  icon: typeof Waves;
  summary: string;
  inputs: string[];
};

export const HAZARDS: HazardDefinition[] = [
  {
    id: "flood",
    label: "Urban Flood",
    shortLabel: "Flood",
    status: "READY",
    accent: "#2f8fff",
    icon: Waves,
    summary: "Depth, arrival, access, damage and evacuation",
    inputs: ["Rainfall", "Terrain", "Drainage", "River stage"],
  },
  {
    id: "earthquake",
    label: "Earthquake Cascade",
    shortLabel: "Quake",
    status: "READY",
    accent: "#c9a55a",
    icon: RadioTower,
    summary: "Shaking, structural exposure, access and rescue demand",
    inputs: ["Magnitude", "Depth", "Vulnerability", "Occupancy"],
  },
  {
    id: "wildfire",
    label: "Wildfire Spread",
    shortLabel: "Wildfire",
    status: "READY",
    accent: "#ff4354",
    icon: Flame,
    summary: "Perimeter, smoke, access and staged evacuation",
    inputs: ["Ignition", "Wind", "Fuel", "Humidity"],
  },
  {
    id: "cyclone",
    label: "Cyclone & Surge",
    shortLabel: "Cyclone",
    status: "READY",
    accent: "#c9a55a",
    icon: CloudRain,
    summary: "Track, wind, surge and infrastructure disruption",
    inputs: ["Track", "Wind", "Rainfall", "Tide"],
  },
  {
    id: "industrial",
    label: "Chemical Release",
    shortLabel: "Industrial",
    status: "READY",
    accent: "#ff4354",
    icon: FlaskConical,
    summary: "Plume, exposure, access and protective action",
    inputs: ["Material", "Release", "Wind", "Stability"],
  },
];

export const ROAD_EVENTS = [
  { time: "T+08", name: "Service Road R-17", state: "Degraded", tone: "amber" },
  { time: "T+16", name: "Campus Gate East", state: "Closure predicted", tone: "red" },
  { time: "T+24", name: "Bridge B approach", state: "Critical", tone: "red" },
  { time: "T+31", name: "Route R-04", state: "Protected corridor", tone: "blue" },
];

export const COMING_SOON = [
  "Landslide",
  "Tsunami",
  "Heatwave",
  "Urban fire",
  "Dam breach",
  "Disease surge",
];
