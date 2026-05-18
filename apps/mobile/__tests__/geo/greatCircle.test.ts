import { describe, it, expect } from 'vitest';
import { haversine, bearing, interpolateAlongRoute } from '../../src/core/geo/greatCircle';

describe('haversine', () => {
  it('SVO to JFK is approximately 7510 km', () => {
    const km = haversine(55.97, 37.41, 40.64, -73.78);
    expect(km).toBeGreaterThan(7400);
    expect(km).toBeLessThan(7700);
  });

  it('same point is 0 km', () => {
    expect(haversine(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it('London to Paris is approximately 340 km', () => {
    const km = haversine(51.5, -0.1, 48.85, 2.35);
    expect(km).toBeGreaterThan(300);
    expect(km).toBeLessThan(380);
  });
});

describe('bearing', () => {
  it('due east bearing is 90 degrees', () => {
    const b = bearing(0, 0, 0, 1);
    expect(b).toBeCloseTo(90, 0);
  });

  it('due north bearing is 0 degrees', () => {
    const b = bearing(0, 0, 1, 0);
    expect(b).toBeCloseTo(0, 0);
  });
});

describe('interpolateAlongRoute', () => {
  const route = [
    { lat: 0, lon: 0, altitude: 0, elapsedSeconds: 0 },
    { lat: 10, lon: 10, altitude: 11000, elapsedSeconds: 3600 },
    { lat: 20, lon: 20, altitude: 11000, elapsedSeconds: 7200 },
    { lat: 30, lon: 30, altitude: 0, elapsedSeconds: 10800 }
  ];

  it('returns first point when elapsed is 0', () => {
    const p = interpolateAlongRoute(route, 0);
    expect(p.lat).toBe(0);
    expect(p.lon).toBe(0);
    expect(p.altitude).toBe(0);
  });

  it('returns last point when elapsed exceeds route end', () => {
    const p = interpolateAlongRoute(route, 99999);
    expect(p.lat).toBe(30);
    expect(p.lon).toBe(30);
  });

  it('interpolates midpoint correctly', () => {
    const p = interpolateAlongRoute(route, 1800); // halfway between point 0 and 1
    expect(p.lat).toBeCloseTo(5, 0);
    expect(p.lon).toBeCloseTo(5, 0);
    expect(p.altitude).toBeCloseTo(5500, -2);
  });

  it('interpolates across segment boundary', () => {
    const p = interpolateAlongRoute(route, 5400); // halfway between point 1 and 2
    expect(p.lat).toBeCloseTo(15, 0);
    expect(p.lon).toBeCloseTo(15, 0);
  });

  it('returns exact point at segment boundary', () => {
    const p = interpolateAlongRoute(route, 3600);
    expect(p.lat).toBe(10);
    expect(p.altitude).toBe(11000);
  });
});
