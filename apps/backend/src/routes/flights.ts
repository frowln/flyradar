import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getFlightDetailed } from '../services/flightLookup.js';
import { getRecentTrack } from '../services/recentTrack.js';
import { buildPackage, getCachedPackage } from '../services/packageBuilder.js';
import { createPackageJobs } from '../services/packageJobs.js';
import { requireAuth } from '../middleware/auth.js';
import { incError, incPackage } from './metrics.js';
import { SUPPORTED_LOCALES } from '../locales.js';

/** A date the calendar actually has: the regex alone admits 2026-13-45. */
export function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const lookupBody = z.object({
  // Letters and digits only: the value is sent to AviationStack and becomes
  // part of cache keys, where a ':' could make two flights share one entry.
  flightNumber: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9]+$/),
  date: z.string().refine(isCalendarDate, 'Not a calendar date (YYYY-MM-DD)'),
  // A closed set, because the locale ends up in a Wikipedia hostname. An
  // unsupported language gets English rather than an error.
  locale: z.enum(SUPPORTED_LOCALES).catch('en')
});

const jobParams = z.object({ jobId: z.uuid() });

const trackQuery = z.object({
  number: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9]+$/)
});

export const flightRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  const jobs = createPackageJobs(buildPackage, {
    onDone: incPackage,
    onError: (err) => {
      incError();
      app.log.error({ err }, 'package build failed');
    }
  });

  // POST /flights/lookup — returns flight info (fast, from cache or AeroDataBox / AviationStack)
  app.post('/flights/lookup', async (req, reply) => {
    const body = lookupBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: z.flattenError(body.error) });
    }
    const { flight, availableDates, providerError } = await getFlightDetailed(
      body.data.flightNumber,
      body.data.date
    );
    if (!flight) {
      // `availableDates` is what turns a dead end into an instruction: the free
      // provider plan only carries the last few days, so a flight booked for
      // next week is absent even though the flight number is perfectly real.
      return reply.code(404).send({
        error: 'Flight not found',
        availableDates,
        ...(providerError ? { reason: providerError } : {})
      });
    }
    return flight;
  });

  /**
   * GET /flights/track?number=SU1234 — the path this flight number flew most
   * recently (within a week), simplified to at most 150 points:
   * `{ points: [[lon, lat, altM, tSec], ...], flownOn, from, to }`, or 404.
   * One provider call per number per day, however many passengers ask.
   */
  app.get<{ Querystring: { number?: string } }>(
    '/flights/track',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const query = trackQuery.safeParse(req.query);
      if (!query.success) {
        return reply.code(400).send({ error: 'Invalid request', details: z.flattenError(query.error) });
      }
      const { track, error } = await getRecentTrack(query.data.number);
      if (!track) {
        return reply.code(404).send({ error: 'No recent track', ...(error ? { reason: error } : {}) });
      }
      return track;
    }
  );

  /**
   * POST /flights/package — the offline package for a flight.
   *
   * 200 with the package when it is already built; otherwise 202 with a job id
   * to poll at GET /flights/package/:jobId. `?sync=1` keeps the old behaviour
   * of holding the request open until the build finishes, for app versions
   * that predate the job flow.
   */
  app.post<{ Querystring: { sync?: string } }>(
    '/flights/package',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = lookupBody.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request', details: z.flattenError(body.error) });
      }
      const { flightNumber, date, locale } = body.data;

      if (req.query.sync === '1' || req.query.sync === 'true') {
        const pkg = await buildPackage(flightNumber, date, locale);
        if (!pkg) {
          return reply.code(404).send({ error: 'Cannot build package for this flight' });
        }
        incPackage();
        return pkg;
      }

      const cached = await getCachedPackage(flightNumber, date, locale);
      if (cached) return cached;

      const started = jobs.start(flightNumber, date, locale);
      if (!started) {
        return reply
          .code(503)
          .header('Retry-After', '30')
          .send({ error: 'Too many packages being built, try again shortly' });
      }
      return reply
        .code(202)
        .header('Location', `/flights/package/${started.jobId}`)
        .header('Retry-After', '3')
        .send({ jobId: started.jobId, status: 'pending' });
    }
  );

  app.get<{ Params: { jobId: string } }>('/flights/package/:jobId', async (req, reply) => {
    const params = jobParams.safeParse(req.params);
    const view = params.success ? jobs.get(params.data.jobId) : null;
    // Unknown and expired look the same: either way, start a new build.
    if (!view) return reply.code(404).send({ error: 'Unknown or expired job' });
    return view;
  });
};
