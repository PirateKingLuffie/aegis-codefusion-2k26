import type {
  BoundingBox,
  Coordinates,
  FreshnessMetadata,
  GeoJsonGeometry,
  IncidentCategory,
  IncidentSeverity,
  LiveIncident,
  ProximityFilter,
} from "./types";

const GEOJSON_TYPES = new Set<GeoJsonGeometry["type"]>([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

export function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

export function sanitizeQuery(value: unknown, fallback = "disaster") {
  if (typeof value !== "string") return fallback;
  const printable = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("");
  const normalized = printable.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 160) || fallback;
}

export function toIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function buildFreshness(observedAt: string | undefined, retrievedAt: string): FreshnessMetadata {
  if (!observedAt) {
    return {
      band: "unknown",
      label: "Observation time unavailable",
      retrievedAt,
    };
  }

  const observedMs = Date.parse(observedAt);
  const retrievedMs = Date.parse(retrievedAt);
  if (!Number.isFinite(observedMs) || !Number.isFinite(retrievedMs)) {
    return {
      band: "unknown",
      label: "Observation time could not be verified",
      observedAt,
      retrievedAt,
    };
  }

  const rawAgeMinutes = (retrievedMs - observedMs) / 60_000;
  const clockSkewDetected = rawAgeMinutes < -5;
  const ageMinutes = Math.max(0, Math.round(rawAgeMinutes));
  let band: FreshnessMetadata["band"];
  let label: string;

  if (clockSkewDetected) {
    band = "unknown";
    label = "Source timestamp is ahead of the server clock";
  } else if (ageMinutes <= 15) {
    band = "live";
    label = `Observed ${ageMinutes} min ago`;
  } else if (ageMinutes <= 360) {
    band = "near-real-time";
    label = `Observed ${Math.max(1, Math.round(ageMinutes / 60))} hr ago`;
  } else if (ageMinutes <= 10_080) {
    band = "recent";
    label = `Observed ${Math.max(1, Math.round(ageMinutes / 1_440))} day(s) ago`;
  } else if (ageMinutes <= 43_200) {
    band = "aging";
    label = `Source publication is ${Math.max(1, Math.round(ageMinutes / 1_440))} days old`;
  } else {
    band = "archived";
    label = `Archived source snapshot from ${observedAt.slice(0, 10)}`;
  }

  return { band, label, observedAt, retrievedAt, ageMinutes, clockSkewDetected };
}

export function stableId(namespace: string, input: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${namespace}:${(hash >>> 0).toString(36)}`;
}

export function decodeXmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
    nbsp: " ",
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return isValidXmlCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return isValidXmlCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function isValidXmlCodePoint(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff);
}

export function stripMarkup(value: string) {
  return decodeXmlEntities(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedRssItem {
  title: string;
  link: string;
  guid?: string;
  publishedAt?: string;
  description?: string;
  source?: string;
  sourceUrl?: string;
}

function getXmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripMarkup(match[1]) : undefined;
}

export function parseRssItems(xml: string, limit = 20): ParsedRssItem[] {
  const items: ParsedRssItem[] = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  for (const match of xml.matchAll(itemPattern)) {
    if (items.length >= limit) break;
    const block = match[1];
    const title = getXmlTag(block, "title") ?? "";
    const link = getXmlTag(block, "link") ?? "";
    if (!title || !safeHttpsUrl(link)) continue;

    const sourceMatch = block.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
    const sourceUrlMatch = sourceMatch?.[1].match(/\burl=["']([^"']+)["']/i);
    const publicationValue = getXmlTag(block, "pubDate");
    items.push({
      title,
      link,
      guid: getXmlTag(block, "guid"),
      publishedAt: toIsoDate(publicationValue),
      description: getXmlTag(block, "description"),
      source: sourceMatch ? stripMarkup(sourceMatch[2]) : undefined,
      sourceUrl: sourceUrlMatch ? safeHttpsUrl(decodeXmlEntities(sourceUrlMatch[1])) : undefined,
    });
  }
  return items;
}

export function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function inferCategory(value: string): IncidentCategory {
  const text = value.toLowerCase();
  if (/chemical|industrial|toxic|plume|gas leak|oil spill/.test(text)) return "industrial";
  if (/earthquake|seismic|tremor|aftershock|quake/.test(text)) return "earthquake";
  if (/wildfire|forest fire|bushfire/.test(text)) return "wildfire";
  if (/cyclone|hurricane|typhoon|storm surge/.test(text)) return "cyclone";
  if (/flood|inundat|river overflow|flash flood|waterlog/.test(text)) return "flood";
  if (/landslide|mudslide|rockfall/.test(text)) return "landslide";
  if (/volcan|eruption|lava/.test(text)) return "volcano";
  if (/drought|water scarcity/.test(text)) return "drought";
  if (/heatwave|heat wave|extreme heat|cold wave/.test(text)) return "extreme-temperature";
  if (/storm|tornado|hail|lightning/.test(text)) return "severe-storm";
  if (/humanitarian|displacement|refugee|conflict/.test(text)) return "humanitarian";
  return "other";
}

export function inferSeverity(value: string): IncidentSeverity {
  const text = value.toLowerCase();
  if (/catastrophic|extreme|mass casualty|red alert|emergency declared/.test(text)) return "critical";
  if (/major|severe|significant|evacuat|fatal|killed|destroyed/.test(text)) return "high";
  if (/warning|affected|damage|displaced|monitor/.test(text)) return "medium";
  return "unknown";
}

export function normalizeGeometry(type: unknown, coordinates: unknown): GeoJsonGeometry | undefined {
  if (typeof type !== "string" || !GEOJSON_TYPES.has(type as GeoJsonGeometry["type"])) return undefined;
  if (!Array.isArray(coordinates)) return undefined;
  return { type: type as GeoJsonGeometry["type"], coordinates };
}

function collectCoordinatePairs(value: unknown, output: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  ) {
    output.push([value[0], value[1]]);
    return;
  }
  for (const entry of value) collectCoordinatePairs(entry, output);
}

export function centerOfGeometry(geometry: GeoJsonGeometry | undefined): Coordinates | undefined {
  if (!geometry) return undefined;
  const pairs: Array<[number, number]> = [];
  collectCoordinatePairs(geometry.coordinates, pairs);
  if (!pairs.length) return undefined;
  const totals = pairs.reduce(
    (accumulator, [longitude, latitude]) => ({
      longitude: accumulator.longitude + longitude,
      latitude: accumulator.latitude + latitude,
    }),
    { longitude: 0, latitude: 0 }
  );
  return {
    longitude: totals.longitude / pairs.length,
    latitude: totals.latitude / pairs.length,
  };
}

export function haversineKm(left: Coordinates, right: Coordinates) {
  const earthRadiusKm = 6_371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const startLatitude = toRadians(left.latitude);
  const endLatitude = toRadians(right.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function isInsideBoundingBox(coordinates: Coordinates, box: BoundingBox) {
  const latitudeMatches = coordinates.latitude >= box.south && coordinates.latitude <= box.north;
  const longitudeMatches =
    box.west <= box.east
      ? coordinates.longitude >= box.west && coordinates.longitude <= box.east
      : coordinates.longitude >= box.west || coordinates.longitude <= box.east;
  return latitudeMatches && longitudeMatches;
}

export function filterIncidentsByArea(
  incidents: LiveIncident[],
  boundingBox?: BoundingBox,
  proximity?: ProximityFilter
) {
  if (!boundingBox && !proximity) return incidents;
  return incidents.filter((incident) => {
    const coordinates = incident.location.coordinates;
    if (!coordinates) return false;
    if (boundingBox && !isInsideBoundingBox(coordinates, boundingBox)) return false;
    if (proximity && haversineKm(coordinates, proximity) > proximity.radiusKm) return false;
    return true;
  });
}

export function deduplicateIncidents(incidents: LiveIncident[]) {
  const seen = new Set<string>();
  return incidents.filter((incident) => {
    const key = `${incident.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${incident.observedAt?.slice(0, 10) ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
