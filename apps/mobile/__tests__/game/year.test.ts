import { describe, it, expect } from 'vitest';
import { yearSummary, flightYears, defaultYear, flightYearMonth, EARTH_KM, MOON_KM } from '../../src/core/game/year';
import type { FlightRecord } from '../../src/core/game/types';

const rec = (over: Partial<FlightRecord> & Pick<FlightRecord, 'flightId' | 'takeoffAt'>): FlightRecord => ({
  from: 'SVO',
  to: 'AYT',
  fromCC: 'RU',
  toCC: 'TR',
  date: over.takeoffAt.slice(0, 10),
  landedAt: over.takeoffAt,
  distanceKm: 2200,
  airborneS: 4 * 3600,
  countries: ['RU', 'GE', 'TR'],
  lines: [],
  passed: [],
  spotted: [],
  night: false,
  sunrise: false,
  sunset: false,
  ...over
});

const log: FlightRecord[] = [
  // Last year: Russia, Georgia and Turkey are already in the passport.
  rec({ flightId: 'old', takeoffAt: '2025-07-01T08:00:00Z' }),
  rec({
    flightId: 'a',
    takeoffAt: '2026-03-02T08:00:00Z',
    passed: [
      { id: 'elbrus', cat: 'mountain' },
      { id: 'black-sea', cat: 'sea' }
    ],
    spotted: ['elbrus'],
    sunrise: true
  }),
  rec({
    flightId: 'b',
    takeoffAt: '2026-03-09T16:00:00Z',
    from: 'AYT',
    to: 'SVO',
    fromCC: 'TR',
    toCC: 'RU',
    countries: ['TR', 'GE', 'RU'],
    passed: [{ id: 'elbrus', cat: 'mountain' }],
    spotted: ['elbrus'],
    sunset: true
  }),
  rec({
    flightId: 'c',
    takeoffAt: '2026-03-16T22:00:00Z',
    from: 'SVO',
    to: 'JFK',
    fromCC: 'RU',
    toCC: 'US',
    countries: ['RU', 'FI', 'SE', 'NO', 'IS', 'CA', 'US'],
    distanceKm: 7510,
    airborneS: 10 * 3600,
    lines: ['arctic_circle', 'prime_meridian'],
    passed: [{ id: 'greenland', cat: 'island' }],
    night: true
  }),
  rec({
    flightId: 'd',
    takeoffAt: '2026-08-20T10:00:00Z',
    from: 'JFK',
    to: 'BOS',
    fromCC: 'US',
    toCC: 'US',
    countries: ['US'],
    distanceKm: 300,
    airborneS: 3600,
    lines: ['arctic_circle'],
    night: true
  }),
  rec({ flightId: 'e', takeoffAt: '2026-08-27T10:00:00Z', from: 'AYT', to: 'SVO', fromCC: 'TR', toCC: 'RU' }),
  // Next year does not leak into this one.
  rec({ flightId: 'next', takeoffAt: '2027-01-10T08:00:00Z', fromCC: 'FR', toCC: 'FR', countries: ['FR'] })
];

describe('yearSummary', () => {
  const y = yearSummary(log, 2026)!;

  it('is null for a year without flights', () => {
    expect(yearSummary(log, 2024)).toBeNull();
    expect(yearSummary([], 2026)).toBeNull();
  });

  it('adds up the year', () => {
    expect(y.year).toBe(2026);
    expect(y.records.map((r) => r.flightId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(y.flights).toBe(5);
    expect(y.distanceKm).toBe(2200 + 2200 + 7510 + 300 + 2200);
    expect(y.airborneS).toBe((4 + 4 + 10 + 1 + 4) * 3600);
  });

  it('lists countries and airports in the order first seen', () => {
    expect(y.countries).toEqual(['RU', 'GE', 'TR', 'FI', 'SE', 'NO', 'IS', 'CA', 'US']);
    expect(y.landedCountries).toEqual(['RU', 'TR', 'US']);
    expect(y.airports).toEqual(['SVO', 'AYT', 'JFK', 'BOS']);
  });

  it('marks countries no earlier year had reached as new', () => {
    expect(y.newCountries).toEqual(['FI', 'SE', 'NO', 'IS', 'CA', 'US']);
    // The first year with flights: everything is new.
    expect(yearSummary(log, 2025)!.newCountries).toEqual(['RU', 'GE', 'TR']);
  });

  it('finds the longest, shortest, first and last flights', () => {
    expect(y.longest.flightId).toBe('c');
    expect(y.shortest.flightId).toBe('d');
    expect(y.firstFlight.flightId).toBe('a');
    expect(y.lastFlight.flightId).toBe('e');
  });

  it('breaks a distance tie by time aloft', () => {
    const tie = yearSummary(
      [
        rec({ flightId: 'slow', takeoffAt: '2026-01-01T08:00:00Z', airborneS: 5 * 3600 }),
        rec({ flightId: 'fast', takeoffAt: '2026-01-02T08:00:00Z', airborneS: 3 * 3600 })
      ],
      2026
    )!;
    expect(tie.longest.flightId).toBe('slow');
    expect(tie.shortest.flightId).toBe('fast');
  });

  it('counts places, spotted and categories once each', () => {
    expect(y.places).toBe(3);
    expect(y.spotted).toBe(1);
    expect(y.byCategory).toEqual({ mountain: 1, sea: 1, island: 1 });
  });

  it('counts the sky: nights, sunrises, sunsets, lines', () => {
    expect(y.nightFlights).toBe(2);
    expect(y.sunrises).toBe(1);
    expect(y.sunsets).toBe(1);
    expect(y.linesCrossed).toEqual(['arctic_circle', 'prime_meridian']);
  });

  it('finds the busiest month, the earlier one on a tie', () => {
    expect(y.byMonth).toEqual([0, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0]);
    expect(y.busiestMonth).toEqual({ month: 2, flights: 3 });
    const tie = yearSummary(
      [rec({ flightId: 'x', takeoffAt: '2026-05-01T08:00:00Z' }), rec({ flightId: 'y', takeoffAt: '2026-02-01T08:00:00Z' })],
      2026
    )!;
    expect(tie.busiestMonth).toEqual({ month: 1, flights: 1 });
  });

  it('finds the most flown route in either direction, as first flown', () => {
    expect(y.topRoute).toEqual({ from: 'SVO', to: 'AYT', count: 3 });
  });

  it('has no top route when nothing was flown twice', () => {
    const once = yearSummary(
      [
        rec({ flightId: 'x', takeoffAt: '2026-05-01T08:00:00Z' }),
        rec({ flightId: 'y', takeoffAt: '2026-05-02T08:00:00Z', from: 'SVO', to: 'JFK' })
      ],
      2026
    )!;
    expect(once.topRoute).toBeNull();
  });

  it('finds the best run of weeks inside the year only', () => {
    // 2, 9 and 16 March: three Mondays in a row. 20 and 27 August: two.
    expect(y.bestWeeksStreak).toBe(3);
    // 31 Dec 2025 and 6 Jan 2026 are consecutive ISO weeks, but only one is in 2026.
    const edge = [
      rec({ flightId: 'x', takeoffAt: '2025-12-31T08:00:00Z' }),
      rec({ flightId: 'y', takeoffAt: '2026-01-06T08:00:00Z' })
    ];
    expect(yearSummary(edge, 2026)!.bestWeeksStreak).toBe(1);
  });

  it('compares the distance with the Earth and the Moon', () => {
    expect(y.aroundEarth).toBeCloseTo(y.distanceKm / EARTH_KM, 10);
    expect(y.toMoon).toBeCloseTo(y.distanceKm / MOON_KM, 10);
    expect(yearSummary([rec({ flightId: 'x', takeoffAt: '2026-01-01T08:00:00Z', distanceKm: 40_075 })], 2026)!.aroundEarth).toBe(1);
  });

  it('files a flight under its local departure date', () => {
    // New Year's Eve, 21:00 in New York: already 1 January in UTC, still 2025 on the boarding pass.
    const nye = rec({ flightId: 'nye', takeoffAt: '2026-01-01T02:00:00Z', date: '2025-12-31' });
    expect(flightYearMonth(nye)).toEqual({ year: 2025, month: 11 });
    expect(yearSummary([nye], 2025)!.flights).toBe(1);
    expect(yearSummary([nye], 2026)).toBeNull();
    // Without a usable local date, takeoff in UTC decides.
    expect(flightYearMonth(rec({ flightId: 'z', takeoffAt: '2026-04-30T23:00:00Z', date: '' }))).toEqual({ year: 2026, month: 3 });
  });
});

describe('choosing the year', () => {
  it('lists the years with flights, newest first', () => {
    expect(flightYears(log)).toEqual([2027, 2026, 2025]);
    expect(flightYears([])).toEqual([]);
  });

  it('opens on this year once it has a flight', () => {
    expect(defaultYear(log, new Date('2026-10-03T12:00:00'))).toBe(2026);
  });

  it('opens on the most recent past year while this one is still empty', () => {
    const past = log.filter((r) => r.takeoffAt < '2026');
    expect(defaultYear(past, new Date('2026-01-03T12:00:00'))).toBe(2025);
    expect(defaultYear(past, new Date('2028-01-03T12:00:00'))).toBe(2025);
  });

  it('opens on this year with no flights at all', () => {
    expect(defaultYear([], new Date('2026-10-03T12:00:00'))).toBe(2026);
  });
});
