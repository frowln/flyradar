import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { cloudsAlong } from '../services/clouds.js';

const cloudsBody = z.object({
  // Sixty points is one every 15 minutes of a 15-hour flight: the whole route in one request.
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        at: z.iso.datetime({ offset: true })
      })
    )
    .min(1)
    .max(60)
});

export const weatherRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  /**
   * POST /weather/clouds — forecast cloud cover along a route.
   *
   * Body `{ points: [{ lat, lon, at }] }`; answers `{ points: [{ at, cloud,
   * low, mid }] }` in the same order, percentages from the hour nearest to
   * each `at`, null where the forecast does not reach (more than ~15 days
   * ahead). 503 when the forecast service cannot be asked.
   */
  app.post(
    '/weather/clouds',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = cloudsBody.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request', details: z.flattenError(body.error) });
      }
      const result = await cloudsAlong(body.data.points);
      if ('error' in result) {
        return reply
          .code(503)
          .header('Retry-After', '60')
          .send({ error: 'Cloud forecast unavailable', reason: result.error });
      }
      return result;
    }
  );
};
