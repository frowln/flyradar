import type { RoutePoint } from '@skyatlas/shared';
import { gcInterpolate, haversine } from '../geo/greatCircle';

/**
 * The flight as a timed path: where the aircraft is, how high, how many
 * seconds after takeoff.
 *
 * A real track bends around closed airspace and weather; we do not have it. What
 * we can model honestly is the shape every flight shares: a climb that covers
 * little ground, a long cruise, a descent that starts ~150 km out. Getting that
 * shape right is what keeps "left, in ten minutes" true at the start and end of
 * the flight, where most of what can be seen actually is.
 */

/** Typical jet cruise ground speed, km/h. Used only when no schedule is known. */
const CRUISE_KMH = 820;

/** Time from wheels-up to cruise and from top of descent to touchdown, seconds. */
const CLIMB_S = 22 * 60;
const DESCENT_S = 26 * 60;

/** Average ground speed during climb and descent, as a fraction of cruise speed. */
const TRANSITION_SPEED_FRACTION = 0.55;

/** Minutes of taxi out and in that sit inside a scheduled block time. */
export const TAXI_S = 18 * 60;

/** Cruise altitude for a leg of this length, metres. Short hops never reach FL370. */
export function cruiseAltitudeM(distanceKm: number): number {
  if (distanceKm < 250) return 6000;
  if (distanceKm < 500) return 8500;
  if (distanceKm < 900) return 10400;
  return 11300;
}

/**
 * Time in the air for a great-circle distance, when the schedule is unknown.
 * Calibrated against typical block times minus taxi: LHR–JFK ≈ 7h40 airborne,
 * SVO–AYT ≈ 3h45, SIN–LHR ≈ 13h20.
 */
export function estimateAirborneSeconds(distanceKm: number): number {
  const hours = distanceKm / CRUISE_KMH + 0.45;
  return Math.round(hours * 3600);
}

/** Airborne seconds from a scheduled block time, never less than physics allows. */
export function airborneFromSchedule(blockSeconds: number, distanceKm: number): number {
  const minimum = Math.round((distanceKm / 1000 + 0.25) * 3600);
  return Math.max(minimum, blockSeconds - TAXI_S);
}

interface Profile {
  /** Seconds in each phase. */
  climb: number;
  cruise: number;
  descent: number;
  /** Ground speed at cruise, km/s. */
  v: number;
}

/**
 * Splits the airborne time into phases and solves for the cruise speed that
 * makes the distances add up.
 */
function solveProfile(distanceKm: number, airborneS: number): Profile {
  // Short flights spend a larger share of their time climbing and descending.
  const climb = Math.min(CLIMB_S, airborneS * 0.3);
  const descent = Math.min(DESCENT_S, airborneS * 0.35);
  const cruise = Math.max(0, airborneS - climb - descent);
  // distance = v·cruise + f·v·(climb + descent)
  const v = distanceKm / (cruise + TRANSITION_SPEED_FRACTION * (climb + descent));
  return { climb, cruise, descent, v };
}

/** Ground distance covered by time t, km. Speed ramps linearly in climb and descent. */
function distanceAt(t: number, p: Profile): number {
  const f = TRANSITION_SPEED_FRACTION;
  // In climb speed rises from (2f-1)·v … v so its mean is f·v; same mirrored in descent.
  const v0 = Math.max(0.1, 2 * f - 1) * p.v;
  const climbDist = f * p.v * p.climb;
  if (t <= p.climb) {
    const a = p.climb > 0 ? (p.v - v0) / p.climb : 0;
    return v0 * t + 0.5 * a * t * t;
  }
  const cruiseEnd = p.climb + p.cruise;
  if (t <= cruiseEnd) return climbDist + p.v * (t - p.climb);
  const td = Math.min(p.descent, t - cruiseEnd);
  const a = p.descent > 0 ? (p.v - v0) / p.descent : 0;
  return climbDist + p.v * p.cruise + p.v * td - 0.5 * a * td * td;
}

function altitudeAt(t: number, p: Profile, cruiseAlt: number): number {
  if (t <= p.climb) {
    // Ease-out: most height is gained early in the climb.
    const x = p.climb > 0 ? t / p.climb : 1;
    return cruiseAlt * (1 - (1 - x) * (1 - x));
  }
  const cruiseEnd = p.climb + p.cruise;
  if (t <= cruiseEnd) return cruiseAlt;
  const x = p.descent > 0 ? Math.min(1, (t - cruiseEnd) / p.descent) : 1;
  // Ease-in: the descent steepens toward the approach.
  return cruiseAlt * (1 - x * x);
}

export interface BuildRouteInput {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  /** Waypoints between the endpoints, joined by great circles (e.g. around closed airspace). */
  via?: Array<{ lat: number; lon: number }>;
  /** Seconds in the air. Estimated from distance when omitted. */
  airborneSeconds?: number;
}

/** A path of great-circle legs, walkable by distance. */
function polyline(points: Array<{ lat: number; lon: number }>) {
  const legs: Array<{ a: { lat: number; lon: number }; b: { lat: number; lon: number }; start: number; len: number }> = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = haversine(a.lat, a.lon, b.lat, b.lon);
    legs.push({ a, b, start: total, len });
    total += len;
  }
  const at = (d: number) => {
    const leg = legs.find((l) => d <= l.start + l.len) ?? legs[legs.length - 1]!;
    const f = leg.len > 0 ? Math.min(1, Math.max(0, (d - leg.start) / leg.len)) : 1;
    return gcInterpolate(leg.a.lat, leg.a.lon, leg.b.lat, leg.b.lon, f);
  };
  return { total, at };
}

export interface BuiltRoute {
  route: RoutePoint[];
  distanceKm: number;
  airborneSeconds: number;
  cruiseAltitudeM: number;
  /** Seconds after takeoff when the descent begins. */
  topOfDescentAt: number;
}

/**
 * Samples the flight at a fixed time step — about every minute on a short
 * flight, never more than ~500 points on the longest.
 */
export function buildRoute(input: BuildRouteInput): BuiltRoute {
  const { from, to } = input;
  const path = polyline([from, ...(input.via ?? []), to]);
  const distanceKm = path.total;
  const airborneSeconds = Math.max(
    15 * 60,
    Math.round(input.airborneSeconds ?? estimateAirborneSeconds(distanceKm))
  );
  const profile = solveProfile(distanceKm, airborneSeconds);
  const cruiseAlt = cruiseAltitudeM(distanceKm);

  const step = Math.max(45, Math.ceil(airborneSeconds / 480));
  const route: RoutePoint[] = [];
  for (let t = 0; ; t = Math.min(airborneSeconds, t + step)) {
    const p = path.at(Math.min(distanceKm, distanceAt(t, profile)));
    route.push({
      lat: round(p.lat, 4),
      lon: round(p.lon, 4),
      altitude: Math.round(altitudeAt(t, profile, cruiseAlt)),
      elapsedSeconds: t
    });
    if (t >= airborneSeconds) break;
  }

  return {
    route,
    distanceKm,
    airborneSeconds,
    cruiseAltitudeM: cruiseAlt,
    topOfDescentAt: Math.round(profile.climb + profile.cruise)
  };
}

function round(n: number, dp: number): number {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
}
