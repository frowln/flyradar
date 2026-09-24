import { describe, it, expect } from 'vitest';
import { sightingsAlong, selectSightings, toPOI } from '../../src/core/places/corridor';
import { buildRoute } from '../../src/core/route/profile';
import type { DataPlace } from '../../src/core/data/types';

// A northbound flight along the 20°E meridian, 0°N → 10°N.
const route = buildRoute({ from: { lat: 0, lon: 20 }, to: { lat: 10, lon: 20 } }).route;

const place = (over: Partial<DataPlace> & Pick<DataPlace, 'id' | 'k' | 'lat' | 'lon'>): DataPlace => ({
  n: over.id,
  r: 7,
  ...over
});

describe('sightingsAlong', () => {
  it('puts a peak east of a northbound track on the right, with its passing time', () => {
    const peak = place({ id: 'peak', k: 'mountain', lat: 5, lon: 20.9, el: 4200 }); // ~100 km east
    const [s] = sightingsAlong(route, [peak], {});
    expect(s).toBeDefined();
    expect(s!.side).toBe('right');
    expect(s!.distanceKm).toBeGreaterThan(90);
    expect(s!.distanceKm).toBeLessThan(110);
    const total = route[route.length - 1]!.elapsedSeconds;
    expect(s!.passAt / total).toBeGreaterThan(0.4);
    expect(s!.passAt / total).toBeLessThan(0.6);
    expect(s!.visibleFrom).toBeLessThan(s!.passAt);
    expect(s!.visibleTo).toBeGreaterThan(s!.passAt);
  });

  it('puts a city west of the track on the left and one on the track below', () => {
    const west = place({ id: 'west', k: 'city', lat: 3, lon: 19.6, pop: 2_000_000 });
    const under = place({ id: 'under', k: 'city', lat: 7, lon: 20.02, pop: 500_000 });
    const byId = Object.fromEntries(sightingsAlong(route, [west, under], {}).map((s) => [s.place.id, s]));
    expect(byId['west']!.side).toBe('left');
    expect(byId['under']!.side).toBe('below');
  });

  it('drops a small hill too far away to recognise', () => {
    const far = place({ id: 'far', k: 'mountain', lat: 5, lon: 22, el: 900 }); // ~220 km
    expect(sightingsAlong(route, [far], {})).toHaveLength(0);
  });

  it('marks a desert as below when the route crosses its outline', () => {
    const desert = place({
      id: 'desert',
      k: 'desert',
      lat: 4,
      lon: 21,
      ext: 250,
      bb: [18, 3, 24, 5]
    });
    const outline = { desert: [[[[18, 3], [24, 3], [24, 5], [18, 5]] as [number, number][]]] };
    const [s] = sightingsAlong(route, [desert], outline);
    expect(s!.side).toBe('below');
    expect(s!.distanceKm).toBe(0);
  });
});

describe('selectSightings', () => {
  it('spreads places across the flight instead of bunching them', () => {
    const many: DataPlace[] = [];
    // 40 cities crammed into the first degree, 3 later on.
    for (let i = 0; i < 40; i++) many.push(place({ id: `c${i}`, k: 'city', lat: 0.3 + i * 0.02, lon: 20.2, r: 8, pop: 1e6 }));
    many.push(place({ id: 'late1', k: 'lake', lat: 6, lon: 20.3, r: 5 }));
    many.push(place({ id: 'late2', k: 'mountain', lat: 8, lon: 19.6, r: 5, el: 3500 }));
    many.push(place({ id: 'late3', k: 'city', lat: 9.5, lon: 20.2, r: 5, pop: 300_000 }));
    const all = sightingsAlong(route, many, {});
    const chosen = selectSightings(all, route[route.length - 1]!.elapsedSeconds, { max: 12 });
    const ids = chosen.map((s) => s.place.id);
    expect(ids).toContain('late1');
    expect(ids).toContain('late2');
    expect(ids).toContain('late3');
    expect(chosen.length).toBeLessThanOrEqual(12);
    // Sorted by time.
    for (let i = 1; i < chosen.length; i++) expect(chosen[i]!.passAt).toBeGreaterThanOrEqual(chosen[i - 1]!.passAt);
  });

  it('always keeps pinned places', () => {
    const a = place({ id: 'origin', k: 'city', lat: 0.1, lon: 20.1, r: 2, pop: 150_000 });
    const b = place({ id: 'star', k: 'mountain', lat: 5, lon: 20.5, r: 10, el: 5000 });
    const all = sightingsAlong(route, [a, b], {});
    const chosen = selectSightings(all, 3600, { max: 1, pinned: ['origin'] });
    expect(chosen.map((s) => s.place.id)).toContain('origin');
  });

  it('turns a sighting into a card with its geometry', () => {
    const peak = place({ id: 'peak', k: 'volcano', lat: 5, lon: 20.9, el: 4200, wd: 'Q1', l: { ru: 'Пик' } });
    const poi = toPOI(sightingsAlong(route, [peak], {})[0]!);
    expect(poi.category).toBe('volcano');
    expect(poi.side).toBe('right');
    expect(poi.wikidata).toBe('Q1');
    expect(poi.translations?.ru?.name).toBe('Пик');
    expect(poi.textSource).toBe('generated');
  });
});
