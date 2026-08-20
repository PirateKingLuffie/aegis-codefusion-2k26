import type { AegisCoordinate } from "./types";

export const WORLD_GLOBE_CENTER: AegisCoordinate = [24, 16];
export const WORLD_GLOBE_ZOOM = 2;
export const WORLD_GLOBE_PITCH = 0;
export const WORLD_GLOBE_BEARING = 0;
export const WORLD_GLOBE_MAX_FOCUS_ZOOM = 6.5;

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

/** Regional searches stay spherical; closer targets use Mercator for reliable street detail. */
export function worldFocusUsesGlobe(targetZoom: number): boolean {
  return targetZoom <= WORLD_GLOBE_MAX_FOCUS_ZOOM;
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
