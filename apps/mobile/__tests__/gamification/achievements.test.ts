import { describe, it, expect } from 'vitest';
import { evaluateAchievements, ACHIEVEMENTS, type LifetimeStats } from '../../src/core/gamification/achievements';

const baseStats: LifetimeStats = {
  totalFlights: 0,
  countriesFlownOver: [],
  poisDiscovered: 0,
  longestFlightHours: 0,
  totalDistanceKm: 0,
  nightFlights: 0,
  continentsVisited: [],
  equatorCrossings: 0,
  datelineCrossings: 0,
  polarFlights: 0,
  sunriseFlights: 0,
  sunsetFlights: 0,
  oceanCrossings: 0,
  mountainRangesFlown: [],
  firstFlightDate: null,
  monthlyFlightsHistory: []
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

  it('ACHIEVEMENTS list has exactly 18 entries', () => {
    expect(ACHIEVEMENTS.length).toBe(18);
  });

  // --- New achievement tests ---

  it('awards equator_crosser on first equator crossing', () => {
    const earned = evaluateAchievements({ ...baseStats, equatorCrossings: 1 }, []);
    expect(earned).toContain('equator_crosser');
  });

  it('awards dateline_crosser on first dateline crossing', () => {
    const earned = evaluateAchievements({ ...baseStats, datelineCrossings: 1 }, []);
    expect(earned).toContain('dateline_crosser');
  });

  it('awards polar_explorer on first polar flight', () => {
    const earned = evaluateAchievements({ ...baseStats, polarFlights: 1 }, []);
    expect(earned).toContain('polar_explorer');
  });

  it('awards dawn_patrol on first sunrise flight', () => {
    const earned = evaluateAchievements({ ...baseStats, sunriseFlights: 1 }, []);
    expect(earned).toContain('dawn_patrol');
  });

  it('awards alpine_flyer when Alps in mountainRangesFlown', () => {
    const earned = evaluateAchievements({ ...baseStats, mountainRangesFlown: ['Alps'] }, []);
    expect(earned).toContain('alpine_flyer');
  });

  it('awards himalayan when Himalayas in mountainRangesFlown', () => {
    const earned = evaluateAchievements({ ...baseStats, mountainRangesFlown: ['Himalayas'] }, []);
    expect(earned).toContain('himalayan');
  });

  it('awards one_year for firstFlightDate more than 1 year ago', () => {
    const longAgo = new Date();
    longAgo.setFullYear(longAgo.getFullYear() - 2);
    const earned = evaluateAchievements({ ...baseStats, firstFlightDate: longAgo.toISOString() }, []);
    expect(earned).toContain('one_year');
  });

  it('does not award one_year for firstFlightDate less than 1 year ago', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 6);
    const earned = evaluateAchievements({ ...baseStats, firstFlightDate: recent.toISOString() }, []);
    expect(earned).not.toContain('one_year');
  });

});
