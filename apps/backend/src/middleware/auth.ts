import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Request signing — an anti-abuse filter, not authentication.
 *
 * The HMAC secret ships inside the mobile app bundle, so anyone willing to
 * unpack the app can sign requests exactly as the app does. What the signature
 * buys is friction: a replayed or hand-written request from curl or a generic
 * scraper fails, and a script has to be written deliberately against this API.
 * It says nothing about *who* is calling. Identity is the device token (an
 * anonymous, self-issued id) and, for an account, a verified Apple identity
 * token — never the signature. Nothing may be authorised on the strength of it.
 *
 * With `AUTH_HMAC_SECRET` set, every request through `requireAuth` must be
 * signed. Without it — development and tests — only the device token's shape is
 * checked. Production refuses to boot without the secret (`assertAuthConfig`),
 * because a missing variable would otherwise switch the filter off silently.
 */

const MAX_SKEW_MS = 5 * 60 * 1000;
/**
 * The device token the app mints (`dev_<ms>_<random>`), or anything else in
 * the RFC 6750 token alphabet. The lower bound keeps out placeholder values.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{20,256}$/;

function hmacSecret(): string | undefined {
  return process.env['AUTH_HMAC_SECRET'] || undefined;
}

/** Throws when the environment would run production without request signing. */
export function assertAuthConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env['NODE_ENV'] === 'production' && !env['AUTH_HMAC_SECRET']) {
    throw new Error(
      'AUTH_HMAC_SECRET must be set in production. It is an anti-abuse filter, ' +
        'not authentication — see apps/backend/README.md.'
    );
  }
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  const deviceToken = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!TOKEN_PATTERN.test(deviceToken)) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  const secret = hmacSecret();
  if (!secret) return;

  const tsHeader = req.headers['x-timestamp'];
  const sigHeader = req.headers['x-signature'];
  if (typeof tsHeader !== 'string' || typeof sigHeader !== 'string') {
    return reply.code(401).send({ error: 'Unauthorized: missing signature' });
  }
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return reply.code(401).send({ error: 'Unauthorized: stale request' });
  }
  const method = req.method.toUpperCase();
  const path = (req.url ?? '').split('?')[0];
  const body = req.body ? JSON.stringify(req.body) : '';
  const payload = `${method}\n${path}\n${ts}\n${deviceToken}\n${body}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (!safeEqualHex(expected, sigHeader)) {
    return reply.code(401).send({ error: 'Unauthorized: bad signature' });
  }
}
