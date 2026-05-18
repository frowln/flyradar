import type { RoutePoint } from '@skyatlas/shared';

const R = 6371; // Earth radius in km
const DEG = Math.PI / 180;

export function haversine(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dφ = (lat2 - lat1) * DEG;
  const dλ = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

export function interpolateAlongRoute(
  route: RoutePoint[],
  elapsedSec: number
): RoutePoint {
  if (route.length === 0) throw new Error('Route must not be empty');
  if (elapsedSec <= route[0].elapsedSeconds) return route[0];
  if (elapsedSec >= route[route.length - 1].elapsedSeconds) return route[route.length - 1];

  let i = 0;
  while (i < route.length - 2 && route[i + 1].elapsedSeconds < elapsedSec) {
    i++;
  }

  const a = route[i];
  const b = route[i + 1];
  const t = (elapsedSec - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds);

  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    altitude: a.altitude + (b.altitude - a.altitude) * t,
    elapsedSeconds: elapsedSec
  };
}
