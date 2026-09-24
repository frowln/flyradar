/**
 * Douglas–Peucker for a flight track, down to a point budget.
 *
 * A recorded track has a position every few seconds — thousands of points for
 * a long flight, most of them on a straight line. The phone needs the turns and
 * the climb and descent, not the straight lines, so points are kept in order of
 * how far the path would move without them, until the budget is spent.
 *
 * Distances are taken in 3-D on the sphere (so the antimeridian is not a jump)
 * with altitude as a fourth axis, weighted so that a kilometre of height counts
 * like ten kilometres sideways: otherwise the climb, which covers little
 * ground, would be flattened into a straight ramp.
 */

/** [lon, lat, altitude m, seconds]. */
export type TrackPoint = [number, number, number, number];

const EARTH_R_KM = 6371;
const ALT_WEIGHT = 10;
/** Below this the path no longer visibly changes; stop even if the budget allows more. */
const MIN_DEVIATION_KM = 0.05;

type Vec = [number, number, number, number];

function toVec([lon, lat, alt]: TrackPoint): Vec {
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;
  return [
    EARTH_R_KM * Math.cos(φ) * Math.cos(λ),
    EARTH_R_KM * Math.cos(φ) * Math.sin(λ),
    EARTH_R_KM * Math.sin(φ),
    (alt / 1000) * ALT_WEIGHT
  ];
}

/** Distance from p to the segment a–b. */
function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  let ab2 = 0;
  let dot = 0;
  for (let i = 0; i < 4; i++) {
    const d = b[i]! - a[i]!;
    ab2 += d * d;
    dot += (p[i]! - a[i]!) * d;
  }
  const t = ab2 > 0 ? Math.max(0, Math.min(1, dot / ab2)) : 0;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const d = p[i]! - (a[i]! + t * (b[i]! - a[i]!));
    s += d * d;
  }
  return Math.sqrt(s);
}

interface Span {
  from: number;
  to: number;
  /** Index of the point farthest from the chord, and how far. */
  worst: number;
  deviation: number;
}

export function simplifyTrack(points: TrackPoint[], maxPoints = 150): TrackPoint[] {
  if (points.length <= Math.max(2, maxPoints)) return points.slice();
  const v = points.map(toVec);

  const span = (from: number, to: number): Span => {
    let worst = -1;
    let deviation = 0;
    for (let i = from + 1; i < to; i++) {
      const d = segmentDistance(v[i]!, v[from]!, v[to]!);
      if (d > deviation) {
        deviation = d;
        worst = i;
      }
    }
    return { from, to, worst, deviation };
  };

  const keep = new Set([0, points.length - 1]);
  const open: Span[] = [span(0, points.length - 1)];
  while (keep.size < maxPoints && open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.deviation > open[best]!.deviation) best = i;
    const s = open[best]!;
    if (s.worst < 0 || s.deviation < MIN_DEVIATION_KM) break;
    open.splice(best, 1);
    keep.add(s.worst);
    open.push(span(s.from, s.worst), span(s.worst, s.to));
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]!);
}
