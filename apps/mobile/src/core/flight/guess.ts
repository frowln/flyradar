import type { OfflinePackage, POI, POICategory } from '@skyatlas/shared';
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
  /**
   * Whether every option is of the answer's kind, so the question may name it
   * ("which sea…?"). Otherwise the options are only alike and it does not.
   */
  sameKind: boolean;
}

/** Kinds close enough to stand in for one another as wrong options. */
const FAMILY: Record<POICategory, string> = {
  sea: 'water',
  lake: 'water',
  river: 'water',
  mountain: 'relief',
  volcano: 'relief',
  range: 'relief',
  glacier: 'relief',
  plateau: 'land',
  desert: 'land',
  park: 'land',
  landmark: 'land',
  region: 'land',
  peninsula: 'land',
  island: 'land',
  city: 'city',
  historic: 'historic'
};

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

/**
 * A group the answer belongs to would be right too: "Great Lakes" cannot be a
 * wrong option next to "Lake Erie", nor "Canary Islands" next to "Tenerife
 * Island". Names are compared in English, word by word, singular to plural.
 */
function containsAnswer(option: POI, answer: POI): boolean {
  const words = (s: string) => s.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 2);
  const a = words(answer.name);
  return words(option.name).some((w) => a.some((x) => w === `${x}s` || w === `${x}es`));
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

  // Wrong options from far along the route, so the answer cannot be read off
  // the map nearby, and of the same kind when there are enough: the question
  // then names the kind ("which sea…?"). Otherwise from kindred kinds, and the
  // question does not name one — a mountain and a town as the other options
  // to "which sea?" gave the answer away.
  const usable = (p: POI) => p.id !== poi.id && Math.abs((p.passAt ?? 0) - (poi.passAt ?? 0)) > 20 * 60 && !containsAnswer(p, poi);
  const sameKind = pkg.pois.filter((p) => usable(p) && p.category === poi.category);
  const pool = sameKind.length >= 2 ? sameKind : pkg.pois.filter((p) => usable(p) && FAMILY[p.category] === FAMILY[poi.category]);
  const distractors = seededOrder(pool, poi.id).slice(0, 2);
  if (distractors.length < 2) return null;
  const options = seededOrder([poi, ...distractors], `${poi.id}:options`);
  return {
    poi,
    options,
    correctIdx: options.indexOf(poi),
    inS: (appearsAt(poi) ?? 0) - elapsedS,
    sameKind: distractors.every((d) => d.category === poi.category)
  };
}
