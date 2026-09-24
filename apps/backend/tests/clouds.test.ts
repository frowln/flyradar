import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { openMeteoUrl, seriesFrom } from '../src/external/openMeteo.js';
import { cellOf, cloudsAlong, coverAt } from '../src/services/clouds.js';
import { clearMemoryCache } from '../src/cache/remember.js';
import { resetProviderPauses } from '../src/external/http.js';
import { weatherRoutes } from '../src/routes/weather.js';
import { errorHandler } from '../src/errorHandler.js';

const NOW = new Date('2026-09-24T12:00:00Z');
const DAY_START = Date.parse('2026-09-24T00:00:00Z') / 1000;

/** One Open-Meteo location: 48 hours from midnight UTC, cloud rising by the hour. */
function location(base = 0) {
  const time = Array.from({ length: 48 }, (_, h) => DAY_START + h * 3600);
  return {
    latitude: 55.75,
    longitude: 37.5,
    hourly: {
      time,
      cloud_cover: time.map((_, h) => Math.min(100, base + h)),
      cloud_cover_low: time.map((_, h) => (h === 14 ? null : Math.min(100, base + h * 2))),
      cloud_cover_mid: time.map(() => 10)
    }
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearMemoryCache();
  resetProviderPauses();
  vi.stubEnv('REDIS_URL', '');
  vi.stubEnv('OPEN_METEO_KEY', '');
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchSpy = vi.fn(async (url: string) => {
    const n = new URL(url).searchParams.get('latitude')!.split(',').length;
    return Response.json(n === 1 ? location() : Array.from({ length: n }, (_, i) => location(i * 50)));
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  warn.mockRestore();
});

describe('Open-Meteo request', () => {
  const cells = [{ lat: 55.75, lon: 37.5 }, { lat: 59.75, lon: 30.25 }];

  it('uses the free host without a key', () => {
    const url = new URL(openMeteoUrl(cells, '2026-09-24', '2026-09-25', {} as NodeJS.ProcessEnv));
    expect(url.host).toBe('api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('55.75,59.75');
    expect(url.searchParams.get('longitude')).toBe('37.5,30.25');
    expect(url.searchParams.get('hourly')).toBe('cloud_cover,cloud_cover_low,cloud_cover_mid');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('start_date')).toBe('2026-09-24');
    expect(url.searchParams.has('apikey')).toBe(false);
  });

  it('uses the commercial host and apikey with a key', () => {
    const url = new URL(openMeteoUrl(cells, '2026-09-24', '2026-09-24', { OPEN_METEO_KEY: 'om-key' } as NodeJS.ProcessEnv));
    expect(url.host).toBe('customer-api.open-meteo.com');
    expect(url.searchParams.get('apikey')).toBe('om-key');
  });

  it('reads one location as an object and several as an array', () => {
    expect(seriesFrom(location(), 1)).toHaveLength(1);
    expect(seriesFrom([location(), location()], 2)).toHaveLength(2);
    expect(seriesFrom([location()], 2)).toBeNull();
    expect(seriesFrom({ error: true, reason: 'x' }, 1)).toBeNull();
  });
});

describe('cloud cover along a route', () => {
  it('snaps to a quarter-degree grid, across the antimeridian too', () => {
    expect(cellOf(55.8, 37.4)).toEqual({ lat: 55.75, lon: 37.5 });
    expect(cellOf(10, 179.9)).toEqual({ lat: 10, lon: -180 });
  });

  it('takes the hour nearest to each moment', () => {
    const [series] = seriesFrom(location(), 1)!;
    expect(coverAt(series!, Date.parse('2026-09-24T10:00:00Z'))).toEqual({ cloud: 10, low: 20, mid: 10 });
    expect(coverAt(series!, Date.parse('2026-09-24T14:00:00Z')).low).toBeNull();
    expect(coverAt(series!, Date.parse('2026-09-28T10:00:00Z'))).toEqual({ cloud: null, low: null, mid: null });
  });

  it('answers each point, in order, from one request for all locations', async () => {
    const result = await cloudsAlong(
      [
        { lat: 55.8, lon: 37.4, at: '2026-09-24T10:20:00Z' },
        { lat: 59.8, lon: 30.3, at: '2026-09-24T11:40:00Z' }
      ],
      NOW
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      points: [
        { at: '2026-09-24T10:20:00Z', cloud: 10, low: 20, mid: 10 },
        { at: '2026-09-24T11:40:00Z', cloud: 62, low: 74, mid: 10 }
      ]
    });
  });

  it('keeps answers by cell and hour, so asking again costs nothing', async () => {
    const points = [{ lat: 55.8, lon: 37.4, at: '2026-09-24T10:20:00Z' }];
    const first = await cloudsAlong(points, NOW);
    const again = await cloudsAlong([{ lat: 55.76, lon: 37.45, at: '2026-09-24T09:50:00Z' }], NOW);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ points: [{ ...(first as { points: object[] }).points[0], at: '2026-09-24T09:50:00Z' }] });
  });

  it('does not ask about moments beyond the forecast', async () => {
    const result = await cloudsAlong([{ lat: 55.8, lon: 37.4, at: '2026-11-01T10:00:00Z' }], NOW);
    expect(result).toEqual({ points: [{ at: '2026-11-01T10:00:00Z', cloud: null, low: null, mid: null }] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a failed forecast rather than inventing clear skies', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json({ error: true, reason: 'Parameter out of range' }, { status: 400 }));
    expect(await cloudsAlong([{ lat: 55.8, lon: 37.4, at: '2026-09-24T10:20:00Z' }], NOW)).toEqual({ error: 'http_400' });
  });

  it('never logs the commercial key', async () => {
    vi.stubEnv('OPEN_METEO_KEY', 'om-secret');
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed: https://customer-api.open-meteo.com/?apikey=om-secret'));
    expect(await cloudsAlong([{ lat: 55.8, lon: 37.4, at: '2026-09-24T10:20:00Z' }], NOW)).toEqual({ error: 'unreachable' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('om-secret');
  });
});

describe('POST /weather/clouds', () => {
  let app: FastifyInstance;
  const AUTH = { authorization: 'Bearer dev_1790000000000_abcdef123456' };

  beforeEach(async () => {
    vi.stubEnv('AUTH_HMAC_SECRET', '');
    app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    await app.register(weatherRoutes);
    await app.ready();
  });

  afterEach(() => app.close());

  const post = (payload: unknown, headers: Record<string, string> = AUTH) =>
    app.inject({ method: 'POST', url: '/weather/clouds', headers, payload: payload as object });

  it('requires a device token', async () => {
    expect((await post({ points: [] }, {})).statusCode).toBe(401);
  });

  it('refuses more than sixty points, bad coordinates and times without a zone', async () => {
    const at = new Date(Date.now() + 3600_000).toISOString();
    const many = Array.from({ length: 61 }, () => ({ lat: 1, lon: 1, at }));
    expect((await post({ points: many })).statusCode).toBe(400);
    expect((await post({ points: [{ lat: 91, lon: 1, at }] })).statusCode).toBe(400);
    expect((await post({ points: [{ lat: 1, lon: 1, at: '2026-09-24T10:00:00' }] })).statusCode).toBe(400);
    expect((await post({ points: [] })).statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers with cover per point', async () => {
    const at = new Date(Date.now() + 3600_000).toISOString();
    const res = await post({ points: [{ lat: 55.8, lon: 37.4, at }] });
    expect(res.statusCode).toBe(200);
    const [point] = res.json().points;
    expect(point.at).toBe(at);
    expect(Object.keys(point).sort()).toEqual(['at', 'cloud', 'low', 'mid']);
  });

  it('answers 503 when the forecast cannot be had', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 502 }));
    const at = new Date(Date.now() + 3600_000).toISOString();
    const res = await post({ points: [{ lat: 55.8, lon: 37.4, at }] });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ reason: 'http_502' });
  });
});
