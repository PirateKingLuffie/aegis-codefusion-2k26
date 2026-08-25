import type { AegisCoordinate } from "./types";

export const WORLD_GLOBE_CENTER: AegisCoordinate = [24, 16];
export const WORLD_GLOBE_ZOOM = 1.96;
export const WORLD_GLOBE_PITCH = 12;
export const WORLD_GLOBE_BEARING = -8;

/**
 * Leave the spherical renderer before local-detail tiles are needed. The
 * buffer below the raster hand-off prevents a one-frame black surface while
 * MapLibre changes projection during a wheel or trackpad gesture.
 */
export const WORLD_GLOBE_EXIT_ZOOM = 5.25;
export const WORLD_GLOBE_REENTRY_ZOOM = 4.7;
export const WORLD_GLOBE_ORBIT_MAX_ZOOM = 3.6;
export const WORLD_GLOBE_DEFAULT_ORBIT_SPEED = 2.5;
export const WORLD_GLOBE_DEFAULT_IDLE_RESUME_MS = 1_500;
export const WORLD_GLOBE_INITIAL_ORBIT_DELAY_MS = 300;
export const WORLD_DETAIL_IMAGERY_LAYER_MAX_ZOOM = 20;
export const WORLD_DETAIL_IMAGERY_OPACITY_STOPS = [
  0, 0.92,
  5.5, 0.88,
  8, 0.78,
  11, 0.62,
  14, 0.34,
  16, 0.16,
  18, 0.08,
  20, 0.04,
] as const;

export const WORLD_CONTEXT_LAYER_IDS = {
  roadCasing: "aegis-world-road-casing",
  roads: "aegis-world-roads",
  roadLabels: "aegis-world-road-labels",
  countryLabels: "aegis-world-country-context-labels",
  cityLabels: "aegis-world-city-context-labels",
} as const;

/** Glyph-free label safety net used when a WebGL runtime drops vector symbols. */
export const WORLD_RASTER_LABELS = {
  sourceId: "aegis-world-carto-labels",
  layerId: "aegis-world-carto-labels-layer",
  tiles: [
    "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
    "https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
  ],
  minzoom: 0,
  maxzoom: 20,
  attribution: "CARTO / OpenStreetMap contributors",
} as const;

/** Keyless high-zoom streets/buildings safety net; labels are a separate layer. */
export const WORLD_RASTER_STREETS = {
  sourceId: "aegis-world-carto-streets",
  layerId: "aegis-world-carto-streets-layer",
  tiles: [
    "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
    "https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
  ],
  minzoom: 0,
  maxzoom: 20,
  layerMinzoom: 5,
  attribution: "CARTO / OpenStreetMap contributors",
  opacityStops: [
    0, 0,
    5.5, 0,
    7, 0.28,
    9, 0.76,
    11, 0.94,
    20, 0.99,
  ],
} as const;

export const WORLD_IMAGERY_SOURCES = [
  {
    id: "aegis-world-blue-marble",
    label: "NASA Blue Marble",
    tiles: [
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/all/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
    ],
    maxzoom: 8,
    attribution: "NASA EOSDIS GIBS",
  },
  {
    id: "aegis-world-sentinel",
    label: "EOX Sentinel-2 cloudless 2020",
    tiles: [
      "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
    ],
    maxzoom: 14,
    attribution: "Sentinel-2 cloudless 2020 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)",
  },
] as const;

export const WORLD_IMAGERY_LAYER_IDS = [
  "aegis-world-blue-marble-layer",
  "aegis-world-sentinel-layer",
] as const;

export interface WorldCamera {
  center: AegisCoordinate;
  zoom: number;
  pitch: number;
  bearing: number;
}

export type WorldProjectionMode = "globe" | "mercator";

/**
 * Projection selection with hysteresis. A zoom gesture can hover around a
 * boundary for several frames; separate exit and re-entry thresholds stop the
 * renderer from repeatedly rebuilding its projection.
 */
export function worldProjectionModeForZoom(
  targetZoom: number,
  currentMode: WorldProjectionMode = "globe",
): WorldProjectionMode {
  if (currentMode === "globe") {
    return targetZoom < WORLD_GLOBE_EXIT_ZOOM ? "globe" : "mercator";
  }
  return targetZoom <= WORLD_GLOBE_REENTRY_ZOOM ? "globe" : "mercator";
}

/** Regional searches stay spherical; closer targets use Mercator for reliable street detail. */
export function worldFocusUsesGlobe(targetZoom: number): boolean {
  return worldProjectionModeForZoom(targetZoom, "globe") === "globe";
}

/** Keeps overview requests recognizably three-dimensional without over-tilting labels. */
export function worldPitchForFocus(targetZoom: number, requestedPitch?: number): number {
  if (!worldFocusUsesGlobe(targetZoom)) return requestedPitch ?? 18;
  const requested = requestedPitch ?? WORLD_GLOBE_PITCH;
  return Math.min(18, Math.max(8, requested || WORLD_GLOBE_PITCH));
}

/** Controlled consumers own the initial scene; only an uncontrolled map may auto-enter the twin. */
export function shouldAutoFlyToTwin(input: {
  enabled: boolean;
  hasInitialCamera: boolean;
  controlledView: boolean;
}): boolean {
  return input.enabled && !input.hasInitialCamera && !input.controlledView;
}

export interface ProviderContextLabelLayer {
  id: string;
  type: string;
  sourceLayer?: string;
  hasTextField: boolean;
  filter?: unknown;
}

/** Identifies provider-owned geographic text layers that should stay above AEGIS fills. */
export function isProviderContextLabelLayer(layer: ProviderContextLabelLayer): boolean {
  if (layer.type !== "symbol" || layer.id.startsWith("aegis-") || !layer.hasTextField) return false;
  return /boundary|country|state|place|settlement|road|transport|water|poi|label|name/i.test(
    `${layer.id} ${layer.sourceLayer ?? ""}`,
  );
}

/** Country names receive stable globe-specific styling above operational fills. */
export function isProviderCountryLabelLayer(layer: ProviderContextLabelLayer): boolean {
  if (!isProviderContextLabelLayer(layer)) return false;
  let serializedFilter = "";
  try {
    serializedFilter = JSON.stringify(layer.filter ?? "");
  } catch {
    // An invalid provider filter is not a country-label candidate.
  }
  return /country|admin[-_ ]?(?:0|2)/i.test(
    `${layer.id} ${layer.sourceLayer ?? ""} ${serializedFilter}`,
  );
}

/** Keeps the complete globe large on compact laptop screens without clipping its horizon. */
export function worldCameraForViewport(width: number, height: number): WorldCamera {
  const shortEdge = Math.max(320, Math.min(width, height));
  const compactAdjustment = shortEdge < 560 ? -0.12 : shortEdge > 820 ? 0.12 : 0;
  return {
    center: WORLD_GLOBE_CENTER,
    zoom: WORLD_GLOBE_ZOOM + compactAdjustment,
    pitch: WORLD_GLOBE_PITCH,
    bearing: WORLD_GLOBE_BEARING,
  };
}

export function orbitResumeDeadline(
  nowMs: number,
  idleResumeMs: number,
  activeFlightMs = 0,
): number {
  return nowMs + Math.max(1_500, idleResumeMs) + Math.max(0, activeFlightMs);
}

/** Initial orbit starts promptly; the longer idle delay is reserved for real interaction. */
export function initialOrbitResumeDeadline(
  nowMs: number,
  startupDelayMs = WORLD_GLOBE_INITIAL_ORBIT_DELAY_MS,
): number {
  return nowMs + Math.min(1_500, Math.max(250, startupDelayMs));
}

export function nextOrbitLongitude(
  longitude: number,
  speedDegreesPerSecond: number,
  elapsedSeconds: number,
): number {
  const speed = Math.min(6, Math.max(0.05, speedDegreesPerSecond));
  const elapsed = Math.min(0.15, Math.max(0, elapsedSeconds));
  return ((longitude + speed * elapsed + 540) % 360) - 180;
}

export function shouldAdvanceOrbit(input: {
  worldView: boolean;
  enabled: boolean;
  reducedMotion: boolean;
  documentVisible: boolean;
  nowMs: number;
  resumeAtMs: number;
  lastFrameMs: number;
  moving: boolean;
}): boolean {
  return input.worldView
    && input.enabled
    && !input.reducedMotion
    && input.documentVisible
    && input.nowMs >= input.resumeAtMs
    && input.nowMs - input.lastFrameMs >= 32
    && !input.moving;
}
