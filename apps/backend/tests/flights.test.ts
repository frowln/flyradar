import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('../src/services/packageBuilder.js', () => ({
  buildPackage: vi.fn(),
  getCachedPackage: vi.fn()
}));
vi.mock('../src/services/flightLookup.js', () => ({
  getFlightDetailed: vi.fn()
}));
vi.mock('../src/services/recentTrack.js', () => ({
  getRecentTrack: vi.fn()
}));

import { flightRoutes, isCalendarDate } from '../src/routes/flights.js';
import { buildPackage, getCachedPackage } from '../src/services/packageBuilder.js';
import { getFlightDetailed } from '../src/services/flightLookup.js';
import { getRecentTrack } from '../src/services/recentTrack.js';
import { createPackageJobs } from '../src/services/packageJobs.js';
import { errorHandler } from '../src/errorHandler.js';

const AUTH = { authorization: 'Bearer dev_1790000000000_abcdef123456' };
const pkg = { version: 1, flight: { id: 'SU100-2026-05-20' }, route: [], pois: [], generatedAt: 'now' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_HMAC_SECRET', '');
  vi.mocked(getCachedPackage).mockResolvedValue(null);
  app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  await app.register(flightRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, headers: AUTH, payload: payload as object });

describe('calendar dates', () => {
  it('accepts real dates, leap days included', () => {
    expect(isCalendarDate('2026-05-20')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
  });

  it('rejects dates the calendar does not have', () => {
    for (const bad of ['2026-13-45', '2026-02-30', '2025-02-29', '2026-00-10', '2026-5-1', 'tomorrow']) {
      expect(isCalendarDate(bad), bad).toBe(false);
    }
  });

  it('answers an impossible date with 400 before any lookup', async () => {
    const res = await post('/flights/lookup', { flightNumber: 'SU100', date: '2026-13-45' });
    expect(res.statusCode).toBe(400);
    expect(getFlightDetailed).not.toHaveBeenCalled();
  });
});

describe('request validation', () => {
  it('requires a device token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/flights/lookup',
      payload: { flightNumber: 'SU100', date: '2026-05-20' }
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a flight number that is not letters and digits', async () => {
    const res = await post('/flights/lookup', { flightNumber: 'SU1:00', date: '2026-05-20' });
    expect(res.statusCode).toBe(400);
  });
});

describe('locale allow-list', () => {
  it('builds in a supported language', async () => {
    vi.mocked(buildPackage).mockResolvedValue(pkg as any);
    await post('/flights/package?sync=1', { flightNumber: 'SU100', date: '2026-05-20', locale: 'ja' });
    expect(buildPackage).toHaveBeenCalledWith('SU100', '2026-05-20', 'ja');
  });

  it('falls back to English for anything else, including host-shaped values', async () => {
    vi.mocked(buildPackage).mockResolvedValue(pkg as any);
    for (const locale of ['evil.com/x', 'attacker.example#', 'pt', 'EN', undefined]) {
      vi.mocked(buildPackage).mockClear();
      const res = await post('/flights/package?sync=1', { flightNumber: 'SU100', date: '2026-05-20', locale });
      expect(res.statusCode, String(locale)).toBe(200);
      expect(buildPackage).toHaveBeenCalledWith('SU100', '2026-05-20', 'en');
    }
  });
});

describe('package jobs over HTTP', () => {
  it('returns a cached package straight away', async () => {
    vi.mocked(getCachedPackage).mockResolvedValue(pkg as any);
    const res = await post('/flights/package', { flightNumber: 'SU100', date: '2026-05-20', locale: 'en' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(pkg);
    expect(buildPackage).not.toHaveBeenCalled();
  });

  it('starts a job, reports it pending, then hands over the package', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(buildPackage).mockReturnValue(new Promise((resolve) => (finish = resolve)) as any);

    const started = await post('/flights/package', { flightNumber: 'SU100', date: '2026-05-20' });
    expect(started.statusCode).toBe(202);
    const { jobId } = started.json();
    expect(started.headers['location']).toBe(`/flights/package/${jobId}`);

    const pending = await app.inject({ method: 'GET', url: `/flights/package/${jobId}`, headers: AUTH });
    expect(pending.json()).toEqual({ status: 'pending' });

    finish(pkg);
    await vi.waitFor(async () => {
      const done = await app.inject({ method: 'GET', url: `/flights/package/${jobId}`, headers: AUTH });
      expect(done.json()).toEqual({ status: 'done', package: pkg });
    });
  });

  it('joins a build already running for the same flight instead of starting another', async () => {
    vi.mocked(buildPackage).mockReturnValue(new Promise(() => {}) as any);
    const body = { flightNumber: 'SU100', date: '2026-05-20', locale: 'ru' };
    const a = (await post('/flights/package', body)).json();
    const b = (await post('/flights/package', body)).json();
    expect(a.jobId).toBe(b.jobId);
    expect(buildPackage).toHaveBeenCalledTimes(1);
  });

  it('reports a flight that cannot be built as an error status', async () => {
    vi.mocked(buildPackage).mockResolvedValue(null);
    const { jobId } = (await post('/flights/package', { flightNumber: 'XX999', date: '2026-05-20' })).json();
    await vi.waitFor(async () => {
      const res = await app.inject({ method: 'GET', url: `/flights/package/${jobId}`, headers: AUTH });
      expect(res.json()).toMatchObject({ status: 'error', reason: 'not_found' });
    });
  });

  it('answers 404 for a job it does not know', async () => {
    const unknown = await app.inject({
      method: 'GET',
      url: '/flights/package/6f1c1a52-5d0e-4d8f-9b1e-0b5a1f6d2c3e',
      headers: AUTH
    });
    expect(unknown.statusCode).toBe(404);
    const junk = await app.inject({ method: 'GET', url: '/flights/package/not-a-uuid', headers: AUTH });
    expect(junk.statusCode).toBe(404);
  });

  it('keeps the synchronous behaviour behind ?sync=1', async () => {
    vi.mocked(buildPackage).mockResolvedValue(pkg as any);
    const ok = await post('/flights/package?sync=1', { flightNumber: 'SU100', date: '2026-05-20' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(pkg);

    vi.mocked(buildPackage).mockResolvedValue(null);
    const missing = await post('/flights/package?sync=1', { flightNumber: 'XX999', date: '2026-05-20' });
    expect(missing.statusCode).toBe(404);
  });
});

describe('package job bookkeeping', () => {
  it('marks a failed build as failed and reports it', async () => {
    const onError = vi.fn();
    const jobs = createPackageJobs(async () => {
      throw new Error('wikipedia down');
    }, { onError });
    const { jobId } = jobs.start('SU100', '2026-05-20', 'en')!;
    await vi.waitFor(() => expect(jobs.get(jobId)).toMatchObject({ status: 'error', reason: 'failed' }));
    expect(onError).toHaveBeenCalled();
  });

  it('gives up on a build that outlives its deadline, and forgets results after their TTL', async () => {
    let clock = 0;
    const jobs = createPackageJobs(() => new Promise(() => {}), {
      now: () => clock,
      deadlineMs: 1_000,
      resultTtlMs: 5_000
    });
    const { jobId } = jobs.start('SU100', '2026-05-20', 'en')!;
    clock = 2_000;
    expect(jobs.get(jobId)).toMatchObject({ status: 'error', reason: 'timeout' });
    clock = 8_000;
    expect(jobs.get(jobId)).toBeNull();
  });

  it('refuses new work at capacity', () => {
    const jobs = createPackageJobs(() => new Promise(() => {}), { maxJobs: 1 });
    expect(jobs.start('SU100', '2026-05-20', 'en')).not.toBeNull();
    expect(jobs.start('SU101', '2026-05-20', 'en')).toBeNull();
  });
});

describe('GET /flights/track', () => {
  const get = (url: string) => app.inject({ method: 'GET', url, headers: AUTH });
  const track = {
    points: [[37.41, 55.97, 0, 0], [30.26, 59.8, 0, 4800]],
    flownOn: '2026-09-22',
    from: 'SVO',
    to: 'LED'
  };

  it('answers with the recent track', async () => {
    vi.mocked(getRecentTrack).mockResolvedValue({ track: track as any });
    const res = await get('/flights/track?number=SU1234');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(track);
    expect(getRecentTrack).toHaveBeenCalledWith('SU1234');
  });

  it('answers 404 when there is none, with the reason when the provider failed', async () => {
    vi.mocked(getRecentTrack).mockResolvedValue({ track: null });
    expect((await get('/flights/track?number=SU1234')).statusCode).toBe(404);
    vi.mocked(getRecentTrack).mockResolvedValue({ track: null, error: 'not_configured' });
    const res = await get('/flights/track?number=SU1234');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ reason: 'not_configured' });
  });

  it('rejects a missing or malformed number before asking anyone', async () => {
    expect((await get('/flights/track')).statusCode).toBe(400);
    expect((await get('/flights/track?number=SU1%3A00')).statusCode).toBe(400);
    expect(getRecentTrack).not.toHaveBeenCalled();
  });
});
