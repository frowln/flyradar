import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRecentTrack,
  fr24Time,
  latestCompleted,
  toFlightTrack,
  trackPoints,
  type Fr24Summary,
  type Fr24TrackPoint
} from '../src/external/fr24.js';
import { simplifyTrack, type TrackPoint } from '../src/services/simplifyTrack.js';
import { getRecentTrack } from '../src/services/recentTrack.js';
import { clearMemoryCache } from '../src/cache/remember.js';
import { resetProviderPauses } from '../src/external/http.js';

const KEY = 'fr24-secret-token';
const NOW = new Date('2026-09-24T12:00:00Z');

/** A recorded SVO → LED flight: taxi, climb, cruise with one turn, descent, taxi. */
function recordedTrack(): Fr24TrackPoint[] {
  const out: Fr24TrackPoint[] = [];
  const t0 = Date.parse('2026-09-22T07:20:00Z');
  const at = (s: number) => new Date(t0 + s * 1000).toISOString().replace('.000', '');
  // Taxi before takeoff at 07:20.
  for (let s = -600; s < 0; s += 60) out.push({ timestamp: at(s), lat: 55.97, lon: 37.41, alt: 0 });
  // 80 minutes airborne, one fix every 10 s, a dog-leg halfway.
  for (let s = 0; s <= 4800; s += 10) {
    const f = s / 4800;
    const lat = 55.97 + (59.8 - 55.97) * f;
    const lon = f < 0.5 ? 37.41 + (33 - 37.41) * (f / 0.5) : 33 + (30.26 - 33) * ((f - 0.5) / 0.5);
    const alt = s < 1200 ? (35000 * s) / 1200 : s > 3600 ? (35000 * (4800 - s)) / 1200 : 35000;
    out.push({ timestamp: at(s), lat, lon, alt });
  }
  // Taxi in.
  for (let s = 4860; s < 5400; s += 60) out.push({ timestamp: at(s), lat: 59.8, lon: 30.26, alt: 0 });
  return out;
}

const summary: Fr24Summary = {
  fr24_id: '3a5b7c9d',
  flight: 'SU1234',
  orig_icao: 'UUEE',
  orig_iata: 'SVO',
  dest_icao: 'ULLI',
  dest_iata: 'LED',
  dest_icao_actual: 'ULLI',
  datetime_takeoff: '2026-09-22T07:20:00Z',
  datetime_landed: '2026-09-22T08:40:00Z',
  flight_ended: true
};

describe('Douglas–Peucker simplification', () => {
  const line = (n: number): TrackPoint[] => Array.from({ length: n }, (_, i) => [i * 0.01, 0, 10_000, i * 10]);

  it('keeps at most the budget, and both ends', () => {
    const zigzag: TrackPoint[] = Array.from({ length: 1000 }, (_, i) => [i * 0.01, (i % 7) * 0.05, 10_000, i * 10]);
    const out = simplifyTrack(zigzag, 150);
    expect(out.length).toBeLessThanOrEqual(150);
    expect(out[0]).toEqual(zigzag[0]);
    expect(out[out.length - 1]).toEqual(zigzag[999]);
    // Time order survives.
    expect(out.every((p, i) => i === 0 || p[3] > out[i - 1]![3])).toBe(true);
  });

  it('reduces a straight line to its ends', () => {
    expect(simplifyTrack(line(500), 150)).toHaveLength(2);
  });

  it('keeps a corner and the top of a climb', () => {
    const corner: TrackPoint[] = [
      ...Array.from({ length: 200 }, (_, i): TrackPoint => [i * 0.01, 0, 0, i]),
      ...Array.from({ length: 200 }, (_, i): TrackPoint => [2, (i + 1) * 0.01, 0, 200 + i])
    ];
    expect(simplifyTrack(corner, 10).map((p) => p[3])).toContain(199);

    const climb: TrackPoint[] = Array.from({ length: 300 }, (_, i): TrackPoint => [i * 0.01, 0, Math.min(11_000, i * 110), i * 10]);
    expect(simplifyTrack(climb, 10).map((p) => p[3])).toContain(1000);
  });

  it('handles a track across the antimeridian without a jump', () => {
    const pacific: TrackPoint[] = Array.from({ length: 400 }, (_, i) => {
      const lon = 170 + i * 0.05;
      return [lon > 180 ? lon - 360 : lon, 0, 11_000, i * 30];
    });
    // Still a straight line on the globe: the ends are enough.
    expect(simplifyTrack(pacific, 150)).toHaveLength(2);
  });
});

describe('FR24 mapping', () => {
  it('picks the newest completed flight, skipping diversions and flights still in the air', () => {
    const rows: Fr24Summary[] = [
      { ...summary, fr24_id: 'old', datetime_takeoff: '2026-09-20T07:20:00Z' },
      { ...summary, fr24_id: 'diverted', datetime_takeoff: '2026-09-23T07:20:00Z', dest_icao_actual: 'ULAA' },
      { ...summary, fr24_id: 'flying', datetime_takeoff: '2026-09-24T07:20:00Z', datetime_landed: null, flight_ended: false },
      { ...summary, fr24_id: 'newest', datetime_takeoff: '2026-09-22T07:20:00Z' }
    ];
    expect(latestCompleted(rows).map((r) => r.fr24_id)).toEqual(['newest', 'old']);
  });

  it('keeps the airborne part, in metres and seconds after takeoff', () => {
    const points = trackPoints(recordedTrack(), summary.datetime_takeoff, summary.datetime_landed);
    expect(points[0]).toEqual([37.41, 55.97, 0, 0]);
    expect(points[points.length - 1]![3]).toBe(4800);
    const cruise = points.find((p) => p[3] === 2400)!;
    expect(cruise[2]).toBe(Math.round(35000 * 0.3048));
  });

  it('falls back to "off the ground" without takeoff and landing times', () => {
    const points = trackPoints(recordedTrack(), null, null);
    expect(points.every((p) => p[2] > 0)).toBe(true);
    expect(points[0]![3]).toBe(0);
  });

  it('builds the response: ≤150 points, the date flown, the airports', () => {
    const track = toFlightTrack(summary, recordedTrack())!;
    expect(track.points.length).toBeLessThanOrEqual(150);
    expect(track.points.length).toBeGreaterThan(3);
    expect(track).toMatchObject({ flownOn: '2026-09-22', from: 'SVO', to: 'LED' });
    for (const [lon, lat, alt, t] of track.points) {
      expect(Number.isFinite(lon) && Number.isFinite(lat)).toBe(true);
      expect(alt).toBeGreaterThanOrEqual(0);
      expect(t).toBeGreaterThanOrEqual(0);
    }
  });

  it('refuses a fragment', () => {
    expect(toFlightTrack(summary, recordedTrack().slice(0, 12))).toBeNull();
  });

  it('writes times the way the API documents them', () => {
    expect(fr24Time(NOW)).toBe('2026-09-24T12:00:00Z');
  });
});

describe('fetchRecentTrack', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;
  const env = { FR24_API_KEY: KEY } as NodeJS.ProcessEnv;

  beforeEach(() => {
    resetProviderPauses();
    clearMemoryCache();
    vi.stubEnv('REDIS_URL', '');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchSpy = vi.fn(async (url: string) =>
      url.includes('/flight-summary/')
        ? Response.json({ data: [summary] })
        : Response.json([{ fr24_id: summary.fr24_id, tracks: recordedTrack() }])
    );
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  it('asks for the past week of the number, then the newest track, with a bearer token and v1', async () => {
    const { track } = await fetchRecentTrack('SU1234', env, NOW);
    expect(track?.from).toBe('SVO');

    const [summaryUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(summaryUrl).toBe(
      'https://fr24api.flightradar24.com/api/flight-summary/full?flights=SU1234' +
        '&flight_datetime_from=2026-09-17T12:00:00Z&flight_datetime_to=2026-09-24T12:00:00Z&sort=desc&limit=10'
    );
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${KEY}`, 'Accept-Version': 'v1' });
    expect(fetchSpy.mock.calls[1]![0]).toBe('https://fr24api.flightradar24.com/api/flight-tracks?flight_id=3a5b7c9d');
  });

  it('reads a tracks response wrapped in `data` as well as a bare one', async () => {
    fetchSpy.mockImplementation(async (url: string) =>
      url.includes('/flight-summary/')
        ? Response.json({ data: [summary] })
        : Response.json({ data: [{ fr24_id: summary.fr24_id, tracks: recordedTrack() }] })
    );
    expect((await fetchRecentTrack('SU1234', env, NOW)).track).not.toBeNull();
  });

  it('finds nothing when the number has not flown this week', async () => {
    fetchSpy.mockImplementation(async () => Response.json({ data: [] }));
    expect(await fetchRecentTrack('SU1234', env, NOW)).toEqual({ track: null });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a key, and reports a refused one', async () => {
    expect(await fetchRecentTrack('SU1234', {} as NodeJS.ProcessEnv, NOW)).toEqual({ track: null, error: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockImplementation(async () => new Response('{}', { status: 401 }));
    expect((await fetchRecentTrack('SU1234', env, NOW)).error).toBe('unauthorized');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });

  it('is asked once per number per day, however many passengers ask', async () => {
    vi.stubEnv('FR24_API_KEY', KEY);
    const [a, b] = await Promise.all([getRecentTrack('SU1234'), getRecentTrack('su1234')]);
    const c = await getRecentTrack('SU1234');
    expect(a.track).not.toBeNull();
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure', async () => {
    vi.stubEnv('FR24_API_KEY', KEY);
    fetchSpy.mockImplementationOnce(async () => new Response('{}', { status: 503 }));
    expect((await getRecentTrack('SU1234')).error).toBe('http_503');
    expect((await getRecentTrack('SU1234')).track).not.toBeNull();
  });
});
