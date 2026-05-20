import type { OfflinePackage, POI, POITranslation } from '@skyatlas/shared';
import { getFlight } from './flightLookup.js';
import { buildRoute } from './routeBuilder.js';
import { aggregatePOIsForRoute } from './poiAggregator.js';

function applyLocale(poi: POI, locale: string): POI {
  if (locale === 'en') return poi;
  const t = poi.translations?.[locale as keyof typeof poi.translations] as POITranslation | undefined;
  if (!t) return poi;
  return { ...poi, name: t.name, summary: t.summary, facts: t.facts };
}

export async function buildPackage(
  flightNumber: string,
  date: string,
  locale = 'en'
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

  const pois = await aggregatePOIsForRoute(route, 200, locale);
  const localizedPois = pois.map(p => applyLocale(p, locale));

  return {
    version: 1,
    flight,
    route,
    pois: localizedPois,
    generatedAt: new Date().toISOString()
  };
}
