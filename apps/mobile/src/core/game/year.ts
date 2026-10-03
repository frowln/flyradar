import type { POICategory } from '@skyatlas/shared';
import type { GlobeLine } from '../geo/lines';
import type { FlightRecord } from './types';
import { weekIndex, longestRun } from './streaks';

/**
 * "My year in the sky": one calendar year of the passport, folded into the
 * numbers worth celebrating.
 *
 * A flight belongs to the year and month of its local departure date — the day
 * printed on the boarding pass — so a New Year's Eve red-eye counts for the
 * year it left in. Week streaks still count in UTC from takeoff, the same way
 * `streaks()` does, so the two never disagree about a week.
 */

/** Once around the Equator. */
export const EARTH_KM = 40_075;
/** Mean distance from the Earth to the Moon. */
export const MOON_KM = 384_400;

export interface YearSummary {
  year: number;
  /** The year's flights, oldest first. */
  records: FlightRecord[];
  flights: number;
  distanceKm: number;
  airborneS: number;
  /** Countries flown over or landed in, in the order they were first seen this year. */
  countries: string[];
  /** Countries departed from or landed in. */
  landedCountries: string[];
  /** Countries of this year that no earlier year's flight had reached. */
  newCountries: string[];
  /** Distinct IATA codes, first-seen order. */
  airports: string[];
  /** By distance; a tie goes to the longer time aloft, then to the earlier flight. */
  longest: FlightRecord;
  shortest: FlightRecord;
  firstFlight: FlightRecord;
  lastFlight: FlightRecord;
  /** Distinct places passed within sight of. */
  places: number;
  /** Distinct places confirmed with "I see it". */
  spotted: number;
  /** Distinct places passed, by category. */
  byCategory: Partial<Record<POICategory, number>>;
  nightFlights: number;
  sunrises: number;
  sunsets: number;
  /** Distinct lines crossed, first-seen order. */
  linesCrossed: GlobeLine[];
  /** Flights per calendar month, January first. */
  byMonth: number[];
  /** The month with the most flights (0 = January); a tie goes to the earlier month. */
  busiestMonth: { month: number; flights: number };
  /** The longest run of consecutive ISO weeks with a flight, within this year's flights. */
  bestWeeksStreak: number;
  /** The most flown airport pair, either direction, in the direction first flown — only when flown at least twice. */
  topRoute: { from: string; to: string; count: number } | null;
  /** Distance as laps of the Equator. */
  aroundEarth: number;
  /** Distance as a share of the way to the Moon. */
  toMoon: number;
}

const DATE = /^(\d{4})-(\d{2})-\d{2}/;

/** Year and month (0–11) of a flight's local departure date, falling back to takeoff in UTC. */
export function flightYearMonth(r: FlightRecord): { year: number; month: number } | null {
  const m = DATE.exec(r.date ?? '');
  if (m) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  const ms = Date.parse(r.takeoffAt);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Every year with at least one flight, newest first. */
export function flightYears(records: FlightRecord[]): number[] {
  const years = new Set<number>();
  for (const r of records) {
    const ym = flightYearMonth(r);
    if (ym) years.add(ym.year);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * The year a "year in the sky" opens on: this year once it has a flight; until
 * then the most recent year that has one (in January, last year's story is the
 * one worth telling). With no flights at all, this year.
 */
export function defaultYear(records: FlightRecord[], now: Date = new Date()): number {
  const current = now.getFullYear();
  const years = flightYears(records);
  if (years.includes(current)) return current;
  return years.find((y) => y < current) ?? current;
}

function pushNew<T>(list: T[], seen: Set<T>, v: T | undefined | null | '') {
  if (!v || seen.has(v)) return;
  seen.add(v);
  list.push(v);
}

export function yearSummary(records: FlightRecord[], year: number): YearSummary | null {
  const ordered = [...records].sort((a, b) => a.takeoffAt.localeCompare(b.takeoffAt));
  const inYear: FlightRecord[] = [];
  const months: number[] = [];
  const before = new Set<string>();
  for (const r of ordered) {
    const ym = flightYearMonth(r);
    if (!ym) continue;
    if (ym.year === year) {
      inYear.push(r);
      months.push(ym.month);
    } else if (ym.year < year) {
      for (const cc of [r.fromCC, ...r.countries, r.toCC]) if (cc) before.add(cc);
    }
  }
  if (inYear.length === 0) return null;

  const countries: string[] = [];
  const countrySeen = new Set<string>();
  const landed: string[] = [];
  const landedSeen = new Set<string>();
  const airports: string[] = [];
  const airportSeen = new Set<string>();
  const lines: GlobeLine[] = [];
  const lineSeen = new Set<GlobeLine>();
  const placeCat = new Map<string, POICategory>();
  const spotted = new Set<string>();
  const routes = new Map<string, { from: string; to: string; count: number }>();
  const byMonth = Array.from({ length: 12 }, () => 0);
  let distanceKm = 0;
  let airborneS = 0;
  let nightFlights = 0;
  let sunrises = 0;
  let sunsets = 0;
  let longest = inYear[0]!;
  let shortest = inYear[0]!;

  inYear.forEach((r, i) => {
    distanceKm += r.distanceKm || 0;
    airborneS += r.airborneS || 0;
    if (r.night) nightFlights++;
    if (r.sunrise) sunrises++;
    if (r.sunset) sunsets++;
    byMonth[months[i]!]!++;

    // In the order a passenger meets them: the origin, what is below, the destination.
    pushNew(countries, countrySeen, r.fromCC);
    for (const cc of r.countries) pushNew(countries, countrySeen, cc);
    pushNew(countries, countrySeen, r.toCC);
    pushNew(landed, landedSeen, r.fromCC);
    pushNew(landed, landedSeen, r.toCC);
    pushNew(airports, airportSeen, r.from);
    pushNew(airports, airportSeen, r.to);
    for (const l of r.lines) pushNew(lines, lineSeen, l);
    for (const p of r.passed) placeCat.set(p.id, p.cat);
    for (const id of r.spotted) spotted.add(id);

    if (r.from && r.to && r.from !== r.to) {
      const key = [r.from, r.to].sort().join('|');
      const route = routes.get(key) ?? { from: r.from, to: r.to, count: 0 };
      route.count++;
      routes.set(key, route);
    }

    if (r.distanceKm > longest.distanceKm || (r.distanceKm === longest.distanceKm && r.airborneS > longest.airborneS)) longest = r;
    if (r.distanceKm < shortest.distanceKm || (r.distanceKm === shortest.distanceKm && r.airborneS < shortest.airborneS)) shortest = r;
  });

  const byCategory: YearSummary['byCategory'] = {};
  for (const cat of placeCat.values()) byCategory[cat] = (byCategory[cat] ?? 0) + 1;

  let busiest = 0;
  for (let m = 1; m < 12; m++) if (byMonth[m]! > byMonth[busiest]!) busiest = m;

  let topRoute: YearSummary['topRoute'] = null;
  for (const route of routes.values()) {
    if (route.count >= 2 && (!topRoute || route.count > topRoute.count)) topRoute = { ...route };
  }

  const weeks = new Set<number>();
  for (const r of inYear) {
    const ms = Date.parse(r.takeoffAt);
    if (Number.isFinite(ms)) weeks.add(weekIndex(ms));
  }

  return {
    year,
    records: inYear,
    flights: inYear.length,
    distanceKm,
    airborneS,
    countries,
    landedCountries: landed,
    newCountries: countries.filter((cc) => !before.has(cc)),
    airports,
    longest,
    shortest,
    firstFlight: inYear[0]!,
    lastFlight: inYear[inYear.length - 1]!,
    places: placeCat.size,
    spotted: spotted.size,
    byCategory,
    nightFlights,
    sunrises,
    sunsets,
    linesCrossed: lines,
    byMonth,
    busiestMonth: { month: busiest, flights: byMonth[busiest]! },
    bestWeeksStreak: longestRun(weeks),
    topRoute,
    aroundEarth: distanceKm / EARTH_KM,
    toMoon: distanceKm / MOON_KM
  };
}
