import { describe, it, expect } from 'vitest';
import { zonedToUtc, zoneOffsetMinutes, localDate, formatClock } from '../../src/core/time/zones';

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
