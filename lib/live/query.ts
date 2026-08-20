import type { AggregateLiveOptions, BoundingBox, ProximityFilter } from "./types";
import { clampInteger, sanitizeQuery } from "./utils";

function finiteNumber(value: string | null) {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseBoundingBox(value: string | null): BoundingBox | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  const [west, south, east, north] = parts;
  if (west < -180 || west > 180 || east < -180 || east > 180) return undefined;
  if (south < -90 || south > 90 || north < -90 || north > 90 || south > north) return undefined;
  return { west, south, east, north };
}

export function parseProximity(searchParams: URLSearchParams): ProximityFilter | undefined {
  const latitude = finiteNumber(searchParams.get("lat"));
  const longitude = finiteNumber(searchParams.get("lon"));
  if (latitude === undefined || longitude === undefined) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  const radiusKm = finiteNumber(searchParams.get("radiusKm")) ?? 250;
  if (radiusKm <= 0 || radiusKm > 20_000) return undefined;
  return { latitude, longitude, radiusKm };
}

export function parseBoolean(value: string | null, fallback = false) {
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function parseLiveOptions(urlValue: string): AggregateLiveOptions {
  const url = new URL(urlValue);
  const queryValue = url.searchParams.get("q");
  const mediaQueryValue = url.searchParams.get("mediaQuery");
  return {
    query: queryValue ? sanitizeQuery(queryValue) : undefined,
    limitPerSource: clampInteger(url.searchParams.get("limit"), 1, 30, 15),
    eonetDays: clampInteger(url.searchParams.get("days"), 1, 90, 30),
    boundingBox: parseBoundingBox(url.searchParams.get("bbox")),
    proximity: parseProximity(url.searchParams),
    includeMedia: parseBoolean(url.searchParams.get("includeMedia"), false),
    mediaQuery: mediaQueryValue ? sanitizeQuery(mediaQueryValue) : undefined,
  };
}
