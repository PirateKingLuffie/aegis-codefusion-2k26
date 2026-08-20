export type WorldSearchHit = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type: string;
  importance?: number;
  bounds?: [number, number, number, number] | null;
  source?: "OpenStreetMap Nominatim" | "AEGIS offline gazetteer";
  dataClass?: "IMPORTED" | "REFERENCE";
};

export type WorldLocationSelection = {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  type: string;
  zoom: number;
  fidelity?: "EIT SITE MODEL" | "GLOBAL PROTOTYPE";
};

export type CoordinateMatch = {
  latitude: number;
  longitude: number;
};

type OfflineWorldPlace = WorldSearchHit & {
  aliases?: readonly string[];
};

const OFFLINE_WORLD_PLACES: readonly OfflineWorldPlace[] = [
  { id: "offline-eit-faridabad", label: "Echelon Institute of Technology, Faridabad, India", latitude: 28.3912265, longitude: 77.4398682, type: "university", importance: 0.98, bounds: [28.387, 28.396, 77.434, 77.446], aliases: ["eit faridabad", "echelon institute", "echelon institute of technology"] },
  { id: "offline-faridabad", label: "Faridabad, Haryana, India", latitude: 28.4089, longitude: 77.3178, type: "city", importance: 0.9, bounds: [28.292, 28.513, 77.206, 77.493] },
  { id: "offline-delhi", label: "Delhi, India", latitude: 28.6139, longitude: 77.209, type: "city", importance: 0.96, bounds: [28.404, 28.884, 76.838, 77.347], aliases: ["new delhi"] },
  { id: "offline-mumbai", label: "Mumbai, Maharashtra, India", latitude: 19.076, longitude: 72.8777, type: "city", importance: 0.95, bounds: [18.89, 19.28, 72.775, 72.986], aliases: ["bombay"] },
  { id: "offline-kolkata", label: "Kolkata, West Bengal, India", latitude: 22.5726, longitude: 88.3639, type: "city", importance: 0.91, bounds: [22.45, 22.68, 88.23, 88.47], aliases: ["calcutta"] },
  { id: "offline-chennai", label: "Chennai, Tamil Nadu, India", latitude: 13.0827, longitude: 80.2707, type: "city", importance: 0.91, bounds: [12.83, 13.24, 80.12, 80.33], aliases: ["madras"] },
  { id: "offline-bengaluru", label: "Bengaluru, Karnataka, India", latitude: 12.9716, longitude: 77.5946, type: "city", importance: 0.92, bounds: [12.73, 13.17, 77.33, 77.84], aliases: ["bangalore"] },
  { id: "offline-guwahati", label: "Guwahati, Assam, India", latitude: 26.1445, longitude: 91.7362, type: "city", importance: 0.86, bounds: [26.05, 26.23, 91.55, 91.88] },
  { id: "offline-taj-mahal", label: "Taj Mahal, Agra, India", latitude: 27.1751, longitude: 78.0421, type: "attraction", importance: 0.99, bounds: [27.169, 27.181, 78.036, 78.048], aliases: ["tajmahal"] },
  { id: "offline-india", label: "India", latitude: 22.3511, longitude: 78.6677, type: "country", importance: 1, bounds: [6.554, 35.675, 68.111, 97.395], aliases: ["republic of india"] },
  { id: "offline-tokyo", label: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503, type: "city", importance: 0.98, bounds: [35.53, 35.82, 139.48, 139.92] },
  { id: "offline-japan", label: "Japan", latitude: 36.2048, longitude: 138.2529, type: "country", importance: 1, bounds: [24.396, 45.551, 122.934, 153.987] },
  { id: "offline-singapore", label: "Singapore", latitude: 1.3521, longitude: 103.8198, type: "city", importance: 0.96, bounds: [1.159, 1.478, 103.605, 104.088], aliases: ["singapore city"] },
  { id: "offline-jakarta", label: "Jakarta, Indonesia", latitude: -6.2088, longitude: 106.8456, type: "city", importance: 0.94, bounds: [-6.37, -6.08, 106.69, 106.98] },
  { id: "offline-manila", label: "Manila, Philippines", latitude: 14.5995, longitude: 120.9842, type: "city", importance: 0.92, bounds: [14.48, 14.72, 120.88, 121.1] },
  { id: "offline-sydney", label: "Sydney, New South Wales, Australia", latitude: -33.8688, longitude: 151.2093, type: "city", importance: 0.95, bounds: [-34.12, -33.58, 150.52, 151.34] },
  { id: "offline-sydney-opera-house", label: "Sydney Opera House, Sydney, Australia", latitude: -33.8568, longitude: 151.2153, type: "attraction", importance: 0.98, bounds: [-33.859, -33.854, 151.212, 151.218] },
  { id: "offline-london", label: "London, United Kingdom", latitude: 51.5074, longitude: -0.1278, type: "city", importance: 0.98, bounds: [51.286, 51.692, -0.51, 0.335] },
  { id: "offline-united-kingdom", label: "United Kingdom", latitude: 55.3781, longitude: -3.436, type: "country", importance: 1, bounds: [49.96, 60.86, -8.65, 1.77], aliases: ["uk", "great britain", "britain"] },
  { id: "offline-paris", label: "Paris, France", latitude: 48.8566, longitude: 2.3522, type: "city", importance: 0.98, bounds: [48.815, 48.902, 2.224, 2.47] },
  { id: "offline-eiffel-tower", label: "Eiffel Tower, Paris, France", latitude: 48.85837, longitude: 2.294481, type: "attraction", importance: 1, bounds: [48.8569, 48.8599, 2.2926, 2.2964], aliases: ["tour eiffel"] },
  { id: "offline-france", label: "France", latitude: 46.2276, longitude: 2.2137, type: "country", importance: 1, bounds: [41.333, 51.124, -5.225, 9.662], aliases: ["french republic"] },
  { id: "offline-new-york", label: "New York City, New York, United States", latitude: 40.7128, longitude: -74.006, type: "city", importance: 0.99, bounds: [40.477, 40.917, -74.259, -73.7], aliases: ["new york", "nyc"] },
  { id: "offline-statue-liberty", label: "Statue of Liberty, New York City, United States", latitude: 40.68925, longitude: -74.0445, type: "attraction", importance: 0.98, bounds: [40.687, 40.692, -74.048, -74.041] },
  { id: "offline-empire-state", label: "Empire State Building, New York City, United States", latitude: 40.74844, longitude: -73.98566, type: "building", importance: 0.98, bounds: [40.7475, 40.7493, -73.9868, -73.9845], aliases: ["empire state"] },
  { id: "offline-washington-dc", label: "Washington, District of Columbia, United States", latitude: 38.9072, longitude: -77.0369, type: "city", importance: 0.95, bounds: [38.791, 38.996, -77.12, -76.91], aliases: ["washington dc", "district of columbia"] },
  { id: "offline-white-house", label: "The White House, Washington, United States", latitude: 38.8977, longitude: -77.0365, type: "building", importance: 0.98, bounds: [38.8964, 38.899, -77.0382, -77.0348], aliases: ["white house"] },
  { id: "offline-miami", label: "Miami, Florida, United States", latitude: 25.7617, longitude: -80.1918, type: "city", importance: 0.92, bounds: [25.71, 25.86, -80.32, -80.13] },
  { id: "offline-los-angeles", label: "Los Angeles, California, United States", latitude: 34.0522, longitude: -118.2437, type: "city", importance: 0.96, bounds: [33.7, 34.34, -118.67, -118.15], aliases: ["la california"] },
  { id: "offline-san-francisco", label: "San Francisco, California, United States", latitude: 37.7749, longitude: -122.4194, type: "city", importance: 0.95, bounds: [37.64, 37.93, -123.17, -122.28], aliases: ["sf california"] },
  { id: "offline-united-states", label: "United States", latitude: 39.8283, longitude: -98.5795, type: "country", importance: 1, bounds: [18.91, 71.39, -179.15, -66.95], aliases: ["usa", "us", "united states of america", "america"] },
  { id: "offline-rio", label: "Rio de Janeiro, Brazil", latitude: -22.9068, longitude: -43.1729, type: "city", importance: 0.93, bounds: [-23.08, -22.75, -43.8, -43.1] },
  { id: "offline-cairo", label: "Cairo, Egypt", latitude: 30.0444, longitude: 31.2357, type: "city", importance: 0.93, bounds: [29.75, 30.32, 31.05, 31.63] },
  { id: "offline-istanbul", label: "Istanbul, Turkey", latitude: 41.0082, longitude: 28.9784, type: "city", importance: 0.95, bounds: [40.8, 41.33, 28.44, 29.46] },
  { id: "offline-dubai", label: "Dubai, United Arab Emirates", latitude: 25.2048, longitude: 55.2708, type: "city", importance: 0.94, bounds: [24.79, 25.36, 54.89, 55.57] },
  { id: "offline-burj-khalifa", label: "Burj Khalifa, Dubai, United Arab Emirates", latitude: 25.1972, longitude: 55.2744, type: "building", importance: 1, bounds: [25.1957, 25.1987, 55.2729, 55.2759], aliases: ["burj dubai"] },
  { id: "offline-connaught-place", label: "Connaught Place, New Delhi, India", latitude: 28.6315, longitude: 77.2167, type: "commercial", importance: 0.9, bounds: [28.625, 28.637, 77.209, 77.224], aliases: ["cp delhi", "rajiv chowk"] },
  { id: "offline-marine-drive", label: "Marine Drive, Mumbai, India", latitude: 18.943, longitude: 72.8238, type: "street", importance: 0.9, bounds: [18.932, 18.958, 72.813, 72.833], aliases: ["queen's necklace"] },
  { id: "offline-mg-road", label: "Mahatma Gandhi Road, Bengaluru, India", latitude: 12.974, longitude: 77.616, type: "street", importance: 0.88, bounds: [12.968, 12.98, 77.603, 77.629], aliases: ["mg road bangalore", "mg road bengaluru"] },
  { id: "offline-baker-street", label: "Baker Street, London, United Kingdom", latitude: 51.5226, longitude: -0.1571, type: "street", importance: 0.9, bounds: [51.51, 51.535, -0.168, -0.145], aliases: ["221b baker street"] },
  { id: "offline-oxford-street", label: "Oxford Street, London, United Kingdom", latitude: 51.5154, longitude: -0.141, type: "street", importance: 0.88, bounds: [51.507, 51.52, -0.17, -0.11] },
  { id: "offline-broadway", label: "Broadway, New York City, United States", latitude: 40.758, longitude: -73.9855, type: "street", importance: 0.91, bounds: [40.52, 40.92, -74.02, -73.86], aliases: ["broadway nyc"] },
  { id: "offline-wall-street", label: "Wall Street, New York City, United States", latitude: 40.706, longitude: -74.0088, type: "street", importance: 0.9, bounds: [40.703, 40.709, -74.014, -74.002] },
  { id: "offline-champs-elysees", label: "Champs-Elysees, Paris, France", latitude: 48.8698, longitude: 2.3076, type: "street", importance: 0.9, bounds: [48.864, 48.874, 2.295, 2.32], aliases: ["avenue des champs elysees", "champs elysees"] },
];

const COORDINATE_PAIR = /^\s*([+-]?\d{1,3}(?:\.\d+)?)\s*\u00B0?\s*([NSEW])?\s*[,;/\s]+\s*([+-]?\d{1,3}(?:\.\d+)?)\s*\u00B0?\s*([NSEW])?\s*$/i;
const LABELLED_COORDINATE_PAIR = /^\s*(lat(?:itude)?|lon(?:gitude)?|lng)\s*[:=]?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*\u00B0?\s*[,;/\s]+\s*(lat(?:itude)?|lon(?:gitude)?|lng)\s*[:=]?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*\u00B0?\s*$/i;

function directionalValue(value: number, direction?: string) {
  if (!direction) return value;
  return Math.abs(value) * (direction.toUpperCase() === "S" || direction.toUpperCase() === "W" ? -1 : 1);
}

function validatedCoordinate(latitude: number, longitude: number): CoordinateMatch | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function isLatitudeLabel(label: string) {
  return label.toLowerCase().startsWith("lat");
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Small, deterministic safety net for globally recognizable places. This is
 * intentionally a reference index, not a substitute for live address search.
 */
export function searchOfflineWorldPlaces(value: string, limit = 6): WorldSearchHit[] {
  const query = normalizeSearchText(value);
  if (query.length < 2 || limit < 1) return [];
  const queryTokens = query.split(" ").filter(Boolean);

  return OFFLINE_WORLD_PLACES
    .map((place) => {
      const primary = normalizeSearchText(place.label);
      const aliases = (place.aliases ?? []).map(normalizeSearchText);
      const candidates = [primary, ...aliases];
      const exact = candidates.some((candidate) => candidate === query);
      const prefix = candidates.some((candidate) => candidate.startsWith(query));
      const allTokens = queryTokens.every((token) => candidates.some((candidate) => candidate.includes(token)));
      const score = exact ? 1_000 : prefix ? 800 : allTokens ? 500 + queryTokens.length * 10 : 0;
      return { place, score };
    })
    .filter(({ score }) => score > 0)
    .sort((first, second) => (
      second.score - first.score
      || (second.place.importance ?? 0) - (first.place.importance ?? 0)
      || first.place.label.localeCompare(second.place.label)
    ))
    .slice(0, Math.min(12, Math.floor(limit)))
    .map(({ place }) => ({
      id: place.id,
      label: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      type: place.type,
      importance: place.importance,
      bounds: place.bounds,
      source: "AEGIS offline gazetteer",
      dataClass: "REFERENCE",
    }));
}

/**
 * Accepts lat/lon, unambiguous lon/lat, cardinal pairs in either order,
 * and explicit labels such as `lon: 77.4399, lat: 28.3912`.
 */
export function parseCoordinateQuery(value: string): CoordinateMatch | null {
  const labelled = value.trim().match(LABELLED_COORDINATE_PAIR);
  if (labelled) {
    const firstValue = Number(labelled[2]);
    const secondValue = Number(labelled[4]);
    if (isLatitudeLabel(labelled[1]) === isLatitudeLabel(labelled[3])) return null;
    return isLatitudeLabel(labelled[1])
      ? validatedCoordinate(firstValue, secondValue)
      : validatedCoordinate(secondValue, firstValue);
  }

  const match = value.trim().match(COORDINATE_PAIR);
  if (!match) return null;
  const first = directionalValue(Number(match[1]), match[2]);
  const second = directionalValue(Number(match[3]), match[4]);
  const firstDirection = match[2]?.toUpperCase();
  const secondDirection = match[4]?.toUpperCase();
  const longitudeFirst = (firstDirection === "E" || firstDirection === "W")
    && (secondDirection === "N" || secondDirection === "S");
  const latitudeFirst = (firstDirection === "N" || firstDirection === "S")
    && (secondDirection === "E" || secondDirection === "W");

  if (longitudeFirst) return validatedCoordinate(second, first);
  if (latitudeFirst) return validatedCoordinate(first, second);
  if (firstDirection || secondDirection) return null;
  if (Math.abs(first) > 90 && Math.abs(second) <= 90) return validatedCoordinate(second, first);
  return validatedCoordinate(first, second);
}

export function formatCoordinate(latitude: number, longitude: number) {
  return `${Math.abs(latitude).toFixed(5)}\u00B0 ${latitude >= 0 ? "N" : "S"} \u00B7 ${Math.abs(longitude).toFixed(5)}\u00B0 ${longitude >= 0 ? "E" : "W"}`;
}

export function zoomForBounds(bounds?: [number, number, number, number] | null) {
  if (!bounds) return 10.5;
  const [south, north, west, east] = bounds;
  const longitudeSpan = east >= west ? east - west : 360 - west + east;
  const span = Math.max(Math.abs(north - south), Math.abs(longitudeSpan));
  if (span > 80) return 2.2;
  if (span > 25) return 3.4;
  if (span > 8) return 4.8;
  if (span > 2) return 6.2;
  if (span > 0.5) return 7.8;
  if (span > 0.12) return 9.2;
  return 11.2;
}

export function searchHitToSelection(hit: WorldSearchHit): WorldLocationSelection {
  const segments = hit.label.split(",").map((segment) => segment.trim()).filter(Boolean);
  const normalizedType = hit.type.toLowerCase();
  const detailZoom = /house|building|university|college|school|hospital|station|attraction|commercial|industrial/.test(normalizedType)
    ? 16.2
    : /road|street|residential|neighbourhood|suburb/.test(normalizedType)
      ? 14.2
      : zoomForBounds(hit.bounds);
  return {
    id: `${hit.source === "AEGIS offline gazetteer" ? "reference" : "osm"}-${hit.id}`,
    name: segments[0] ?? "Mapped location",
    region: segments.slice(1, 4).join(", ") || hit.type,
    latitude: hit.latitude,
    longitude: hit.longitude,
    type: hit.type,
    zoom: detailZoom,
    fidelity: "GLOBAL PROTOTYPE",
  };
}
