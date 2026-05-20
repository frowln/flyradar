import { describe, it, expect } from 'vitest';
import { computePosition } from '../../src/core/flight/positionEngine';
import { evaluateAchievements, type LifetimeStats } from '../../src/core/gamification/achievements';
import { calculateXP, levelFromXP, rankFromLevel } from '../../src/core/gamification/levels';
import { calculateStreaks } from '../../src/core/gamification/streaks';
import { groupIntoTrips } from '../../src/core/trip/trips';

describe('Critical Path: Flight Lifecycle', () => {
  const mockRoute = Array.from({ length: 100 }, (_, i) => ({
    lat: 55.97 - (i / 99) * 15,
    lon: 37.41 - (i / 99) * 111,
    altitude: 11000,
    elapsedSeconds: i * 360
  }));

  it('user adds flight → flight tracks position over time', () => {
    const takeoffAt = new Date('2026-05-20T10:00:00Z');
    const at30min = new Date('2026-05-20T10:30:00Z');
    const at5h = new Date('2026-05-20T15:00:00Z');

    const p1 = computePosition(mockRoute, takeoffAt, at30min);
    const p2 = computePosition(mockRoute, takeoffAt, at5h);

    expect(p1.elapsedSeconds).toBeLessThan(p2.elapsedSeconds);
    expect(p1.lat).not.toBe(p2.lat);
  });

  it('user completes 10 flights → earns "air_wolf"', () => {
    const stats: LifetimeStats = {
      totalFlights: 10,
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
    const earned = evaluateAchievements(stats, []);
    expect(earned).toContain('air_wolf');
  });

  it('XP → level → rank progression', () => {
    // Need level >= 10 for 'traveler' rank. Total XP for level 10 = sum(200*i, i=1..9) = 9000
    // Use enough activity to exceed 9000 XP
    const xp = calculateXP({
      flightsCompleted: 50,   // 5000 XP
      poisDiscovered: 200,    // 2000 XP
      achievementsEarned: 20, // 1000 XP
      countriesVisited: 30,   // 750 XP
      distanceKm: 100000      // 1000 XP
    }); // total = 9750 XP → level 10
    const { level } = levelFromXP(xp);
    const rank = rankFromLevel(level);
    expect(level).toBeGreaterThanOrEqual(10);
    expect(rank.id).not.toBe('newcomer');
  });

  it('Trip grouping → 3 flights within 14 days = one trip', () => {
    const makePkg = (id: string, fn: string, dep: string, arr: string, orig: string, origIata: string, origCountry: string, dest: string, destIata: string, destCountry: string) => ({
      flight: {
        id,
        flightNumber: fn,
        scheduledDeparture: dep,
        scheduledArrival: arr,
        origin: { iata: origIata, city: orig, country: origCountry, lat: 0, lon: 0 },
        destination: { iata: destIata, city: dest, country: destCountry, lat: 0, lon: 0 }
      },
      route: [],
      pois: []
    });

    const packages = [
      makePkg('1', 'A1', '2026-05-01T00:00:00Z', '2026-05-01T02:00:00Z', 'New York', 'JFK', 'USA', 'Paris', 'CDG', 'France'),
      makePkg('2', 'A2', '2026-05-05T00:00:00Z', '2026-05-05T02:00:00Z', 'Paris', 'CDG', 'France', 'Rome', 'FCO', 'Italy'),
      makePkg('3', 'A3', '2026-05-10T00:00:00Z', '2026-05-10T02:00:00Z', 'Rome', 'FCO', 'Italy', 'New York', 'JFK', 'USA')
    ];

    const trips = groupIntoTrips(packages as any);
    expect(trips).toHaveLength(1);
    expect(trips[0].flights).toHaveLength(3);
  });

  it('Streak: 3 consecutive months = 3 streak', () => {
    const r = calculateStreaks([
      { date: '2026-01-15' },
      { date: '2026-02-10' },
      { date: '2026-03-22' }
    ]);
    expect(r.bestStreak).toBe(3);
  });
});
