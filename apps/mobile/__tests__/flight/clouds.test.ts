import { describe, it, expect, vi } from 'vitest';
import type { CloudSample, OfflinePackage, POI } from '@skyatlas/shared';

vi.mock('../../src/i18n', () => ({
  getLocale: () => 'en',
  t: (key: string, p?: Record<string, unknown>) => (p ? `${key} ${JSON.stringify(p)}` : key)
}));
vi.mock('../../src/core/settings', () => ({
  settings: { getAlerts: () => 'more', getUnits: () => 'metric' }
}));

const { cloudAt, cloudQueries, cloudSampleTimes, fetchCloudsFor, groundHidden } = await import('../../src/core/flight/clouds');
const { alertsForFlight } = await import('../../src/core/flight/alerts');
const { windowAdvice } = await import('../../src/core/flight/windowAdvice');
const { buildRoute } = await import('../../src/core/route/profile');

/** SVO → AYT, four hours, departing at a time of day when the peaks are in daylight. */
function pkg(dep = '2026-10-01T06:00:00Z', over: Partial<OfflinePackage> = {}): OfflinePackage {
  const { route } = buildRoute({ from: { lat: 55.97, lon: 37.41 }, to: { lat: 36.9, lon: 30.8 } });
  return {
    version: 2,
    flight: {
      id: 'SU1234-2026-10-01',
      flightNumber: 'SU1234',
      airline: '',
      origin: { iata: 'SVO', icao: '', name: 'Sheremetyevo', city: 'Moscow', country: 'RU', lat: 55.97, lon: 37.41, tz: 'Europe/Moscow' },
      destination: { iata: 'AYT', icao: '', name: 'Antalya', city: 'Antalya', country: 'TR', lat: 36.9, lon: 30.8, tz: 'Europe/Istanbul' },
      scheduledDeparture: dep,
      scheduledArrival: dep
    },
    route,
    pois: [],
    generatedAt: '',
    ...over
  };
}

const samples = (values: Array<[number, number, number]>): CloudSample[] =>
  values.map(([at, cloud, low]) => ({ at, cloud, low }));

describe('where to ask about clouds', () => {
  it('asks every quarter hour, landing included', () => {
    expect(cloudSampleTimes(3600)).toEqual([0, 900, 1800, 2700, 3600]);
    expect(cloudSampleTimes(0)).toEqual([]);
  });

  it('never asks about more than sixty points, however long the flight', () => {
    const times = cloudSampleTimes(20 * 3600);
    expect(times.length).toBeLessThanOrEqual(60);
    expect(times[times.length - 1]).toBe(20 * 3600);
  });

  it('places each point on the route at the time the aircraft is there', () => {
    const p = pkg();
    const { times, queries } = cloudQueries(p)!;
    expect(queries[0]).toEqual({ lat: 55.97, lon: 37.41, at: '2026-10-01T06:10:00.000Z' });
    expect(queries[1]!.at).toBe('2026-10-01T06:25:00.000Z');
    expect(times[times.length - 1]).toBe(p.route[p.route.length - 1]!.elapsedSeconds);
  });
});

describe('fetching the forecast for a package', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const answer = vi.fn(async (points: Array<{ at: string }>) =>
    points.map((p, i) => ({ at: p.at, cloud: i === 1 ? null : 50, low: 20 }))
  );

  it('keeps the answered points, by seconds after takeoff', async () => {
    const clouds = await fetchCloudsFor(pkg(), answer, now);
    expect(clouds![0]).toEqual({ at: 0, cloud: 50, low: 20 });
    // The unanswered quarter hour is left out rather than guessed.
    expect(clouds!.some((c) => c.at === 900)).toBe(false);
  });

  it('does not ask beyond a week ahead, or after the flight', async () => {
    answer.mockClear();
    expect(await fetchCloudsFor(pkg('2026-10-09T06:00:00Z'), answer, now)).toBeNull();
    expect(await fetchCloudsFor(pkg('2026-09-28T06:00:00Z'), answer, now)).toBeNull();
    expect(answer).not.toHaveBeenCalled();
  });

  it('gives up quietly on a failure or a partial answer', async () => {
    expect(await fetchCloudsFor(pkg(), async () => null, now)).toBeNull();
    expect(await fetchCloudsFor(pkg(), async () => [{ at: 'x', cloud: 1, low: 1 }], now)).toBeNull();
    expect(
      await fetchCloudsFor(pkg(), async () => {
        throw new Error('offline');
      }, now)
    ).toBeNull();
  });
});

describe('cloud at a moment', () => {
  const p = { clouds: samples([[0, 20, 0], [900, 40, 60], [1800, 100, 100], [5500, 0, 0]]) };

  it('interpolates between neighbouring samples', () => {
    expect(cloudAt(p, 450)).toEqual({ cloud: 30, low: 30 });
    expect(cloudAt(p, 1800)).toEqual({ cloud: 100, low: 100 });
  });

  it('uses the nearer sample across a long gap, and knows nothing far from any', () => {
    expect(cloudAt(p, 2400)).toEqual({ cloud: 100, low: 100 });
    expect(cloudAt(p, 3600)).toBeNull();
    expect(cloudAt(p, 5500 + 600)).toEqual({ cloud: 0, low: 0 });
    expect(cloudAt({}, 100)).toBeNull();
  });

  it('calls the ground hidden from 80 % low cloud', () => {
    expect(groundHidden(p, 1800)).toBe(true);
    expect(groundHidden(p, 900)).toBe(false);
    expect(groundHidden({}, 900)).toBe(false);
  });
});

describe('alerts under cloud', () => {
  const peak = (id: string, passAt: number): POI => ({
    id,
    name: id,
    category: 'mountain',
    lat: 0,
    lon: 0,
    summary: '',
    facts: [],
    photos: [],
    passAt,
    side: 'left',
    rank: 10,
    closestApproachKm: 5
  });
  const takeoff = new Date('2026-10-01T06:10:00Z');
  const withPeaks = (clouds?: CloudSample[]) =>
    pkg(undefined, {
      pois: [peak('Elbrus', 3600), peak('Kazbek', 7200)],
      clouds
    });
  const sights = (alerts: ReturnType<typeof alertsForFlight>) =>
    alerts.filter((a) => a.data?.kind === 'sight').map((a) => (a.data as { poiId: string }).poiId);

  it('announces sights under a clear sky', () => {
    expect(sights(alertsForFlight(withPeaks(), takeoff))).toEqual(['Elbrus', 'Kazbek']);
  });

  it('does not announce a sight under a low overcast, and keeps the rest', () => {
    const clouds = samples([[3000, 100, 95], [3600, 100, 95], [4200, 100, 95], [6600, 30, 10], [7200, 30, 10], [7800, 30, 10]]);
    const alerts = alertsForFlight(withPeaks(clouds), takeoff);
    expect(sights(alerts)).toEqual(['Kazbek']);
  });

  it('ignores high cloud', () => {
    const clouds = samples([[3600, 100, 30], [7200, 100, 30]]);
    expect(sights(alertsForFlight(withPeaks(clouds), takeoff))).toEqual(['Elbrus', 'Kazbek']);
  });
});

describe('window advice with a forecast', () => {
  it('reports the share of the flight under 70 % cloud or more', () => {
    const p = pkg();
    const end = p.route[p.route.length - 1]!.elapsedSeconds;
    const half = Math.round(end / 2);
    const clouds = cloudSampleTimes(end).map((at) => ({ at, cloud: at < half ? 90 : 10, low: 0 }));
    const advice = windowAdvice(p.route, p.pois, new Date('2026-10-01T06:10:00Z'), clouds);
    expect(advice.cloudy).toBeGreaterThan(0.4);
    expect(advice.cloudy).toBeLessThan(0.6);
  });

  it('says nothing about cloud without a forecast', () => {
    const p = pkg();
    expect(windowAdvice(p.route, p.pois, new Date('2026-10-01T06:10:00Z')).cloudy).toBeNull();
  });
});
