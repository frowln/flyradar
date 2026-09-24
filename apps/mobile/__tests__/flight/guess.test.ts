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
