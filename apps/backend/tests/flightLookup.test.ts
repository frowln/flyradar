import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/external/aviationstack.js', () => ({
  lookupFlightDetailed: vi.fn()
}));
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    flightCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn()
    },
    airport: {
      findUnique: vi.fn()
    }
  }
}));

import { getFlight, getFlightDetailed } from '../src/services/flightLookup.js';
import { lookupFlightDetailed } from '../src/external/aviationstack.js';
import { prisma } from '../src/db/prisma.js';

const mockAviationFlight = {
  flight_date: '2026-05-20',
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

const airportByIata = (iata: string) =>
  ({ SVO: mockSVO, JFK: mockJFK } as Record<string, unknown>)[iata] ?? null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.flightCache.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.flightCache.upsert).mockResolvedValue({} as any);
  vi.mocked(prisma.airport.findUnique).mockImplementation(
    (async (args: { where: { iata: string } }) => airportByIata(args.where.iata)) as any
  );
});

afterEach(() => vi.unstubAllEnvs());

describe('getFlight with an AviationStack key', () => {
  beforeEach(() => vi.stubEnv('AVIATIONSTACK_KEY', 'test-key'));

  it('returns a cached flight without asking the provider', async () => {
    const cachedFlight = { id: 'SU100-2026-05-20', flightNumber: 'SU100', airline: 'Aeroflot' };
    vi.mocked(prisma.flightCache.findUnique).mockResolvedValue({
      flightNumber: 'SU100',
      date: '2026-05-20',
      payload: cachedFlight as any,
      cachedAt: new Date()
    });

    const result = await getFlight('SU100', '2026-05-20');
    expect(result).toEqual(cachedFlight);
    expect(lookupFlightDetailed).not.toHaveBeenCalled();
  });

  it('fetches from the provider and caches the real flight', async () => {
    vi.mocked(lookupFlightDetailed).mockResolvedValue({
      flight: mockAviationFlight,
      availableDates: ['2026-05-20']
    });

    const result = await getFlightDetailed('SU100', '2026-05-20');

    expect(lookupFlightDetailed).toHaveBeenCalledWith('SU100', '2026-05-20');
    expect(result.flight?.airline).toBe('Aeroflot');
    expect(result.flight?.origin.iata).toBe('SVO');
    expect(result.flight?.destination.iata).toBe('JFK');
    expect(result.flight?.aircraftType).toBe('B77W');
    expect(result.availableDates).toEqual(['2026-05-20']);
    expect(prisma.flightCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flightNumber_date: { flightNumber: 'SU100', date: '2026-05-20' } }
      })
    );
  });

  it('still answers when the cache write fails', async () => {
    vi.mocked(lookupFlightDetailed).mockResolvedValue({ flight: mockAviationFlight, availableDates: [] });
    vi.mocked(prisma.flightCache.upsert).mockRejectedValue(new Error('read-only'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await getFlight('SU100', '2026-05-20'))?.origin.iata).toBe('SVO');
    warn.mockRestore();
  });

  it('ignores a demo flight cached before demo flights stopped being stored', async () => {
    vi.mocked(prisma.flightCache.findUnique).mockResolvedValue({
      flightNumber: 'SU100',
      date: '2026-05-20',
      payload: { id: 'SU100-2026-05-20', airline: 'Demo Airlines' } as any,
      cachedAt: new Date()
    });
    vi.mocked(lookupFlightDetailed).mockResolvedValue({ flight: mockAviationFlight, availableDates: [] });

    const result = await getFlight('SU100', '2026-05-20');
    expect(result?.airline).toBe('Aeroflot');
    expect(lookupFlightDetailed).toHaveBeenCalled();
  });

  it('reports the provider refusing, with the dates it does have', async () => {
    vi.mocked(lookupFlightDetailed).mockResolvedValue({
      flight: null,
      availableDates: ['2026-05-18'],
      error: 'usage_limit_reached'
    });

    const result = await getFlightDetailed('XX999', '2026-05-20');
    expect(result).toEqual({
      flight: null,
      availableDates: ['2026-05-18'],
      providerError: 'usage_limit_reached'
    });
    expect(prisma.flightCache.upsert).not.toHaveBeenCalled();
  });

  it('says which airport is missing rather than returning an unknown flight', async () => {
    vi.mocked(lookupFlightDetailed).mockResolvedValue({ flight: mockAviationFlight, availableDates: [] });
    vi.mocked(prisma.airport.findUnique).mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getFlightDetailed('SU100', '2026-05-20');
    expect(result.flight).toBeNull();
    expect(result.providerError).toBe('unknown_airport');
    warn.mockRestore();
  });
});

describe('getFlight without an AviationStack key (demo mode)', () => {
  beforeEach(() => vi.stubEnv('AVIATIONSTACK_KEY', ''));

  it('builds a flight on a plausible route without calling the provider', async () => {
    const flight = await getFlight('SU100', '2026-05-20');

    expect(lookupFlightDetailed).not.toHaveBeenCalled();
    expect(flight?.airline).toBe('Demo Airlines');
    expect(flight?.origin.iata).toBe('SVO');
    expect(flight?.destination.iata).toBe('JFK');
    expect(flight?.scheduledDeparture).toBe('2026-05-20T10:00:00.000Z');
  });

  it('never stores a demo flight in the flight cache', async () => {
    await getFlight('SU100', '2026-05-20');
    expect(prisma.flightCache.upsert).not.toHaveBeenCalled();
    expect(prisma.flightCache.create).not.toHaveBeenCalled();
  });

  it('returns null when the demo route airports are not seeded', async () => {
    vi.mocked(prisma.airport.findUnique).mockResolvedValue(null);
    expect(await getFlight('SU100', '2026-05-20')).toBeNull();
  });
});
