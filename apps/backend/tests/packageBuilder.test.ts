import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/flightLookup.js', () => ({
  getFlight: vi.fn()
}));
vi.mock('../src/services/routeBuilder.js', () => ({
  buildRoute: vi.fn()
}));
vi.mock('../src/services/poiAggregator.js', () => ({
  aggregatePOIsForRoute: vi.fn()
}));

import { buildPackage } from '../src/services/packageBuilder.js';
import { getFlight } from '../src/services/flightLookup.js';
import { buildRoute } from '../src/services/routeBuilder.js';
import { aggregatePOIsForRoute } from '../src/services/poiAggregator.js';

const mockFlight = {
  id: 'SU100-2026-05-20',
  flightNumber: 'SU100',
  airline: 'Aeroflot',
  origin: { iata: 'SVO', icao: 'UUEE', name: 'Sheremetyevo', city: 'Moscow', country: 'Russia', lat: 55.97, lon: 37.41, tz: 'Europe/Moscow' },
  destination: { iata: 'JFK', icao: 'KJFK', name: 'JFK Airport', city: 'New York', country: 'USA', lat: 40.64, lon: -73.78, tz: 'America/New_York' },
  scheduledDeparture: '2026-05-20T10:00:00Z',
  scheduledArrival: '2026-05-20T20:00:00Z'
};

const mockRoute = [{ lat: 55.97, lon: 37.41, altitude: 0, elapsedSeconds: 0 }];
const mockPois = [{ id: 'gn-1', name: 'Helsinki', category: 'city' as const, lat: 60.17, lon: 24.94, summary: 'Capital of Finland.', facts: ['Fact 1'], photos: [] }];

beforeEach(() => vi.clearAllMocks());

describe('buildPackage', () => {
  it('assembles a complete offline package', async () => {
    vi.mocked(getFlight).mockResolvedValue(mockFlight as any);
    vi.mocked(buildRoute).mockReturnValue(mockRoute as any);
    vi.mocked(aggregatePOIsForRoute).mockResolvedValue(mockPois as any);

    const pkg = await buildPackage('SU100', '2026-05-20');

    expect(pkg).not.toBeNull();
    expect(pkg?.version).toBe(1);
    expect(pkg?.flight.flightNumber).toBe('SU100');
    expect(pkg?.route).toEqual(mockRoute);
    expect(pkg?.pois).toEqual(mockPois);
    expect(pkg?.generatedAt).toBeTruthy();
  });

  it('calculates duration from scheduled times', async () => {
    vi.mocked(getFlight).mockResolvedValue(mockFlight as any);
    vi.mocked(buildRoute).mockReturnValue(mockRoute as any);
    vi.mocked(aggregatePOIsForRoute).mockResolvedValue([]);

    await buildPackage('SU100', '2026-05-20');

    expect(buildRoute).toHaveBeenCalledWith(
      { lat: 55.97, lon: 37.41 },
      { lat: 40.64, lon: -73.78 },
      { points: 200, durationMinutes: 600 }
    );
  });

  it('returns null when flight not found', async () => {
    vi.mocked(getFlight).mockResolvedValue(null);
    const pkg = await buildPackage('XX999', '2026-05-20');
    expect(pkg).toBeNull();
  });
});
