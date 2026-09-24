import { describe, it, expect } from 'vitest';
import { zonedToUtc, zoneOffsetMinutes, localDate, formatClock, nextWallClock, shiftDate } from '../../src/core/time/zones';

describe('airport-local time', () => {
  it('converts Moscow wall-clock to UTC', () => {
    expect(zonedToUtc('2026-10-01', '09:30', 'Europe/Moscow').toISOString()).toBe('2026-10-01T06:30:00.000Z');
  });

  it('handles daylight saving on both sides of the Atlantic', () => {
    expect(zonedToUtc('2026-07-01', '18:00', 'America/New_York').toISOString()).toBe('2026-07-01T22:00:00.000Z');
    expect(zonedToUtc('2026-01-15', '18:00', 'America/New_York').toISOString()).toBe('2026-01-15T23:00:00.000Z');
    expect(zonedToUtc('2026-07-01', '08:00', 'Europe/London').toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });

  it('keeps the local calendar date — the "day early" bug', () => {
    const dep = zonedToUtc('2026-10-01', '01:15', 'Asia/Tokyo');
    // 01:15 in Tokyo is still 30 September in UTC …
    expect(dep.toISOString().slice(0, 10)).toBe('2026-09-30');
    // … but the flight's date is the one on the ticket.
    expect(localDate(dep, 'Asia/Tokyo')).toBe('2026-10-01');
    expect(formatClock(dep, 'Asia/Tokyo')).toBe('01:15');
  });

  it('reports offsets east of UTC as positive', () => {
    expect(zoneOffsetMinutes('Asia/Singapore', new Date('2026-05-01T00:00:00Z'))).toBe(480);
    expect(zoneOffsetMinutes('America/Los_Angeles', new Date('2026-05-01T00:00:00Z'))).toBe(-420);
  });
});

describe('arrival from a ticket\'s local time', () => {
  it('shifts calendar dates across month and year ends', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('not-a-date', 1)).toBe('not-a-date');
  });

  it('lands the next local day on a westbound Pacific crossing', () => {
    const dep = zonedToUtc('2026-06-21', '10:50', 'Pacific/Honolulu');
    const arr = nextWallClock(dep, '2026-06-21', '14:40', 'Asia/Tokyo')!;
    expect(localDate(arr, 'Asia/Tokyo')).toBe('2026-06-22');
    expect((arr.getTime() - dep.getTime()) / 3_600_000).toBeCloseTo(8.83, 1);
  });

  /**
   * Flying east across the date line the arrival date is the day before the
   * departure date. Only days after departure used to be tried, so Apia 10:00
   * → Pago Pago 10:40 became a 24 h 40 min block and a 23-hour "flight" over
   * 150 km of sea; longer ones like Auckland–Honolulu fell past the 30-hour
   * cut-off and silently ignored the ticket.
   */
  it('lands the previous local day on an eastbound crossing of the date line', () => {
    const dep = zonedToUtc('2026-06-21', '10:00', 'Pacific/Apia');
    const arr = nextWallClock(dep, '2026-06-21', '10:40', 'Pacific/Pago_Pago')!;
    expect(localDate(arr, 'Pacific/Pago_Pago')).toBe('2026-06-20');
    expect((arr.getTime() - dep.getTime()) / 60_000).toBe(40);

    const akl = zonedToUtc('2026-06-21', '05:00', 'Pacific/Auckland');
    const hnl = nextWallClock(akl, '2026-06-21', '15:30', 'Pacific/Honolulu')!;
    expect(localDate(hnl, 'Pacific/Honolulu')).toBe('2026-06-20');
    expect((hnl.getTime() - akl.getTime()) / 3_600_000).toBe(8.5);
  });

  it('respects a clock change between departure and arrival', () => {
    // New York 20:30 on 28 March lands in London at 09:30 on the 29th, the
    // morning Britain springs forward: 08:30 UTC. Stepping the previous day's
    // 09:30 GMT on by 24 hours gave 09:30 UTC — an hour late.
    const dep = zonedToUtc('2026-03-28', '20:30', 'America/New_York');
    const arr = nextWallClock(dep, '2026-03-28', '09:30', 'Europe/London')!;
    expect(arr.toISOString()).toBe('2026-03-29T08:30:00.000Z');
  });

  it('returns null for an unreadable date', () => {
    expect(nextWallClock(new Date('2026-06-21T00:00:00Z'), 'someday', '10:00', 'Europe/London')).toBeNull();
  });
});
