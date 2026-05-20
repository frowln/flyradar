import type { OfflinePackage } from '@skyatlas/shared';

export interface Trip {
  id: string;
  /** Auto-generated display name, e.g. "US → DE" or "France trip" */
  name: string;
  flights: OfflinePackage[];
  startDate: string; // ISO — departure of first leg
  endDate: string;   // ISO — arrival of last leg
  totalDistanceKm: number;
  countries: string[];
}

const MAX_GAP_DAYS = 14;

/**
 * Groups a list of offline packages into trips.
 * Two consecutive flights belong to the same trip when the gap between
 * the arrival of the earlier flight and the departure of the later flight
 * is ≤ MAX_GAP_DAYS (14 days).
 */
export function groupIntoTrips(packages: OfflinePackage[]): Trip[] {
  if (packages.length === 0) return [];

  const sorted = [...packages].sort(
    (a, b) =>
      new Date(a.flight.scheduledDeparture).getTime() -
      new Date(b.flight.scheduledDeparture).getTime()
  );

  const trips: Trip[] = [];
  let currentGroup: OfflinePackage[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const prevArrival = new Date(prev.flight.scheduledArrival).getTime();
    const nextDeparture = new Date(sorted[i].flight.scheduledDeparture).getTime();
    const gapDays = (nextDeparture - prevArrival) / (1000 * 60 * 60 * 24);

    if (gapDays <= MAX_GAP_DAYS) {
      currentGroup.push(sorted[i]);
    } else {
      trips.push(makeTrip(currentGroup));
      currentGroup = [sorted[i]];
    }
  }

  trips.push(makeTrip(currentGroup));
  return trips;
}

function makeTrip(flights: OfflinePackage[]): Trip {
  const first = flights[0];
  const last = flights[flights.length - 1];

  // Collect unique countries preserving insertion order
  const countries = Array.from(
    new Set(
      flights.flatMap((p) => [p.flight.origin.country, p.flight.destination.country])
    )
  );

  const name =
    countries.length > 1
      ? `${first.flight.origin.iata} → ${last.flight.destination.iata}`
      : `${countries[0]} trip`;

  return {
    id: `trip-${first.flight.id}`,
    name,
    flights,
    startDate: first.flight.scheduledDeparture,
    endDate: last.flight.scheduledArrival,
    totalDistanceKm: 0, // populated by caller if route distance is available
    countries
  };
}
