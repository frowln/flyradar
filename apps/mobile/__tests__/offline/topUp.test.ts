import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OfflinePackage, POI } from '@skyatlas/shared';

const saved: OfflinePackage[] = [];
let online = true;
let noArticle = new Set<string>();

vi.mock('../../src/core/places/wiki', () => ({
  enrichWithWikipedia: async (pois: POI[], locale: string) =>
    pois.map((p) => (online && !noArticle.has(p.id) ? { ...p, summary: `${p.id} in ${locale}`, textSource: 'wikipedia' } : p))
}));
vi.mock('../../src/core/offline/packageStore', () => ({
  savePackage: async (p: OfflinePackage) => void saved.push(p),
  listPackages: async () => []
}));
vi.mock('../../src/core/offline/photoCache', () => ({ cachePhotos: async (_id: string, pois: POI[]) => pois }));
vi.mock('../../src/core/map/offlineMap', () => ({ hasCorridor: async () => true, downloadCorridor: async () => {} }));
vi.mock('../../src/core/flight/session', () => ({ useSession: { getState: () => ({ flightId: null, landedAt: null }) } }));

const { topUpFlight } = await import('../../src/core/offline/topUp');

const poi = (id: string, told = false): POI =>
  ({
    id,
    name: id,
    category: 'mountain',
    lat: 0,
    lon: 0,
    summary: '',
    facts: [],
    photos: [],
    wikidata: 'Q1',
    ...(told ? { textSource: 'wikipedia' } : {})
  }) as POI;

const pkg = (pois: POI[], locale = 'ru'): OfflinePackage =>
  ({ version: 2, flight: { id: 'F1' }, route: [], pois, locale, generatedAt: '' }) as unknown as OfflinePackage;

describe('topping up a flight added without a connection', () => {
  beforeEach(() => {
    saved.length = 0;
    online = true;
    noArticle = new Set();
  });

  it('fetches only the stories that are missing', async () => {
    const out = await topUpFlight(pkg([poi('a', true), poi('b')]), 'ru');
    expect(out.pois.find((p) => p.id === 'b')!.summary).toBe('b in ru');
    expect(out.pois.find((p) => p.id === 'a')!.summary).toBe('');
    expect(saved).toHaveLength(1);
  });

  it('changes nothing while offline, so the next launch tries again', async () => {
    online = false;
    const before = pkg([poi('a'), poi('b')]);
    expect(await topUpFlight(before, 'ru')).toBe(before);
    expect(saved).toHaveLength(0);
  });

  it('remembers places that have no article and does not ask again', async () => {
    noArticle = new Set(['b']);
    const once = await topUpFlight(pkg([poi('a'), poi('b')]), 'ru');
    expect(once.storyless).toEqual(['b']);
    saved.length = 0;
    const twice = await topUpFlight(once, 'ru');
    expect(twice).toBe(once);
    expect(saved).toHaveLength(0);
  });

  it('refetches everything in the new language after a language change', async () => {
    const out = await topUpFlight(pkg([poi('a', true), poi('b', true)], 'en'), 'de');
    expect(out.locale).toBe('de');
    expect(out.pois.map((p) => p.summary)).toEqual(['a in de', 'b in de']);
  });
});
