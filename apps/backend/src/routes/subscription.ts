import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const TIMEOUT_MS = 5_000;

const verifyBody = z.object({
  // RevenueCat ids: "$RCAnonymousID:<hex>" or whatever the app set.
  appUserId: z.string().trim().min(1).max(256)
});

interface Entitlement {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
}

/**
 * Whether a RevenueCat entitlement grants access right now.
 *
 * A lifetime purchase has `expires_date: null` — never expiring, not absent —
 * and used to read as "not subscribed", locking out exactly the people who paid
 * the most. A subscription in its billing grace period is still active too.
 */
export function entitlementActive(entitlement: unknown, now = Date.now()): boolean {
  if (!entitlement || typeof entitlement !== 'object') return false;
  const { expires_date, grace_period_expires_date } = entitlement as Entitlement;
  if (expires_date === null) return true;
  return [expires_date, grace_period_expires_date].some(
    (d) => typeof d === 'string' && Date.parse(d) > now
  );
}

export const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.post('/subscription/verify', async (req, reply) => {
    const body = verifyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });

    const apiKey = process.env['REVENUECAT_SECRET_KEY'];
    if (!apiKey) {
      // Without key — no validation possible, degrade gracefully
      return { verified: false, reason: 'not_configured' };
    }

    try {
      // Encoded: the id is client-supplied, and unencoded a "../" in it would
      // address a different RevenueCat endpoint with our secret key attached.
      const r = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(body.data.appUserId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(TIMEOUT_MS)
        }
      );
      if (!r.ok) return { verified: false };
      const data = (await r.json()) as { subscriber?: { entitlements?: Record<string, unknown> } };
      return { verified: entitlementActive(data.subscriber?.entitlements?.['pro']) };
    } catch {
      return { verified: false };
    }
  });
};
