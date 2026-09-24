import type { Flight, FlightTrack } from '@skyatlas/shared';
import { apiClient, API_ENABLED } from './client';
import type { CloudQuery, CloudReading } from '../flight/clouds';
import { formatClock, localDate } from '../time/zones';

/**
 * Flight data from the server: lookup by number, last week's real track, and
 * the cloud forecast along a route.
 *
 * All of it is optional. Without a configured server, or without signal, each
 * call resolves to null and the flight is prepared from bundled data exactly
 * as before — nothing here may throw into a screen.
 */

/** "su 1234" → "SU1234"; null when it cannot be a flight number. */
export function normaliseFlightNumber(value: string): string | null {
  const n = value.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(n) ? n : null;
}

async function quiet<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  if (!API_ENABLED) return null;
  try {
    return await fn();
  } catch (e) {
    // A 404 is an answer ("no such flight"), everything else an outage; either
    // way the caller carries on without. Development still sees why.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.info(`[flights] ${what} unavailable:`, e instanceof Error ? e.message : e);
    }
    return null;
  }
}

/**
 * A flight by number on a local departure date (YYYY-MM-DD): airports, local
 * times with offsets, aircraft, status. Null when unknown or unreachable.
 */
export function lookupFlight(number: string, date: string): Promise<Flight | null> {
  const flightNumber = normaliseFlightNumber(number);
  if (!flightNumber || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.resolve(null);
  return quiet('lookup', async () => {
    const f = await apiClient.post<Flight>('/flights/lookup', { flightNumber, date });
    return f?.origin?.iata && f.destination?.iata && f.scheduledDeparture ? f : null;
  });
}

/**
 * What the add-flight form needs from a looked-up flight: airport codes and
 * the ticket's local times at each end.
 */
export function formFromFlight(f: Flight): {
  fromIata: string;
  toIata: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
} {
  const dep = new Date(f.scheduledDeparture);
  const arr = new Date(f.scheduledArrival);
  return {
    fromIata: f.origin.iata,
    toIata: f.destination.iata,
    date: f.localDate ?? localDate(dep, f.origin.tz),
    departureTime: formatClock(dep, f.origin.tz),
    arrivalTime: formatClock(arr, f.destination.tz)
  };
}

/** The path this flight number flew most recently (within a week), or null. */
export function fetchTrack(number: string): Promise<FlightTrack | null> {
  const flightNumber = normaliseFlightNumber(number);
  if (!flightNumber) return Promise.resolve(null);
  return quiet('track', async () => {
    const t = await apiClient.get<FlightTrack>(`/flights/track?number=${encodeURIComponent(flightNumber)}`);
    return Array.isArray(t?.points) && t.points.length >= 2 ? t : null;
  });
}

/** Cloud cover at up to 60 points along a route; null unless every point was answered. */
export function fetchClouds(points: CloudQuery[]): Promise<CloudReading[] | null> {
  if (!points.length || points.length > 60) return Promise.resolve(null);
  return quiet('clouds', async () => {
    const r = await apiClient.post<{ points: CloudReading[] }>('/weather/clouds', { points });
    return Array.isArray(r?.points) && r.points.length === points.length ? r.points : null;
  });
}
