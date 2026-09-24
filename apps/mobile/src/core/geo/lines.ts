import type { RoutePoint } from '@skyatlas/shared';

/**
 * The lines on the globe a flight can cross.
 *
 * These are the oldest rites of flying and sailing — crossing the equator,
 * the date line, the polar circles — and they are exact: no data needed, no
 * uncertainty about whether it happened.
 */

export type GlobeLine =
  | 'equator'
  | 'tropic_cancer'
  | 'tropic_capricorn'
  | 'arctic_circle'
  | 'antarctic_circle'
  | 'dateline'
  | 'prime_meridian';

const TROPIC = 23.4365;
const POLAR = 66.5635;

const PARALLELS: Array<{ line: GlobeLine; lat: number }> = [
  { line: 'equator', lat: 0 },
  { line: 'tropic_cancer', lat: TROPIC },
  { line: 'tropic_capricorn', lat: -TROPIC },
  { line: 'arctic_circle', lat: POLAR },
  { line: 'antarctic_circle', lat: -POLAR }
];

export interface LineCrossing {
  line: GlobeLine;
  /** Seconds after takeoff. */
  at: number;
}

/** Every line the route crosses, in order. */
export function lineCrossings(route: RoutePoint[]): LineCrossing[] {
  const out: LineCrossing[] = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;

    for (const { line, lat } of PARALLELS) {
      const da = a.lat - lat;
      const db = b.lat - lat;
      if (da === 0 || da * db < 0) {
        const f = da === db ? 0 : da / (da - db);
        out.push({ line, at: Math.round(a.elapsedSeconds + f * (b.elapsedSeconds - a.elapsedSeconds)) });
      }
    }

    const dLon = b.lon - a.lon;
    if (Math.abs(dLon) > 180) {
      // Jumped from +179 to −179 (or back): the antimeridian.
      const aDist = 180 - Math.abs(a.lon);
      const bDist = 180 - Math.abs(b.lon);
      const f = aDist + bDist > 0 ? aDist / (aDist + bDist) : 0.5;
      out.push({ line: 'dateline', at: Math.round(a.elapsedSeconds + f * (b.elapsedSeconds - a.elapsedSeconds)) });
    } else if ((a.lon < 0 && b.lon >= 0) || (a.lon >= 0 && b.lon < 0)) {
      const f = a.lon === b.lon ? 0 : a.lon / (a.lon - b.lon);
      out.push({ line: 'prime_meridian', at: Math.round(a.elapsedSeconds + f * (b.elapsedSeconds - a.elapsedSeconds)) });
    }
  }

  // A route running along a parallel can touch it several times in a row;
  // one crossing per line per ten minutes is what a person would call one.
  const kept: LineCrossing[] = [];
  for (const c of out.sort((x, y) => x.at - y.at)) {
    const prev = [...kept].reverse().find((k) => k.line === c.line);
    if (prev && c.at - prev.at < 600) continue;
    kept.push(c);
  }
  return kept;
}
