import { describe, it, expect, vi } from 'vitest';
import type { Moment, OfflinePackage, POI } from '@skyatlas/shared';

let locale = 'en';
vi.mock('../../src/i18n', () => ({
  getLocale: () => locale,
  t: (key: string, p?: Record<string, unknown>) => (p ? `${key} ${JSON.stringify(p)}` : key)
}));
vi.mock('../../src/core/settings', () => ({ settings: { getAlerts: () => 'key', getUnits: () => 'metric' } }));

const { alertFor } = await import('../../src/core/flight/alerts');

const place = (over: Partial<POI> = {}): POI => ({
  id: 'fuji',
  name: 'Mount Fuji',
  category: 'mountain',
  lat: 35.36,
  lon: 138.73,
  summary: '',
  facts: [],
  photos: [],
  passAt: 1800,
  side: 'left',
  closestApproachKm: 60,
  ...over
});
const pkg = (poi: POI) =>
  ({ version: 2, flight: { id: 'F1' }, route: [], pois: [poi], locale: 'en', generatedAt: '' }) as unknown as OfflinePackage;
const sight = (side: Moment['side']): Moment => ({ id: 'm1', kind: 'sight', at: 1800, poiId: 'fuji', side }) as Moment;
const takeoff = new Date('2026-09-24T08:00:00Z');

describe('what a notification says about a place', () => {
  it('says what to look for, when that has been written', () => {
    const a = alertFor(sight('left'), pkg(place({ look: 'A lone white cone above the clouds', tagline: 'The mountain on the banknote' })), takeoff)!;
    expect(a.body).toContain('alert.sightBodyWith');
    expect(a.body).toContain('A lone white cone above the clouds.');
  });

  it('falls back to the one-line hook, then to the plain line', () => {
    expect(alertFor(sight('left'), pkg(place({ tagline: 'The mountain on the banknote' })), takeoff)!.body).toContain(
      'The mountain on the banknote.'
    );
    expect(alertFor(sight('left'), pkg(place()), takeoff)!.body).toMatch(/^alert\.sightBody /);
  });

  it('uses the text in the reader’s language, and no English one for another language', () => {
    locale = 'ru';
    const translated = place({
      look: 'A lone white cone',
      translations: { ru: { name: 'Фудзи', summary: 'Священная гора Японии.', facts: [], look: 'Одинокий белый конус над облаками' } }
    });
    expect(alertFor(sight('below'), pkg(translated), takeoff)!.body).toBe('Одинокий белый конус над облаками.');
    expect(alertFor(sight('below'), pkg(place({ look: 'A lone white cone' })), takeoff)!.body).toBe('alert.belowBody');
    locale = 'en';
  });
});
