import type { Passport } from './types';
import { categoryCount } from './passport';

/**
 * Achievements, each a number reaching a target.
 *
 * Every one reads a field the passport actually computes, and every one can be
 * earned on real flights — the old list had ten that could not, because the
 * stats they checked were never recorded. Progress is always shown, so a locked
 * badge says how far away it is rather than just "locked".
 */

export type AchievementGroup = 'journey' | 'globe' | 'sky' | 'eyes';

export interface AchievementDef {
  id: string;
  group: AchievementGroup;
  target: number;
  value: (p: Passport) => number;
}

const km = (p: Passport) => Math.round(p.distanceKm);
const hours = (s: number) => s / 3600;

export const ACHIEVEMENTS: AchievementDef[] = [
  // The journey
  { id: 'first_flight', group: 'journey', target: 1, value: (p) => p.flights },
  { id: 'flights_10', group: 'journey', target: 10, value: (p) => p.flights },
  { id: 'flights_50', group: 'journey', target: 50, value: (p) => p.flights },
  { id: 'long_haul', group: 'journey', target: 8, value: (p) => hours(p.longestS) },
  { id: 'ultra_long', group: 'journey', target: 14, value: (p) => hours(p.longestS) },
  { id: 'around_world', group: 'journey', target: 40_075, value: km },
  { id: 'to_the_moon', group: 'journey', target: 384_400, value: km },

  // The globe
  { id: 'countries_5', group: 'globe', target: 5, value: (p) => p.countries.length },
  { id: 'countries_20', group: 'globe', target: 20, value: (p) => p.countries.length },
  { id: 'countries_50', group: 'globe', target: 50, value: (p) => p.countries.length },
  { id: 'continents_3', group: 'globe', target: 3, value: (p) => p.continents.length },
  { id: 'continents_6', group: 'globe', target: 6, value: (p) => p.continents.length },
  { id: 'equator', group: 'globe', target: 1, value: (p) => p.lines.equator ?? 0 },
  { id: 'dateline', group: 'globe', target: 1, value: (p) => p.lines.dateline ?? 0 },
  { id: 'polar_circle', group: 'globe', target: 1, value: (p) => (p.lines.arctic_circle ?? 0) + (p.lines.antarctic_circle ?? 0) },
  { id: 'tropics', group: 'globe', target: 1, value: (p) => (p.lines.tropic_cancer ?? 0) + (p.lines.tropic_capricorn ?? 0) },

  // The sky
  { id: 'sunrise', group: 'sky', target: 1, value: (p) => p.sunrises },
  { id: 'sunset', group: 'sky', target: 1, value: (p) => p.sunsets },
  { id: 'night_owl', group: 'sky', target: 5, value: (p) => p.nightFlights },

  // Your own eyes
  { id: 'spotted_1', group: 'eyes', target: 1, value: (p) => p.spotted },
  { id: 'spotted_25', group: 'eyes', target: 25, value: (p) => p.spotted },
  { id: 'guesser', group: 'eyes', target: 10, value: (p) => p.guessed },
  { id: 'peaks_10', group: 'eyes', target: 10, value: (p) => categoryCount(p, 'mountain', 'volcano') },
  { id: 'volcano', group: 'eyes', target: 1, value: (p) => categoryCount(p, 'volcano') },
  { id: 'ranges_5', group: 'eyes', target: 5, value: (p) => categoryCount(p, 'range') },
  { id: 'seas_10', group: 'eyes', target: 10, value: (p) => categoryCount(p, 'sea') },
  { id: 'deserts_3', group: 'eyes', target: 3, value: (p) => categoryCount(p, 'desert') },
  { id: 'lakes_10', group: 'eyes', target: 10, value: (p) => categoryCount(p, 'lake') },
  { id: 'islands_10', group: 'eyes', target: 10, value: (p) => categoryCount(p, 'island') },
  { id: 'cities_50', group: 'eyes', target: 50, value: (p) => categoryCount(p, 'city') }
];

export interface AchievementState {
  def: AchievementDef;
  value: number;
  earned: boolean;
  /** 0–1. */
  progress: number;
}

export function achievementStates(p: Passport): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const value = def.value(p);
    return { def, value, earned: value >= def.target, progress: Math.min(1, value / def.target) };
  });
}

/** Achievements earned by `after` that `before` did not have. */
export function newlyEarned(before: Passport, after: Passport): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => a.value(after) >= a.target && a.value(before) < a.target);
}
