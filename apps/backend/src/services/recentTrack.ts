import { cached } from '../cache/remember.js';
import { fetchRecentTrack, type TrackLookup } from '../external/fr24.js';

const FOUND_TTL_S = 24 * 3600;
/** Nothing flown this week: a new route may start any day, so ask again sooner. */
const NONE_TTL_S = 6 * 3600;

/**
 * The recent track for a flight number, at most one provider call per number
 * per day however many passengers ask. Failures are not kept.
 */
export function getRecentTrack(flightNumber: string): Promise<TrackLookup> {
  const number = flightNumber.toUpperCase();
  return cached(`track:${number}`, async () => {
    const found = await fetchRecentTrack(number);
    return { value: found, ttlSec: found.error ? 0 : found.track ? FOUND_TTL_S : NONE_TTL_S };
  });
}
