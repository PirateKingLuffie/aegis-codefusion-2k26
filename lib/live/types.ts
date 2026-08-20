export type LiveSourceId =
  | "nasa-eonet"
  | "usgs-earthquakes"
  | "gdacs"
  | "reliefweb"
  | "google-news"
  | "youtube-data"
  | "wikimedia-commons"
  | "aegis-verified-cache"
  | "aegis-simulation";

export type IncidentCategory =
  | "flood"
  | "earthquake"
  | "wildfire"
  | "cyclone"
  | "severe-storm"
  | "volcano"
  | "landslide"
  | "drought"
  | "extreme-temperature"
  | "industrial"
  | "humanitarian"
  | "other";

export type IncidentSeverity = "critical" | "high" | "medium" | "low" | "unknown";
export type IncidentState = "active" | "monitoring" | "closed" | "unknown";
export type RecordReality = "observed" | "simulated";
export type DataMode =
  | "near-real-time"
  | "recent-report"
  | "cached-source-snapshot"
  | "simulated-demo";
export type RetrievalStatus = "live" | "cached" | "degraded" | "unavailable";
export type FreshnessBand =
  | "live"
  | "near-real-time"
  | "recent"
  | "aging"
  | "archived"
  | "unknown";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoJsonGeometry {
  type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

export interface IncidentLocation {
  name: string;
  country?: string;
  countryCode?: string;
  coordinates?: Coordinates;
}

export interface FreshnessMetadata {
  band: FreshnessBand;
  label: string;
  observedAt?: string;
  retrievedAt: string;
  ageMinutes?: number;
  clockSkewDetected?: boolean;
}

export interface ImpactMetric {
  key: string;
  label: string;
  value: number | string | boolean;
  unit?: string;
  qualifier?: string;
  sourceUrl?: string;
}

export interface IncidentLink {
  label: string;
  url: string;
  kind: "source" | "official" | "report" | "news" | "map" | "media-search";
}

export interface Provenance {
  sourceId: LiveSourceId;
  sourceName: string;
  dataset: string;
  upstreamUrl?: string;
  apiUrl?: string;
  retrievedAt: string;
  publishedAt?: string;
  status: RetrievalStatus;
  notice?: string;
  license?: string;
}

export interface LiveIncident {
  id: string;
  title: string;
  summary: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  state: IncidentState;
  reality: RecordReality;
  dataMode: DataMode;
  observedAt?: string;
  updatedAt?: string;
  freshness: FreshnessMetadata;
  location: IncidentLocation;
  geometry?: GeoJsonGeometry;
  magnitude?: {
    value: number;
    unit?: string;
    description?: string;
  };
  impactMetrics: ImpactMetric[];
  links: IncidentLink[];
  provenance: Provenance;
  tags: string[];
}

export interface SourceTelemetry {
  id: LiveSourceId;
  name: string;
  status: RetrievalStatus;
  retrievedAt: string;
  recordCount: number;
  upstreamUrl?: string;
  latencyMs?: number;
  message?: string;
}

export interface AdapterResult {
  source: SourceTelemetry;
  incidents: LiveIncident[];
}

export interface MediaVideo {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl?: string;
  watchUrl: string;
  embedUrl?: string;
  directUrl?: string;
  mimeType?: string;
  license?: string;
  provenance: Provenance;
}

export interface MediaLink {
  label: string;
  url: string;
  kind: "youtube-search" | "news-search" | "official" | "relief-search" | "news-report";
  publisher?: string;
  publishedAt?: string;
  notice?: string;
}

export interface IncidentMediaResult {
  query: string;
  mode: "youtube-api" | "open-media" | "safe-search-links";
  status: RetrievalStatus;
  retrievedAt: string;
  videos: MediaVideo[];
  links: MediaLink[];
  notice: string;
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ProximityFilter extends Coordinates {
  radiusKm: number;
}

export interface AggregateLiveOptions {
  query?: string;
  limitPerSource?: number;
  eonetDays?: number;
  boundingBox?: BoundingBox;
  proximity?: ProximityFilter;
  includeMedia?: boolean;
  mediaQuery?: string;
}

export interface LiveIntelligenceResponse {
  schemaVersion: "1.0";
  generatedAt: string;
  mode: "live" | "mixed" | "offline-fallback";
  query: string;
  sources: SourceTelemetry[];
  incidents: LiveIncident[];
  verifiedSnapshots: LiveIncident[];
  offlineScenarioPreviews: LiveIncident[];
  media?: IncidentMediaResult;
  counts: {
    observed: number;
    simulated: number;
    liveSources: number;
    degradedSources: number;
  };
  notices: string[];
}
