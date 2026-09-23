import type { POI, RoutePoint, POICategory } from '@skyatlas/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { fetchWikiSummary, wikiStats, resetWikiStats } from '../external/wikipedia.js';

/**
 * Picks the places a flight passes over.
 *
 * Discovery is a query against our own table, not a call to a geo API. The
 * previous versions asked GeoNames, then Overpass, then Wikipedia's geosearch
 * at request time, and every one of them refused often enough to matter:
 * `statement timeout`, "the server is probably too busy", 429 on nine probes in
 * ten. A thirteen-hour flight came back with a dozen places, most of them from
 * a hardcoded list of world landmarks that existed only to paper over those
 * failures. `scripts/load-places.mjs` loads 386 000 places once; this file reads
 * them in milliseconds.
 *
 * The network is still used for prose — but only for the handful of places a
 * route actually names, and each answer is kept on the row afterwards.
 */

/** Half-width of the corridor, in degrees of latitude (~245 km). */
const CORRIDOR_DEG = 2.2;
/** One corridor box per this much route. */
const SEGMENT_KM = 500;
/** Ranked candidates pulled per category, so every category can compete. */
const PER_CATEGORY_CANDIDATES = 12;
/** Places named per segment — this is what covers the whole route. */
const PER_SEGMENT = 6;
/** Distinct categories to fill before prominence alone decides. */
const SEGMENT_VARIETY = 3;
const MAX_TOTAL = 90;
/** Wikipedia summaries fetched at once. Only the chosen places need one. */
const PROSE_CONCURRENCY = 4;

const DEG = Math.PI / 180;

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface Candidate {
  id: string;
  name: string;
  names: Record<string, string>;
  category: POICategory;
  lat: number;
  lon: number;
  elevation: number | null;
  population: number | null;
  wikiTitles: Record<string, string>;
  prominence: number;
  content: Record<string, CardText>;
}

interface CardText {
  summary: string;
  facts: string[];
  photos: string[];
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dφ = (lat2 - lat1) * DEG;
  const dλ = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dλ / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function extractFacts(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 20)
    .slice(0, 3);
}

/** Splits the route into roughly equal-length runs of points. */
export function segmentRoute(route: RoutePoint[]): RoutePoint[][] {
  if (route.length < 2) return route.length ? [route] : [];
  const segments: RoutePoint[][] = [];
  let current: RoutePoint[] = [route[0]!];
  let run = 0;
  for (let i = 1; i < route.length; i++) {
    const prev = route[i - 1]!;
    const point = route[i]!;
    run += distKm(prev.lat, prev.lon, point.lat, point.lon);
    current.push(point);
    if (run >= SEGMENT_KM) {
      segments.push(current);
      current = [point];
      run = 0;
    }
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

/**
 * Boxes covering a segment's corridor.
 *
 * Usually one. A segment straddling the antimeridian returns two, because a box
 * whose west edge exceeds its east edge covers the planet the long way round —
 * a Tokyo–Los Angeles flight would otherwise select every place on Earth.
 */
export function boxesFor(segment: RoutePoint[]): BBox[] {
  const lats = segment.map((p) => p.lat);
  const south = Math.max(-89, Math.min(...lats) - CORRIDOR_DEG);
  const north = Math.min(89, Math.max(...lats) + CORRIDOR_DEG);

  // A degree of longitude is short near the poles, so the margin widens there.
  const midLat = (south + north) / 2;
  const lonPad = Math.min(20, CORRIDOR_DEG / Math.max(0.2, Math.cos(midLat * DEG)));

  const lons = segment.map((p) => p.lon);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  if (maxLon - minLon > 180) {
    const eastSide = lons.filter((l) => l > 0);
    const westSide = lons.filter((l) => l <= 0);
    return [
      { south, north, west: Math.min(...eastSide) - lonPad, east: 180 },
      { south, north, west: -180, east: Math.max(...westSide) + lonPad }
    ];
  }
  return [
    { south, north, west: Math.max(-180, minLon - lonPad), east: Math.min(180, maxLon + lonPad) }
  ];
}

/**
 * The most promising places in one box, taken per category.
 *
 * A flat "top 150 by prominence" is category-blind, and over India every one of
 * those 150 is a city — so the variety rule below had nothing but cities to
 * choose from and named twenty-five of them across a route that crosses the
 * Himalaya. Partitioning by category guarantees the mountains are in the running
 * even where the cities outrank them.
 *
 * Rows carrying a Wikipedia title sort first: the article is what turns a name
 * into a card, and a place without one is dropped later anyway.
 */
async function candidatesInBox(box: BBox, locale: string): Promise<Candidate[]> {
  const rows = await prisma.$queryRaw<Array<Record<string, never>>>(Prisma.sql`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY category
        ORDER BY ("wikiTitles" ? ${locale}) DESC,
                 ("wikiTitles" ? 'en') DESC,
                 prominence DESC
      ) AS rn
      FROM "POI"
      WHERE lat BETWEEN ${box.south} AND ${box.north}
        AND lon BETWEEN ${box.west} AND ${box.east}
        -- A readable article is a requirement, not a preference. The dataset
        -- admits anything linked to any Wikipedia, but only six languages are
        -- kept, so a town written up solely in Indonesian survives the load and
        -- then has nothing to show: 61 of 93 chosen places were discarded at the
        -- last step for exactly this. Filtering here means the segment spends
        -- its six slots on places that can actually become cards.
        AND ("wikiTitles" ? ${locale} OR "wikiTitles" ? 'en' OR content ? ${locale})
    ) ranked
    WHERE rn <= ${PER_CATEGORY_CANDIDATES}
  `);
  return (rows as unknown as Array<{
    id: string;
    name: string;
    names: unknown;
    category: string;
    lat: number;
    lon: number;
    elevation: number | null;
    population: number | null;
    wikiTitles: unknown;
    prominence: number;
    content: unknown;
  }>).map((r) => ({
    id: r.id,
    name: r.name,
    names: (r.names ?? {}) as Record<string, string>,
    category: r.category as POICategory,
    lat: r.lat,
    lon: r.lon,
    elevation: r.elevation,
    population: r.population,
    wikiTitles: (r.wikiTitles ?? {}) as Record<string, string>,
    prominence: r.prominence,
    content: (r.content ?? {}) as unknown as Record<string, CardText>
  }));
}

/**
 * How well a place will read to this passenger, as a sortable rank.
 *
 * 2 — written up in their language; the card is theirs end to end.
 * 1 — an English article only; a Russian reader gets a Russian interface around
 *     English prose, which is worth having but worth ranking below.
 * 0 — nothing to show, and dropped downstream.
 */
function readability(place: Candidate, locale: string): number {
  if (place.content[locale]?.summary || place.wikiTitles[locale]) return 2;
  if (place.wikiTitles['en']) return 1;
  return 0;
}

/**
 * Picks what to name inside one segment.
 *
 * Two things decide, in this order.
 *
 * **An article beats prominence.** A place without one is dropped downstream, so
 * naming the tallest unwritten-about peak instead of the town below it costs the
 * segment its only card. The database query already sorts this way; re-sorting
 * here on prominence alone threw that away and left long stretches of route
 * empty.
 *
 * **Rarity beats prominence too, for the first few picks.** Choosing the three
 * most prominent categories in each segment picks the same three every time —
 * cities, seas and mountains outrank lakes and castles everywhere — so a
 * thirteen-hour flight named twenty-four cities and nothing else. Preferring
 * whatever the route has named least turns the atlas varied along its length
 * rather than within one segment.
 */
export function chooseForSegment(
  found: Candidate[],
  seenByCategory: Map<POICategory, number> = new Map(),
  locale = 'en'
): Candidate[] {
  const ranked = [...found].sort((a, b) => {
    const readable = readability(b, locale) - readability(a, locale);
    return readable !== 0 ? readable : b.prominence - a.prominence;
  });

  const best = new Map<POICategory, Candidate>();
  for (const place of ranked) if (!best.has(place.category)) best.set(place.category, place);

  const rarestFirst = [...best.entries()].sort((a, b) => {
    const seen = (seenByCategory.get(a[0]) ?? 0) - (seenByCategory.get(b[0]) ?? 0);
    return seen !== 0 ? seen : b[1].prominence - a[1].prominence;
  });

  const chosen: Candidate[] = [];
  for (const [, place] of rarestFirst.slice(0, SEGMENT_VARIETY)) chosen.push(place);
  for (const place of ranked) {
    if (chosen.length >= PER_SEGMENT) break;
    if (chosen.includes(place)) continue;
    chosen.push(place);
  }
  return chosen;
}

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    })
  );
  return results;
}

/**
 * The card text for one place, in one language.
 *
 * Read from the row when it is already there — the second flight over a place
 * costs no network at all. Otherwise fetched by the exact article title the
 * dataset carries, which resolves first try; guessing from the place name
 * silently loses everything filed under a different heading.
 */
async function cardTextFor(place: Candidate, locale: string): Promise<CardText | null> {
  const cached = place.content[locale];
  if (cached?.summary) return cached;

  const title = place.wikiTitles[locale] ?? place.names[locale] ?? place.name;
  let wiki = await fetchWikiSummary(title, locale);
  if (!wiki?.extract && locale !== 'en') {
    const english = place.wikiTitles['en'] ?? place.name;
    wiki = await fetchWikiSummary(english, 'en');
  }
  if (!wiki?.extract) return null;

  const text: CardText = {
    summary: wiki.extract.slice(0, 800),
    facts: extractFacts(wiki.extract),
    photos: wiki.thumbnail ? [wiki.thumbnail] : []
  };

  // Kept on the row so the next route through here needs no network. A failure
  // to write must not cost the passenger the card they are already reading.
  try {
    await prisma.pOI.update({
      where: { id: place.id },
      data: { content: { ...place.content, [locale]: text } as unknown as Prisma.InputJsonValue }
    });
  } catch (e) {
    console.warn(`Could not cache text for ${place.id}:`, e instanceof Error ? e.message : e);
  }
  return text;
}

export async function aggregatePOIsForRoute(
  route: RoutePoint[],
  _radiusKm = 200,
  locale = 'en'
): Promise<POI[]> {
  const segments = segmentRoute(route);
  if (segments.length === 0) return [];

  // One query per corridor box, so places are found along the whole flight
  // rather than clustered at the departure airport.
  const found = await Promise.all(
    segments.map(async (segment) =>
      (await Promise.all(boxesFor(segment).map((b) => candidatesInBox(b, locale)))).flat()
    )
  );

  // Choosing runs in route order and remembers what has already been named, so
  // the variety rule can favour categories this flight has not shown yet.
  // Neighbouring corridors overlap, so a place near a boundary is found twice.
  const seenByCategory = new Map<POICategory, number>();
  const seen = new Set<string>();
  const picked: Candidate[] = [];
  for (const candidates of found) {
    for (const place of chooseForSegment(candidates, seenByCategory, locale)) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      seenByCategory.set(place.category, (seenByCategory.get(place.category) ?? 0) + 1);
      picked.push(place);
      if (picked.length >= MAX_TOTAL) break;
    }
  }

  resetWikiStats();
  const texts = await mapWithLimit(picked, PROSE_CONCURRENCY, (place) =>
    cardTextFor(place, locale)
  );

  const pois: POI[] = [];
  let withoutProse = 0;
  for (let i = 0; i < picked.length; i++) {
    const place = picked[i]!;
    const text = texts[i];
    // A card with a name and no prose is a dead end; leave it out rather than
    // show an empty screen.
    if (!text) {
      withoutProse++;
      continue;
    }
    pois.push({
      id: place.id,
      name: place.names[locale] ?? place.name,
      category: place.category,
      lat: place.lat,
      lon: place.lon,
      elevation: place.elevation ?? undefined,
      population: place.population ?? undefined,
      wikiTitle: place.wikiTitles[locale] ?? place.wikiTitles['en'],
      summary: text.summary,
      facts: text.facts,
      photos: text.photos
    });
  }
  // Places chosen and then lost for want of an article are the difference
  // between a full route and a thin one — worth seeing in the log rather than
  // inferring from a short list of cards.
  const wiki = wikiStats();
  console.info(
    `[places] ${segments.length} segments → ${picked.length} chosen → ${pois.length} cards` +
      (withoutProse ? ` · ${withoutProse} without prose` : '') +
      (wiki.throttled ? ` · ${wiki.throttled} throttled` : '') +
      (wiki.missing ? ` · ${wiki.missing} refused` : '')
  );
  return pois;
}
