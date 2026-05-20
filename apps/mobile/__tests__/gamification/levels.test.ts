import { describe, it, expect } from 'vitest';
import { calculateXP, levelFromXP, rankFromLevel, xpForLevel } from '../../src/core/gamification/levels';

describe('calculateXP', () => {
  it('zero stats give zero XP', () => {
    expect(calculateXP({ flightsCompleted: 0, poisDiscovered: 0, achievementsEarned: 0, countriesVisited: 0, distanceKm: 0 })).toBe(0);
  });
  it('1 flight + 5 POIs + 1 achievement + 1 country + 1000 km = 100 + 50 + 50 + 25 + 10 = 235', () => {
    expect(calculateXP({ flightsCompleted: 1, poisDiscovered: 5, achievementsEarned: 1, countriesVisited: 1, distanceKm: 1000 })).toBe(235);
  });
});

describe('levelFromXP', () => {
  it('0 XP is level 1', () => {
    expect(levelFromXP(0).level).toBe(1);
  });
  it('xp curve scales progressively', () => {
    const r = levelFromXP(1000);
    expect(r.level).toBeGreaterThan(1);
    expect(r.level).toBeLessThan(10);
  });
});

describe('rankFromLevel', () => {
  it('level 1 is newcomer', () => {
    expect(rankFromLevel(1).id).toBe('newcomer');
  });
  it('level 25 is explorer', () => {
    expect(rankFromLevel(25).id).toBe('explorer');
  });
  it('level 80 is legend', () => {
    expect(rankFromLevel(80).id).toBe('legend');
  });
});
