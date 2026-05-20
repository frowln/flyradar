import { describe, it, expect } from 'vitest';
import { calculateStreaks } from '../../src/core/gamification/streaks';

describe('calculateStreaks', () => {
  it('empty returns zeros', () => {
    expect(calculateStreaks([])).toEqual({ currentStreak: 0, bestStreak: 0, totalMonthsFlown: 0 });
  });
  it('single flight = 1 month flown', () => {
    expect(calculateStreaks([{ date: '2026-05-01' }]).totalMonthsFlown).toBe(1);
  });
  it('detects 3-month best streak', () => {
    const r = calculateStreaks([
      { date: '2025-01-15' }, { date: '2025-02-10' }, { date: '2025-03-22' }
    ]);
    expect(r.bestStreak).toBe(3);
  });
  it('non-consecutive months break streak', () => {
    const r = calculateStreaks([
      { date: '2025-01-15' }, { date: '2025-03-22' }
    ]);
    expect(r.bestStreak).toBe(1);
  });
});
