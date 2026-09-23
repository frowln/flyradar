import { describe, it, expect } from 'vitest';
import { computeHeading } from '../../src/core/flight/positionEngine';

/** Due east along the equator — heading should read 90° throughout. */
const EASTBOUND = Array.from({ length: 50 }, (_, i) => ({
  lat: 0,
  lon: i * 0.5,
  altitude: 11000,
  elapsedSeconds: i * 360
}));

/** Due north along a meridian — heading should read 0°. */
const NORTHBOUND = Array.from({ length: 50 }, (_, i) => ({
  lat: i * 0.5,
  lon: 0,
  altitude: 11000,
  elapsedSeconds: i * 360
}));

describe('computeHeading', () => {
  it('reads due east on an eastbound equatorial route', () => {
    const takeoff = new Date(Date.now() - 60 * 60 * 1000);
    expect(computeHeading(EASTBOUND, takeoff)).toBeCloseTo(90, 0);
  });

  it('reads due north on a northbound route', () => {
    const takeoff = new Date(Date.now() - 60 * 60 * 1000);
    expect(computeHeading(NORTHBOUND, takeoff)).toBeCloseTo(0, 0);
  });

  it('still reports the direction of travel after the route ends', () => {
    // 20 hours into a 4.9-hour route: sampling ahead yields the same point.
    const takeoff = new Date(Date.now() - 20 * 60 * 60 * 1000);
    expect(computeHeading(EASTBOUND, takeoff)).toBeCloseTo(90, 0);
  });

  it('reports the direction of travel at the moment of takeoff', () => {
    const takeoff = new Date();
    expect(computeHeading(EASTBOUND, takeoff, takeoff)).toBeCloseTo(90, 0);
  });

  it('returns a bearing in 0–359 for every point along the route', () => {
    const takeoff = new Date(0);
    for (let h = 0; h < 6; h++) {
      const now = new Date(h * 60 * 60 * 1000);
      const heading = computeHeading(EASTBOUND, takeoff, now);
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThan(360);
    }
  });

  it('degrades to zero rather than throwing on a degenerate route', () => {
    expect(computeHeading([], new Date())).toBe(0);
    expect(
      computeHeading([{ lat: 0, lon: 0, altitude: 0, elapsedSeconds: 0 }], new Date())
    ).toBe(0);
  });

  it('honours the time multiplier used by the simulator', () => {
    const takeoff = new Date(Date.now() - 60 * 1000);
    // 60× speed puts the aircraft an hour in; the route is straight, so the
    // heading is unchanged — the point is that it does not throw or drift.
    expect(computeHeading(EASTBOUND, takeoff, new Date(), 60)).toBeCloseTo(90, 0);
  });
});
