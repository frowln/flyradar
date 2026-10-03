import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setDatasetsForTesting } from '../../src/core/data/datasets';
import { buildRoute } from '../../src/core/route/profile';
import {
  groundSpeedKmh,
  outsideTempC,
  compassPoint,
  zoneBelow,
  utcOffsetMinutes,
  clockIn,
  viewSector,
  usefulRangeKm
} from '../../src/core/flight/telemetry';

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../assets/data', `${name}.skydata`), 'utf8'));
setDatasetsForTesting({ airports: read('airports').airports });

describe('the numbers on the seat-back screen', () => {
  const { route } = buildRoute({ from: { lat: 55.97, lon: 37.41 }, to: { lat: 43.45, lon: 39.95 } });
  const end = route[route.length - 1]!.elapsedSeconds;

  it('gives a jet ground speed at cruise and a slow one on the climb', () => {
    expect(groundSpeedKmh(route, end / 2)).toBeGreaterThan(700);
    expect(groundSpeedKmh(route, end / 2)).toBeLessThan(1000);
    expect(groundSpeedKmh(route, 30)).toBeLessThan(groundSpeedKmh(route, end / 2));
  });

  it('reads the standard atmosphere for the temperature outside', () => {
    expect(outsideTempC(0)).toBe(15);
    expect(outsideTempC(11000)).toBe(-56.5);
    expect(outsideTempC(12500)).toBe(-56.5);
    expect(outsideTempC(5000)).toBeCloseTo(-17.5);
  });

  it('names the course by compass point', () => {
    expect(compassPoint(0)).toBe('n');
    expect(compassPoint(142)).toBe('se');
    expect(compassPoint(359)).toBe('n');
    expect(compassPoint(-90)).toBe('w');
  });

  it('knows the time on the ground below', () => {
    expect(zoneBelow(55.75, 37.6)).toBe('Europe/Moscow');
    expect(utcOffsetMinutes('Europe/Moscow', new Date('2026-09-24T12:00:00Z'))).toBe(180);
    expect(utcOffsetMinutes('Asia/Kathmandu', new Date('2026-09-24T12:00:00Z'))).toBe(345);
    expect(clockIn('Europe/Moscow', new Date('2026-09-24T12:00:00Z'))).toBe('15:00');
    // Mid-Atlantic still gets a zone: the nearest coast's.
    expect(zoneBelow(45, -35)).toBeTruthy();
  });

  it('takes the zone from the country below, not from an airport across the border', () => {
    // Over Adygea the nearest airport is Sukhumi, on Georgian time.
    expect(zoneBelow(44.65, 40.58, 'RU')).toBe('Europe/Moscow');
    // On the Indian plain north of Lucknow the nearest airports are Nepalese.
    expect(zoneBelow(28.06, 82.45, 'IN')).toBe('Asia/Kolkata');
    // Over British Columbia, not Washington State.
    expect(zoneBelow(49.33, -122.66, 'CA')).toBe('America/Vancouver');
  });

  it('draws a window sector abeam on the right side', () => {
    const ring = viewSector(50, 30, 0, 'right', 200);
    expect(ring[0]).toEqual([30, 50]);
    // Heading north, the right window looks east: the sector's middle is east of the aircraft.
    const mid = ring[Math.floor(ring.length / 2)]!;
    expect(mid[0]).toBeGreaterThan(30);
    expect(Math.abs(mid[1] - 50)).toBeLessThan(0.5);
    expect(usefulRangeKm(11000)).toBeGreaterThan(150);
  });

  it('keeps a sector continuous across the date line', () => {
    const ring = viewSector(52, 179.5, 0, 'right', 200);
    expect(ring.every(([lon]) => lon > 170)).toBe(true);
  });
});
