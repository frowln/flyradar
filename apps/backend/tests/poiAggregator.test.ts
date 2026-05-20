import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external modules BEFORE importing the service
vi.mock('../src/external/geonames.js', () => ({
  searchAround: vi.fn()
}));
vi.mock('../src/external/wikipedia.js', () => ({
  fetchWikiSummary: vi.fn()
}));

import { aggregatePOIsForRoute } from '../src/services/poiAggregator.js';
import { searchAround } from '../src/external/geonames.js';
import { fetchWikiSummary } from '../src/external/wikipedia.js';

const mockRoute = Array.from({ length: 20 }, (_, i) => ({
  lat: 45 + i * 0.5,
  lon: 6 + i * 0.1,
  altitude: 11000,
  elapsedSeconds: i * 180
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env['GEONAMES_USER'] = 'test_user';
});

describe('aggregatePOIsForRoute', () => {
  it('returns POIs for found GeoNames entries with Wikipedia data', async () => {
    vi.mocked(searchAround).mockResolvedValue([{
      geonameId: 123,
      name: 'Mont Blanc',
      lat: '45.83',
      lng: '6.86',
      fcl: 'T',
      fcode: 'MT',
      elevation: 4810
    }]);
    vi.mocked(fetchWikiSummary).mockResolvedValue({
      extract: 'Mont Blanc is the highest mountain in the Alps. It reaches 4810 meters above sea level. Many climbers attempt the summit each year.',
      thumbnail: 'https://example.com/montblanc.jpg'
    });

    const pois = await aggregatePOIsForRoute(mockRoute);

    expect(pois.length).toBeGreaterThan(0);
    expect(pois[0].name).toBe('Mont Blanc');
    expect(pois[0].category).toBe('mountain');
    expect(pois[0].elevation).toBe(4810);
    expect(pois[0].photos).toContain('https://example.com/montblanc.jpg');
    expect(pois[0].facts.length).toBeGreaterThan(0);
  });

  it('deduplicates POIs with the same geonameId', async () => {
    vi.mocked(searchAround).mockResolvedValue([{
      geonameId: 42,
      name: 'Lake Geneva',
      lat: '46.45',
      lng: '6.56',
      fcl: 'H',
      fcode: 'LK'
    }]);
    vi.mocked(fetchWikiSummary).mockResolvedValue({
      extract: 'Lake Geneva is a large lake on the north side of the Alps. It borders Switzerland and France.'
    });

    const pois = await aggregatePOIsForRoute(mockRoute);
    const lakePois = pois.filter(p => p.id === 'gn-42');
    expect(lakePois).toHaveLength(1);
  });

  it('skips entries with no Wikipedia summary', async () => {
    vi.mocked(searchAround).mockResolvedValue([{
      geonameId: 99,
      name: 'Unknown Peak',
      lat: '46.0',
      lng: '7.0',
      fcl: 'T',
      fcode: 'MT'
    }]);
    vi.mocked(fetchWikiSummary).mockResolvedValue(null);

    const pois = await aggregatePOIsForRoute(mockRoute);
    expect(pois).toHaveLength(0);
  });

  it('skips entries with unknown feature codes', async () => {
    vi.mocked(searchAround).mockResolvedValue([{
      geonameId: 77,
      name: 'Some Airport',
      lat: '46.0',
      lng: '7.0',
      fcl: 'S',
      fcode: 'AIRP'  // not in CATEGORY_MAP
    }]);
    vi.mocked(fetchWikiSummary).mockResolvedValue({
      extract: 'An airport with a long history.'
    });

    const pois = await aggregatePOIsForRoute(mockRoute);
    expect(pois).toHaveLength(0);
  });

  it('returns empty array when GeoNames returns nothing', async () => {
    vi.mocked(searchAround).mockResolvedValue([]);
    const pois = await aggregatePOIsForRoute(mockRoute);
    expect(pois).toHaveLength(0);
  });
});
