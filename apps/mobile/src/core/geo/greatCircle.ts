import type { RoutePoint } from '@skyatlas/shared';

export const EARTH_R = 6371; // km
const DEG = Math.PI / 180;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dφ = (lat2 - lat1) * DEG;
  const dλ = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Wraps a longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * The point a fraction `f` of the way along the great circle from a to b.
 *
 * Spherical rather than linear interpolation: over a long-haul leg the two
 * differ by hundreds of kilometres, and linear blending of longitudes breaks
 * outright across the antimeridian.
 */
export function gcInterpolate(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  f: number
): { lat: number; lon: number } {
  const φ1 = lat1 * DEG;
  const λ1 = lon1 * DEG;
  const φ2 = lat2 * DEG;
  const λ2 = lon2 * DEG;
  const δ = haversine(lat1, lon1, lat2, lon2) / EARTH_R;
  if (δ < 1e-9) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG,
    lon: Math.atan2(y, x) / DEG
  };
}

/**
 * Signed distance from a point to the great circle through a→b, in km.
 * Positive means the point lies to the right of the direction of travel.
 */
export function crossTrackKm(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const δ13 = haversine(aLat, aLon, lat, lon) / EARTH_R;
  const θ13 = bearing(aLat, aLon, lat, lon) * DEG;
  const θ12 = bearing(aLat, aLon, bLat, bLon) * DEG;
  return Math.asin(Math.sin(δ13) * Math.sin(θ13 - θ12)) * EARTH_R;
}

/**
 * Distance along a→b to the foot of the perpendicular from the point, in km.
 * Negative when the foot falls behind a.
 */
export function alongTrackKm(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const δ13 = haversine(aLat, aLon, lat, lon) / EARTH_R;
  const δxt = crossTrackKm(lat, lon, aLat, aLon, bLat, bLon) / EARTH_R;
  const cos = Math.cos(δ13) / Math.cos(δxt);
  const along = Math.acos(Math.max(-1, Math.min(1, cos))) * EARTH_R;
  const θ13 = bearing(aLat, aLon, lat, lon);
  const θ12 = bearing(aLat, aLon, bLat, bLon);
  const diff = Math.abs(((θ13 - θ12 + 540) % 360) - 180);
  return diff > 90 ? -along : along;
}

/**
 * Position at a moment of the flight.
 *
 * Between two route samples the aircraft is placed by great-circle interpolation,
 * so a sample pair straddling the antimeridian does not send it round the world.
 */
export function interpolateAlongRoute(route: RoutePoint[], elapsedSec: number): RoutePoint {
  if (route.length === 0) throw new Error('Route must not be empty');
  const first = route[0]!;
  const last = route[route.length - 1]!;
  if (elapsedSec <= first.elapsedSeconds) return first;
  if (elapsedSec >= last.elapsedSeconds) return last;

  // Binary search: routes are hundreds of points and this runs every tick.
  let lo = 0;
  let hi = route.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (route[mid]!.elapsedSeconds <= elapsedSec) lo = mid;
    else hi = mid;
  }
  const a = route[lo]!;
  const b = route[hi]!;
  const span = b.elapsedSeconds - a.elapsedSeconds;
  const t = span > 0 ? (elapsedSec - a.elapsedSeconds) / span : 0;
  const p = gcInterpolate(a.lat, a.lon, b.lat, b.lon, t);

  return {
    lat: p.lat,
    lon: p.lon,
    altitude: a.altitude + (b.altitude - a.altitude) * t,
    elapsedSeconds: elapsedSec
  };
}

/** Total ground length of a route, km. */
export function routeLengthKm(route: RoutePoint[]): number {
  let d = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    d += haversine(a.lat, a.lon, b.lat, b.lon);
  }
  return d;
}

/** Heading of travel at a moment, from the route itself. */
export function headingAt(route: RoutePoint[], elapsedSec: number): number {
  if (route.length < 2) return 0;
  const end = route[route.length - 1]!.elapsedSeconds;
  const t0 = Math.max(0, Math.min(elapsedSec, end - 60));
  const t1 = Math.min(end, t0 + 60);
  const a = interpolateAlongRoute(route, t0);
  const b = interpolateAlongRoute(route, t1);
  if (a.lat === b.lat && a.lon === b.lon) return 0;
  return bearing(a.lat, a.lon, b.lat, b.lon);
}
