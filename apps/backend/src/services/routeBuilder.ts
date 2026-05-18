import type { RoutePoint } from '@skyatlas/shared';

const DEG = Math.PI / 180;

function greatCirclePoint(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  fraction: number
): { lat: number; lon: number } {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG;
  const λ1 = lon1 * DEG, λ2 = lon2 * DEG;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
  ));
  if (d === 0) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ = Math.atan2(y, x);
  return { lat: φ / DEG, lon: λ / DEG };
}

function altitudeAt(fraction: number, cruiseAlt = 11000): number {
  const CLIMB_FRAC = 0.08;  // first 8% of flight = climb
  const DESC_FRAC = 0.85;   // last 15% of flight = descent
  if (fraction <= CLIMB_FRAC) {
    return (fraction / CLIMB_FRAC) * cruiseAlt;
  }
  if (fraction <= DESC_FRAC) {
    return cruiseAlt;
  }
  return cruiseAlt * (1 - (fraction - DESC_FRAC) / (1 - DESC_FRAC));
}

export function buildRoute(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  opts: { points: number; durationMinutes: number }
): RoutePoint[] {
  const totalSeconds = opts.durationMinutes * 60;
  return Array.from({ length: opts.points }, (_, i) => {
    const fraction = opts.points === 1 ? 0 : i / (opts.points - 1);
    const point = greatCirclePoint(origin.lat, origin.lon, destination.lat, destination.lon, fraction);
    return {
      lat: point.lat,
      lon: point.lon,
      altitude: altitudeAt(fraction),
      elapsedSeconds: fraction * totalSeconds
    };
  });
}
