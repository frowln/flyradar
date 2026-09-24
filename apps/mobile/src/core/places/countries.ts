import type { CountryPass, RoutePoint } from '@skyatlas/shared';
import type { DataCountry } from '../data/types';
import { bboxContains, pointInMulti } from '../geo/polygon';
import { interpolateAlongRoute } from '../geo/greatCircle';

/**
 * Which countries the flight passes over, and when.
 *
 * This is the one collection that works on every flight — at night, in cloud,
 * from an aisle seat — so it has to be right. The route is sampled roughly every
 * 8 km of ground; a country crossed for less than a minute is kept anyway,
 * because to a passenger a sliver of a country still counts.
 */

const SAMPLE_S = 30;

function countryAt(lon: number, lat: number, countries: DataCountry[], hint: DataCountry | null): DataCountry | null {
  // Consecutive samples are almost always in the same country; test it first.
  if (hint && bboxContains(hint.bb, lon, lat) && pointInMulti(lon, lat, hint.g)) return hint;
  for (const c of countries) {
    if (c === hint) continue;
    if (bboxContains(c.bb, lon, lat) && pointInMulti(lon, lat, c.g)) return c;
  }
  return null;
}

export function countriesAlong(route: RoutePoint[], countries: DataCountry[]): CountryPass[] {
  if (route.length === 0) return [];
  const end = route[route.length - 1]!.elapsedSeconds;
  const passes: CountryPass[] = [];
  let current: DataCountry | null = null;
  let hint: DataCountry | null = null;

  for (let t = 0; ; t = Math.min(end, t + SAMPLE_S)) {
    const p = interpolateAlongRoute(route, t);
    const c = countryAt(p.lon, p.lat, countries, hint);
    if (c) hint = c;
    if (c !== current) {
      const last = passes[passes.length - 1];
      // Close the country being left; leaving the sea closes nothing.
      if (last && current) last.exitAt = t;
      if (c) passes.push({ cc: c.cc, enterAt: t, exitAt: t });
      current = c;
    }
    if (t >= end) break;
  }
  const last = passes[passes.length - 1];
  if (last && current) last.exitAt = end;

  // Merge re-entries into the same country separated by a very short gap (a
  // coastline wiggle or a border that the outline simplified away).
  const merged: CountryPass[] = [];
  for (const p of passes) {
    const prev = merged[merged.length - 1];
    if (prev && prev.cc === p.cc && p.enterAt - prev.exitAt <= 90) prev.exitAt = p.exitAt;
    else merged.push({ ...p });
  }
  return merged;
}

/** Distinct countries in order of first entry. */
export function distinctCountries(passes: CountryPass[]): string[] {
  const out: string[] = [];
  for (const p of passes) if (!out.includes(p.cc)) out.push(p.cc);
  return out;
}

/** Seconds spent over each country, summed across re-entries. */
export function secondsByCountry(passes: CountryPass[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of passes) m.set(p.cc, (m.get(p.cc) ?? 0) + (p.exitAt - p.enterAt));
  return m;
}
