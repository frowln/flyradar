import type { POICategory } from '@skyatlas/shared';
import type { GlobeLine } from '../geo/lines';

/**
 * One completed flight, as the passport remembers it.
 *
 * Everything the game shows — stamps, collections, levels, achievements — is
 * derived from these records and nothing else. There are no separate counters
 * that can drift out of step with what actually happened, and an achievement is
 * never unreachable because the field it reads was never written.
 */
export interface FlightRecord {
  flightId: string;
  flightNumber?: string;
  from: string;
  to: string;
  fromCC: string;
  toCC: string;
  /** Local date at the origin, YYYY-MM-DD. */
  date: string;
  takeoffAt: string;
  landedAt: string;
  distanceKm: number;
  airborneS: number;
  /** Countries overflown, in order. */
  countries: string[];
  lines: GlobeLine[];
  /** Every place the route passed within sight of. */
  passed: Array<{ id: string; cat: POICategory }>;
  /** Places the passenger confirmed with "I see it". */
  spotted: string[];
  /** Correct answers to "what is about to appear". */
  guessed?: number;
  night: boolean;
  sunrise: boolean;
  sunset: boolean;
  seat?: 'left' | 'right' | 'middle' | 'unknown';
}

export type CategoryTally = Partial<Record<POICategory, { passed: number; spotted: number }>>;

export interface Passport {
  flights: number;
  distanceKm: number;
  airborneS: number;
  longestS: number;
  countries: string[];
  landed: string[];
  continents: string[];
  airports: string[];
  lines: Partial<Record<GlobeLine, number>>;
  places: number;
  spotted: number;
  guessed: number;
  byCategory: CategoryTally;
  nightFlights: number;
  sunrises: number;
  sunsets: number;
}
