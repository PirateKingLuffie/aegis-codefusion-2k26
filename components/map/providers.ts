export type ZeroCostMapProviderId = "openfreemap-dark" | "carto-dark" | "custom";

export interface ZeroCostMapProvider {
  id: ZeroCostMapProviderId;
  label: string;
  styleUrl: string;
  attributionLabel: string;
  attributionUrl: string;
}

export const ZERO_COST_MAP_PROVIDERS: readonly ZeroCostMapProvider[] = [
  {
    id: "openfreemap-dark",
    label: "OpenFreeMap Dark",
    styleUrl: "https://tiles.openfreemap.org/styles/dark",
    attributionLabel: "OpenFreeMap / OpenMapTiles / OpenStreetMap contributors",
    attributionUrl: "https://openfreemap.org",
  },
  {
    id: "carto-dark",
    label: "CARTO Dark Matter",
    styleUrl: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    attributionLabel: "CARTO / OpenStreetMap contributors",
    attributionUrl: "https://carto.com/attributions",
  },
] as const;

export type MapProviderStage =
  | "style-loading"
  | "style-ready"
  | "degraded"
  | "failover"
  | "continuity";

export type MapFailureClass =
  | "optional"
  | "operational"
  | "base-resource"
  | "style"
  | "engine";

export interface MapProviderState {
  providerId: ZeroCostMapProviderId | "continuity";
  providerLabel: string;
  attempt: number;
  stage: MapProviderStage;
  errorCode?: string;
  errorMessage?: string;
  sourceId?: string;
}

export interface MapFailureInput {
  sourceId?: string;
  message?: string;
  styleReady: boolean;
}

const OPTIONAL_SOURCE_IDS = new Set([
  "aegis-terrain-dem",
  "aegis-terrain-hillshade-dem",
  "aegis-terrain-hillshade",
  "aegis-world-blue-marble",
  "aegis-world-sentinel",
  "aegis-world-carto-labels",
]);

/** Pure classification used by the renderer and scoped provider tests. */
export function classifyMapFailure({
  sourceId,
  message = "",
  styleReady,
}: MapFailureInput): MapFailureClass {
  const normalized = message.toLowerCase();
  if (
    (sourceId && OPTIONAL_SOURCE_IDS.has(sourceId))
    || /\b(terrain|hillshade|raster-dem|dem tile|blue marble|sentinel imagery)\b/.test(normalized)
  ) return "optional";
  // A broken simulation overlay must never evict a healthy basemap. These
  // sources are owned by AEGIS and can degrade independently of the provider.
  if (sourceId?.startsWith("aegis-") || /\baegis-[a-z0-9-]+\b/.test(normalized)) {
    return "operational";
  }
  if (!styleReady && /\b(style|stylesheet|style\.json)\b/.test(normalized)) return "style";
  if (/\b(webgl|web gl|context lost|canvas context|gpu)\b/.test(normalized)) return "engine";
  return "base-resource";
}

export function buildProviderCandidates(customStyleUrl?: string): ZeroCostMapProvider[] {
  const custom = customStyleUrl?.trim();
  const defaults = [...ZERO_COST_MAP_PROVIDERS];
  if (!custom || defaults.some((provider) => provider.styleUrl === custom)) return defaults;
  return [
    {
      id: "custom",
      label: "Custom MapLibre style",
      styleUrl: custom,
      attributionLabel: "Custom map style / OpenStreetMap-compatible data",
      attributionUrl: "https://www.openstreetmap.org/copyright",
    },
    ...defaults,
  ];
}

export function providersAreIndependent(
  first: ZeroCostMapProvider,
  second: ZeroCostMapProvider,
): boolean {
  try {
    return new URL(first.styleUrl).hostname !== new URL(second.styleUrl).hostname;
  } catch {
    return false;
  }
}
