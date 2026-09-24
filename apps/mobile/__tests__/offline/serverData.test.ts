import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FlightTrack, OfflinePackage, POI } from '@skyatlas/shared';

// The stories step goes to Wikipedia; here it returns the places unchanged.
vi.mock('../../src/core/places/wiki', () => ({ enrichWithWikipedia: async (pois: POI[]) => pois }));

const { buildFlightPackage, composePackage } = await import('../../src/core/offline/buildPackage');
const datasets = await import('../../src/core/data/datasets');
const { haversine } = await import('../../src/core/geo/greatCircle');

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../assets/data', `${name}.skydata`), 'utf8'));
datasets.setDatasetsForTesting({
  airports: read('airports').airports,
  places: read('places').places,
  areas: read('areas').areas,
  countries: read('countries').countries
});
const data = () => ({ places: datasets.getPlaces(), areas: datasets.getAreas(), countries: datasets.getCountries() });
const SVO = datasets.airportByIata('SVO')!;
const LED = datasets.airportByIata('LED')!;
const BEND = { lat: 57.2, lon: 36.9 };

/** SVO → LED as flown last week: a dog-leg well east of the great circle. */
function track(from = SVO, to = LED): FlightTrack {
  const points: FlightTrack['points'] = [];
  for (let t = 0; t <= 4200; t += 60) {
    const f = t / 4200;
    const [a, b, g] = f < 0.4 ? [from, BEND, f / 0.4] : [BEND, to, (f - 0.4) / 0.6];
    const alt = t < 1200 ? (10_400 * t) / 1200 : t > 2700 ? (10_400 * (4200 - t)) / 1500 : 10_400;
    points.push([a.lon + (b.lon - a.lon) * g, a.lat + (b.lat - a.lat) * g, Math.round(alt), t]);
  }
  return { points, flownOn: '2026-09-22', from: 'SVO', to: 'LED' };
}

const request = (extra: object = {}) => ({
  from: SVO,
  to: LED,
  date: '2026-10-01',
  departureTime: '10:05',
  arrivalTime: '11:30',
  flightNumber: 'SU1234',
  locale: 'en',
  ...extra
});

const nearestToBend = (pkg: OfflinePackage) =>
  Math.min(...pkg.route.map((p) => haversine(p.lat, p.lon, BEND.lat, BEND.lon)));

describe('composePackage with a recent track', () => {
  it('flies the track and says so', () => {
    const pkg = composePackage(request({ track: track() }), data());
    expect(pkg.routeKind).toBe('track');
    expect(pkg.trackFlownOn).toBe('2026-09-22');
    expect(nearestToBend(pkg)).toBeLessThan(10);
    // Stretched to the ticket: 85 minutes block less taxi.
    expect(pkg.route[pkg.route.length - 1]!.elapsedSeconds).toBe(85 * 60 - 18 * 60);
    // Everything downstream is computed off the track.
    expect(pkg.moments!.some((m) => m.kind === 'landing')).toBe(true);
    expect(pkg.countries![0]!.cc).toBe('RU');
  });

  it('keeps the model when the track belongs to another trip', () => {
    const pkg = composePackage(request({ track: track(LED, SVO) }), data());
    expect(pkg.routeKind).not.toBe('track');
    expect(pkg.trackFlownOn).toBeUndefined();
    expect(nearestToBend(pkg)).toBeGreaterThan(40);
  });
});

describe('buildFlightPackage with a server', () => {
  const saved: OfflinePackage[] = [];
  const deps = (extra: object = {}) => ({ data, save: async (p: OfflinePackage) => void saved.push(p), ...extra });
  const now = () => new Date('2026-09-29T12:00:00Z');

  afterEach(() => {
    saved.length = 0;
    vi.useRealTimers();
  });

  it('asks for the track by flight number and uses it', async () => {
    const fetchTrack = vi.fn(async () => track());
    const pkg = await buildFlightPackage(request(), deps({ fetchTrack, now }));
    expect(fetchTrack).toHaveBeenCalledWith('SU1234');
    expect(pkg.routeKind).toBe('track');
  });

  it('does not ask when the request already says there is no track, or has no number', async () => {
    const fetchTrack = vi.fn(async () => track());
    await buildFlightPackage(request({ track: null }), deps({ fetchTrack, now }));
    await buildFlightPackage(request({ flightNumber: undefined }), deps({ fetchTrack, now }));
    expect(fetchTrack).not.toHaveBeenCalled();
  });

  it('settles for the model when the track is slow or fails', async () => {
    const failing = await buildFlightPackage(
      request(),
      deps({ fetchTrack: async () => Promise.reject(new Error('offline')), now })
    );
    expect(failing.routeKind).not.toBe('track');

    vi.useFakeTimers();
    const slow = buildFlightPackage(request(), deps({ fetchTrack: () => new Promise(() => {}), now }));
    await vi.advanceTimersByTimeAsync(7_000);
    expect((await slow).routeKind).not.toBe('track');
  });

  it('adds the cloud forecast, one point per quarter hour, and saves it', async () => {
    const fetchClouds = vi.fn(async (points: Array<{ at: string }>) => points.map((p) => ({ at: p.at, cloud: 75, low: 40 })));
    const pkg = await buildFlightPackage(request(), deps({ fetchClouds, now }));
    const asked = fetchClouds.mock.calls[0]![0];
    const airborne = pkg.route[pkg.route.length - 1]!.elapsedSeconds;
    expect(asked).toHaveLength(Math.ceil(airborne / 900) + 1);
    expect(pkg.clouds![0]).toEqual({ at: 0, cloud: 75, low: 40 });
    expect(pkg.cloudsAt).toBe(now().toISOString());
    expect(saved[saved.length - 1]!.clouds).toHaveLength(asked.length);
  });

  it('skips the forecast more than a week ahead, and survives its failure', async () => {
    const fetchClouds = vi.fn(async () => null);
    const far = await buildFlightPackage(request({ date: '2026-10-20' }), deps({ fetchClouds, now }));
    expect(fetchClouds).not.toHaveBeenCalled();
    expect(far.clouds).toBeUndefined();
    const failed = await buildFlightPackage(request(), deps({ fetchClouds, now }));
    expect(fetchClouds).toHaveBeenCalledTimes(1);
    expect(failed.clouds).toBeUndefined();
  });

  it('asks nothing when no server is wired in', async () => {
    const pkg = await buildFlightPackage(request(), deps({ now }));
    expect(pkg.routeKind).not.toBe('track');
    expect(pkg.clouds).toBeUndefined();
  });
});
