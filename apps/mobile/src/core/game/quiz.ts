import type { CountryPass, OfflinePackage, PlaceQuestion, POI } from '@skyatlas/shared';
import { secondsByCountry } from '../places/countries';

/**
 * A short quiz about the flight just taken.
 *
 * Every question is built from the package — the countries crossed, the side a
 * peak was on, the order places went by — so every answer is true by
 * construction. It is asked after landing, when the passenger has a moment and
 * the flight is still fresh; never at cruise, where it would compete with the
 * window.
 */

export type QuizNote = { key: string; params: Record<string, string | number> } | { text: string };

export interface QuizQuestion {
  id: string;
  /** i18n key of the prompt, with params (unused when `text` is set). */
  prompt: string;
  params: Record<string, string | number>;
  /** A question written for one place, shown as it is. */
  text?: string;
  options: string[];
  correctIdx: number;
  /** Shown once answered — why the answer is what it is. */
  explain?: QuizNote;
}

export interface QuizNaming {
  place: (poi: POI) => string;
  country: (cc: string) => string;
  side: (side: 'left' | 'right') => string;
  /** The place's written text in the reader's language, if any. */
  text?: (poi: POI) => { quiz?: PlaceQuestion; tagline?: string; facts: string[] };
  duration?: (seconds: number) => string;
  height?: (metres: number) => string;
}

/** Deterministic shuffle so a quiz does not change between renders. */
function shuffle<T>(xs: T[], seed: string): T[] {
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

function withAnswer(
  id: string,
  prompt: string,
  params: QuizQuestion['params'],
  answer: string,
  wrong: string[],
  explain?: QuizNote
): QuizQuestion | null {
  const distinct = Array.from(new Set(wrong.filter((w) => w !== answer))).slice(0, 3);
  if (distinct.length < 1) return null;
  const options = shuffle([answer, ...distinct], id);
  return { id, prompt, params, options, correctIdx: options.indexOf(answer), explain };
}

/**
 * Questions written for the places this flight passed — "When did Fuji last
 * erupt?" — preferring places the passenger opened or saw, then the most
 * notable. Their explanation is the place's first written fact.
 */
function placeQuestions(pkg: OfflinePackage, naming: QuizNaming, prefer: string[], max: number): QuizQuestion[] {
  if (!naming.text || max <= 0) return [];
  const liked = new Set(prefer);
  const asked = pkg.pois
    .map((poi) => ({ poi, text: naming.text!(poi) }))
    .filter((x) => x.text.quiz && x.text.quiz.x.length >= 2)
    .sort((a, b) => Number(liked.has(b.poi.id)) - Number(liked.has(a.poi.id)) || (b.poi.rank ?? 0) - (a.poi.rank ?? 0))
    .slice(0, max);
  return asked.map(({ poi, text }) => {
    const q = text.quiz!;
    const id = `${pkg.flight.id}-place-${poi.id}`;
    const options = shuffle([q.a, ...q.x.slice(0, 2)], id);
    const note = text.facts[0] ?? text.tagline;
    return {
      id,
      prompt: '',
      params: {},
      text: q.q,
      options,
      correctIdx: options.indexOf(q.a),
      explain: note ? { text: `${naming.place(poi)}: ${note}` } : undefined
    };
  });
}

export function flightQuiz(pkg: OfflinePackage, naming: QuizNaming, max = 6, prefer: string[] = []): QuizQuestion[] {
  const qs: QuizQuestion[] = [];
  const passes: CountryPass[] = pkg.countries ?? [];
  const id = pkg.flight.id;

  // Longest time over a country.
  const secs = Array.from(secondsByCountry(passes).entries()).sort((a, b) => b[1] - a[1]);
  if (secs.length >= 3) {
    const q = withAnswer(
      `${id}-longest`,
      'quiz.longestCountry',
      {},
      naming.country(secs[0]![0]),
      secs.slice(1, 4).map(([cc]) => naming.country(cc)),
      naming.duration
        ? { key: 'quiz.longestExplain', params: { country: naming.country(secs[0]![0]), time: naming.duration(secs[0]![1]) } }
        : undefined
    );
    if (q) qs.push(q);
  }

  // Which side a prominent sight was on.
  // Something a passenger could have looked at: a peak, a city, a lake — not a
  // sea that happened to lie off one wingtip at touchdown.
  const SIDE_KINDS = new Set(['mountain', 'volcano', 'city', 'lake', 'island', 'range']);
  const end = pkg.route[pkg.route.length - 1]?.elapsedSeconds ?? 0;
  const midFlight = (p: POI) => (p.passAt ?? 0) > end * 0.08 && (p.passAt ?? 0) < end * 0.92;
  const sided = pkg.pois
    .filter((p): p is POI & { side: 'left' | 'right' } => (p.side === 'left' || p.side === 'right') && SIDE_KINDS.has(p.category) && midFlight(p))
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  const star = sided[0];
  if (star) {
    const other = star.side === 'left' ? 'right' : 'left';
    const hook = naming.text?.(star).tagline;
    const q = withAnswer(
      `${id}-side`,
      'quiz.whichSide',
      { place: naming.place(star) },
      naming.side(star.side),
      [naming.side(other)],
      hook ? { text: `${naming.place(star)}: ${hook}` } : undefined
    );
    if (q) qs.push(q);
  }

  // The highest peak on the route.
  const peaks = pkg.pois
    .filter((p) => (p.category === 'mountain' || p.category === 'volcano') && p.elevation)
    .sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  if (peaks.length >= 3) {
    const q = withAnswer(
      `${id}-peak`,
      'quiz.highestPeak',
      {},
      naming.place(peaks[0]!),
      peaks.slice(1, 4).map(naming.place),
      naming.height ? { key: 'quiz.peakExplain', params: { place: naming.place(peaks[0]!), h: naming.height(peaks[0]!.elevation!) } } : undefined
    );
    if (q) qs.push(q);
  }

  // How many countries were below.
  const n = new Set(passes.map((p) => p.cc)).size;
  if (n >= 2) {
    const list = Array.from(new Set(passes.map((p) => p.cc))).map(naming.country).join(', ');
    const q = withAnswer(`${id}-count`, 'quiz.countryCount', {}, String(n), [String(n - 1), String(n + 1), String(n + 2)], {
      key: 'quiz.countryExplain',
      params: { list }
    });
    if (q) qs.push(q);
  }

  // Which came first.
  const timed = pkg.pois.filter((p) => p.passAt != null && (p.rank ?? 0) >= 5 && midFlight(p));
  if (timed.length >= 2) {
    const a = timed[0]!;
    const b = timed[timed.length - 1]!;
    if ((b.passAt ?? 0) - (a.passAt ?? 0) > 1200) {
      const q = withAnswer(
        `${id}-order`,
        'quiz.whichFirst',
        { a: naming.place(a), b: naming.place(b) },
        naming.place(a),
        [naming.place(b)],
        naming.duration
          ? { key: 'quiz.firstExplain', params: { a: naming.place(a), ta: naming.duration(a.passAt ?? 0), b: naming.place(b), tb: naming.duration(b.passAt ?? 0) } }
          : undefined
      );
      if (q) qs.push(q);
    }
  }

  // Two or three about the flight, the rest about the places it passed.
  const own = qs.slice(0, Math.min(3, max));
  return [...own, ...placeQuestions(pkg, naming, prefer, max - own.length)];
}
