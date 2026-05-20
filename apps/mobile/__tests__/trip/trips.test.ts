import { describe, it, expect } from 'vitest';
import { groupIntoTrips } from '../../src/core/trip/trips';
import type { OfflinePackage } from '@skyatlas/shared';

function makePkg(
  id: string,
  departure: string,
  arrival: string,
  originCountry = 'US',
  destCountry = 'DE'
): OfflinePackage {
  return {
    version: 1,
    flight: {
      id,
      flightNumber: `FL${id}`,
      airline: 'Test Air',
      origin: { iata: 'SFO', icao: 'KSFO', name: 'SFO', city: 'San Francisco', country: originCountry, lat: 37.6, lon: -122.4, tz: 'America/Los_Angeles' },
      destination: { iata: 'FRA', icao: 'EDDF', name: 'Frankfurt', city: 'Frankfurt', country: destCountry, lat: 50.0, lon: 8.6, tz: 'Europe/Berlin' },
      scheduledDeparture: departure,
      scheduledArrival: arrival
    },
    route: [],
    pois: [],
    generatedAt: departure
  };
}

describe('groupIntoTrips', () => {
  it('returns empty array for empty input', () => {
    expect(groupIntoTrips([])).toEqual([]);
  });

  it('wraps a single flight in one trip', () => {
    const pkg = makePkg('1', '2026-01-01T08:00:00Z', '2026-01-01T18:00:00Z');
    const trips = groupIntoTrips([pkg]);
    expect(trips).toHaveLength(1);
    expect(trips[0].flights).toHaveLength(1);
  });

  it('groups two flights within 14 days into one trip', () => {
    const p1 = makePkg('1', '2026-01-01T08:00:00Z', '2026-01-01T18:00:00Z');
    const p2 = makePkg('2', '2026-01-10T08:00:00Z', '2026-01-10T20:00:00Z');
    const trips = groupIntoTrips([p1, p2]);
    expect(trips).toHaveLength(1);
    expect(trips[0].flights).toHaveLength(2);
  });

  it('splits flights more than 14 days apart into separate trips', () => {
    const p1 = makePkg('1', '2026-01-01T08:00:00Z', '2026-01-01T18:00:00Z');
    const p2 = makePkg('2', '2026-02-01T08:00:00Z', '2026-02-01T20:00:00Z');
    const trips = groupIntoTrips([p1, p2]);
    expect(trips).toHaveLength(2);
  });

  it('groups three consecutive legs into one trip', () => {
    const p1 = makePkg('1', '2026-03-01T08:00:00Z', '2026-03-01T12:00:00Z');
    const p2 = makePkg('2', '2026-03-02T08:00:00Z', '2026-03-02T14:00:00Z');
    const p3 = makePkg('3', '2026-03-05T08:00:00Z', '2026-03-05T16:00:00Z');
    const trips = groupIntoTrips([p1, p2, p3]);
    expect(trips).toHaveLength(1);
    expect(trips[0].flights).toHaveLength(3);
  });

  it('generates a name with IATA codes for multi-country trip', () => {
    const p1 = makePkg('1', '2026-03-01T08:00:00Z', '2026-03-01T12:00:00Z', 'US', 'DE');
    const p2 = makePkg('2', '2026-03-03T08:00:00Z', '2026-03-03T14:00:00Z', 'DE', 'TR');
    const trips = groupIntoTrips([p1, p2]);
    expect(trips[0].name).toContain('→');
  });

  it('generates a "trip" name for single-country flights', () => {
    const p1 = makePkg('1', '2026-03-01T08:00:00Z', '2026-03-01T12:00:00Z', 'US', 'US');
    const trips = groupIntoTrips([p1]);
    expect(trips[0].name).toContain('trip');
  });

  it('sets startDate and endDate correctly', () => {
    const p1 = makePkg('1', '2026-03-01T08:00:00Z', '2026-03-01T12:00:00Z');
    const p2 = makePkg('2', '2026-03-03T08:00:00Z', '2026-03-03T22:00:00Z');
    const trips = groupIntoTrips([p1, p2]);
    expect(trips[0].startDate).toBe('2026-03-01T08:00:00Z');
    expect(trips[0].endDate).toBe('2026-03-03T22:00:00Z');
  });

  it('handles unsorted input by sorting by departure', () => {
    const p1 = makePkg('1', '2026-03-05T08:00:00Z', '2026-03-05T12:00:00Z');
    const p2 = makePkg('2', '2026-03-01T08:00:00Z', '2026-03-01T14:00:00Z');
    const trips = groupIntoTrips([p1, p2]);
    expect(trips).toHaveLength(1);
    expect(trips[0].startDate).toBe('2026-03-01T08:00:00Z');
  });

  it('collects unique countries across legs', () => {
    const p1 = makePkg('1', '2026-03-01T08:00:00Z', '2026-03-01T12:00:00Z', 'US', 'DE');
    const p2 = makePkg('2', '2026-03-03T08:00:00Z', '2026-03-03T14:00:00Z', 'DE', 'TR');
    const trips = groupIntoTrips([p1, p2]);
    expect(trips[0].countries).toContain('US');
    expect(trips[0].countries).toContain('DE');
    expect(trips[0].countries).toContain('TR');
    // DE should appear only once
    expect(trips[0].countries.filter((c) => c === 'DE')).toHaveLength(1);
  });
});
