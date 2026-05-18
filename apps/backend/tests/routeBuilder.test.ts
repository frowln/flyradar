import { describe, it, expect } from 'vitest';
import { buildRoute } from '../src/services/routeBuilder.js';

describe('buildRoute', () => {
  it('produces the requested number of points', () => {
    const route = buildRoute(
      { lat: 55.97, lon: 37.41 }, // SVO
      { lat: 40.64, lon: -73.78 }, // JFK
      { points: 200, durationMinutes: 600 }
    );
    expect(route).toHaveLength(200);
  });

  it('first point is at origin', () => {
    const route = buildRoute(
      { lat: 55.97, lon: 37.41 },
      { lat: 40.64, lon: -73.78 },
      { points: 200, durationMinutes: 600 }
    );
    expect(route[0].lat).toBeCloseTo(55.97, 1);
    expect(route[0].lon).toBeCloseTo(37.41, 1);
  });

  it('last point is at destination', () => {
    const route = buildRoute(
      { lat: 55.97, lon: 37.41 },
      { lat: 40.64, lon: -73.78 },
      { points: 200, durationMinutes: 600 }
    );
    expect(route[199].lat).toBeCloseTo(40.64, 1);
    expect(route[199].lon).toBeCloseTo(-73.78, 1);
  });

  it('midpoint elapsed time is half total duration', () => {
    const route = buildRoute(
      { lat: 0, lon: 0 },
      { lat: 0, lon: 90 },
      { points: 101, durationMinutes: 600 }
    );
    const mid = route[50];
    expect(mid.elapsedSeconds).toBeCloseTo(300 * 60, -3); // 300 minutes in seconds
  });

  it('altitude profile: takeoff at 0, cruise above 9000m, landing at 0', () => {
    const route = buildRoute(
      { lat: 0, lon: 0 },
      { lat: 0, lon: 90 },
      { points: 100, durationMinutes: 600 }
    );
    expect(route[0].altitude).toBe(0);
    expect(route[50].altitude).toBeGreaterThan(9000);
    expect(route[99].altitude).toBeLessThan(500);
  });

  it('handles same origin and destination without crashing', () => {
    const route = buildRoute(
      { lat: 51.5, lon: -0.1 },
      { lat: 51.5, lon: -0.1 },
      { points: 10, durationMinutes: 60 }
    );
    expect(route).toHaveLength(10);
  });
});
