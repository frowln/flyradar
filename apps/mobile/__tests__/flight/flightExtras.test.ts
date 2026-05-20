import { describe, it, expect } from 'vitest';
import { calculateCO2, sunTimes, detectTimezoneCrossing, aircraftInfo } from '../../src/core/flight/flightExtras';

describe('calculateCO2', () => {
  it('1000km flight emits ~115kg', () => {
    expect(calculateCO2(1000).kg).toBe(115);
  });
  it('returns trees equivalent', () => {
    expect(calculateCO2(1000).treesEquivalent).toBeGreaterThan(0);
  });
});

describe('sunTimes', () => {
  it('returns valid dates for London', () => {
    const { sunrise, sunset } = sunTimes(51.5, -0.1);
    expect(sunrise).toBeInstanceOf(Date);
    expect(sunset).toBeInstanceOf(Date);
    expect(sunset.getTime()).toBeGreaterThan(sunrise.getTime());
  });
});

describe('detectTimezoneCrossing', () => {
  it('detects crossing', () => {
    expect(detectTimezoneCrossing(14, 16)).toBe(true);
    expect(detectTimezoneCrossing(10, 11)).toBe(false);
  });
});

describe('aircraftInfo', () => {
  it('returns info for known aircraft', () => {
    expect(aircraftInfo('B77W')?.name).toContain('777');
  });
  it('returns null for unknown', () => {
    expect(aircraftInfo('XXXX')).toBeNull();
  });
});
