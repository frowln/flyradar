import type { FlightTrack, RoutePoint } from '@skyatlas/shared';
import { haversine, interpolateAlongRoute, routeLengthKm } from '../geo/greatCircle';
import type { BuiltRoute } from './profile';

/**
 * The route from a track this flight number actually flew.
 *
 * A modelled route is a great circle, or a detour drawn around closed
 * airspace; the aircraft follows airways, oceanic tracks and the same detours
 * day after day. A track from last week is the better guess — as long as it
 * is the same trip. So it is used only when it starts and ends at this
 * flight's airports, and its clock is stretched to this flight's schedule:
 * the path is last week's, the timing is today's.
 */

/** A track ending farther than this from the airport is another leg or a diversion. */
export const TRACK_MATCH_KM = 60;
/** FL450: nothing a passenger flies goes higher; anything above is a bad fix. */
const MAX_ALTITUDE_M = 13_700;
/** Ground speed across the gap between an airport and the first or last recorded fix, km/s. */
const GAP_SPEED_KMS = 0.12;

type Place = { lat: number; lon: number };

/** Well-formed points in time order, each strictly later than the last. */
function clean(points: FlightTrack['points'] | undefined): FlightTrack['points'] {
  if (!Array.isArray(points)) return [];
  const ok = points
    .filter((p) => Array.isArray(p) && p.length >= 4 && p.every(Number.isFinite) && Math.abs(p[1]) <= 90)
    .sort((a, b) => a[3] - b[3]);
  return ok.filter((p, i) => i === 0 || p[3] > ok[i - 1]![3]);
}

/** Whether the track's first and last fixes (in time) are at these airports. */
export function trackMatchesAirports(track: FlightTrack | null | undefined, from: Place, to: Place, maxKm = TRACK_MATCH_KM): boolean {
  const pts = clean(track?.points);
  if (pts.length < 2) return false;
  const [lon0, lat0] = pts[0]!;
  const [lon1, lat1] = pts[pts.length - 1]!;
  return haversine(lat0, lon0, from.lat, from.lon) <= maxKm && haversine(lat1, lon1, to.lat, to.lon) <= maxKm;
}

const clampAlt = (m: number) => Math.max(0, Math.min(MAX_ALTITUDE_M, Number.isFinite(m) ? m : 0));

/**
 * Seconds after takeoff when the descent begins: the last moment within a
 * step-climb of cruise altitude.
 */
function topOfDescent(route: RoutePoint[], cruise: number): number {
  const end = route[route.length - 1]!.elapsedSeconds;
  if (cruise < 1000) return Math.max(0, end - 26 * 60);
  const threshold = cruise - Math.max(600, cruise * 0.1);
  for (let i = route.length - 1; i >= 0; i--) {
    if (route[i]!.altitude >= threshold) return route[i]!.elapsedSeconds;
  }
  return Math.max(0, end - 26 * 60);
}

export interface TrackRouteOptions {
  from: Place;
  to: Place;
  /** This flight's time in the air; the track's own duration when unknown. */
  airborneSeconds?: number;
}

/**
 * The same shape `buildRoute` produces — sampled at the same step, altitude
 * from the track — or null when the track does not belong to these airports.
 */
export function routeFromTrack(track: FlightTrack, opts: TrackRouteOptions): BuiltRoute | null {
  if (!trackMatchesAirports(track, opts.from, opts.to)) return null;
  const pts = clean(track.points);

  // Anchor both ends on the runway: recording starts a little after takeoff
  // and stops a little before touchdown.
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const head = haversine(opts.from.lat, opts.from.lon, first[1], first[0]);
  const tail = haversine(last[1], last[0], opts.to.lat, opts.to.lon);
  const lead = head > 1 ? head / GAP_SPEED_KMS : 0;
  const raw: RoutePoint[] = [];
  if (lead) raw.push({ lat: opts.from.lat, lon: opts.from.lon, altitude: 0, elapsedSeconds: 0 });
  for (const [lon, lat, alt, t] of pts) {
    raw.push({ lat, lon, altitude: clampAlt(alt), elapsedSeconds: lead + (t - first[3]) });
  }
  const recordedEnd = raw[raw.length - 1]!.elapsedSeconds;
  if (tail > 1) raw.push({ lat: opts.to.lat, lon: opts.to.lon, altitude: 0, elapsedSeconds: recordedEnd + tail / GAP_SPEED_KMS });
  const recorded = raw[raw.length - 1]!.elapsedSeconds;
  if (!(recorded > 0)) return null;

  const airborneSeconds = Math.max(15 * 60, Math.round(opts.airborneSeconds ?? recorded));
  const k = airborneSeconds / recorded;
  const scaled = raw.map((p) => ({ ...p, elapsedSeconds: p.elapsedSeconds * k }));

  // Resampled at buildRoute's step, so everything downstream sees the density it expects.
  const step = Math.max(45, Math.ceil(airborneSeconds / 480));
  const route: RoutePoint[] = [];
  for (let t = 0; ; t = Math.min(airborneSeconds, t + step)) {
    const p = interpolateAlongRoute(scaled, t);
    route.push({ lat: round(p.lat, 4), lon: round(p.lon, 4), altitude: Math.round(clampAlt(p.altitude)), elapsedSeconds: t });
    if (t >= airborneSeconds) break;
  }

  // A high percentile rather than the maximum: one bad fix must not define cruise.
  const sorted = route.map((p) => p.altitude).sort((a, b) => a - b);
  const cruiseAltitudeM = sorted[Math.floor((sorted.length - 1) * 0.85)]!;
  return {
    route,
    distanceKm: routeLengthKm(route),
    airborneSeconds,
    cruiseAltitudeM,
    topOfDescentAt: topOfDescent(route, cruiseAltitudeM)
  };
}

function round(n: number, dp: number): number {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
}
