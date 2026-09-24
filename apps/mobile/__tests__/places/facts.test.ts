import { describe, it, expect, vi } from 'vitest';
import type { OfflinePackage, POI } from '@skyatlas/shared';

vi.mock('../../src/i18n', () => ({ t: (key: string) => key, getLocale: () => 'en' }));
vi.mock('../../src/core/settings', () => ({ settings: { getUnits: () => 'metric' } }));

const { placeFacts } = await import('../../src/core/places/facts');

const place = (over: Partial<POI>): POI =>
  ({ id: 'x', name: 'X', lat: 0, lon: 0, summary: '', facts: [], photos: [], rank: 7, ...over }) as POI;
const pkg = { route: [{ lat: 0, lon: 0, altitude: 11000, elapsedSeconds: 0 }] } as unknown as OfflinePackage;

describe('facts computed for this flight', () => {
  it('says how far away a lake can be recognised', () => {
    expect(placeFacts(place({ category: 'lake', extentKm: 40 }), pkg)).toEqual(['facts.recognise']);
  });

  it('says nothing of the kind for a history item: a heartland is not recognised from afar', () => {
    expect(placeFacts(place({ category: 'historic', extentKm: 60 }), pkg)).toEqual([]);
  });
});
