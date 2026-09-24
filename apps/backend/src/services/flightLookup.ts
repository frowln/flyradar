import { prisma } from '../db/prisma.js';
import { lookupFlightDetailed } from '../external/aviationstack.js';
import type { Flight } from '@skyatlas/shared';

export interface FlightResult {
  flight: Flight | null;
  /**
   * Dates the provider does have for this flight number.
   *
   * The free AviationStack plan only carries the last few days, so a passenger
   * adding next week's flight gets nothing back. Reporting the dates that exist
   * separates "we have never heard of this flight" from "we have this flight,
   * just not that far ahead" — which the app can then say out loud instead of
   * looking broken.
   */
  availableDates: string[];
  /** Why the provider gave nothing, when it was the provider's doing. */
  providerError?: string;
}

/**
 * Marks a flight invented by demo mode. Such flights are never written to
 * FlightCache — once a key is configured, a cached demo route would otherwise
 * keep answering for the real flight number. Rows written before that rule are
 * skipped by the same marker.
 */
const DEMO_AIRLINE = 'Demo Airlines';

export async function getFlightDetailed(
  flightNumber: string,
  date: string
): Promise<FlightResult> {
  // Check cache first
  const cached = await prisma.flightCache.findUnique({
    where: { flightNumber_date: { flightNumber, date } }
  });
  const cachedFlight = cached?.payload as unknown as Flight | undefined;
  if (cachedFlight && cachedFlight.airline !== DEMO_AIRLINE) {
    return { flight: cachedFlight, availableDates: [date] };
  }

  // Demo mode: if no API key, build a flight from a hardcoded route
  if (!process.env['AVIATIONSTACK_KEY']) {
    return { flight: await buildDemoFlight(flightNumber, date), availableDates: [] };
  }

  // Lookup from AviationStack
  const { flight: raw, availableDates, error } = await lookupFlightDetailed(flightNumber, date);
  if (!raw) return { flight: null, availableDates, providerError: error };

  // Find airports in our DB
  const [origin, destination] = await Promise.all([
    prisma.airport.findUnique({ where: { iata: raw.departure.iata } }),
    prisma.airport.findUnique({ where: { iata: raw.arrival.iata } })
  ]);
  // An empty Airport table looks exactly like an unknown flight from here, and
  // did for weeks. Say which code was missing.
  if (!origin || !destination) {
    console.warn(
      `Airport not in database: ${!origin ? raw.departure.iata : ''}${!destination ? ` ${raw.arrival.iata}` : ''}` +
        ' — run scripts/seed-airports.mjs'
    );
    return { flight: null, availableDates, providerError: 'unknown_airport' };
  }

  const flight: Flight = {
    id: `${flightNumber}-${date}`,
    flightNumber,
    airline: raw.airline.name,
    origin: {
      iata: origin.iata,
      icao: origin.icao ?? '',
      name: origin.name,
      city: origin.city,
      country: origin.country,
      lat: origin.lat,
      lon: origin.lon,
      tz: origin.tz
    },
    destination: {
      iata: destination.iata,
      icao: destination.icao ?? '',
      name: destination.name,
      city: destination.city,
      country: destination.country,
      lat: destination.lat,
      lon: destination.lon,
      tz: destination.tz
    },
    scheduledDeparture: raw.departure.scheduled,
    scheduledArrival: raw.arrival.scheduled,
    actualDeparture: raw.departure.actual,
    aircraftType: raw.aircraft?.iata
  };

  // Cache for future requests. An upsert, because two passengers looking up
  // the same flight at once both miss the cache and both write; and a failed
  // write costs a future lookup, not this one.
  try {
    await prisma.flightCache.upsert({
      where: { flightNumber_date: { flightNumber, date } },
      create: { flightNumber, date, payload: flight as any },
      update: { payload: flight as any, cachedAt: new Date() }
    });
  } catch (e) {
    console.warn('FlightCache write failed:', e instanceof Error ? e.message : e);
  }

  return { flight, availableDates };
}

/** The flight alone, for callers that have nothing to say about why it is missing. */
export async function getFlight(flightNumber: string, date: string): Promise<Flight | null> {
  return (await getFlightDetailed(flightNumber, date)).flight;
}

// Real-world IATA carrier prefixes → their primary hub airport.
// Used so that demo routes for known flight numbers (SU100, BA117, LH400...)
// originate from a plausible airport instead of being random.
const CARRIER_HUBS: Record<string, string> = {
  SU: 'SVO', BA: 'LHR', LH: 'FRA', EK: 'DXB', QR: 'DOH', TK: 'IST',
  AA: 'JFK', UA: 'SFO', DL: 'JFK', AF: 'CDG', KL: 'AMS', QF: 'SYD',
  SQ: 'SIN', JL: 'HND', NH: 'HND', CX: 'HKG', AC: 'YYZ', IB: 'MAD'
};

const DEMO_ROUTES: Array<[string, string, number]> = [
  ['SVO', 'JFK', 600], ['SVO', 'DXB', 320],
  ['LHR', 'JFK', 460], ['LHR', 'CDG', 80],  ['LHR', 'DXB', 420],
  ['FRA', 'JFK', 510], ['FRA', 'LAX', 720],
  ['DXB', 'SIN', 460], ['DXB', 'JFK', 800],
  ['DOH', 'JFK', 800],
  ['IST', 'JFK', 660],
  ['JFK', 'LAX', 350], ['JFK', 'LHR', 420],
  ['SFO', 'LHR', 600],
  ['CDG', 'JFK', 470],
  ['AMS', 'JFK', 460],
  ['SYD', 'LAX', 850],
  ['SIN', 'LAX', 1080],
  ['HND', 'LAX', 660],
  ['HKG', 'LAX', 780],
  ['YYZ', 'LHR', 420],
  ['MAD', 'JFK', 460]
];

// Famous real-world flight numbers — pinned to their actual routes for
// authentic demos. Any flight number not listed here falls back to the
// carrier-hub heuristic below.
const KNOWN_FLIGHTS: Record<string, [string, string, number]> = {
  SU100: ['SVO', 'JFK', 600], SU101: ['JFK', 'SVO', 600],
  SU102: ['SVO', 'JFK', 600], SU103: ['JFK', 'SVO', 600],
  SU106: ['SVO', 'LAX', 720], SU107: ['LAX', 'SVO', 720],
  BA117: ['LHR', 'JFK', 460], BA118: ['JFK', 'LHR', 420],
  BA249: ['LHR', 'GRU', 720],
  LH400: ['FRA', 'JFK', 510], LH401: ['JFK', 'FRA', 510],
  EK201: ['DXB', 'JFK', 800], EK202: ['JFK', 'DXB', 770],
  EK241: ['DXB', 'BOS', 760],
  QR701: ['DOH', 'JFK', 800],
  TK1: ['IST', 'JFK', 660], TK2: ['JFK', 'IST', 600],
  AA100: ['JFK', 'LHR', 420], AA101: ['LHR', 'JFK', 460],
  UA1: ['SFO', 'SIN', 1020],
  DL1: ['JFK', 'CDG', 470], DL2: ['CDG', 'JFK', 470],
  AF7: ['CDG', 'JFK', 470], AF11: ['CDG', 'JFK', 470],
  KL643: ['AMS', 'JFK', 460],
  QF1: ['SYD', 'LHR', 1380], QF11: ['SYD', 'LAX', 850],
  SQ21: ['SIN', 'EWR', 1140], SQ22: ['EWR', 'SIN', 1140],
  JL5: ['HND', 'LAX', 660], NH8: ['HND', 'LAX', 660]
};

async function buildDemoFlight(flightNumber: string, date: string): Promise<Flight | null> {
  let originIata: string, destIata: string, durationMin: number;
  const pinned = KNOWN_FLIGHTS[flightNumber.toUpperCase()];
  if (pinned) {
    [originIata, destIata, durationMin] = pinned;
  } else {
    const prefix = flightNumber.match(/^[A-Z]+/)?.[0] ?? '';
    const hub = CARRIER_HUBS[prefix];
    const candidates = hub
      ? DEMO_ROUTES.filter(([origin]) => origin === hub)
      : DEMO_ROUTES;
    const pool = candidates.length > 0 ? candidates : DEMO_ROUTES;
    [originIata, destIata, durationMin] =
      pool[Math.abs(hashCode(flightNumber)) % pool.length];
  }

  const [origin, destination] = await Promise.all([
    prisma.airport.findUnique({ where: { iata: originIata as string } }),
    prisma.airport.findUnique({ where: { iata: destIata as string } })
  ]);
  if (!origin || !destination) return null;

  const departure = new Date(`${date}T10:00:00Z`);
  const arrival = new Date(departure.getTime() + (durationMin as number) * 60_000);

  const flight: Flight = {
    id: `${flightNumber}-${date}`,
    flightNumber,
    airline: DEMO_AIRLINE,
    origin: stripAirport(origin),
    destination: stripAirport(destination),
    scheduledDeparture: departure.toISOString(),
    scheduledArrival: arrival.toISOString(),
    aircraftType: 'B77W'
  };

  // Deliberately not cached: two airport reads are cheap, and see DEMO_AIRLINE.
  return flight;
}

function stripAirport(a: any) {
  return {
    iata: a.iata, icao: a.icao ?? '', name: a.name, city: a.city,
    country: a.country, lat: a.lat, lon: a.lon, tz: a.tz
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return h;
}
