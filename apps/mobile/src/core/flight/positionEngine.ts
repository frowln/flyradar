import type { RoutePoint } from '@skyatlas/shared';
import { interpolateAlongRoute } from '../geo/greatCircle';

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
