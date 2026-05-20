import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getFlight } from '../services/flightLookup.js';
import { buildPackage } from '../services/packageBuilder.js';
import { requireAuth } from '../middleware/auth.js';

const lookupBody = z.object({
  flightNumber: z.string().min(2).max(10),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locale: z.string().optional().default('en')
});

export const flightRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // POST /flights/lookup — returns flight info (fast, from cache or AviationStack)
  app.post('/flights/lookup', async (req, reply) => {
    const body = lookupBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.flatten() });
    }
    const flight = await getFlight(body.data.flightNumber, body.data.date);
    if (!flight) {
      return reply.code(404).send({ error: 'Flight not found' });
    }
    return flight;
  });

  // POST /flights/package — builds full offline package (slow, triggers POI aggregation)
  app.post('/flights/package', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = lookupBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.flatten() });
    }
    const pkg = await buildPackage(body.data.flightNumber, body.data.date, body.data.locale);
    if (!pkg) {
      return reply.code(404).send({ error: 'Cannot build package for this flight' });
    }
    return pkg;
  });
};
