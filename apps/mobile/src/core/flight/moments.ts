import type { CountryPass, Moment, OfflinePackage, POI, RoutePoint } from '@skyatlas/shared';
import { lineCrossings } from '../geo/lines';
import { solarElevation, sunsetThreshold } from '../geo/sun';
import { interpolateAlongRoute } from '../geo/greatCircle';

/**
 * The flight as a sequence of moments worth knowing about.
 *
 * Built from geometry and data only: a border is crossed at this second, the
 * sun rises for this seat at that one, this peak is abeam on the left at the
 * other. Everything the in-flight screen says about "next" and everything the
 * phone will announce with the radio off comes from this list.
 */

/** How much a sighting is worth an interruption, 0–1. */
export function sightWeight(poi: POI): number {
  const rank = Math.min(10, Math.max(1, poi.rank ?? 5)) / 10;
  const dist = poi.closestApproachKm ?? 0;
  const proximity = dist <= 10 ? 1 : Math.max(0.2, 1 - dist / 220);
  const kind =
    poi.category === 'mountain' || poi.category === 'volcano' || poi.category === 'range' || poi.category === 'glacier'
      ? 1.15
      : poi.category === 'city' || poi.category === 'region' || poi.category === 'river'
        ? 0.85
        : // History is worth a line in "next", rarely a notification: nothing
          // of it is visible from the window.
          poi.category === 'historic'
          ? 0.6
          : 1;
  return Math.min(1, rank * rank * proximity * kind);
}

function sunEvents(route: RoutePoint[], takeoff: Date): Moment[] {
  const out: Moment[] = [];
  const end = route[route.length - 1]!.elapsedSeconds;
  const step = 120;
  let prev: number | null = null;
  for (let t = 0; t <= end; t += step) {
    const p = interpolateAlongRoute(route, t);
    const when = new Date(takeoff.getTime() + t * 1000);
    const above = solarElevation(p.lat, p.lon, when) - sunsetThreshold(p.altitude);
    if (prev !== null && Math.sign(above) !== Math.sign(prev) && above !== 0) {
      const kind = above > 0 ? 'sunrise' : 'sunset';
      out.push({ id: `${kind}-${t}`, kind, at: t - step / 2, weight: 0.75 });
    }
    prev = above;
  }
  return out;
}

export interface MomentInput {
  route: RoutePoint[];
  pois: POI[];
  countries?: CountryPass[];
  /** When the aircraft left the ground. Needed for sunrise and sunset. */
  takeoff?: Date;
  topOfDescentAt?: number;
}

export function computeMoments(input: MomentInput): Moment[] {
  const { route, pois } = input;
  if (route.length < 2) return [];
  const end = route[route.length - 1]!.elapsedSeconds;
  const out: Moment[] = [{ id: 'takeoff', kind: 'takeoff', at: 0, weight: 1 }];

  for (const poi of pois) {
    if (poi.passAt == null) continue;
    out.push({
      id: `sight-${poi.id}`,
      kind: 'sight',
      // A place flown over arrives when the track enters it. Its passAt sits
      // up to ten minutes inside, which had "next: Grand Canyon in 13 min" and
      // "you are flying over it in the next few minutes" land after the
      // window view had already put it below.
      at: poi.overFrom ?? poi.passAt,
      side: poi.side,
      poiId: poi.id,
      weight: sightWeight(poi)
    });
  }

  // A border counts once per country: a coastline that dips in and out of the
  // sea should not announce Canada three times.
  const passes = input.countries ?? [];
  const entered = new Set<string>();
  passes.forEach((p, i) => {
    const first = !entered.has(p.cc);
    entered.add(p.cc);
    if (i === 0 && p.enterAt === 0) return; // the country you take off from is not an arrival
    if (!first) return;
    out.push({ id: `border-${p.cc}-${p.enterAt}`, kind: 'border', at: p.enterAt, cc: p.cc, weight: 0.55 });
  });

  for (const c of lineCrossings(route)) {
    const weight = c.line === 'prime_meridian' ? 0.35 : c.line === 'equator' || c.line === 'dateline' ? 1 : 0.8;
    out.push({ id: `line-${c.line}-${c.at}`, kind: 'line', at: c.at, line: c.line, weight });
  }

  if (input.takeoff) out.push(...sunEvents(route, input.takeoff));

  const tod = input.topOfDescentAt ?? Math.max(0, end - 26 * 60);
  if (end > 45 * 60) out.push({ id: 'descent', kind: 'descent', at: tod, weight: 0.6 });
  out.push({ id: 'landing', kind: 'landing', at: end, weight: 1 });

  return out.sort((a, b) => a.at - b.at || b.weight - a.weight);
}

export function momentsForPackage(pkg: OfflinePackage, takeoff?: Date): Moment[] {
  const takeoffAt = takeoff ?? new Date(pkg.flight.actualDeparture ?? pkg.flight.scheduledDeparture);
  return computeMoments({
    route: pkg.route,
    pois: pkg.pois,
    countries: pkg.countries,
    takeoff: Number.isNaN(takeoffAt.getTime()) ? undefined : takeoffAt
  });
}

/**
 * The few moments worth waking someone for.
 *
 * Three by default, spread at least a quarter of an hour apart, and only sights
 * on the passenger's side when the seat is known — an alert to look out of a
 * window you are not next to is noise.
 */
export function pickAlerts(
  moments: Moment[],
  opts: { max?: number; minGapS?: number; seatSide?: 'left' | 'right' | 'middle' | 'unknown'; daylight?: (at: number) => boolean } = {}
): Moment[] {
  const max = opts.max ?? 3;
  const gap = opts.minGapS ?? 15 * 60;
  const candidates = moments.filter((m) => {
    if (m.kind === 'takeoff' || m.kind === 'landing' || m.kind === 'descent') return false;
    if (m.kind === 'border') return false;
    if (m.kind === 'sight') {
      if (m.weight < 0.35) return false;
      if (opts.daylight && !opts.daylight(m.at)) return false;
      if ((opts.seatSide === 'left' || opts.seatSide === 'right') && m.side && m.side !== 'below' && m.side !== opts.seatSide) {
        return false;
      }
    }
    return true;
  });
  const chosen: Moment[] = [];
  for (const m of [...candidates].sort((a, b) => b.weight - a.weight)) {
    if (chosen.length >= max) break;
    if (chosen.some((c) => Math.abs(c.at - m.at) < gap)) continue;
    chosen.push(m);
  }
  return chosen.sort((a, b) => a.at - b.at);
}

/** Fraction of the flight in daylight at cruise, given a takeoff time. */
export function daylightFraction(route: RoutePoint[], takeoff: Date): number {
  const end = route[route.length - 1]?.elapsedSeconds ?? 0;
  if (end <= 0) return 0;
  let light = 0;
  let n = 0;
  for (let t = 0; t <= end; t += 300) {
    const p = interpolateAlongRoute(route, t);
    const when = new Date(takeoff.getTime() + t * 1000);
    if (solarElevation(p.lat, p.lon, when) > sunsetThreshold(p.altitude)) light++;
    n++;
  }
  return n ? light / n : 0;
}
