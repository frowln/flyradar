import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` is hoisted above every other statement, so the spies it closes over
// have to be created by `vi.hoisted` or they do not exist yet when it runs.
const { queryRaw, update } = vi.hoisted(() => ({ queryRaw: vi.fn(), update: vi.fn() }));

vi.mock('../src/db/prisma.js', () => ({
  prisma: { $queryRaw: queryRaw, pOI: { update } }
}));
vi.mock('../src/external/wikipedia.js', () => ({
  fetchWikiSummary: vi.fn(),
  wikiStats: () => ({ throttled: 0, missing: 0 }),
  resetWikiStats: () => {}
}));

import {
  aggregatePOIsForRoute,
  segmentRoute,
  boxesFor,
  chooseForSegment
} from '../src/services/poiAggregator.js';
import { fetchWikiSummary } from '../src/external/wikipedia.js';

const ROUTE_POINT = { altitude: 11000, elapsedSeconds: 0 };

/** A short hop over the Alps: one segment's worth of route. */
const shortRoute = Array.from({ length: 20 }, (_, i) => ({
  ...ROUTE_POINT,
  lat: 45 + i * 0.05,
  lon: 6 + i * 0.05,
  elapsedSeconds: i * 180
}));

/** Singapore to London: long enough to span many segments. */
const longRoute = Array.from({ length: 160 }, (_, i) => ({
  ...ROUTE_POINT,
  lat: 1 + (i * 50) / 160,
  lon: 104 - (i * 104) / 160,
  elapsedSeconds: i * 300
}));

const row = (over: Partial<Record<string, unknown>> & { id: string; name: string }) => ({
  names: {},
  category: 'mountain',
  lat: 45.8,
  lon: 6.8,
  elevation: 4810,
  population: null,
  wikiTitles: {},
  prominence: 100_000,
  content: {},
  ...over
});

const summary = (extract: string, thumbnail?: string) => ({ extract, thumbnail });

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([]);
  update.mockResolvedValue({});
  vi.mocked(fetchWikiSummary).mockResolvedValue(
    summary(
      'Mont Blanc is the highest mountain in the Alps. It reaches 4810 metres above sea level. Many climbers attempt the summit each year.',
      'https://example.com/montblanc.jpg'
    )
  );
});

describe('route geometry', () => {
  it('splits a long route into many segments and a short one into few', () => {
    expect(segmentRoute(longRoute).length).toBeGreaterThan(8);
    expect(segmentRoute(shortRoute).length).toBeLessThanOrEqual(2);
    expect(segmentRoute([]).length).toBe(0);
  });

  it('wraps a corridor box around the segment it covers', () => {
    const [box] = boxesFor(shortRoute);
    expect(box!.south).toBeLessThan(45);
    expect(box!.north).toBeGreaterThan(45.95);
    expect(box!.west).toBeLessThan(6);
    expect(box!.east).toBeGreaterThan(6.95);
  });

  /**
   * A box whose west edge exceeds its east edge selects the planet the long way
   * round. A Tokyo–Los Angeles flight would match every place on Earth.
   */
  it('splits the corridor at the antimeridian instead of wrapping it', () => {
    const pacific = Array.from({ length: 40 }, (_, i) => {
      const lon = 170 + i * 0.5;
      return { ...ROUTE_POINT, lat: 40, lon: lon > 180 ? lon - 360 : lon };
    });
    const boxes = boxesFor(pacific);
    expect(boxes.length).toBe(2);
    for (const b of boxes) {
      expect(b.west, `west ${b.west} must be below east ${b.east}`).toBeLessThan(b.east);
      expect(b.west).toBeGreaterThanOrEqual(-180);
      expect(b.east).toBeLessThanOrEqual(180);
    }
  });
});

describe('choosing what to name', () => {
  /**
   * The table holds 250 000 mountains against 61 000 cities, so prominence
   * order alone would name six summits over the Alps and never the city below.
   */
  it('brings a new category before repeating one', () => {
    const chosen = chooseForSegment([
      row({ id: 'c1', name: 'Big City', category: 'city', prominence: 900_000 }),
      row({ id: 'c2', name: 'Second City', category: 'city', prominence: 800_000 }),
      row({ id: 'c3', name: 'Third City', category: 'city', prominence: 700_000 }),
      row({ id: 'c4', name: 'Fourth City', category: 'city', prominence: 600_000 }),
      row({ id: 'm1', name: 'A Mountain', category: 'mountain', prominence: 200_000 }),
      row({ id: 'l1', name: 'A Lake', category: 'lake', prominence: 100_000 })
    ] as never);

    const categories = new Set(chosen.map((c) => c.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
    // The most prominent place still leads.
    expect(chosen[0]!.name).toBe('Big City');
  });
});

describe('aggregatePOIsForRoute', () => {
  it('builds a card from a stored place and its article', async () => {
    queryRaw.mockResolvedValue([row({ id: 'gn-1', name: 'Mont Blanc' })]);

    const pois = await aggregatePOIsForRoute(shortRoute);

    expect(pois.length).toBeGreaterThan(0);
    expect(pois[0]!.name).toBe('Mont Blanc');
    expect(pois[0]!.category).toBe('mountain');
    expect(pois[0]!.elevation).toBe(4810);
    expect(pois[0]!.photos).toContain('https://example.com/montblanc.jpg');
    expect(pois[0]!.facts.length).toBeGreaterThan(0);
  });

  it('names the place in the language the passenger reads', async () => {
    queryRaw.mockResolvedValue([
      row({ id: 'gn-2', name: 'Ipoh', names: { ru: 'Ипох' }, wikiTitles: { ru: 'Ипох' } })
    ]);

    const pois = await aggregatePOIsForRoute(shortRoute, 200, 'ru');
    expect(pois[0]!.name).toBe('Ипох');
    // The exact article title, not a guess from the name.
    expect(vi.mocked(fetchWikiSummary).mock.calls[0]).toEqual(['Ипох', 'ru']);
  });

  /** The second flight over a place must cost no network at all. */
  it('uses stored text without asking Wikipedia again', async () => {
    queryRaw.mockResolvedValue([
      row({
        id: 'gn-3',
        name: 'Everest',
        content: { en: { summary: 'Already known.', facts: ['A fact.'], photos: [] } }
      })
    ]);

    const pois = await aggregatePOIsForRoute(shortRoute);
    expect(pois[0]!.summary).toBe('Already known.');
    expect(fetchWikiSummary).not.toHaveBeenCalled();
  });

  it('stores text it had to fetch', async () => {
    queryRaw.mockResolvedValue([row({ id: 'gn-4', name: 'Mont Blanc' })]);

    await aggregatePOIsForRoute(shortRoute, 200, 'ru');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gn-4' },
        data: expect.objectContaining({
          content: expect.objectContaining({ ru: expect.objectContaining({ summary: expect.any(String) }) })
        })
      })
    );
  });

  /** A failed write must not cost the passenger the card they are reading. */
  it('still returns the card when the write-back fails', async () => {
    queryRaw.mockResolvedValue([row({ id: 'gn-5', name: 'Mont Blanc' })]);
    update.mockRejectedValue(new Error('database is read-only'));

    const pois = await aggregatePOIsForRoute(shortRoute);
    expect(pois).toHaveLength(1);
  });

  it('drops a place with no article rather than showing a bare name', async () => {
    queryRaw.mockResolvedValue([row({ id: 'gn-6', name: 'Unnamed Peak' })]);
    vi.mocked(fetchWikiSummary).mockResolvedValue(null);

    const pois = await aggregatePOIsForRoute(shortRoute);
    expect(pois).toHaveLength(0);
  });

  it('falls back to the English article when the local one is missing', async () => {
    queryRaw.mockResolvedValue([
      row({ id: 'gn-7', name: 'Mont Blanc', wikiTitles: { en: 'Mont Blanc' } })
    ]);
    vi.mocked(fetchWikiSummary)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(summary('The highest mountain in the Alps, at 4810 metres.'));

    const pois = await aggregatePOIsForRoute(shortRoute, 200, 'ru');
    expect(pois).toHaveLength(1);
    expect(vi.mocked(fetchWikiSummary).mock.calls[1]).toEqual(['Mont Blanc', 'en']);
  });

  it('lists a place found in two overlapping corridors only once', async () => {
    queryRaw.mockResolvedValue([row({ id: 'gn-8', name: 'Lake Geneva', category: 'lake' })]);

    const pois = await aggregatePOIsForRoute(longRoute);
    expect(pois.filter((p) => p.id === 'gn-8')).toHaveLength(1);
  });

  /**
   * The bug this whole rewrite exists for: the previous implementation merged
   * every segment into one list and took the first thirty in route order, so a
   * thirteen-hour flight named thirty places around the departure airport and
   * nothing for the remaining ten hours.
   */
  it('searches the whole route, not just its beginning', async () => {
    await aggregatePOIsForRoute(longRoute);

    // Prisma.sql carries the bound values in order: locale, south, north,
    // west, east, per-category limit.
    const boxes = queryRaw.mock.calls.map((c) => {
      const [, , , west, east] = c[0].values;
      return { west, east };
    });
    expect(boxes.length).toBeGreaterThan(8);
    expect(Math.max(...boxes.map((b) => b.east))).toBeGreaterThan(90);
    expect(Math.min(...boxes.map((b) => b.west))).toBeLessThan(10);
  });

  /**
   * Category-blind ranking is what named twenty-five cities on a route across
   * the Himalaya: over India the top of the table is nothing but cities.
   */
  it('ranks candidates within each category, not across all of them', async () => {
    await aggregatePOIsForRoute(shortRoute);
    const sql = queryRaw.mock.calls[0][0].sql ?? queryRaw.mock.calls[0][0].strings.join('');
    expect(sql).toMatch(/PARTITION BY category/);
    expect(sql).toMatch(/prominence DESC/);
  });

  it('returns nothing for an empty route rather than querying', async () => {
    expect(await aggregatePOIsForRoute([])).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
