import { describe, it, expect } from 'vitest';
import type { FlightTrack } from '@skyatlas/shared';
import { routeFromTrack, trackMatchesAirports } from '../../src/core/route/track';
import { buildRoute } from '../../src/core/route/profile';
import { crossTrackKm, haversine, interpolateAlongRoute } from '../../src/core/geo/greatCircle';

const SVO = { lat: 55.9726, lon: 37.4146 };
const LED = { lat: 59.8003, lon: 30.2625 };
/** Where SU flights to St Petersburg turn north-west: well off the great circle. */
const BEND = { lat: 57.2, lon: 36.9 };

/**
 * A recorded SVO → LED flight, 70 minutes: first fix 4 km out, a dog-leg at
 * the bend, last fix 5 km short, climbing to FL340 and back down.
 */
function recorded(): FlightTrack {
  const points: FlightTrack['points'] = [];
  const start = { lat: SVO.lat + 0.03, lon: SVO.lon - 0.03 };
  const end = { lat: LED.lat - 0.04, lon: LED.lon + 0.03 };
  const total = 70 * 60;
  for (let t = 0; t <= total; t += 60) {
    const f = t / total;
    const [a, b, g] = f < 0.4 ? [start, BEND, f / 0.4] : [BEND, end, (f - 0.4) / 0.6];
    const lat = a.lat + (b.lat - a.lat) * g;
    const lon = a.lon + (b.lon - a.lon) * g;
    const alt = t < 1200 ? (10_400 * t) / 1200 : t > total - 1500 ? (10_400 * (total - t)) / 1500 : 10_400;
    points.push([lon, lat, Math.round(alt), t]);
  }
  return { points, flownOn: '2026-09-22', from: 'SVO', to: 'LED' };
}

describe('matching a track to the flight', () => {
  it('accepts a track that starts and ends at these airports', () => {
    expect(trackMatchesAirports(recorded(), SVO, LED)).toBe(true);
  });

  it('refuses the return leg, another leg, and a stub', () => {
    const t = recorded();
    // The return leg: flown LED → SVO, so its clock runs the other way along the path.
    const reversed = { ...t, points: t.points.map((p, i, all) => [...all[all.length - 1 - i]!.slice(0, 3), p[3]] as [number, number, number, number]) };
    expect(trackMatchesAirports(reversed, SVO, LED)).toBe(false);
    expect(trackMatchesAirports(t, SVO, { lat: 59.8, lon: 36 })).toBe(false);
    expect(trackMatchesAirports({ ...t, points: [t.points[0]!] }, SVO, LED)).toBe(false);
    expect(trackMatchesAirports(null, SVO, LED)).toBe(false);
    expect(routeFromTrack(reversed, { from: SVO, to: LED })).toBeNull();
  });
});

describe('routeFromTrack', () => {
  it('produces the same shape as a modelled route, stretched to the schedule', () => {
    const built = routeFromTrack(recorded(), { from: SVO, to: LED, airborneSeconds: 80 * 60 })!;
    const modelled = buildRoute({ from: SVO, to: LED, airborneSeconds: 80 * 60 });
    const r = built.route;
    expect(built.airborneSeconds).toBe(80 * 60);
    expect(r[0]).toMatchObject({ lat: SVO.lat, lon: SVO.lon, altitude: 0, elapsedSeconds: 0 });
    expect(r[r.length - 1]!.elapsedSeconds).toBe(80 * 60);
    expect(haversine(r[r.length - 1]!.lat, r[r.length - 1]!.lon, LED.lat, LED.lon)).toBeLessThan(0.1);
    // The same time step, so everything downstream sees the density it expects.
    expect(r[1]!.elapsedSeconds - r[0]!.elapsedSeconds).toBe(modelled.route[1]!.elapsedSeconds);
    expect(r.length).toBe(modelled.route.length);
    expect(Object.keys(r[5]!).sort()).toEqual(['altitude', 'elapsedSeconds', 'lat', 'lon']);
  });

  it('follows the track through the bend instead of the great circle', () => {
    const built = routeFromTrack(recorded(), { from: SVO, to: LED })!;
    const nearest = Math.min(...built.route.map((p) => haversine(p.lat, p.lon, BEND.lat, BEND.lon)));
    expect(nearest).toBeLessThan(10);
    expect(Math.abs(crossTrackKm(BEND.lat, BEND.lon, SVO.lat, SVO.lon, LED.lat, LED.lon))).toBeGreaterThan(50);
    expect(built.distanceKm).toBeGreaterThan(haversine(SVO.lat, SVO.lon, LED.lat, LED.lon) + 20);
  });

  it("keeps the track's own duration when the schedule is unknown", () => {
    const built = routeFromTrack(recorded(), { from: SVO, to: LED })!;
    // 70 recorded minutes plus the short gaps to each runway.
    expect(built.airborneSeconds).toBeGreaterThan(70 * 60);
    expect(built.airborneSeconds).toBeLessThan(72 * 60);
  });

  it('takes altitude from the track, clamped, with the descent where the track descends', () => {
    const t = recorded();
    t.points[30]![2] = 25_000;
    t.points[31]![2] = -300;
    const built = routeFromTrack(t, { from: SVO, to: LED, airborneSeconds: 70 * 60 })!;
    expect(Math.max(...built.route.map((p) => p.altitude))).toBeLessThanOrEqual(13_700);
    expect(Math.min(...built.route.map((p) => p.altitude))).toBeGreaterThanOrEqual(0);
    const midCruise = interpolateAlongRoute(built.route, 35 * 60).altitude;
    expect(midCruise).toBeGreaterThan(9_000);
    // Descent from ~45 minutes of 70.
    expect(built.topOfDescentAt).toBeGreaterThan(40 * 60);
    expect(built.topOfDescentAt).toBeLessThan(55 * 60);
  });

  it('copes with points out of order and repeated', () => {
    const t = recorded();
    const shuffled = { ...t, points: [t.points[10]!, ...t.points.slice(1).reverse(), t.points[0]!] };
    const built = routeFromTrack(shuffled, { from: SVO, to: LED })!;
    expect(built.route).toEqual(routeFromTrack(t, { from: SVO, to: LED })!.route);
    const repeated = { ...t, points: [...t.points.slice(0, 20), t.points[19]!, ...t.points.slice(20)] };
    const ok = routeFromTrack(repeated, { from: SVO, to: LED })!;
    expect(ok.route.every((p, i) => i === 0 || p.elapsedSeconds > ok.route[i - 1]!.elapsedSeconds)).toBe(true);
  });
});
