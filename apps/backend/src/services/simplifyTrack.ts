/**
 * Douglas–Peucker for a flight track, down to a point budget.
 *
 * A recorded track has a position every few seconds — thousands of points for
 * a long flight, most of them on a straight line. The phone needs the turns and
 * the climb and descent, not the straight lines, so points are kept in order of
 * how far the path would move without them, until the budget is spent.
 *
 * The distance of a point from a segment is its cross-track distance from
 * the great circle between the segment's ends (the phone joins kept points
 * along great circles, so a point on that circle is redundant however long the
 * segment) combined with how far its altitude is from the straight ramp
 * between the ends — a kilometre of height counting like ten sideways, or the
 * climb, which covers little ground, would be flattened away.
 */

/** [lon, lat, altitude m, seconds]. */
export type TrackPoint = [number, number, number, number];

const EARTH_R_KM = 6371;
const ALT_WEIGHT = 10;
/** Below this the path no longer visibly changes; stop even if the budget allows more. */
const MIN_DEVIATION_KM = 0.05;

type Vec3 = [number, number, number];

function unit([lon, lat]: TrackPoint): Vec3 {
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
/** Angle between two unit vectors, radians — robust for tiny angles, unlike acos. */
const angle = (a: Vec3, b: Vec3) => Math.atan2(norm(cross(a, b)), dot(a, b));

/** Deviation of point p from the segment a–b, km. */
function deviation(p: Vec3, pAlt: number, a: Vec3, aAlt: number, b: Vec3, bAlt: number): number {
  const n = cross(a, b);
  const len = norm(n);
  const span = angle(a, b);
  let sideways: number;
  let f: number;
  if (len < 1e-12 || span < 1e-9) {
    sideways = angle(a, p);
    f = 0;
  } else {
    const nh: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
    const off = dot(p, nh);
    sideways = Math.abs(Math.asin(Math.max(-1, Math.min(1, off))));
    // Where along a→b the point falls, as a fraction; outside, its nearer end counts.
    const foot: Vec3 = [p[0] - off * nh[0], p[1] - off * nh[1], p[2] - off * nh[2]];
    const along = Math.atan2(dot(cross(a, foot), nh), dot(a, foot));
    f = along / span;
    if (f < 0) {
      sideways = angle(a, p);
      f = 0;
    } else if (f > 1) {
      sideways = angle(b, p);
      f = 1;
    }
  }
  const altKm = Math.abs(pAlt - (aAlt + f * (bAlt - aAlt))) / 1000;
  return Math.hypot(sideways * EARTH_R_KM, altKm * ALT_WEIGHT);
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
  const v = points.map(unit);

  const span = (from: number, to: number): Span => {
    let worst = -1;
    let dev = 0;
    for (let i = from + 1; i < to; i++) {
      const d = deviation(v[i]!, points[i]![2], v[from]!, points[from]![2], v[to]!, points[to]![2]);
      if (d > dev) {
        dev = d;
        worst = i;
      }
    }
    return { from, to, worst, deviation: dev };
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
