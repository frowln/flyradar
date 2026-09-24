import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../src/db/prisma.js', () => ({ prisma: {} }));

import { buildApp, trustProxyFromEnv, loggerOptions } from '../src/app.js';
import { assertAuthConfig } from '../src/middleware/auth.js';

let app: FastifyInstance;

beforeEach(async () => {
  vi.stubEnv('AUTH_HMAC_SECRET', '');
  vi.stubEnv('METRICS_TOKEN', '');
  app = await buildApp({ logger: false });
  app.get('/test/boom', async () => {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
  });
  app.get('/test/bad-input', async () => {
    throw Object.assign(new Error('flightNumber is required'), { statusCode: 400 });
  });
  app.get('/test/duplicate', async () => {
    throw Object.assign(new Error('Unique constraint failed on the fields: (`appleSub`)'), { code: 'P2002' });
  });
  app.get('/test/missing', async () => {
    throw Object.assign(new Error('No record was found for an update.'), { code: 'P2025' });
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

describe('error handler', () => {
  it('hides the message of a server error', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error'
    });
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('10.0.0.5');
  });

  it('keeps the message of a client error', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/bad-input' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'Bad Request', message: 'flightNumber is required' });
  });

  it('maps Prisma constraint and not-found errors to 409 and 404 without their wording', async () => {
    const dup = await app.inject({ method: 'GET', url: '/test/duplicate' });
    expect(dup.statusCode).toBe(409);
    expect(dup.body).not.toContain('appleSub');

    const missing = await app.inject({ method: 'GET', url: '/test/missing' });
    expect(missing.statusCode).toBe(404);
  });

  it('accepts a bodiless request that still says it is JSON, as the app sends DELETEs', async () => {
    const local = await buildApp({ logger: false });
    local.delete('/test/echo', async (req) => ({ body: req.body ?? null }));
    local.post('/test/echo', async (req) => ({ body: req.body ?? null }));
    const res = await local.inject({
      method: 'DELETE',
      url: '/test/echo',
      headers: { 'content-type': 'application/json', 'content-length': '0' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: null });

    // The stock parser's prototype-poisoning check still applies.
    const poisoned = await local.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"__proto__":{"isAdmin":true}}'
    });
    expect(poisoned.statusCode).toBe(400);
    await local.close();
  });

  it('keeps Fastify’s own 4xx, such as malformed JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/flights/lookup',
      headers: { 'content-type': 'application/json', authorization: 'Bearer dev_1790000000000_abcdef123456' },
      payload: '{"flightNumber":'
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('metrics', () => {
  it('does not exist without METRICS_TOKEN', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);
  });

  it('requires the bearer token when configured, and counts server errors', async () => {
    vi.stubEnv('METRICS_TOKEN', 'scrape-secret');
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer wrong' } })).statusCode
    ).toBe(401);

    const read = async () =>
      (await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer scrape-secret' } })).body;
    const errorsIn = (text: string) => Number(/skyatlas_errors_total (\d+)/.exec(text)![1]);

    const before = errorsIn(await read());
    await app.inject({ method: 'GET', url: '/test/boom' });
    expect(errorsIn(await read())).toBe(before + 1);
  });
});

describe('rate limiting', () => {
  it('keys on the client address, so rotating X-Device-Id buys nothing', async () => {
    let limited = 0;
    for (let i = 0; i < 105; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-device-id': `dev_rotating_device_${i.toString().padStart(4, '0')}` }
      });
      if (res.statusCode === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe('configuration', () => {
  it('trusts one proxy hop in production and none elsewhere by default', () => {
    expect(trustProxyFromEnv({ NODE_ENV: 'production' })).toBe(1);
    expect(trustProxyFromEnv({ NODE_ENV: 'development' })).toBe(false);
    expect(trustProxyFromEnv({ TRUST_PROXY: 'true' })).toBe(true);
    expect(trustProxyFromEnv({ NODE_ENV: 'production', TRUST_PROXY: 'false' })).toBe(false);
    expect(trustProxyFromEnv({ TRUST_PROXY: '2' })).toBe(2);
    expect(trustProxyFromEnv({ TRUST_PROXY: '10.0.0.0/8,127.0.0.1' })).toBe('10.0.0.0/8,127.0.0.1');
  });

  it('logs plain JSON in production and pretty output in development', () => {
    expect(loggerOptions({ NODE_ENV: 'production' })).toEqual({ level: 'info' });
    expect(loggerOptions({ NODE_ENV: 'development', LOG_LEVEL: 'debug' })).toMatchObject({
      level: 'debug',
      transport: { target: 'pino-pretty' }
    });
  });

  it('refuses to run production without the request-signing secret', () => {
    expect(() => assertAuthConfig({ NODE_ENV: 'production' })).toThrow(/AUTH_HMAC_SECRET/);
    expect(() => assertAuthConfig({ NODE_ENV: 'production', AUTH_HMAC_SECRET: 's' })).not.toThrow();
    expect(() => assertAuthConfig({ NODE_ENV: 'development' })).not.toThrow();
  });
});
