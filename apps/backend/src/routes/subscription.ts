import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const REVENUECAT_API_KEY = process.env['REVENUECAT_SECRET_KEY'];

export const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  app.post('/subscription/verify', async (req, reply) => {
    const body = z.object({ appUserId: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });

    if (!REVENUECAT_API_KEY) {
      // Without key — no validation possible, degrade gracefully
      return { verified: false, reason: 'not_configured' };
    }

    try {
      const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${body.data.appUserId}`, {
        headers: { Authorization: `Bearer ${REVENUECAT_API_KEY}` }
      });
      if (!r.ok) return { verified: false };
      const data = await r.json() as any;
      const isPro = data.subscriber?.entitlements?.pro?.expires_date
        ? new Date(data.subscriber.entitlements.pro.expires_date) > new Date()
        : false;
      return { verified: isPro };
    } catch {
      return { verified: false };
    }
  });
};
