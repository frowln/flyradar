import type { POI, RoutePoint } from '@skyatlas/shared';
import { nearbyPOIs } from '../offline/poiDatabase';
import { haversine } from '../geo/greatCircle';
import { rankPOIsByInterest } from '../ai/personalization';

const RADIUS_KM = 200;

export interface ScheduledPOI {
  poi: POI;
  distanceKm: number;
}

export async function getNextPOI(
  flightId: string,
  position: RoutePoint,
  seenPoiIds: Set<string>
): Promise<ScheduledPOI | null> {
  const candidates = await nearbyPOIs(flightId, position.lat, position.lon, RADIUS_KM);

  const unseen = candidates.filter((p) => !seenPoiIds.has(p.id));
  if (unseen.length === 0) return null;

  // Rank by user interest first, then pick the closest among top-interest candidates
  const ranked = rankPOIsByInterest(unseen);

  let closest: POI | null = null;
  let minDist = Infinity;

  for (const poi of ranked) {
    const dist = haversine(position.lat, position.lon, poi.lat, poi.lon);
    if (dist < minDist) {
      minDist = dist;
      closest = poi;
    }
  }

  if (!closest) return null;
  return { poi: closest, distanceKm: Math.round(minDist) };
}
