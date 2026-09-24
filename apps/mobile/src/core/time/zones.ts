/**
 * Airport-local time.
 *
 * A departure printed on a ticket is a wall-clock time in the origin's zone.
 * Treating it as the phone's zone, or as UTC, is how a flight ends up "a day
 * early" for anyone east of Greenwich — `new Date('2026-10-01')` is midnight
 * UTC, which is still 30 September in New York and already 1 October at 03:00
 * in Moscow. Every conversion goes through the IANA zone of the airport.
 */

/** Minutes east of UTC for a zone at an instant, e.g. +180 for Moscow. */
export function zoneOffsetMinutes(tz: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

/** The instant at which the wall clock in `tz` reads `date` `time`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  // Two passes settle the offset across a DST change.
  let guess = naive - zoneOffsetMinutes(tz, new Date(naive)) * 60_000;
  guess = naive - zoneOffsetMinutes(tz, new Date(guess)) * 60_000;
  return new Date(guess);
}

/** The calendar date `days` after (negative: before) a "YYYY-MM-DD" date. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d + days);
  return Number.isNaN(t) ? date : new Date(t).toISOString().slice(0, 10);
}

/**
 * The first instant after `after` at which the wall clock in `tz` reads `time`.
 *
 * A ticket prints the arrival as a local time and leaves its date implied:
 * usually the departure date or the day after, but flying east across the date
 * line it can be the day *before* — Apia 10:00 lands in Pago Pago at 09:40 the
 * previous day. Each candidate day is converted on its own, so a clock change
 * between departure and arrival is respected. Null when the time is unreadable.
 */
export function nextWallClock(after: Date, date: string, time: string, tz: string): Date | null {
  // Offsets span 26 hours (−12…+14), so the answer is within two days either side.
  for (let k = -2; k <= 3; k++) {
    const at = zonedToUtc(shiftDate(date, k), time, tz);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
}

/** Wall-clock "HH:MM" in a zone. */
export function formatClock(at: Date, tz?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(at);
  } catch {
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  }
}

/** Calendar date "YYYY-MM-DD" in a zone. */
export function localDate(at: Date, tz?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    const y = at.getFullYear();
    return `${y}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  }
}

/** "3 h 05 min" style duration pieces. */
export function splitDuration(seconds: number): { h: number; m: number } {
  const mins = Math.max(0, Math.round(seconds / 60));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

export function hhmm(seconds: number): string {
  const { h, m } = splitDuration(seconds);
  return `${h}:${String(m).padStart(2, '0')}`;
}
