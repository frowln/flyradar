import type { RoutePoint } from '@skyatlas/shared';
import { interpolateAlongRoute, haversine, alongTrackKm, crossTrackKm, headingAt } from '../geo/greatCircle';
import type { GpsFix } from './session';

/**
 * Where the aircraft is now.
 *
 * Two sources, used in order of trust: a recent GPS fix (the phone's receiver
 * works in flight mode, it just needs a window), and otherwise the time since
 * takeoff projected along the planned route, corrected by whatever the last fix
 * taught us about being early or late.
 */

export interface Now {
  /** Seconds of flight, on the route's clock. */
  elapsedS: number;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  source: 'gps' | 'estimate';
  /** 0–1 along the route. */
  progress: number;
  ended: boolean;
}

/** A fix older than this no longer describes where the aircraft is. */
const FIX_FRESH_MS = 3 * 60 * 1000;

export function elapsedFromClock(takeoffAt: Date, now: Date, multiplier = 1, offsetS = 0): number {
  return Math.max(0, ((now.getTime() - takeoffAt.getTime()) / 1000) * multiplier + offsetS);
}

/** Seconds of flight at which the route passes closest to a point. */
export function projectOntoRoute(route: RoutePoint[], lat: number, lon: number): { elapsedS: number; offTrackKm: number } {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < route.length; i++) {
    const d = haversine(route[i]!.lat, route[i]!.lon, lat, lon);
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  let elapsed = route[bi]!.elapsedSeconds;
  let offTrack = best;
  for (const [ai, bj] of [
    [bi - 1, bi],
    [bi, bi + 1]
  ] as const) {
    const a = route[ai];
    const b = route[bj];
    if (!a || !b) continue;
    const leg = haversine(a.lat, a.lon, b.lat, b.lon);
    if (leg < 0.01) continue;
    const along = alongTrackKm(lat, lon, a.lat, a.lon, b.lat, b.lon);
    if (along >= 0 && along <= leg) {
      elapsed = a.elapsedSeconds + (along / leg) * (b.elapsedSeconds - a.elapsedSeconds);
      offTrack = Math.abs(crossTrackKm(lat, lon, a.lat, a.lon, b.lat, b.lon));
      break;
    }
  }
  return { elapsedS: elapsed, offTrackKm: offTrack };
}

export function positionNow(
  route: RoutePoint[],
  takeoffAt: Date,
  now: Date,
  opts: { multiplier?: number; clockOffsetS?: number; fix?: GpsFix | null } = {}
): Now {
  const end = route[route.length - 1]?.elapsedSeconds ?? 0;
  const fix = opts.fix;
  const fresh = fix && now.getTime() - fix.at < FIX_FRESH_MS && (opts.multiplier ?? 1) === 1;

  if (fresh) {
    const proj = projectOntoRoute(route, fix.lat, fix.lon);
    // A fix far off the planned track still tells us where we are; the route
    // clock just stops being a good description of it.
    const planned = interpolateAlongRoute(route, proj.elapsedS);
    return {
      elapsedS: proj.elapsedS,
      lat: fix.lat,
      lon: fix.lon,
      altitude: fix.alt && fix.alt > 500 ? fix.alt : planned.altitude,
      heading: headingAt(route, proj.elapsedS),
      source: 'gps',
      progress: end > 0 ? Math.min(1, proj.elapsedS / end) : 1,
      ended: proj.elapsedS >= end - 30
    };
  }

  const elapsedS = Math.min(end, elapsedFromClock(takeoffAt, now, opts.multiplier, opts.clockOffsetS));
  const p = interpolateAlongRoute(route, elapsedS);
  return {
    elapsedS,
    lat: p.lat,
    lon: p.lon,
    altitude: p.altitude,
    heading: headingAt(route, elapsedS),
    source: 'estimate',
    progress: end > 0 ? elapsedS / end : 1,
    ended: elapsedS >= end
  };
}

/**
 * The clock correction a fix implies: positive when the aircraft is ahead of
 * the schedule the clock assumes, negative when behind.
 */
export function offsetFromFix(route: RoutePoint[], takeoffAt: Date, fix: GpsFix, multiplier = 1): number {
  const byClock = elapsedFromClock(takeoffAt, new Date(fix.at), multiplier, 0);
  const byFix = projectOntoRoute(route, fix.lat, fix.lon).elapsedS;
  return Math.round(byFix - byClock);
}
