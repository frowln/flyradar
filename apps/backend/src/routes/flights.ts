import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getFlight } from '../services/flightLookup.js';
import { buildPackage } from '../services/packageBuilder.js';

const lookupBody = z.object({
  flightNumber: z.string().min(2).max(10),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const flightRoutes: FastifyPluginAsync = async (app) => {
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
  app.post('/flights/package', async (req, reply) => {
    const body = lookupBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.flatten() });
    }
    const pkg = await buildPackage(body.data.flightNumber, body.data.date);
    if (!pkg) {
      return reply.code(404).send({ error: 'Cannot build package for this flight' });
    }
    return pkg;
  });
};
