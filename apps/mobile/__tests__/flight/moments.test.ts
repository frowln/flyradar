import { describe, it, expect } from 'vitest';
import { computeMoments, pickAlerts, daylightFraction } from '../../src/core/flight/moments';
import { lineCrossings } from '../../src/core/geo/lines';
import { buildRoute } from '../../src/core/route/profile';
import type { POI } from '@skyatlas/shared';

const poi = (id: string, passAt: number, side: POI['side'], rank = 9): POI => ({
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
  rank,
  closestApproachKm: 20
});

describe('globe lines', () => {
  it('finds the equator and the date line', () => {
    // Fiji → Hawaii crosses both.
    const r = buildRoute({ from: { lat: -17.75, lon: 177.44 }, to: { lat: 21.32, lon: -157.92 } }).route;
    const lines = lineCrossings(r).map((c) => c.line);
    expect(lines).toContain('equator');
    expect(lines).toContain('dateline');
    // Honolulu is at 21°N, short of the Tropic of Cancer.
    expect(lines).not.toContain('tropic_cancer');
  });

  it('finds nothing on a short hop that stays put', () => {
    const r = buildRoute({ from: { lat: 50, lon: 10 }, to: { lat: 51, lon: 11 } }).route;
    expect(lineCrossings(r)).toEqual([]);
  });
});

describe('computeMoments', () => {
  const route = buildRoute({ from: { lat: 0, lon: 20 }, to: { lat: 20, lon: 20 } }).route;
  const end = route[route.length - 1]!.elapsedSeconds;

  it('orders takeoff, sights, borders and landing in time', () => {
    const m = computeMoments({
      route,
      pois: [poi('a', 1800, 'left')],
      countries: [
        { cc: 'AA', enterAt: 0, exitAt: 3000 },
        { cc: 'BB', enterAt: 3000, exitAt: end }
      ]
    });
    expect(m[0]!.kind).toBe('takeoff');
    expect(m[m.length - 1]!.kind).toBe('landing');
    expect(m.find((x) => x.kind === 'border')!.cc).toBe('BB');
    expect(m.filter((x) => x.kind === 'border')).toHaveLength(1);
  });

  it('adds sunrise or sunset when the flight spans one', () => {
    // An evening departure heading into the night over Africa.
    const m = computeMoments({ route, pois: [], takeoff: new Date('2026-03-20T15:30:00Z') });
    expect(m.some((x) => x.kind === 'sunset')).toBe(true);
  });
});

describe('pickAlerts', () => {
  const moments = computeMoments({
    route: buildRoute({ from: { lat: 0, lon: 20 }, to: { lat: 20, lon: 20 } }).route,
    pois: [poi('L1', 2000, 'left', 10), poi('R1', 2100, 'right', 10), poi('L2', 5000, 'left', 9), poi('R2', 9000, 'right', 9)]
  });

  it('keeps at most three, a quarter-hour apart', () => {
    const a = pickAlerts(moments);
    expect(a.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < a.length; i++) expect(a[i]!.at - a[i - 1]!.at).toBeGreaterThanOrEqual(900);
  });

  it('only alerts about the passenger’s own side', () => {
    const a = pickAlerts(moments, { seatSide: 'left' });
    expect(a.filter((m) => m.kind === 'sight').every((m) => m.side === 'left')).toBe(true);
  });
});

describe('daylightFraction', () => {
  it('is near 1 for a midday flight at the equator and near 0 at midnight', () => {
    const route = buildRoute({ from: { lat: 0, lon: 0 }, to: { lat: 5, lon: 5 } }).route;
    expect(daylightFraction(route, new Date('2026-03-20T11:00:00Z'))).toBeGreaterThan(0.9);
    expect(daylightFraction(route, new Date('2026-03-20T23:00:00Z'))).toBeLessThan(0.1);
  });
});
