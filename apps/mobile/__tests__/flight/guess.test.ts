import { describe, it, expect } from 'vitest';
import { nextGuess } from '../../src/core/flight/guess';
import type { OfflinePackage, POI } from '@skyatlas/shared';

const poi = (id: string, passAt: number, category: POI['category'] = 'mountain', rank = 9): POI => ({
  id, name: id, category, lat: 0, lon: 0, summary: '', facts: [], photos: [], passAt, rank, side: 'left', closestApproachKm: 20
});
const pkg = { pois: [poi('a', 1000), poi('b', 3000), poi('c', 5000), poi('d', 7000)] } as OfflinePackage;

describe('nextGuess', () => {
  it('asks about a notable place a few minutes before it comes abeam', () => {
    const g = nextGuess(pkg, 1000 - 180, {})!;
    expect(g.poi.id).toBe('a');
    expect(g.options).toHaveLength(3);
    expect(g.options[g.correctIdx]!.id).toBe('a');
    expect(g.inS).toBe(180);
  });

  it('does not ask too early, too late, or twice', () => {
    expect(nextGuess(pkg, 1000 - 900, {})).toBeNull();
    expect(nextGuess(pkg, 1000 - 20, {})).toBeNull();
    expect(nextGuess(pkg, 1000 - 180, { a: true })).toBeNull();
  });

  it('keeps its options stable between ticks', () => {
    expect(nextGuess(pkg, 820, {})!.options.map((o) => o.id)).toEqual(nextGuess(pkg, 850, {})!.options.map((o) => o.id));
  });
});

describe('wrong options', () => {
  it('never offers a group the answer belongs to', () => {
    const named = (id: string, name: string, passAt: number): POI => ({ ...poi(id, passAt, 'lake'), name });
    const lakes = {
      pois: [named('erie', 'Lake Erie', 1000), named('great', 'Great Lakes', 4000), named('powell', 'Lake Powell', 7000), named('mead', 'Lake Mead', 9000)]
    } as OfflinePackage;
    const g = nextGuess(lakes, 1000 - 3 * 60, {})!;
    expect(g.poi.id).toBe('erie');
    expect(g.options.map((o) => o.id)).not.toContain('great');
  });
});

describe('the kind named in the question', () => {
  it('names the kind only when every option is of it', () => {
    const mixed = { pois: [poi('sea', 1000, 'sea'), poi('peak', 4000), poi('town', 7000, 'city'), poi('sea2', 9000, 'sea')] } as OfflinePackage;
    // One other sea and no other water: no fair question.
    expect(nextGuess(mixed, 1000 - 180, {})).toBeNull();
    const withLake = { pois: [...mixed.pois, poi('lake', 11000, 'lake')] } as OfflinePackage;
    const kindred = nextGuess(withLake, 1000 - 180, {})!;
    expect(kindred.sameKind).toBe(false);
    expect(kindred.options.map((o) => o.category).sort()).toEqual(['lake', 'sea', 'sea']);
    const seas = { pois: [...mixed.pois, poi('sea3', 11000, 'sea')] } as OfflinePackage;
    const g = nextGuess(seas, 1000 - 180, {})!;
    expect(g.sameKind).toBe(true);
    expect(g.options.every((o) => o.category === 'sea')).toBe(true);
  });
});
