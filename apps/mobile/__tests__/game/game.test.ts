import { describe, it, expect } from 'vitest';
import { buildPassport } from '../../src/core/game/passport';
import { xpLedger, totalXP, levelFromXP, rankFor, XP } from '../../src/core/game/xp';
import { achievementStates, newlyEarned, ACHIEVEMENTS } from '../../src/core/game/achievements';
import { flightQuiz } from '../../src/core/game/quiz';
import { recordFromFlight } from '../../src/core/game/record';
import { buildRoute } from '../../src/core/route/profile';
import type { FlightRecord } from '../../src/core/game/types';
import type { OfflinePackage } from '@skyatlas/shared';

const continent: Record<string, string> = { RU: 'Europe', TR: 'Asia', GE: 'Asia', US: 'North America', GB: 'Europe' };
const cont = (cc: string) => continent[cc];

const rec = (over: Partial<FlightRecord> & Pick<FlightRecord, 'flightId' | 'takeoffAt'>): FlightRecord => ({
  from: 'SVO',
  to: 'AYT',
  fromCC: 'RU',
  toCC: 'TR',
  date: over.takeoffAt.slice(0, 10),
  landedAt: over.takeoffAt,
  distanceKm: 2200,
  airborneS: 3.6 * 3600,
  countries: ['RU', 'GE', 'TR'],
  lines: [],
  passed: [
    { id: 'elbrus', cat: 'mountain' },
    { id: 'black-sea', cat: 'sea' }
  ],
  spotted: ['elbrus'],
  night: false,
  sunrise: false,
  sunset: false,
  ...over
});

describe('passport', () => {
  const log = [
    rec({ flightId: 'a', takeoffAt: '2026-06-01T08:00:00Z' }),
    rec({
      flightId: 'b',
      takeoffAt: '2026-06-15T08:00:00Z',
      from: 'AYT',
      to: 'SVO',
      fromCC: 'TR',
      toCC: 'RU',
      lines: ['prime_meridian'],
      spotted: [],
      sunset: true
    })
  ];
  const p = buildPassport(log, cont);

  it('counts unique countries, places and spotted across flights', () => {
    expect(p.flights).toBe(2);
    expect(p.countries.sort()).toEqual(['GE', 'RU', 'TR']);
    expect(p.landed.sort()).toEqual(['RU', 'TR']);
    expect(p.places).toBe(2);
    expect(p.spotted).toBe(1);
    expect(p.byCategory.mountain).toEqual({ passed: 1, spotted: 1 });
    expect(p.continents.sort()).toEqual(['Asia', 'Europe']);
    expect(p.sunsets).toBe(1);
  });

  it('credits XP for novelty, not repetition', () => {
    const [first, second] = xpLedger(log);
    expect(first!.total).toBeGreaterThan(second!.total);
    // The second flight re-crosses known countries and places: no country XP.
    expect(second!.parts.find((x) => x.key === 'newCountry')).toBeUndefined();
    expect(second!.parts.find((x) => x.key === 'firstLine')!.xp).toBe(XP.firstLine);
  });

  it('lifts a first-time flyer out of level 1 with one flight', () => {
    const xp = totalXP([log[0]!]);
    expect(levelFromXP(xp).level).toBeGreaterThanOrEqual(2);
    expect(rankFor(1)).toBe('newcomer');
    expect(rankFor(12)).toBe('explorer');
  });
});

describe('achievements', () => {
  it('are all reachable from fields the passport computes', () => {
    // A passport maxed on every dimension earns everything.
    const huge = buildPassport(
      Array.from({ length: 60 }, (_, i) =>
        rec({
          flightId: `f${i}`,
          takeoffAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
          distanceKm: 8000,
          airborneS: 15 * 3600,
          countries: Array.from({ length: 60 }, (_, k) => `C${k}`),
          lines: ['equator', 'dateline', 'arctic_circle', 'tropic_cancer'],
          passed: Array.from({ length: 60 }, (_, k) => ({
            id: `p${i}-${k}`,
            cat: (['mountain', 'volcano', 'range', 'sea', 'desert', 'lake', 'island', 'city'] as const)[k % 8]!
          })),
          spotted: Array.from({ length: 60 }, (_, k) => `p${i}-${k}`),
          guessed: 3,
          night: true,
          sunrise: true,
          sunset: true
        })
      ),
      (cc) => ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'][Number(cc.slice(1)) % 6]
    );
    const states = achievementStates(huge);
    expect(states.filter((s) => !s.earned).map((s) => s.def.id)).toEqual([]);
    expect(states).toHaveLength(ACHIEVEMENTS.length);
  });

  it('reports what a flight newly earned', () => {
    const before = buildPassport([], cont);
    const after = buildPassport([rec({ flightId: 'x', takeoffAt: '2026-06-01T08:00:00Z' })], cont);
    const ids = newlyEarned(before, after).map((a) => a.id);
    expect(ids).toContain('first_flight');
    expect(ids).toContain('spotted_1');
  });
});

describe('flight quiz and record', () => {
  const built = buildRoute({ from: { lat: 55.97, lon: 37.41 }, to: { lat: 36.9, lon: 30.8 } });
  const end = built.route[built.route.length - 1]!.elapsedSeconds;
  const pkg: OfflinePackage = {
    version: 2,
    flight: {
      id: 'SVO-AYT-2026-06-01-0900',
      flightNumber: '',
      airline: '',
      origin: { iata: 'SVO', icao: '', name: '', city: 'Moscow', country: 'RU', lat: 55.97, lon: 37.41, tz: 'Europe/Moscow' },
      destination: { iata: 'AYT', icao: '', name: '', city: 'Antalya', country: 'TR', lat: 36.9, lon: 30.8, tz: 'Europe/Istanbul' },
      scheduledDeparture: '2026-06-01T06:00:00Z',
      scheduledArrival: '2026-06-01T10:00:00Z',
      localDate: '2026-06-01'
    },
    route: built.route,
    pois: [
      { id: 'elbrus', name: 'Elbrus', category: 'mountain', elevation: 5642, lat: 43.35, lon: 42.44, summary: '', facts: [], photos: [], side: 'left', rank: 10, passAt: 3000 },
      { id: 'kazbek', name: 'Kazbek', category: 'mountain', elevation: 5047, lat: 42.7, lon: 44.5, summary: '', facts: [], photos: [], side: 'left', rank: 8, passAt: 3300 },
      { id: 'ararat', name: 'Ararat', category: 'mountain', elevation: 5137, lat: 39.7, lon: 44.3, summary: '', facts: [], photos: [], side: 'right', rank: 8, passAt: 5500 },
      { id: 'sea', name: 'Black Sea', category: 'sea', lat: 43, lon: 34, summary: '', facts: [], photos: [], side: 'below', rank: 9, passAt: 6000 }
    ],
    generatedAt: '',
    countries: [
      { cc: 'RU', enterAt: 0, exitAt: 5000 },
      { cc: 'GE', enterAt: 5000, exitAt: 5200 },
      { cc: 'TR', enterAt: 7000, exitAt: end }
    ]
  };
  const naming = { place: (p: { name: string }) => p.name, country: (cc: string) => cc, side: (s: string) => s };

  it('builds questions whose answers are true by construction', () => {
    const qs = flightQuiz(pkg, naming);
    const longest = qs.find((q) => q.prompt === 'quiz.longestCountry')!;
    expect(longest.options[longest.correctIdx]).toBe('RU');
    const side = qs.find((q) => q.prompt === 'quiz.whichSide')!;
    expect(side.options[side.correctIdx]).toBe('left');
    const peak = qs.find((q) => q.prompt === 'quiz.highestPeak')!;
    expect(peak.options[peak.correctIdx]).toBe('Elbrus');
    // Stable between calls.
    expect(flightQuiz(pkg, naming)).toEqual(qs);
  });

  it('records only what the flight reached', () => {
    const r = recordFromFlight(pkg, {
      takeoffAt: new Date('2026-06-01T06:10:00Z'),
      landedAt: new Date('2026-06-01T08:00:00Z'),
      spotted: ['elbrus', 'sea'],
      elapsedS: 4000
    });
    expect(r.countries).toEqual(['RU']);
    expect(r.passed.map((p) => p.id)).toEqual(['elbrus', 'kazbek']);
    expect(r.spotted).toEqual(['elbrus']);
    expect(r.toCC).toBe('');
    const full = recordFromFlight(pkg, {
      takeoffAt: new Date('2026-06-01T06:10:00Z'),
      landedAt: new Date('2026-06-01T10:00:00Z'),
      spotted: []
    });
    expect(full.countries).toEqual(['RU', 'GE', 'TR']);
    expect(full.toCC).toBe('TR');
  });
});
