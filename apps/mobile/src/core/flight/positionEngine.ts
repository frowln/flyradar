import type { RoutePoint } from '@skyatlas/shared';
import { interpolateAlongRoute } from '../geo/greatCircle';

export function computePosition(
  route: RoutePoint[],
  takeoffAt: Date,
  now: Date = new Date()
): RoutePoint {
  const elapsedSec = Math.max(0, (now.getTime() - takeoffAt.getTime()) / 1000);
  return interpolateAlongRoute(route, elapsedSec);
}
