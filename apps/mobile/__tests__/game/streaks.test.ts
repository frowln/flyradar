import { describe, it, expect } from 'vitest';
import { streaks, weekIndex, monthIndex, longestRun } from '../../src/core/game/streaks';
import type { FlightRecord } from '../../src/core/game/types';

const rec = (takeoffAt: string, id = takeoffAt): FlightRecord => ({
  flightId: id,
  from: 'SVO',
  to: 'LED',
  fromCC: 'RU',
  toCC: 'RU',
  date: takeoffAt.slice(0, 10),
  takeoffAt,
  landedAt: takeoffAt,
  distanceKm: 600,
  airborneS: 3600,
  countries: ['RU'],
  lines: [],
  passed: [],
  spotted: [],
  night: false,
  sunrise: false,
  sunset: false
});

const log = (...dates: string[]) => dates.map((d) => rec(d.includes('T') ? d : `${d}T09:00:00Z`));

// Saturday 3 October 2026; its ISO week runs Monday 28 September – Sunday 4 October.
const NOW = new Date('2026-10-03T12:00:00Z');

describe('week and month numbering', () => {
  it('starts weeks on Monday, in UTC', () => {
    const sunday = Date.parse('2026-10-04T23:59:59Z');
    const monday = Date.parse('2026-10-05T00:00:00Z');
    expect(weekIndex(Date.parse('2026-09-28T00:00:00Z'))).toBe(weekIndex(sunday));
    expect(weekIndex(monday)).toBe(weekIndex(sunday) + 1);
  });

  it('numbers weeks straight through New Year', () => {
    // ISO week 52 of 2025, then week 1 of 2026 (which starts on 29 December 2025).
    const w52 = weekIndex(Date.parse('2025-12-24T12:00:00Z'));
    expect(weekIndex(Date.parse('2025-12-29T12:00:00Z'))).toBe(w52 + 1);
    expect(weekIndex(Date.parse('2026-01-04T12:00:00Z'))).toBe(w52 + 1);
    expect(weekIndex(Date.parse('2026-01-05T12:00:00Z'))).toBe(w52 + 2);
  });

  it('numbers months straight through New Year', () => {
    expect(monthIndex(Date.parse('2026-01-01T00:00:00Z'))).toBe(monthIndex(Date.parse('2025-12-31T23:59:59Z')) + 1);
  });

  it('finds the longest run in a set', () => {
    expect(longestRun(new Set())).toBe(0);
    expect(longestRun(new Set([5]))).toBe(1);
    expect(longestRun(new Set([1, 2, 3, 7, 8, 10, 11, 12, 13]))).toBe(4);
  });
});

describe('streaks', () => {
  it('is all zero with no flights', () => {
    expect(streaks([], NOW)).toEqual({
      weeks: 0,
      bestWeeks: 0,
      months: 0,
      bestMonths: 0,
      flewThisWeek: false,
      flewThisMonth: false
    });
  });

  it('counts consecutive weeks ending this week', () => {
    const s = streaks(log('2026-09-14', '2026-09-22', '2026-09-29'), NOW);
    expect(s.weeks).toBe(3);
    expect(s.flewThisWeek).toBe(true);
  });

  it('keeps the streak alive while this week has no flight yet', () => {
    const s = streaks(log('2026-09-08', '2026-09-15', '2026-09-27'), NOW);
    // Last flight Sunday 27 September: last week. Nothing yet this week.
    expect(s.flewThisWeek).toBe(false);
    expect(s.weeks).toBe(3);
  });

  it('is broken by a week without a flight', () => {
    // Two weeks ago and three weeks ago, nothing last week or this week.
    expect(streaks(log('2026-09-08', '2026-09-15'), NOW).weeks).toBe(0);
    // A gap inside the history: only the run touching now counts.
    const s = streaks(log('2026-09-01', '2026-09-15', '2026-09-22', '2026-09-30'), NOW);
    expect(s.weeks).toBe(3);
  });

  it('counts a week once however many flights it holds', () => {
    const s = streaks(log('2026-09-28T06:00:00Z', '2026-09-28T18:00:00Z', '2026-10-02', '2026-10-04T22:00:00Z'), NOW);
    expect(s.weeks).toBe(1);
    expect(s.bestWeeks).toBe(1);
  });

  it('runs across the turn of the year', () => {
    const jan = new Date('2026-01-08T12:00:00Z');
    const s = streaks(log('2025-12-16', '2025-12-23', '2025-12-31', '2026-01-06'), jan);
    expect(s.weeks).toBe(4);
    expect(s.months).toBe(2);
  });

  it('reads takeoff in UTC, whatever offset it was written with', () => {
    // 23:30 on Sunday in Rio (UTC−3) is 02:30 on Monday in UTC: this week, not last.
    const s = streaks([rec('2026-09-27T23:30:00-03:00')], NOW);
    expect(s.flewThisWeek).toBe(true);
    expect(s.weeks).toBe(1);
  });

  it('remembers the best run after the current one ends', () => {
    const s = streaks(
      log('2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-09-22', '2026-10-01'),
      NOW
    );
    expect(s.weeks).toBe(2);
    expect(s.bestWeeks).toBe(5);
  });

  it('counts months the same way, alive until the month is over', () => {
    const s = streaks(log('2026-06-10', '2026-07-03', '2026-08-30', '2026-09-30'), NOW);
    expect(s.flewThisMonth).toBe(false);
    expect(s.months).toBe(4);
    expect(s.bestMonths).toBe(4);
    expect(streaks(log('2026-06-10', '2026-07-03', '2026-08-30'), NOW).months).toBe(0);
    const withThis = streaks(log('2026-08-30', '2026-10-02'), NOW);
    expect(withThis.months).toBe(1);
    expect(withThis.bestMonths).toBe(1);
    expect(withThis.flewThisMonth).toBe(true);
  });

  it('ignores a record with an unreadable takeoff time', () => {
    const s = streaks([...log('2026-09-30'), rec('not a date', 'broken')], NOW);
    expect(s.weeks).toBe(1);
  });
});
