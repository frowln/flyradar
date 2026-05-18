import { describe, it, expect } from 'vitest';
import { computePosition } from '../../src/core/flight/positionEngine';

const ROUTE = Array.from({ length: 100 }, (_, i) => ({
  lat: 0,
  lon: i * 0.5,
  altitude: i < 10 ? i * 1100 : i > 85 ? (100 - i) * 733 : 11000,
  elapsedSeconds: i * 360 // 100 points over 360 seconds each = 36000s total (10 hours)
}));

describe('computePosition', () => {
  it('returns first point when takeoff is now', () => {
    const takeoff = new Date();
    const pos = computePosition(ROUTE, takeoff, takeoff);
    expect(pos.elapsedSeconds).toBe(0);
    expect(pos.lat).toBe(0);
    expect(pos.lon).toBe(0);
  });

  it('returns correct position 30 minutes into flight', () => {
    const takeoff = new Date(Date.now() - 30 * 60 * 1000);
    const pos = computePosition(ROUTE, takeoff);
    expect(pos.elapsedSeconds).toBeCloseTo(1800, -1);
    expect(pos.lon).toBeGreaterThan(0);
  });

  it('clamps to route end when elapsed exceeds total duration', () => {
    const takeoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
    const pos = computePosition(ROUTE, takeoff);
    expect(pos.elapsedSeconds).toBe(ROUTE[ROUTE.length - 1].elapsedSeconds);
  });

  it('clamps to route start when takeoff is in the future', () => {
    const takeoff = new Date(Date.now() + 60 * 60 * 1000); // 1h in the future
    const pos = computePosition(ROUTE, takeoff);
    expect(pos.elapsedSeconds).toBe(0);
  });

  it('accepts explicit now parameter for deterministic testing', () => {
    const takeoff = new Date('2026-05-20T10:00:00Z');
    const now = new Date('2026-05-20T11:00:00Z'); // exactly 1 hour later
    const pos = computePosition(ROUTE, takeoff, now);
    expect(pos.elapsedSeconds).toBeCloseTo(3600, -1);
  });
});
