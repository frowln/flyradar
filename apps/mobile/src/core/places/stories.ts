import type { POI, PlaceQuestion, RoutePoint } from '@skyatlas/shared';
import { haversine, bearing, gcInterpolate, headingAt, interpolateAlongRoute } from '../geo/greatCircle';

/**
 * Texts written for SkyAtlas, and the history layer.
 *
 * An encyclopedia's first paragraph answers "what is it?"; a passenger at the
 * window wants "why look, what exactly do I look for, what will I remember".
 * Places the app knows best carry texts written for that (content/, built into
 * assets/data/stories.<lang>.skydata). They take precedence over a fetched
 * Wikipedia summary, which remains the fallback and the "read more" link.
 *
 * The history layer adds what cannot be seen but is worth knowing: the Silk
 * Road passing underneath, an ancient capital off the left wing, a kingdom's
 * heartland below. Items are routes (polylines), sites (point + radius) and
 * regions (centre + radius), matched against the flight's route here.
 */

export interface StoryText {
  t: string;
  s: string;
  w?: string;
  f: string[];
  q?: PlaceQuestion;
}

export interface HistoryText extends StoryText {
  name: string;
  era?: string;
}

export interface StoriesFile {
  version: 1;
  lang: string;
  places: Record<string, StoryText>;
  history: Record<string, HistoryText>;
}

export interface HistoryItem {
  key: string;
  kind: 'route' | 'site' | 'region';
  rank: number;
  name: Partial<Record<'en' | 'ru' | 'de' | 'fr' | 'es' | 'ja', string>>;
  /** Routes: [lon, lat] waypoints. */
  path?: [number, number][];
  lat?: number;
  lon?: number;
  radius_km?: number;
}

export interface HistoryFile {
  version: 1;
  items: HistoryItem[];
}

type Lang = keyof NonNullable<POI['translations']>;

function keyOf(poi: POI): string {
  return poi.wikidata ?? poi.id;
}

/** Writes a text into the POI in the right slot for its language. */
function withText(poi: POI, lang: string, text: StoryText, extra: { era?: string } = {}): POI {
  if (lang === 'en') {
    return { ...poi, summary: text.s, tagline: text.t, facts: text.f, look: text.w, quiz: text.q, era: extra.era, textSource: 'editorial', textLang: undefined };
  }
  const translations = { ...(poi.translations ?? {}) };
  const k = lang as Lang;
  translations[k] = {
    name: translations[k]?.name ?? poi.name,
    summary: text.s,
    tagline: text.t,
    facts: text.f,
    look: text.w,
    quiz: text.q,
    era: extra.era
  };
  return { ...poi, translations, textSource: 'editorial' };
}

/** Applies written texts to the places that have them, in the reader's language. */
export function applyStories(pois: POI[], stories: StoriesFile | null | undefined): POI[] {
  if (!stories) return pois;
  return pois.map((poi) => {
    const text = stories.places[keyOf(poi)] ?? stories.places[poi.id];
    return text ? withText(poi, stories.lang, text) : poi;
  });
}

// ─── History layer ──────────────────────────────────────────────────────────

/** Samples of the flight every minute or so, indexed on a one-degree grid. */
interface Samples {
  pts: Array<{ lat: number; lon: number; t: number }>;
  grid: Map<string, number[]>;
}

const cell = (lat: number, lon: number) => `${Math.floor(lat)}:${Math.floor(((lon % 360) + 540) % 360)}`;

function sampleRoute(route: RoutePoint[]): Samples {
  const end = route[route.length - 1]?.elapsedSeconds ?? 0;
  const step = Math.max(30, Math.min(90, end / 400));
  const pts: Samples['pts'] = [];
  const grid = new Map<string, number[]>();
  for (let t = 0; t <= end; t += step) {
    const p = interpolateAlongRoute(route, t);
    const i = pts.push({ lat: p.lat, lon: p.lon, t }) - 1;
    const k = cell(p.lat, p.lon);
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  return { pts, grid };
}

/** The flight samples within ~1° of a point. */
function nearby(s: Samples, lat: number, lon: number): number[] {
  const out: number[] = [];
  for (let dl = -1; dl <= 1; dl++) {
    for (let dn = -1; dn <= 1; dn++) {
      const list = s.grid.get(cell(lat + dl, lon + dn));
      if (list) out.push(...list);
    }
  }
  return out;
}

/** Nearest flight sample to a point, if any lies within ~110 km. */
function nearest(s: Samples, lat: number, lon: number, from = 0, to = Infinity): { i: number; d: number } | null {
  let best: { i: number; d: number } | null = null;
  for (const i of nearby(s, lat, lon)) {
    const p = s.pts[i]!;
    if (p.t < from || p.t > to) continue;
    const d = haversine(lat, lon, p.lat, p.lon);
    if (!best || d < best.d) best = { i, d };
  }
  return best;
}

/** Waypoints joined by great circles, one point every ~20 km. */
function densify(path: [number, number][]): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [lon1, lat1] = path[i]!;
    const [lon2, lat2] = path[i + 1]!;
    const n = Math.max(1, Math.ceil(haversine(lat1, lon1, lat2, lon2) / 20));
    for (let k = 0; k < n; k++) {
      const p = gcInterpolate(lat1, lon1, lat2, lon2, k / n);
      out.push({ lat: p.lat, lon: p.lon });
    }
  }
  const last = path[path.length - 1];
  if (last) out.push({ lat: last[1], lon: last[0] });
  return out;
}

interface Match {
  item: HistoryItem;
  lat: number;
  lon: number;
  passAt: number;
  distanceKm: number;
  side: 'left' | 'right' | 'below';
  overFrom?: number;
  overTo?: number;
}

const CROSS_KM = 35;
/**
 * A route crossed while taxiing, climbing out or on final is not a moment:
 * Lindbergh's flight "crossed" at minute 0 out of JFK only because it began
 * there. Sites near an airport still count — the Acropolis on the climb out
 * of Athens is a fine view.
 */
const QUIET_ENDS_S = 10 * 60;

function matchRoute(item: HistoryItem, s: Samples): Match | null {
  if (!item.path || item.path.length < 2) return null;
  const end = s.pts[s.pts.length - 1]?.t ?? 0;
  let first: { i: number; d: number; lat: number; lon: number } | null = null;
  let lastT = -1;
  for (const p of densify(item.path)) {
    const n = nearest(s, p.lat, p.lon, QUIET_ENDS_S, end - QUIET_ENDS_S);
    if (!n || n.d > CROSS_KM) continue;
    const t = s.pts[n.i]!.t;
    if (!first || t < s.pts[first.i]!.t) first = { ...n, lat: p.lat, lon: p.lon };
    lastT = Math.max(lastT, t);
  }
  if (!first) return null;
  const at = s.pts[first.i]!.t;
  // Crossing: a few minutes. Flying along it: until the track leaves it, capped.
  return {
    item,
    lat: first.lat,
    lon: first.lon,
    passAt: at,
    distanceKm: first.d,
    side: 'below',
    overFrom: Math.max(0, at - 150),
    overTo: Math.min(Math.max(at + 150, lastT), at + 40 * 60)
  };
}

function matchArea(item: HistoryItem, s: Samples, route: RoutePoint[]): Match | null {
  if (item.lat == null || item.lon == null || !item.radius_km) return null;
  let best: { i: number; d: number } | null = null;
  let from = -1;
  let to = -1;
  // A radius can reach far beyond the grid neighbourhood, so areas are
  // checked against every sample (there are only a few hundred per flight).
  for (let i = 0; i < s.pts.length; i++) {
    const p = s.pts[i]!;
    const d = haversine(item.lat, item.lon, p.lat, p.lon);
    if (!best || d < best.d) best = { i, d };
    if (d <= item.radius_km) {
      if (from < 0) from = p.t;
      to = p.t;
    }
  }
  if (!best || best.d > item.radius_km) return null;
  const at = s.pts[best.i]!.t;
  if (item.kind === 'region') {
    return { item, lat: item.lat, lon: item.lon, passAt: at, distanceKm: 0, side: 'below', overFrom: from, overTo: to };
  }
  const p = s.pts[best.i]!;
  const rel = (bearing(p.lat, p.lon, item.lat, item.lon) - headingAt(route, at) + 360) % 360;
  const side = best.d < 10 ? 'below' : rel < 180 ? 'right' : 'left';
  return { item, lat: item.lat, lon: item.lon, passAt: at, distanceKm: best.d, side };
}

export interface HistoryOptions {
  /** Most history cards per flight — they add to the view, not replace it. */
  max?: number;
  /** Minimum minutes between two of them. */
  gapMin?: number;
}

/** History items this route passes, as POIs in the reader's language. */
export function historyAlong(
  route: RoutePoint[],
  items: HistoryItem[],
  texts: Record<string, HistoryText> | undefined,
  lang: string,
  opts: HistoryOptions = {}
): POI[] {
  if (route.length < 2 || !items.length) return [];
  const s = sampleRoute(route);
  const lats = s.pts.map((p) => p.lat);
  const minLat = Math.min(...lats) - 15;
  const maxLat = Math.max(...lats) + 15;

  const matches: Match[] = [];
  for (const item of items) {
    // A text in the reader's language is what makes an item worth showing.
    if (!texts?.[item.key]) continue;
    if (item.kind === 'route') {
      if (item.path && item.path.every(([, lat]) => lat < minLat || lat > maxLat)) continue;
      const m = matchRoute(item, s);
      if (m) matches.push(m);
    } else {
      if (item.lat == null || item.lat < minLat || item.lat > maxLat) continue;
      const m = matchArea(item, s, route);
      if (m) matches.push(m);
    }
  }

  const max = opts.max ?? 6;
  const gap = (opts.gapMin ?? 12) * 60;
  const kept: Match[] = [];
  for (const m of matches.sort((a, b) => b.item.rank - a.item.rank || a.distanceKm - b.distanceKm)) {
    if (kept.length >= max) break;
    if (kept.some((k) => Math.abs(k.passAt - m.passAt) < gap)) continue;
    kept.push(m);
  }

  return kept
    .sort((a, b) => a.passAt - b.passAt)
    .map((m) => {
      const text = texts![m.item.key]!;
      const translations: NonNullable<POI['translations']> = {};
      for (const [l, name] of Object.entries(m.item.name)) {
        if (name && l !== 'en') translations[l as Lang] = { name, summary: '', facts: [] };
      }
      const base: POI = {
        id: `hist-${m.item.key}`,
        name: m.item.name.en ?? text.name,
        category: 'historic',
        lat: m.lat,
        lon: m.lon,
        rank: m.item.rank,
        extentKm: m.item.kind === 'route' ? undefined : m.item.radius_km,
        summary: '',
        facts: [],
        photos: [],
        closestApproachKm: Math.round(m.distanceKm),
        passAt: m.passAt,
        side: m.side,
        overFrom: m.overFrom,
        overTo: m.overTo,
        textSource: 'editorial',
        translations
      };
      const named = lang === 'en' ? base : { ...base, translations: { ...translations, [lang]: { name: text.name, summary: '', facts: [] } } };
      // A road or a trade route is crossed somewhere along a thousand
      // kilometres; "look for Lake Geneva" is true for one stretch of it only.
      const told = m.item.kind === 'route' ? { ...text, w: undefined } : text;
      return withText(named, lang, told, { era: text.era });
    });
}
