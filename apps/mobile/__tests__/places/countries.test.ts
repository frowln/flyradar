import { describe, it, expect } from 'vitest';
import { countriesAlong, distinctCountries, secondsByCountry } from '../../src/core/places/countries';
import { buildRoute } from '../../src/core/route/profile';
import type { DataCountry } from '../../src/core/data/types';

const box = (cc: string, lon0: number, lon1: number, lat0: number, lat1: number): DataCountry => ({
  cc,
  n: cc,
  cont: 'Test',
  bb: [lon0, lat0, lon1, lat1],
  g: [[[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1]]]]
});

describe('countriesAlong', () => {
  // Eastbound along the equator from 0° to 10°E, over A (0–4), sea (4–5), B (5–10).
  const route = buildRoute({ from: { lat: 0.5, lon: 0.2 }, to: { lat: 0.5, lon: 9.8 } }).route;
  const countries = [box('AA', 0, 4, -1, 2), box('BB', 5, 10, -1, 2)];

  it('lists countries in order with a gap for the sea', () => {
    const passes = countriesAlong(route, countries);
    expect(distinctCountries(passes)).toEqual(['AA', 'BB']);
    expect(passes[0]!.enterAt).toBe(0);
    expect(passes[0]!.exitAt).toBeLessThan(passes[1]!.enterAt);
    expect(passes[1]!.exitAt).toBe(route[route.length - 1]!.elapsedSeconds);
  });

  it('adds up time over each country', () => {
    const secs = secondsByCountry(countriesAlong(route, countries));
    expect(secs.get('BB')!).toBeGreaterThan(secs.get('AA')!);
  });
});
