import type { CloudSample, POI, RoutePoint } from '@skyatlas/shared';
import { interpolateAlongRoute } from '../geo/greatCircle';
import { solarElevation, sunsetThreshold } from '../geo/sun';
import { sightWeight } from './moments';
import { cloudAt, CLOUDY } from './clouds';

/**
 * Which window to ask for at check-in — and whether it is worth asking at all.
 *
 * A window seat is worth something only when there is light and something on
 * that side. The advice weighs every sight by how notable and how close it is,
 * counts cities at night (their lights carry for a hundred kilometres) but
 * little else, and says plainly when neither side will show much.
 */

export interface WindowAdvice {
  best: 'left' | 'right' | 'either' | 'none';
  left: number;
  right: number;
  /** Top sights on each side, by id. */
  leftIds: string[];
  rightIds: string[];
  /** Share of the flight in daylight, 0–1 (null when the departure time is unknown). */
  daylight: number | null;
  /**
   * Share of the flight under a forecast of 70 % cloud or more, 0–1, over the
   * stretches the forecast covers; null without a forecast (pass `pkg.clouds`).
   */
  cloudy: number | null;
}

export function windowAdvice(route: RoutePoint[], pois: POI[], takeoff?: Date, clouds?: CloudSample[]): WindowAdvice {
  let left = 0;
  let right = 0;
  const lefts: Array<{ id: string; w: number }> = [];
  const rights: Array<{ id: string; w: number }> = [];
  let light = 0;
  let samples = 0;
  const valid = takeoff && !Number.isNaN(takeoff.getTime());

  if (valid && route.length > 1) {
    const end = route[route.length - 1]!.elapsedSeconds;
    for (let t = 0; t <= end; t += 300) {
      const p = interpolateAlongRoute(route, t);
      const when = new Date(takeoff!.getTime() + t * 1000);
      if (solarElevation(p.lat, p.lon, when) > sunsetThreshold(p.altitude)) light++;
      samples++;
    }
  }

  for (const poi of pois) {
    if (poi.passAt == null || !poi.side) continue;
    let w = sightWeight(poi);
    if (valid) {
      const p = interpolateAlongRoute(route, poi.passAt);
      const when = new Date(takeoff!.getTime() + poi.passAt * 1000);
      const day = solarElevation(p.lat, p.lon, when) > sunsetThreshold(p.altitude);
      if (!day) w *= poi.category === 'city' ? 0.8 : 0.05;
    }
    if (poi.side === 'left') {
      left += w;
      lefts.push({ id: poi.id, w });
    } else if (poi.side === 'right') {
      right += w;
      rights.push({ id: poi.id, w });
    } else {
      left += w * 0.5;
      right += w * 0.5;
    }
  }

  let overcast = 0;
  let forecast = 0;
  if (clouds?.length && route.length > 1) {
    const end = route[route.length - 1]!.elapsedSeconds;
    for (let t = 0; t <= end; t += 300) {
      const c = cloudAt({ clouds }, t);
      if (!c) continue;
      forecast++;
      if (c.cloud >= CLOUDY) overcast++;
    }
  }

  const top = (xs: Array<{ id: string; w: number }>) =>
    xs.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.id);

  const total = left + right;
  let best: WindowAdvice['best'];
  if (total < 0.6) best = 'none';
  else if (left > right * 1.2) best = 'left';
  else if (right > left * 1.2) best = 'right';
  else best = 'either';

  return {
    best,
    left,
    right,
    leftIds: top(lefts),
    rightIds: top(rights),
    daylight: samples ? light / samples : null,
    cloudy: forecast ? overcast / forecast : null
  };
}
