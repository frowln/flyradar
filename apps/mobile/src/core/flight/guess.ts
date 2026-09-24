import type { OfflinePackage, POI } from '@skyatlas/shared';
import { sightWeight } from './moments';

/**
 * "What is about to appear?" — a guess a few minutes before a notable sight.
 *
 * The question is built from the package: the right answer is the place about
 * to come abeam, the wrong ones are other places of the same kind from the same
 * flight. Everything is true by construction, and the answer is on the other
 * side of the window a minute later.
 */

export interface Guess {
  poi: POI;
  options: POI[];
  correctIdx: number;
  /** Seconds until it appears: abeam, or at the edge of an area flown over. */
  inS: number;
}

const OPEN_BEFORE_S = 6 * 60;
const CLOSE_BEFORE_S = 45;

function seededOrder<T>(xs: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * When the place appears: abeam for a sight to one side, but the edge of the
 * outline for one flown over. An area's `passAt` sits up to ten minutes inside
 * it, so "which landmark are you about to fly over?" was asked over the
 * Grand Canyon rather than before it.
 */
function appearsAt(p: POI): number | undefined {
  return p.overFrom ?? p.passAt;
}

export function nextGuess(pkg: OfflinePackage, elapsedS: number, answered: Record<string, boolean>): Guess | null {
  const candidates = pkg.pois
    .filter((p) => {
      const at = appearsAt(p);
      return (
        at != null &&
        at - elapsedS <= OPEN_BEFORE_S &&
        at - elapsedS >= CLOSE_BEFORE_S &&
        !(p.id in answered) &&
        sightWeight(p) >= 0.3
      );
    })
    .sort((a, b) => sightWeight(b) - sightWeight(a));
  const poi = candidates[0];
  if (!poi) return null;

  const sameKind = pkg.pois.filter((p) => p.id !== poi.id && p.category === poi.category);
  const pool = sameKind.length >= 2 ? sameKind : pkg.pois.filter((p) => p.id !== poi.id);
  // Distractors from far along the route, so the answer cannot be read off the map nearby.
  const distractors = seededOrder(
    pool.filter((p) => Math.abs((p.passAt ?? 0) - (poi.passAt ?? 0)) > 20 * 60),
    poi.id
  ).slice(0, 2);
  if (distractors.length < 2) return null;
  const options = seededOrder([poi, ...distractors], `${poi.id}:options`);
  return { poi, options, correctIdx: options.indexOf(poi), inS: (appearsAt(poi) ?? 0) - elapsedS };
}
