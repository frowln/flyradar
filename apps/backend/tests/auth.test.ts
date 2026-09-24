import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { requireAuth } from '../src/middleware/auth.js';

const TOKEN = 'dev_1790000000000_abcdef123456';
const SECRET = 'shipped-in-the-app-bundle';

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  app.addHook('preHandler', requireAuth);
  app.post('/flights/lookup', async () => ({ ok: true }));
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

/** Signs exactly as apps/mobile/src/core/crypto/sign.ts does. */
function signed(body: object, ts = Date.now(), secret = SECRET) {
  const bodyStr = JSON.stringify(body);
  const sig = createHmac('sha256', secret)
    .update(`POST\n/flights/lookup\n${ts}\n${TOKEN}\n${bodyStr}`)
    .digest('hex');
  return {
    method: 'POST' as const,
    url: '/flights/lookup',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      'x-timestamp': String(ts),
      'x-signature': sig
    },
    payload: bodyStr
  };
}

const body = { flightNumber: 'SU100', date: '2026-05-20' };

describe('requireAuth without a signing secret (development)', () => {
  beforeEach(() => vi.stubEnv('AUTH_HMAC_SECRET', ''));

  it('lets a well-formed device token through unsigned', async () => {
    const res = await app.inject({ method: 'POST', url: '/flights/lookup', headers: { authorization: `Bearer ${TOKEN}` }, payload: body });
    expect(res.statusCode).toBe(200);
  });

  it('still refuses a missing or junk token', async () => {
    for (const authorization of [undefined, 'Bearer short', `Basic ${TOKEN}`, `Bearer ${TOKEN} extra`]) {
      const res = await app.inject({
        method: 'POST',
        url: '/flights/lookup',
        headers: authorization ? { authorization } : {},
        payload: body
      });
      expect(res.statusCode, String(authorization)).toBe(401);
    }
  });
});

describe('requireAuth with a signing secret', () => {
  beforeEach(() => vi.stubEnv('AUTH_HMAC_SECRET', SECRET));

  it('accepts a request signed the way the app signs', async () => {
    expect((await app.inject(signed(body))).statusCode).toBe(200);
  });

  it('refuses unsigned, stale, and wrongly signed requests', async () => {
    const unsigned = await app.inject({ method: 'POST', url: '/flights/lookup', headers: { authorization: `Bearer ${TOKEN}` }, payload: body });
    expect(unsigned.statusCode).toBe(401);
    expect((await app.inject(signed(body, Date.now() - 10 * 60 * 1000))).statusCode).toBe(401);
    expect((await app.inject(signed(body, Date.now(), 'another-secret'))).statusCode).toBe(401);
  });

  it('refuses a signed request whose body was changed', async () => {
    const req = signed(body);
    req.payload = JSON.stringify({ ...body, flightNumber: 'BA117' });
    expect((await app.inject(req)).statusCode).toBe(401);
  });
});
