import { describe, it, expect } from 'vitest';
import type { POI } from '@skyatlas/shared';
import { applyStories, historyAlong, type HistoryItem, type StoriesFile } from '../../src/core/places/stories';
import { placeText } from '../../src/core/places/names';
import { buildRoute } from '../../src/core/route/profile';

const poi = (id: string, wikidata?: string): POI => ({
  id,
  name: id,
  category: 'mountain',
  lat: 0,
  lon: 0,
  wikidata,
  summary: '',
  facts: [],
  photos: [],
  translations: { ru: { name: 'Гора', summary: '', facts: [] } }
});

const text = { t: 'A hook', s: 'A story.', w: 'Look left.', f: ['A fact.'], q: { q: 'Q?', a: 'A', x: ['B', 'C'] } };
const file = (lang: string, history: StoriesFile['history'] = {}): StoriesFile => ({ version: 1, lang, places: { Q1: text }, history });

describe('written place texts', () => {
  it('fills the reader-language slot, keyed by Wikidata id', () => {
    const [ru] = applyStories([poi('a', 'Q1')], file('ru'));
    expect(ru!.textSource).toBe('editorial');
    const pt = placeText(ru!, 'ru');
    expect(pt).toMatchObject({ summary: 'A story.', tagline: 'A hook', look: 'Look left.', facts: ['A fact.'] });
    expect(pt.textLang).toBeUndefined();
    expect(pt.quiz?.a).toBe('A');
  });

  it('writes English texts into the base fields', () => {
    const [en] = applyStories([poi('a', 'Q1')], file('en'));
    expect(placeText(en!, 'en')).toMatchObject({ summary: 'A story.', look: 'Look left.' });
    // …and does not offer the English window note to a German reader.
    expect(placeText(en!, 'de').look).toBeUndefined();
  });

  it('leaves places without a text alone', () => {
    const [p] = applyStories([poi('b', 'Q2')], file('en'));
    expect(p!.textSource).toBeUndefined();
  });
});

describe('history along the route', () => {
  // Moscow → Antalya, a great circle over the steppe, the Black Sea and Anatolia.
  const route = buildRoute({ from: { lat: 55.97, lon: 37.41 }, to: { lat: 36.9, lon: 30.8 } }).route;
  const texts = {
    road: { name: 'Old road', t: 't', s: 's', f: ['f'] },
    city: { name: 'Old city', t: 't', s: 's', f: ['f'], era: 'Antiquity' },
    land: { name: 'Old land', t: 't', s: 's', f: ['f'] },
    far: { name: 'Far away', t: 't', s: 's', f: ['f'] }
  };
  const items: HistoryItem[] = [
    // An east–west road across the route near 45°N.
    { key: 'road', kind: 'route', rank: 8, name: { en: 'Old road', ru: 'Старая дорога' }, path: [[25, 45.2], [45, 45.2]] },
    // A site ~40 km east of the track around 50°N.
    { key: 'city', kind: 'site', rank: 7, name: { en: 'Old city' }, lat: 50, lon: 35.9, radius_km: 80 },
    { key: 'land', kind: 'region', rank: 6, name: { en: 'Old land' }, lat: 40, lon: 33, radius_km: 300 },
    { key: 'far', kind: 'site', rank: 10, name: { en: 'Far away' }, lat: -30, lon: 150, radius_km: 50 }
  ];

  it('finds a crossing, a site to one side and a region below', () => {
    const hist = historyAlong(route, items, texts, 'en', { gapMin: 0 });
    const byId = Object.fromEntries(hist.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(['hist-city', 'hist-land', 'hist-road']);
    expect(byId['hist-road']!.side).toBe('below');
    expect(byId['hist-road']!.overTo! - byId['hist-road']!.overFrom!).toBeGreaterThanOrEqual(300);
    expect(['left', 'right']).toContain(byId['hist-city']!.side);
    expect(byId['hist-land']!.side).toBe('below');
    expect(byId['hist-city']!.category).toBe('historic');
    expect(placeText(byId['hist-city']!, 'en').era).toBe('Antiquity');
    // Ordered along the flight.
    const at = hist.map((p) => p.passAt!);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('shows nothing without a text in the reader language', () => {
    expect(historyAlong(route, items, {}, 'de')).toEqual([]);
  });

  it('keeps history cards apart and few', () => {
    const hist = historyAlong(route, items, texts, 'en', { max: 1 });
    expect(hist).toHaveLength(1);
    expect(hist[0]!.id).toBe('hist-road');
  });

  it('names a history card in the reader language', () => {
    const hist = historyAlong(route, items, { road: { ...texts.road, name: 'Старая дорога' } }, 'ru', { gapMin: 0 });
    expect(hist[0]!.translations?.ru?.name).toBe('Старая дорога');
  });
});
