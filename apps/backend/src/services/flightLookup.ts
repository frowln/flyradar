import { prisma } from '../db/prisma.js';
import { lookupFlight } from '../external/aviationstack.js';
import type { Flight } from '@skyatlas/shared';

export async function getFlight(
  flightNumber: string,
  date: string
): Promise<Flight | null> {
  // Check cache first
  const cached = await prisma.flightCache.findUnique({
    where: { flightNumber_date: { flightNumber, date } }
  });
  if (cached) return cached.payload as unknown as Flight;

  // Demo mode: if no API key, build a flight from a hardcoded route
  if (!process.env['AVIATIONSTACK_KEY']) {
    return buildDemoFlight(flightNumber, date);
  }

  // Lookup from AviationStack
  const raw = await lookupFlight(flightNumber, date);
  if (!raw) return null;

  // Find airports in our DB
  const [origin, destination] = await Promise.all([
    prisma.airport.findUnique({ where: { iata: raw.departure.iata } }),
    prisma.airport.findUnique({ where: { iata: raw.arrival.iata } })
  ]);
  if (!origin || !destination) return null;

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

  // Cache for future requests
  await prisma.flightCache.create({
    data: {
      flightNumber,
      date,
      payload: flight as any
    }
  });

  return flight;
}

const DEMO_ROUTES = [
  ['SVO', 'JFK', 600],
  ['SVO', 'DXB', 320],
  ['LHR', 'CDG', 80],
  ['JFK', 'LAX', 350],
  ['DXB', 'SIN', 460],
];

async function buildDemoFlight(flightNumber: string, date: string): Promise<Flight | null> {
  const [originIata, destIata, durationMin] =
    DEMO_ROUTES[Math.abs(hashCode(flightNumber)) % DEMO_ROUTES.length];

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
    airline: 'Demo Airlines',
    origin: stripAirport(origin),
    destination: stripAirport(destination),
    scheduledDeparture: departure.toISOString(),
    scheduledArrival: arrival.toISOString(),
    aircraftType: 'B77W'
  };

  await prisma.flightCache.create({
    data: { flightNumber, date, payload: flight as any }
  });

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
