import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/external/aviationstack.js', () => ({
  lookupFlight: vi.fn()
}));
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    flightCache: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    airport: {
      findUnique: vi.fn()
    }
  }
}));

import { getFlight } from '../src/services/flightLookup.js';
import { lookupFlight } from '../src/external/aviationstack.js';
import { prisma } from '../src/db/prisma.js';

const mockAviationFlight = {
  airline: { name: 'Aeroflot', iata: 'SU' },
  flight: { iata: 'SU100' },
  departure: { iata: 'SVO', scheduled: '2026-05-20T10:00:00+03:00' },
  arrival: { iata: 'JFK', scheduled: '2026-05-20T15:30:00-05:00' },
  aircraft: { iata: 'B77W' }
};

const mockSVO = {
  id: 1, iata: 'SVO', icao: 'UUEE', name: 'Sheremetyevo International Airport',
  city: 'Moscow', country: 'Russia', lat: 55.97, lon: 37.41, tz: 'Europe/Moscow'
};

const mockJFK = {
  id: 2, iata: 'JFK', icao: 'KJFK', name: 'John F Kennedy International Airport',
  city: 'New York', country: 'United States', lat: 40.64, lon: -73.78, tz: 'America/New_York'
};

beforeEach(() => vi.clearAllMocks());

describe('getFlight', () => {
  it('returns cached flight when available', async () => {
    const cachedFlight = { id: 'SU100-2026-05-20', flightNumber: 'SU100' };
    vi.mocked(prisma.flightCache.findUnique).mockResolvedValue({
      flightNumber: 'SU100',
      date: '2026-05-20',
      payload: cachedFlight as any,
      cachedAt: new Date()
    });

    const result = await getFlight('SU100', '2026-05-20');
    expect(result).toEqual(cachedFlight);
    expect(lookupFlight).not.toHaveBeenCalled();
  });

  it('fetches from API and caches when not cached', async () => {
    vi.mocked(prisma.flightCache.findUnique).mockResolvedValue(null);
    vi.mocked(lookupFlight).mockResolvedValue(mockAviationFlight);
    vi.mocked(prisma.airport.findUnique)
      .mockResolvedValueOnce(mockSVO as any)
      .mockResolvedValueOnce(mockJFK as any);
    vi.mocked(prisma.flightCache.create).mockResolvedValue({} as any);

    const result = await getFlight('SU100', '2026-05-20');

    expect(result).not.toBeNull();
    expect(result?.flightNumber).toBe('SU100');
    expect(result?.origin.iata).toBe('SVO');
    expect(result?.destination.iata).toBe('JFK');
    expect(result?.aircraftType).toBe('B77W');
    expect(prisma.flightCache.create).toHaveBeenCalled();
  });

  it('returns null when AviationStack returns nothing', async () => {
    vi.mocked(prisma.flightCache.findUnique).mockResolvedValue(null);
    vi.mocked(lookupFlight).mockResolvedValue(null);

    const result = await getFlight('XX999', '2026-05-20');
    expect(result).toBeNull();
  });

  it('returns null when airports not found in DB', async () => {
    vi.mocked(prisma.flightCache.findUnique).mockResolvedValue(null);
    vi.mocked(lookupFlight).mockResolvedValue(mockAviationFlight);
    vi.mocked(prisma.airport.findUnique).mockResolvedValue(null);

    const result = await getFlight('SU100', '2026-05-20');
    expect(result).toBeNull();
  });
});
