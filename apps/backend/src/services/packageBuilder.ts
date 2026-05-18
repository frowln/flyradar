import type { OfflinePackage } from '@skyatlas/shared';
import { getFlight } from './flightLookup.js';
import { buildRoute } from './routeBuilder.js';
import { aggregatePOIsForRoute } from './poiAggregator.js';

export async function buildPackage(
  flightNumber: string,
  date: string
): Promise<OfflinePackage | null> {
  const flight = await getFlight(flightNumber, date);
  if (!flight) return null;

  const durationMin = Math.round(
    (new Date(flight.scheduledArrival).getTime() -
     new Date(flight.scheduledDeparture).getTime()) / 60_000
  );

  const route = buildRoute(
    { lat: flight.origin.lat, lon: flight.origin.lon },
    { lat: flight.destination.lat, lon: flight.destination.lon },
    { points: 200, durationMinutes: durationMin }
  );

  const pois = await aggregatePOIsForRoute(route, 200);

  return {
    version: 1,
    flight,
    route,
    pois,
    generatedAt: new Date().toISOString()
  };
}
