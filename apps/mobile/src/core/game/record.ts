import type { OfflinePackage } from '@skyatlas/shared';
import type { FlightRecord } from './types';
import { distinctCountries } from '../places/countries';
import { lineCrossings } from '../geo/lines';
import { daylightFraction, computeMoments } from '../flight/moments';
import { routeLengthKm } from '../geo/greatCircle';
import { localDate } from '../time/zones';

/**
 * Turns a finished flight into a passport entry.
 *
 * "Passed" means the route went within sight of a place — true on every flight,
 * whatever the weather or seat — and is the silver tier of the collection.
 * "Spotted" is gold: the passenger said they saw it.
 */
export function recordFromFlight(
  pkg: OfflinePackage,
  session: { takeoffAt: Date; landedAt: Date; spotted: string[]; guesses?: Record<string, boolean>; elapsedS?: number }
): FlightRecord {
  const { flight, route } = pkg;
  const end = route[route.length - 1]?.elapsedSeconds ?? 0;
  // A flight ended early (the passenger closed it mid-air) only earns what it reached.
  const reached = Math.min(end, session.elapsedS ?? end);
  const moments = computeMoments({ route, pois: pkg.pois, countries: pkg.countries, takeoff: session.takeoffAt });

  const countries = distinctCountries((pkg.countries ?? []).filter((c) => c.enterAt <= reached));
  const passed = pkg.pois
    .filter((p) => (p.passAt ?? 0) <= reached)
    .map((p) => ({ id: p.id, cat: p.category }));

  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber || undefined,
    from: flight.origin.iata,
    to: flight.destination.iata,
    fromCC: flight.origin.country,
    toCC: reached >= end ? flight.destination.country : '',
    date: flight.localDate ?? localDate(new Date(flight.scheduledDeparture), flight.origin.tz),
    takeoffAt: session.takeoffAt.toISOString(),
    landedAt: session.landedAt.toISOString(),
    distanceKm: Math.round(routeLengthKm(route) * (end > 0 ? reached / end : 1)),
    airborneS: Math.round(reached),
    countries,
    lines: lineCrossings(route)
      .filter((c) => c.at <= reached)
      .map((c) => c.line),
    passed,
    spotted: session.spotted.filter((id) => passed.some((p) => p.id === id)),
    guessed: Object.entries(session.guesses ?? {}).filter(([id, ok]) => ok && passed.some((p) => p.id === id)).length,
    night: daylightFraction(route, session.takeoffAt) < 0.35,
    sunrise: moments.some((m) => m.kind === 'sunrise' && m.at <= reached),
    sunset: moments.some((m) => m.kind === 'sunset' && m.at <= reached),
    seat: pkg.seat?.side
  };
}
