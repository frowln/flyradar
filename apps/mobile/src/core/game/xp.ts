import type { FlightRecord } from './types';

/**
 * Experience, earned only from things that happened.
 *
 * The weights favour novelty — a new country, a first sight confirmed with your
 * own eyes, a line crossed for the first time — over repetition, so that the
 * twentieth commute adds a little and the first equator crossing adds a lot.
 * There is nothing to grind: XP comes from flying, and only from flying.
 */
export const XP = {
  flight: 100,
  per50km: 1,
  newCountry: 40,
  newLanded: 20,
  newPlace: 3,
  newSpotted: 25,
  firstLine: 150,
  repeatLine: 30,
  sunEvent: 20,
  guess: 10
} as const;

export interface FlightXP {
  flightId: string;
  total: number;
  parts: Array<{ key: keyof typeof XP; xp: number; count: number }>;
}

/** XP per flight, in order, each flight credited only for what was new at the time. */
export function xpLedger(records: FlightRecord[]): FlightXP[] {
  const countries = new Set<string>();
  const landed = new Set<string>();
  const places = new Set<string>();
  const spotted = new Set<string>();
  const lines = new Set<string>();
  const out: FlightXP[] = [];

  for (const r of [...records].sort((a, b) => a.takeoffAt.localeCompare(b.takeoffAt))) {
    const parts: FlightXP['parts'] = [];
    const add = (key: keyof typeof XP, count: number) => {
      if (count > 0) parts.push({ key, count, xp: XP[key] * count });
    };
    add('flight', 1);
    add('per50km', Math.floor(r.distanceKm / 50));

    let c = 0;
    for (const cc of [...r.countries, r.fromCC, r.toCC]) if (cc && !countries.has(cc)) (countries.add(cc), c++);
    add('newCountry', c);
    let l = 0;
    for (const cc of [r.fromCC, r.toCC]) if (cc && !landed.has(cc)) (landed.add(cc), l++);
    add('newLanded', l);
    let p = 0;
    for (const x of r.passed) if (!places.has(x.id)) (places.add(x.id), p++);
    add('newPlace', p);
    let s = 0;
    for (const id of r.spotted) if (!spotted.has(id)) (spotted.add(id), s++);
    add('newSpotted', s);
    let first = 0;
    let repeat = 0;
    for (const line of r.lines) {
      if (lines.has(line)) repeat++;
      else (lines.add(line), first++);
    }
    add('firstLine', first);
    add('repeatLine', repeat);
    add('sunEvent', (r.sunrise ? 1 : 0) + (r.sunset ? 1 : 0));
    add('guess', r.guessed ?? 0);

    out.push({ flightId: r.flightId, total: parts.reduce((n, x) => n + x.xp, 0), parts });
  }
  return out;
}

export function totalXP(records: FlightRecord[]): number {
  return xpLedger(records).reduce((n, f) => n + f.total, 0);
}

/** XP to go from level n to n+1. Gentle at first: one flight lifts you out of level 1. */
export function xpForLevel(level: number): number {
  return 150 + (level - 1) * 125;
}

export function levelFromXP(xp: number): { level: number; into: number; span: number; progress: number } {
  let level = 1;
  let floor = 0;
  while (level < 99 && floor + xpForLevel(level) <= xp) {
    floor += xpForLevel(level);
    level++;
  }
  const span = xpForLevel(level);
  const into = xp - floor;
  return { level, into, span, progress: Math.min(1, into / span) };
}

export const RANKS = [
  { id: 'newcomer', minLevel: 1 },
  { id: 'traveler', minLevel: 4 },
  { id: 'explorer', minLevel: 10 },
  { id: 'pioneer', minLevel: 20 },
  { id: 'legend', minLevel: 35 }
] as const;

export type RankId = (typeof RANKS)[number]['id'];

export function rankFor(level: number): RankId {
  let id: RankId = 'newcomer';
  for (const r of RANKS) if (level >= r.minLevel) id = r.id;
  return id;
}
