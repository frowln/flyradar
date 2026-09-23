import type { RoutePoint } from '@skyatlas/shared';
import { interpolateAlongRoute, bearing } from '../geo/greatCircle';

/**
 * How far ahead to sample the route when deriving heading. A minute is long
 * enough that great-circle curvature registers, short enough that the answer
 * still describes where the nose points now.
 */
const HEADING_SAMPLE_SECONDS = 60;

export function computePosition(
  route: RoutePoint[],
  takeoffAt: Date,
  now: Date = new Date(),
  timeMultiplier: number = 1
): RoutePoint {
  const realElapsed = Math.max(0, (now.getTime() - takeoffAt.getTime()) / 1000);
  const simulatedElapsed = realElapsed * timeMultiplier;
  return interpolateAlongRoute(route, simulatedElapsed);
}

/**
 * Compass heading in degrees, derived from the route rather than the device.
 *
 * A phone's magnetometer is useless inside an aluminium tube, and the aircraft
 * does not report its heading to us — but the route does, because a flight
 * follows a great circle closely enough for this purpose.
 *
 * Sampling a minute ahead; at the end of the route it samples backwards instead,
 * so the last leg still yields the direction of travel rather than zero.
 */
export function computeHeading(
  route: RoutePoint[],
  takeoffAt: Date,
  now: Date = new Date(),
  timeMultiplier: number = 1
): number {
  if (route.length < 2) return 0;

  const realElapsed = Math.max(0, (now.getTime() - takeoffAt.getTime()) / 1000);

  // Clamp to the route's own duration before sampling. Sampling around a time
  // past the end makes both probes land on the final point, and the bearing
  // between a point and itself is meaningless.
  const duration = route[route.length - 1]!.elapsedSeconds;
  const elapsed = Math.min(Math.max(0, realElapsed * timeMultiplier), duration);

  const from = Math.max(0, Math.min(elapsed, duration - HEADING_SAMPLE_SECONDS));
  const to = Math.min(duration, from + HEADING_SAMPLE_SECONDS);

  const here = interpolateAlongRoute(route, from);
  const ahead = interpolateAlongRoute(route, to);

  if (here.lat === ahead.lat && here.lon === ahead.lon) return 0;
  return bearing(here.lat, here.lon, ahead.lat, ahead.lon);
}
