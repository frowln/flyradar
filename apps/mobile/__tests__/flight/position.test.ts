import { describe, it, expect } from 'vitest';
import { positionNow, offsetFromFix, projectOntoRoute, elapsedFromClock } from '../../src/core/flight/position';
import { buildRoute } from '../../src/core/route/profile';
import { interpolateAlongRoute, headingAt } from '../../src/core/geo/greatCircle';

const built = buildRoute({ from: { lat: 51.47, lon: -0.45 }, to: { lat: 40.64, lon: -73.78 } });
const route = built.route;
const end = route[route.length - 1]!.elapsedSeconds;
const takeoff = new Date('2026-07-01T10:00:00Z');
const at = (s: number) => new Date(takeoff.getTime() + s * 1000);

describe('positionNow', () => {
  it('estimates from the clock when there is no fix', () => {
    const now = positionNow(route, takeoff, at(3600));
    expect(now.source).toBe('estimate');
    expect(now.elapsedS).toBe(3600);
    expect(now.ended).toBe(false);
  });

  it('clamps to the end of the route and reports arrival', () => {
    const now = positionNow(route, takeoff, at(end + 3600));
    expect(now.elapsedS).toBe(end);
    expect(now.ended).toBe(true);
    expect(now.progress).toBe(1);
  });

  it('runs faster for a demo flight', () => {
    expect(positionNow(route, takeoff, at(60), { multiplier: 60 }).elapsedS).toBe(3600);
  });

  it('prefers a fresh GPS fix and ignores a stale one', () => {
    const truth = interpolateAlongRoute(route, 7200);
    const fix = { lat: truth.lat, lon: truth.lon, at: at(5400).getTime() };
    const fresh = positionNow(route, takeoff, at(5400), { fix });
    expect(fresh.source).toBe('gps');
    expect(Math.abs(fresh.elapsedS - 7200)).toBeLessThan(90);
    const stale = positionNow(route, takeoff, at(5400 + 600), { fix });
    expect(stale.source).toBe('estimate');
  });

  it('carries a fix’s correction forward as a clock offset', () => {
    // The aircraft is 20 minutes behind the clock.
    const truth = interpolateAlongRoute(route, 3600 - 1200);
    const fix = { lat: truth.lat, lon: truth.lon, at: at(3600).getTime() };
    const offset = offsetFromFix(route, takeoff, fix);
    expect(Math.abs(offset + 1200)).toBeLessThan(90);
    const later = positionNow(route, takeoff, at(5000), { clockOffsetS: offset });
    expect(Math.abs(later.elapsedS - (5000 - 1200))).toBeLessThan(90);
  });

  it('points the heading along the route, westbound across the Atlantic', () => {
    const h = positionNow(route, takeoff, at(end / 2)).heading;
    expect(h).toBeGreaterThan(240);
    expect(h).toBeLessThan(320);
    expect(headingAt(route, end + 100)).toBeGreaterThan(200);
  });
});

describe('projectOntoRoute', () => {
  it('finds the moment of closest approach for a point on the track', () => {
    const p = interpolateAlongRoute(route, 12_345);
    const proj = projectOntoRoute(route, p.lat, p.lon);
    expect(Math.abs(proj.elapsedS - 12_345)).toBeLessThan(30);
    expect(proj.offTrackKm).toBeLessThan(5);
  });

  it('never returns a negative elapsed time', () => {
    expect(elapsedFromClock(takeoff, new Date(takeoff.getTime() - 60_000))).toBe(0);
  });
});
