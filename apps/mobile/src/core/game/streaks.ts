import type { FlightRecord } from './types';

/**
 * Flight streaks: how many weeks, or months, in a row the passport has had a
 * flight in it.
 *
 * For someone who flies every week this is the one number that grows between
 * new countries, so it has to be exact and it has to be forgiving in the right
 * place: a streak is not broken on Monday morning because this week's flight is
 * on Friday. It stays alive until the week (or month) is over.
 *
 * Everything is counted in UTC from `takeoffAt`, so a flight never moves from
 * one week to another when the phone changes time zone. A week is an ISO week
 * (Monday to Sunday), a month a calendar month.
 */

export interface Streaks {
  /** Weeks in a row with a flight, ending this week — or last week, while this one is still open. */
  weeks: number;
  /** The longest run of weeks ever. */
  bestWeeks: number;
  /** Months in a row with a flight, ending this month — or last month, while this one is still open. */
  months: number;
  bestMonths: number;
  flewThisWeek: boolean;
  flewThisMonth: boolean;
}

const DAY_MS = 86_400_000;

/**
 * A running number for the ISO week of a moment, in UTC: consecutive weeks get
 * consecutive numbers, so a run across New Year (week 52 → week 1) needs no
 * special case. 1 January 1970 was a Thursday; shifting by three days puts
 * every Monday on a multiple of seven.
 */
export function weekIndex(ms: number): number {
  return Math.floor((Math.floor(ms / DAY_MS) + 3) / 7);
}

/** A running number for the calendar month of a moment, in UTC. */
export function monthIndex(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function takeoffMs(r: FlightRecord): number | null {
  const ms = Date.parse(r.takeoffAt);
  return Number.isFinite(ms) ? ms : null;
}

/** Distinct period numbers that hold at least one flight. */
function periods(records: FlightRecord[], index: (ms: number) => number): Set<number> {
  const out = new Set<number>();
  for (const r of records) {
    const ms = takeoffMs(r);
    if (ms != null) out.add(index(ms));
  }
  return out;
}

/** The longest run of consecutive numbers in the set. */
export function longestRun(set: Set<number>): number {
  let best = 0;
  for (const n of set) {
    // Only start counting at the beginning of a run.
    if (set.has(n - 1)) continue;
    let len = 1;
    while (set.has(n + len)) len++;
    best = Math.max(best, len);
  }
  return best;
}

/** The run ending at `now`, or at the period before it while `now` has no flight yet. */
function currentRun(set: Set<number>, now: number): number {
  const end = set.has(now) ? now : set.has(now - 1) ? now - 1 : null;
  if (end == null) return 0;
  let len = 0;
  while (set.has(end - len)) len++;
  return len;
}

export function streaks(records: FlightRecord[], now: Date = new Date()): Streaks {
  const nowMs = now.getTime();
  const weeks = periods(records, weekIndex);
  const months = periods(records, monthIndex);
  const thisWeek = weekIndex(nowMs);
  const thisMonth = monthIndex(nowMs);
  return {
    weeks: currentRun(weeks, thisWeek),
    bestWeeks: longestRun(weeks),
    months: currentRun(months, thisMonth),
    bestMonths: longestRun(months),
    flewThisWeek: weeks.has(thisWeek),
    flewThisMonth: months.has(thisMonth)
  };
}
