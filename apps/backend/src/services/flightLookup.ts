import { prisma } from '../db/prisma.js';
import { lookupFlightDetailed, type AviationStackFlight } from '../external/aviationstack.js';
import { lookupAeroDataBox } from '../external/aerodatabox.js';
import { isTransient } from '../external/http.js';
import type { Airport, Flight, FlightStatus } from '@skyatlas/shared';

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

export type FlightProvider = 'aerodatabox' | 'aviationstack' | 'demo';

/** AeroDataBox when its key is set, else AviationStack, else invented flights. */
export function flightProvider(env: NodeJS.ProcessEnv = process.env): FlightProvider {
  if (env['AERODATABOX_KEY']) return 'aerodatabox';
  if (env['AVIATIONSTACK_KEY']) return 'aviationstack';
  return 'demo';
}

const DAY_MS = 86_400_000;

/**
 * How long a cached flight stays true.
 *
 * On the day itself gates, delays and status move by the minute, and "today"
 * spans a day either side somewhere on Earth. A schedule days ahead moves
 * rarely. A flight that has flown will not change again.
 */
export function flightCacheTtlMs(date: string, now = Date.now()): number {
  const day = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  const ahead = Math.round((day - today) / DAY_MS);
  if (ahead < -1) return Infinity;
  if (ahead <= 1) return 15 * 60_000;
  return 24 * 3600_000;
}

export async function getFlightDetailed(
  flightNumber: string,
  date: string
): Promise<FlightResult> {
  const cached = await prisma.flightCache.findUnique({
    where: { flightNumber_date: { flightNumber, date } }
  });
  const payload = cached?.payload as unknown as Flight | undefined;
  const known = payload && payload.airline !== DEMO_AIRLINE ? payload : undefined;
  if (known && Date.now() - new Date(cached!.cachedAt).getTime() < flightCacheTtlMs(date)) {
    return { flight: known, availableDates: [date] };
  }

  const provider = flightProvider();
  if (provider === 'demo') {
    // A real flight looked up while a key was configured is still real.
    if (known) return { flight: known, availableDates: [date] };
    return { flight: await buildDemoFlight(flightNumber, date), availableDates: [] };
  }

  const found =
    provider === 'aerodatabox'
      ? await fromAeroDataBox(flightNumber, date)
      : await fromAviationStack(flightNumber, date);
  if (!found.flight) {
    // A provider that is down or over quota should not take away a flight we
    // already know; an older answer beats none.
    if (known && isTransient(found.providerError)) return { flight: known, availableDates: [date] };
    return found;
  }

  // An upsert, because two passengers looking up the same flight at once both
  // miss the cache and both write; and a failed write costs a future lookup,
  // not this one.
  try {
    await prisma.flightCache.upsert({
      where: { flightNumber_date: { flightNumber, date } },
      create: { flightNumber, date, payload: found.flight as any },
      update: { payload: found.flight as any, cachedAt: new Date() }
    });
  } catch (e) {
    console.warn('FlightCache write failed:', e instanceof Error ? e.message : e);
  }
  return found;
}

async function findAirport(iata: string): Promise<Airport | null> {
  const row = await prisma.airport.findUnique({ where: { iata } });
  return row ? stripAirport(row) : null;
}

/** An empty Airport table looks exactly like an unknown flight; say which code was missing. */
function missingAirports(a: string | null, b: string | null): FlightResult {
  console.warn(`Airport not in database: ${[a, b].filter(Boolean).join(' ')} — run scripts/seed-airports.mjs`);
  return { flight: null, availableDates: [], providerError: 'unknown_airport' };
}

async function fromAeroDataBox(flightNumber: string, date: string): Promise<FlightResult> {
  const { flight: raw, error } = await lookupAeroDataBox(flightNumber, date);
  if (!raw) return { flight: null, availableDates: [], ...(error ? { providerError: error } : {}) };

  // Our table first, so a flight reads the same whichever provider found it;
  // the provider's own record covers airports the table lacks.
  const [dbOrigin, dbDestination] = await Promise.all([
    findAirport(raw.originIata),
    findAirport(raw.destinationIata)
  ]);
  const origin = dbOrigin ?? raw.origin;
  const destination = dbDestination ?? raw.destination;
  if (!origin || !destination) {
    return missingAirports(origin ? null : raw.originIata, destination ? null : raw.destinationIata);
  }

  const flight: Flight = {
    id: `${flightNumber}-${date}`,
    flightNumber,
    airline: raw.airline,
    origin,
    destination,
    scheduledDeparture: raw.scheduledDeparture,
    scheduledArrival: raw.scheduledArrival,
    localDate: date,
    status: raw.status,
    ...(raw.revisedDeparture ? { revisedDeparture: raw.revisedDeparture } : {}),
    ...(raw.revisedArrival ? { revisedArrival: raw.revisedArrival } : {}),
    ...(raw.actualDeparture ? { actualDeparture: raw.actualDeparture } : {}),
    ...(raw.aircraftType ? { aircraftType: raw.aircraftType } : {})
  };
  return { flight, availableDates: [date] };
}

const AVIATIONSTACK_STATUS: Record<string, FlightStatus> = {
  scheduled: 'scheduled',
  active: 'departed',
  landed: 'landed',
  cancelled: 'cancelled',
  diverted: 'diverted'
};

async function fromAviationStack(flightNumber: string, date: string): Promise<FlightResult> {
  const { flight: raw, availableDates, error } = await lookupFlightDetailed(flightNumber, date);
  if (!raw) return { flight: null, availableDates, providerError: error };

  const [origin, destination] = await Promise.all([
    findAirport(raw.departure.iata),
    findAirport(raw.arrival.iata)
  ]);
  if (!origin || !destination) {
    const result = missingAirports(origin ? null : raw.departure.iata, destination ? null : raw.arrival.iata);
    return { ...result, availableDates };
  }

  const flight: Flight = {
    id: `${flightNumber}-${date}`,
    flightNumber,
    airline: raw.airline.name,
    origin,
    destination,
    scheduledDeparture: raw.departure.scheduled,
    scheduledArrival: raw.arrival.scheduled,
    actualDeparture: raw.departure.actual,
    aircraftType: raw.aircraft?.iata,
    localDate: date,
    status: statusFromAviationStack(raw)
  };
  return { flight, availableDates };
}

function statusFromAviationStack(raw: AviationStackFlight): FlightStatus {
  return (raw.flight_status && AVIATIONSTACK_STATUS[raw.flight_status]) || 'unknown';
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
