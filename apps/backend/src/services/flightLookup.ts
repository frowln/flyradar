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
