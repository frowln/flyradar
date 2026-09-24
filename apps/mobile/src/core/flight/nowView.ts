import type { Moment, OfflinePackage, POI } from '@skyatlas/shared';
import { viewingSide } from '../geo/viewingSide';
import { recognitionRangeKm } from '../places/visibility';
import { sightWeight, computeMoments } from './moments';
import { solarElevation, sunsetThreshold } from '../geo/sun';
import type { Now } from './position';

/**
 * What is out of each window right now.
 *
 * The answer to the one question the in-flight screen exists for, computed from
 * the current position and heading every tick: which places are in recognition
 * range on the left, on the right, and underneath — and, for each, whether it
 * is still ahead, abeam, or already sliding behind.
 */

export type Where = 'ahead' | 'abeam' | 'behind' | 'below';

export interface InView {
  poi: POI;
  where: Where;
  distanceKm: number;
  weight: number;
}

export interface WindowNow {
  left: InView[];
  right: InView[];
  below: InView[];
  /** The next few moments still to come. */
  next: Moment[];
  daylight: boolean;
  /** Country under the aircraft, if over land. */
  countryNow: string | null;
}

const KIND_RANGE_CATS = new Set(['city', 'mountain', 'volcano', 'landmark']);

function rangeFor(poi: POI): number {
  return recognitionRangeKm({
    k: poi.category === 'historic' || poi.category === 'park' ? 'landmark' : (poi.category as never),
    r: poi.rank ?? 5,
    pop: poi.population,
    el: poi.elevation,
    ext: poi.extentKm
  });
}

export function whatsOutside(pkg: OfflinePackage, now: Now, takeoff: Date | null, max = 3): WindowNow {
  const left: InView[] = [];
  const right: InView[] = [];
  const below: InView[] = [];
  const t = now.elapsedS;
  const altKm = Math.max(0.3, now.altitude / 1000);

  for (const poi of pkg.pois) {
    if (poi.visibleFrom != null && poi.visibleTo != null) {
      if (t < poi.visibleFrom - 60 || t > poi.visibleTo + 60) continue;
    }
    const weight = sightWeight(poi);
    // Areas flown over are "below" for as long as the track is inside them.
    if (poi.side === 'below' && !KIND_RANGE_CATS.has(poi.category)) {
      below.push({ poi, where: 'below', distanceKm: 0, weight });
      continue;
    }
    const sight = viewingSide(now.lat, now.lon, now.heading, poi.lat, poi.lon, altKm);
    const range = rangeFor(poi) + (poi.extentKm ?? 0) * 0.5;
    if (sight.distanceKm > range) continue;
    if (sight.distanceKm < 8) {
      below.push({ poi, where: 'below', distanceKm: sight.distanceKm, weight });
      continue;
    }
    const rel = sight.relativeBearing;
    const where: Where = rel <= 30 || rel >= 330 ? 'ahead' : rel >= 150 && rel <= 210 ? 'behind' : 'abeam';
    // Ahead and behind are still assigned to the side they lean toward: that
    // is the window they will be, or were, visible from.
    const entry = { poi, where, distanceKm: sight.distanceKm, weight: weight * (where === 'abeam' ? 1 : 0.7) };
    if (rel < 180) right.push(entry);
    else left.push(entry);
  }

  const byWeight = (a: InView, b: InView) => b.weight - a.weight || a.distanceKm - b.distanceKm;
  const moments = pkg.moments && !takeoff ? pkg.moments : computeMoments({ route: pkg.route, pois: pkg.pois, countries: pkg.countries, takeoff: takeoff ?? undefined });
  const next = moments.filter((m) => m.at > t + 30 && m.kind !== 'takeoff' && m.weight >= 0.3).slice(0, 4);

  const daylight = takeoff
    ? solarElevation(now.lat, now.lon, new Date(takeoff.getTime() + t * 1000)) > sunsetThreshold(now.altitude) - 2
    : true;

  const pass = (pkg.countries ?? []).find((c) => c.enterAt <= t && c.exitAt >= t);

  return {
    left: left.sort(byWeight).slice(0, max),
    right: right.sort(byWeight).slice(0, max),
    below: below.sort(byWeight).slice(0, 2),
    next,
    daylight,
    countryNow: pass?.cc ?? null
  };
}
