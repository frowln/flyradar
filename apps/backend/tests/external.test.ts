import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer as createHttpServer, type Server } from 'node:http';
import Fastify from 'fastify';
import { connect as netConnect, type AddressInfo } from 'node:net';
import { fetchWikiSummary, isWikiLang } from '../src/external/wikipedia.js';
import { fetchViaConnect } from '../src/external/outbound.js';
import { entitlementActive, subscriptionRoutes } from '../src/routes/subscription.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Wikipedia language allow-list', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(JSON.stringify({ extract: 'A mountain.' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('only admits the languages the app ships', () => {
    for (const ok of ['en', 'ru', 'de', 'fr', 'es', 'ja']) expect(isWikiLang(ok), ok).toBe(true);
    for (const bad of ['pt', 'EN', 'evil.com#', 'en.evil.com', 'localhost:3000/', '']) {
      expect(isWikiLang(bad), bad).toBe(false);
    }
  });

  it('never builds a request for a language outside the list', async () => {
    expect(await fetchWikiSummary('Mont Blanc', 'attacker.example/x?')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks Wikipedia with an encoded title and a timeout', async () => {
    const summary = await fetchWikiSummary('AC/DC ?#', 'fr');
    expect(summary).toEqual({ extract: 'A mountain.', thumbnail: undefined });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://fr.wikipedia.org/api/rest_v1/page/summary/AC%2FDC%20%3F%23');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('RevenueCat entitlements', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');

  it('treats a lifetime purchase (no expiry) as active', () => {
    expect(entitlementActive({ expires_date: null }, now)).toBe(true);
  });

  it('checks the expiry of a subscription, grace period included', () => {
    expect(entitlementActive({ expires_date: '2026-10-01T00:00:00Z' }, now)).toBe(true);
    expect(entitlementActive({ expires_date: '2026-09-01T00:00:00Z' }, now)).toBe(false);
    expect(
      entitlementActive({ expires_date: '2026-09-01T00:00:00Z', grace_period_expires_date: '2026-09-30T00:00:00Z' }, now)
    ).toBe(true);
  });

  it('treats a missing entitlement as inactive', () => {
    expect(entitlementActive(undefined, now)).toBe(false);
    expect(entitlementActive({}, now)).toBe(false);
  });

  it('encodes the client-supplied user id into the RevenueCat path', async () => {
    vi.stubEnv('AUTH_HMAC_SECRET', '');
    vi.stubEnv('REVENUECAT_SECRET_KEY', 'sk_test');
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ subscriber: { entitlements: { pro: { expires_date: null } } } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const app = Fastify({ logger: false });
    await app.register(subscriptionRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/subscription/verify',
      headers: { authorization: 'Bearer dev_1790000000000_abcdef123456' },
      payload: { appUserId: '../../projects/x' }
    });

    expect(res.json()).toEqual({ verified: true });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.revenuecat.com/v1/subscribers/..%2F..%2Fprojects%2Fx');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    await app.close();
  });
});

describe('outbound proxy tunnel', () => {
  let target: Server;
  let proxy: Server;
  const connects: string[] = [];

  beforeEach(async () => {
    connects.length = 0;
    target = createHttpServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ path: req.url, via: req.headers['x-test'] }));
    });
    // A minimal CONNECT proxy, like tinyproxy: open a TCP tunnel and pipe.
    proxy = createHttpServer();
    proxy.on('connect', (req, client, head) => {
      connects.push(req.url ?? '');
      const [host, port] = (req.url ?? '').split(':');
      const upstream = netConnect(Number(port), host, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on('error', () => client.destroy());
    });
    await Promise.all([
      new Promise<void>((r) => target.listen(0, '127.0.0.1', r)),
      new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r))
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      new Promise((r) => target.close(r)),
      new Promise((r) => proxy.close(r))
    ]);
  });

  it('sends the request through a CONNECT tunnel and returns a normal Response', async () => {
    const targetPort = (target.address() as AddressInfo).port;
    const proxyPort = (proxy.address() as AddressInfo).port;

    const res = await fetchViaConnect(
      new URL(`http://127.0.0.1:${targetPort}/v1/flights?flight_iata=SU100`),
      new URL(`http://127.0.0.1:${proxyPort}`),
      { headers: { 'x-test': 'tunnelled' }, signal: AbortSignal.timeout(5_000) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: '/v1/flights?flight_iata=SU100', via: 'tunnelled' });
    expect(connects).toEqual([`127.0.0.1:${targetPort}`]);
  });

  it('fails when the proxy refuses the tunnel', async () => {
    const refusing = createHttpServer();
    refusing.on('connect', (_req, client) => client.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
    await new Promise<void>((r) => refusing.listen(0, '127.0.0.1', r));
    const port = (refusing.address() as AddressInfo).port;

    await expect(
      fetchViaConnect(new URL('https://api.aviationstack.com/v1/flights'), new URL(`http://127.0.0.1:${port}`))
    ).rejects.toThrow(/403/);
    await new Promise((r) => refusing.close(r));
  });
});
