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

let apiEnabled = false;
const fetchClouds = vi.fn(async (points: Array<{ at: string }>) =>
  points.map((p) => ({ at: p.at, cloud: 90, low: 85 }))
);
vi.mock('../../src/core/api/client', () => ({
  get API_ENABLED() {
    return apiEnabled;
  }
}));
vi.mock('../../src/core/api/flights', () => ({ fetchClouds: (points: Array<{ at: string }>) => fetchClouds(points) }));

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

describe('refreshing the cloud forecast', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const flight = (departsInH: number, extra: Partial<OfflinePackage> = {}): OfflinePackage =>
    ({
      version: 2,
      flight: { id: 'F2', scheduledDeparture: new Date(now.getTime() + departsInH * 3600_000).toISOString() },
      route: [
        { lat: 55.97, lon: 37.41, altitude: 0, elapsedSeconds: 0 },
        { lat: 59.8, lon: 30.26, altitude: 0, elapsedSeconds: 3600 }
      ],
      pois: [],
      locale: 'ru',
      generatedAt: '',
      ...extra
    }) as unknown as OfflinePackage;

  beforeEach(() => {
    saved.length = 0;
    online = true;
    apiEnabled = true;
    fetchClouds.mockClear();
  });

  it('fetches a new forecast for a flight within three days', async () => {
    const out = await topUpFlight(flight(30), 'ru', now);
    expect(fetchClouds).toHaveBeenCalledTimes(1);
    // One point every 15 minutes, landing included.
    expect(fetchClouds.mock.calls[0]![0]).toHaveLength(5);
    expect(out.clouds).toEqual([0, 900, 1800, 2700, 3600].map((at) => ({ at, cloud: 90, low: 85 })));
    expect(out.cloudsAt).toBe(now.toISOString());
    expect(saved).toHaveLength(1);
  });

  it('leaves flights further ahead, flights already gone, and fresh forecasts alone', async () => {
    await topUpFlight(flight(4 * 24), 'ru', now);
    await topUpFlight(flight(-2), 'ru', now);
    await topUpFlight(flight(30, { cloudsAt: new Date(now.getTime() - 3600_000).toISOString() }), 'ru', now);
    expect(fetchClouds).not.toHaveBeenCalled();
  });

  it('asks nothing without a server', async () => {
    apiEnabled = false;
    const before = flight(30);
    expect(await topUpFlight(before, 'ru', now)).toBe(before);
    expect(fetchClouds).not.toHaveBeenCalled();
  });

  it('keeps the old forecast when the new one cannot be had', async () => {
    fetchClouds.mockResolvedValueOnce(null as never);
    const old = [{ at: 0, cloud: 10, low: 5 }];
    const before = flight(30, { clouds: old, cloudsAt: '2026-09-23T00:00:00Z' });
    expect((await topUpFlight(before, 'ru', now)).clouds).toBe(old);
  });

  it('keeps a new forecast even when the stories cannot be fetched', async () => {
    online = false;
    const out = await topUpFlight(flight(30, { pois: [poi('a')] }), 'ru', now);
    expect(out.clouds).toHaveLength(5);
  });
});
