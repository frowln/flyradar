import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pointInMulti, pointInRing } from '../../src/core/geo/polygon';
import type { CountriesFile, MultiPolygon, Ring } from '../../src/core/data/types';

const countries = (JSON.parse(readFileSync(join(__dirname, '../../assets/data/countries.skydata'), 'utf8')) as CountriesFile).countries;

/** The plain ray cast the indexed version must agree with, edge for edge. */
function scanRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const scanMulti = (lon: number, lat: number, multi: MultiPolygon) =>
  multi.some((p) => p.length > 0 && scanRing(lon, lat, p[0]!) && !p.slice(1).some((h) => scanRing(lon, lat, h)));

describe('point in polygon', () => {
  /**
   * The latitude-band index and per-polygon boxes made country lookup ~60×
   * faster on Hermes; they are only allowed to do so by giving exactly the
   * answers of the full scan — including on vertices and band boundaries,
   * where an off-by-one in the bucketing would show.
   */
  it('gives the same answers as a full ray cast on the largest outlines', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let checked = 0;
    const mismatches: string[] = [];
    for (const cc of ['RU', 'US', 'GL', 'NO', 'ID', 'FJ']) {
      const { g, bb } = countries.find((c) => c.cc === cc)!;
      const [w, s, e, n] = bb;
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 200; k++) pts.push([w - 1 + rnd() * (e - w + 2), s - 1 + rnd() * (n - s + 2)]);
      for (const poly of g) {
        const ring = poly[0]!;
        for (let i = 0; i < ring.length; i += 97) {
          const [x, y] = ring[i]!;
          const [x2, y2] = ring[(i + 1) % ring.length]!;
          pts.push([x, y], [x, Math.round(y)], [(x + x2) / 2, (y + y2) / 2]);
        }
      }
      for (const [lon, lat] of pts) {
        if (pointInMulti(lon, lat, g) !== scanMulti(lon, lat, g)) mismatches.push(`${cc} ${lon},${lat}`);
        checked++;
      }
    }
    expect(mismatches).toEqual([]);
    expect(checked).toBeGreaterThan(1500);
  });

  it('still handles small rings and points outside the box', () => {
    const square: Ring = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2]
    ];
    expect(pointInRing(1, 1, square)).toBe(true);
    expect(pointInRing(3, 1, square)).toBe(false);
    const big: Ring = Array.from({ length: 100 }, (_, i) => {
      const a = (i / 100) * 2 * Math.PI;
      return [10 * Math.cos(a), 10 * Math.sin(a)] as [number, number];
    });
    expect(pointInRing(0, 0, big)).toBe(true);
    expect(pointInRing(0, 9.9, big)).toBe(true);
    expect(pointInRing(0, 10.5, big)).toBe(false);
    expect(pointInRing(20, 0, big)).toBe(false);
  });
});
