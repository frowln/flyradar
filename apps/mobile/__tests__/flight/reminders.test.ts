import { describe, it, expect, vi } from 'vitest';
import type { OfflinePackage, POI } from '@skyatlas/shared';

vi.mock('../../src/i18n', () => ({
  getLocale: () => 'en',
  t: (key: string, p?: Record<string, unknown>) => (p ? `${key} ${JSON.stringify(p)}` : key)
}));

const { remindersFor, reminderIds, TAKEOFF_CATEGORY } = await import('../../src/core/flight/reminders');
const { buildRoute } = await import('../../src/core/route/profile');

const peak = (id: string, passAt: number, side: POI['side']): POI => ({
  id,
  name: id,
  category: 'mountain',
  lat: 0,
  lon: 0,
  summary: '',
  facts: [],
  photos: [],
  passAt,
  side,
  rank: 9,
  closestApproachKm: 20
});

function pkg(dep: string, over: Partial<OfflinePackage> = {}): OfflinePackage {
  const { route } = buildRoute({ from: { lat: 55.97, lon: 37.41 }, to: { lat: 36.9, lon: 30.8 } });
  return {
    version: 2,
    flight: {
      id: 'SU1234-2026-10-01',
      flightNumber: 'SU1234',
      origin: { iata: 'SVO', name: 'Sheremetyevo', city: 'Moscow', lat: 55.97, lon: 37.41, tz: 'Europe/Moscow' },
      destination: { iata: 'AYT', name: 'Antalya', city: 'Antalya', lat: 36.9, lon: 30.8, tz: 'Europe/Istanbul' },
      scheduledDeparture: dep,
      scheduledArrival: dep
    },
    route,
    pois: [peak('Elbrus', 5400, 'left'), peak('Kazbek', 6000, 'left'), peak('Ankara', 9000, 'right')],
    countries: [],
    moments: [],
    ...over
  } as unknown as OfflinePackage;
}

describe('ground reminders', () => {
  const now = new Date('2026-09-29T09:00:00Z');

  it('advises the side at check-in and prompts for takeoff after departure', () => {
    const r = remindersFor(pkg('2026-10-01T06:00:00Z'), now);
    expect(r.map((a) => a.id)).toEqual(reminderIds('SU1234-2026-10-01'));
    const [seat, takeoff] = r;
    expect(seat!.at.toISOString()).toBe('2026-09-30T06:00:00.000Z');
    expect(seat!.title).toBe('remind.seatLeftTitle');
    expect(seat!.body).toContain('Elbrus');
    expect(takeoff!.at.toISOString()).toBe('2026-10-01T06:15:00.000Z');
    expect(takeoff!.category).toBe(TAKEOFF_CATEGORY);
    expect(takeoff!.data).toEqual({ kind: 'takeoff', flightId: 'SU1234-2026-10-01' });
  });

  it('skips the seat advice when the seat is already known', () => {
    const r = remindersFor(pkg('2026-10-01T06:00:00Z', { seat: { side: 'right', label: '23F' } } as Partial<OfflinePackage>), now);
    expect(r.map((a) => a.data?.kind)).toEqual(['takeoff']);
  });

  it('schedules nothing that is already in the past', () => {
    expect(remindersFor(pkg('2026-09-29T08:00:00Z'), now)).toEqual([]);
    // Check-in time passed, takeoff prompt still ahead.
    expect(remindersFor(pkg('2026-09-29T20:00:00Z'), now).map((a) => a.data?.kind)).toEqual(['takeoff']);
  });

  it('never reminds about the demo flight', () => {
    expect(remindersFor(pkg('2026-10-01T06:00:00Z', { demo: true }), now)).toEqual([]);
  });
});
