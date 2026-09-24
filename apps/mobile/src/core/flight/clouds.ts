import type { CloudSample, OfflinePackage } from '@skyatlas/shared';
import { interpolateAlongRoute } from '../geo/greatCircle';

/**
 * Cloud along the route: whether the ground will be there to see.
 *
 * Fetched once when a flight is prepared (and refreshed while departure is a
 * few days off, as the forecast sharpens), kept in the package, and read at
 * cruise with the radio off. Low cloud is what matters from 11 km: high cloud
 * is usually below or around the aircraft only in patches, while an overcast
 * at 1 km hides everything a sight alert would point at.
 */

/** One sample per quarter of an hour of flight. */
export const CLOUD_STEP_S = 15 * 60;
/** The server takes at most this many points per request. */
const MAX_POINTS = 60;
/** Forecasts are not worth asking for further ahead than this. */
export const CLOUD_HORIZON_MS = 7 * 24 * 3600_000;
/** From this much low cloud a sight is not worth an alert. */
export const LOW_CLOUD_HIDES = 80;
/** From this much total cloud a stretch of the flight counts as cloudy. */
export const CLOUDY = 70;

export interface CloudQuery {
  lat: number;
  lon: number;
  /** ISO time the aircraft is expected there. */
  at: string;
}

export interface CloudReading {
  at: string;
  cloud: number | null;
  low: number | null;
}

export type FetchClouds = (points: CloudQuery[]) => Promise<CloudReading[] | null>;

/** Wheels-up, as the package's timeline counts it: departure plus taxi. */
function takeoffMs(pkg: OfflinePackage): number {
  return Date.parse(pkg.flight.scheduledDeparture) + 10 * 60_000;
}

/** Seconds after takeoff to ask about: every quarter hour, the landing included. */
export function cloudSampleTimes(airborneS: number): number[] {
  if (!(airborneS > 0)) return [];
  const step = Math.max(CLOUD_STEP_S, Math.ceil(airborneS / (MAX_POINTS - 1)));
  const out: number[] = [];
  for (let t = 0; t < airborneS; t += step) out.push(t);
  out.push(airborneS);
  return out;
}

/** Where the aircraft will be and when, for each sample time. */
export function cloudQueries(pkg: OfflinePackage): { times: number[]; queries: CloudQuery[] } | null {
  const route = pkg.route;
  const takeoff = takeoffMs(pkg);
  if (route.length < 2 || !Number.isFinite(takeoff)) return null;
  const times = cloudSampleTimes(route[route.length - 1]!.elapsedSeconds);
  const queries = times.map((t) => {
    const p = interpolateAlongRoute(route, t);
    return {
      lat: Math.round(p.lat * 100) / 100,
      lon: Math.round(p.lon * 100) / 100,
      at: new Date(takeoff + t * 1000).toISOString()
    };
  });
  return { times, queries };
}

/**
 * The forecast along a package's route, or null when there is nothing to ask
 * (departure beyond the forecast's reach, a flight already flown) or nothing
 * came back. Never throws: clouds are a nicety, never a reason a flight fails
 * to prepare.
 */
export async function fetchCloudsFor(
  pkg: OfflinePackage,
  fetchClouds: FetchClouds,
  now: Date = new Date()
): Promise<CloudSample[] | null> {
  const takeoff = takeoffMs(pkg);
  const end = pkg.route[pkg.route.length - 1]?.elapsedSeconds ?? 0;
  if (!Number.isFinite(takeoff) || takeoff - now.getTime() > CLOUD_HORIZON_MS) return null;
  if (takeoff + end * 1000 < now.getTime()) return null;
  const asked = cloudQueries(pkg);
  if (!asked) return null;
  let readings: CloudReading[] | null;
  try {
    readings = await fetchClouds(asked.queries);
  } catch {
    return null;
  }
  if (!readings || readings.length !== asked.queries.length) return null;
  const samples: CloudSample[] = [];
  readings.forEach((r, i) => {
    if (typeof r?.cloud === 'number' && typeof r.low === 'number') {
      samples.push({ at: asked.times[i]!, cloud: r.cloud, low: r.low });
    }
  });
  return samples.length ? samples : null;
}

/**
 * Cloud at a moment of the flight, from the package alone.
 *
 * Interpolated between the samples either side when they are close; the
 * nearer one within a quarter hour otherwise; null where the forecast said
 * nothing — "unknown" must not read as "clear".
 */
export function cloudAt(pkg: Pick<OfflinePackage, 'clouds'>, elapsedS: number): { cloud: number; low: number } | null {
  const samples = pkg.clouds;
  if (!samples?.length) return null;
  let before: CloudSample | undefined;
  let after: CloudSample | undefined;
  for (const s of samples) {
    if (s.at <= elapsedS) before = s;
    else {
      after = s;
      break;
    }
  }
  if (before && after && after.at - before.at <= 3600) {
    const f = (elapsedS - before.at) / (after.at - before.at);
    return {
      cloud: Math.round(before.cloud + (after.cloud - before.cloud) * f),
      low: Math.round(before.low + (after.low - before.low) * f)
    };
  }
  const near = [before, after]
    .filter((s): s is CloudSample => !!s && Math.abs(s.at - elapsedS) <= CLOUD_STEP_S)
    .sort((a, b) => Math.abs(a.at - elapsedS) - Math.abs(b.at - elapsedS))[0];
  return near ? { cloud: near.cloud, low: near.low } : null;
}

/** Whether low cloud will hide the ground at this moment. */
export function groundHidden(pkg: Pick<OfflinePackage, 'clouds'>, elapsedS: number): boolean {
  return (cloudAt(pkg, elapsedS)?.low ?? 0) >= LOW_CLOUD_HIDES;
}
