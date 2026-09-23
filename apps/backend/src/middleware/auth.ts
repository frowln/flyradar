import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';

const HMAC_SECRET = process.env['AUTH_HMAC_SECRET'];
const MAX_SKEW_MS = 5 * 60 * 1000;
const MIN_TOKEN_LEN = 20;

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
  if (!auth || !auth.startsWith('Bearer ') || auth.length < MIN_TOKEN_LEN + 7) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  const deviceToken = auth.slice(7);

  // No HMAC secret configured — fall back to presence check (dev / tests).
  // Production deployments MUST set AUTH_HMAC_SECRET.
  if (!HMAC_SECRET) return;

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
  const expected = createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  if (!safeEqualHex(expected, sigHeader)) {
    return reply.code(401).send({ error: 'Unauthorized: bad signature' });
  }
}
