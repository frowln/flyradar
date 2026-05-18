import { describe, it, expect } from 'vitest';
import { evaluateAchievements, ACHIEVEMENTS, type LifetimeStats } from '../../src/core/gamification/achievements';

const baseStats: LifetimeStats = {
  totalFlights: 0,
  countriesFlownOver: [],
  poisDiscovered: 0,
  longestFlightHours: 0,
  totalDistanceKm: 0,
  nightFlights: 0,
  continentsVisited: []
};

describe('evaluateAchievements', () => {
  it('awards first_flight on first flight', () => {
    const earned = evaluateAchievements({ ...baseStats, totalFlights: 1 }, []);
    expect(earned).toContain('first_flight');
  });

  it('awards air_wolf at 10 flights', () => {
    const earned = evaluateAchievements({ ...baseStats, totalFlights: 10 }, []);
    expect(earned).toContain('air_wolf');
  });

  it('awards marathoner for flight over 12h', () => {
    const earned = evaluateAchievements({ ...baseStats, longestFlightHours: 13 }, []);
    expect(earned).toContain('marathoner');
  });

  it('awards explorer at 50 POIs', () => {
    const earned = evaluateAchievements({ ...baseStats, poisDiscovered: 50 }, []);
    expect(earned).toContain('explorer');
  });

  it('does not re-award already earned achievements', () => {
    const earned = evaluateAchievements(
      { ...baseStats, totalFlights: 1 },
      ['first_flight']
    );
    expect(earned).not.toContain('first_flight');
  });

  it('returns empty array when nothing qualifies', () => {
    const earned = evaluateAchievements(baseStats, []);
    expect(earned).toHaveLength(0);
  });

  it('awards multiple achievements at once', () => {
    const earned = evaluateAchievements(
      { ...baseStats, totalFlights: 10, poisDiscovered: 50 },
      []
    );
    expect(earned).toContain('air_wolf');
    expect(earned).toContain('explorer');
  });

  it('ACHIEVEMENTS list has at least 10 entries', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
  });
});
