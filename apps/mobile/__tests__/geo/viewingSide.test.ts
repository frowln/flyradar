import { describe, it, expect } from 'vitest';
import { viewingSide, depressionAngle, horizonDistanceKm } from '../../src/core/geo/viewingSide';

describe('viewingSide', () => {
  // Aircraft on the equator at 0°E, so bearings are easy to reason about.
  const LAT = 0;
  const LON = 0;

  it('puts a place due east of a northbound aircraft on the right', () => {
    const s = viewingSide(LAT, LON, 0, 0, 1);
    expect(s.side).toBe('right');
    expect(s.relativeBearing).toBeCloseTo(90, 0);
  });

  it('puts a place due west of a northbound aircraft on the left', () => {
    const s = viewingSide(LAT, LON, 0, 0, -1);
    expect(s.side).toBe('left');
    expect(s.relativeBearing).toBeCloseTo(270, 0);
  });

  it('reports straight ahead rather than a side', () => {
    expect(viewingSide(LAT, LON, 0, 1, 0).side).toBe('ahead');
  });

  it('reports behind when the place is astern', () => {
    expect(viewingSide(LAT, LON, 0, -1, 0).side).toBe('behind');
  });

  it('follows the heading rather than true north', () => {
    // Same place, but the aircraft now flies east: what was on the right is ahead.
    expect(viewingSide(LAT, LON, 90, 0, 1).side).toBe('ahead');
    // And what was ahead is now on the left.
    expect(viewingSide(LAT, LON, 90, 1, 0).side).toBe('left');
  });

  it('normalises headings outside 0–360', () => {
    expect(viewingSide(LAT, LON, 450, 0, 1).side).toBe(viewingSide(LAT, LON, 90, 0, 1).side);
    expect(viewingSide(LAT, LON, -270, 0, 1).side).toBe(viewingSide(LAT, LON, 90, 0, 1).side);
  });

  it('keeps the relative bearing within 0–359 for any heading', () => {
    for (const heading of [-720, -45, 0, 17, 359, 360, 721]) {
      const { relativeBearing } = viewingSide(LAT, LON, heading, 10, 10);
      expect(relativeBearing).toBeGreaterThanOrEqual(0);
      expect(relativeBearing).toBeLessThan(360);
    }
  });

  it('gives no viewing angle for places behind the aircraft', () => {
    expect(viewingSide(LAT, LON, 0, -1, 0).depressionAngle).toBeNull();
  });
});

describe('depressionAngle', () => {
  it('looks straight down at zero distance', () => {
    expect(depressionAngle(0, 11.28)).toBe(90);
  });

  it('gets shallower as the place gets further away', () => {
    const near = depressionAngle(20, 11.28)!;
    const far = depressionAngle(120, 11.28)!;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('returns null past the horizon instead of a bogus positive angle', () => {
    // Flat-earth arithmetic would report ~1.3° here; the place is in fact hidden.
    expect(depressionAngle(500, 11.28)).toBeNull();
  });

  it('sees further from higher up', () => {
    // 450 km is past the horizon at cruise (~379 km) but inside it at 20 km (~504 km).
    expect(depressionAngle(450, 11.28)).toBeNull();
    expect(depressionAngle(450, 20)).not.toBeNull();
  });
});

describe('horizonDistanceKm', () => {
  it('is about 380 km at cruise altitude', () => {
    expect(horizonDistanceKm(11.28)).toBeGreaterThan(350);
    expect(horizonDistanceKm(11.28)).toBeLessThan(400);
  });

  it('agrees with depressionAngle about what is visible', () => {
    const horizon = horizonDistanceKm(11.28);
    expect(depressionAngle(horizon - 10, 11.28)).not.toBeNull();
    expect(depressionAngle(horizon + 10, 11.28)).toBeNull();
  });
});
