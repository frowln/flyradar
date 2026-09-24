import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn()
  });
  const client: Record<string, any> = {
    device: model(),
    user: model(),
    discovery: model(),
    pOI: model(),
    pOIStat: model(),
    review: model(),
    reviewVote: model(),
    report: model(),
    friendship: model(),
    userStats: model()
  };
  // Interactive transactions run against the same mock.
  client['$transaction'] = vi.fn(async (fn: (tx: unknown) => unknown) => fn(client));
  return client;
});

vi.mock('../src/db/prisma.js', () => ({ prisma: db }));
vi.mock('../src/auth/apple.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/apple.js')>()),
  verifyAppleIdentityToken: vi.fn()
}));

import { socialRoutes } from '../src/routes/social.js';
import { errorHandler } from '../src/errorHandler.js';
import { verifyAppleIdentityToken, AppleTokenError } from '../src/auth/apple.js';

const DEVICE = 'dev_1790000000000_abcdef123456';
const HEADERS = { authorization: `Bearer ${DEVICE}`, 'x-device-id': DEVICE, 'x-platform': 'ios' };

let app: FastifyInstance;

function resetDb() {
  for (const m of Object.values(db)) {
    if (typeof m === 'function') continue;
    for (const fn of Object.values(m as Record<string, ReturnType<typeof vi.fn>>)) fn.mockReset();
  }
  db['$transaction'].mockReset();
  db['$transaction'].mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  db['device'].upsert.mockResolvedValue({ id: DEVICE, userId: 'u1', user: { id: 'u1', suspendedAt: null } });
  db['discovery'].count.mockResolvedValue(0);
  db['discovery'].findUnique.mockResolvedValue(null);
  db['discovery'].create.mockResolvedValue({});
  db['pOIStat'].upsert.mockResolvedValue({});
  db['userStats'].upsert.mockResolvedValue({});
  db['pOI'].findUnique.mockResolvedValue({ id: 'gn-1' });
}

beforeEach(async () => {
  vi.stubEnv('AUTH_HMAC_SECRET', '');
  resetDb();
  app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  await app.register(socialRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

const send = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, headers = HEADERS) =>
  app.inject({ method, url, headers, ...(payload ? { payload } : {}) });

describe('device identity', () => {
  it('refuses a missing or malformed device id', async () => {
    for (const id of [undefined, 'short', 'x'.repeat(200), 'dev_123456789012345/../..', 'dev 1790000000000 abc']) {
      const headers = { authorization: HEADERS.authorization, ...(id ? { 'x-device-id': id } : {}) };
      const res = await app.inject({ method: 'GET', url: '/social/me', headers });
      expect(res.statusCode, String(id)).toBe(400);
    }
    expect(db['device'].upsert).not.toHaveBeenCalled();
  });
});

describe('profile edits', () => {
  it('accepts a reasonable handle and https avatar', async () => {
    db['user'].update.mockResolvedValue({ id: 'u1', handle: 'Ana', avatarUrl: 'https://cdn.example/a.png' });
    const res = await send('PATCH', '/social/me', { handle: '  Ana ', avatarUrl: 'https://cdn.example/a.png' });
    expect(res.statusCode).toBe(200);
    expect(db['user'].update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { handle: 'Ana', avatarUrl: 'https://cdn.example/a.png' }
    });
  });

  it.each([
    ['a handle too short', { handle: 'A' }],
    ['a handle too long', { handle: 'A'.repeat(25) }],
    ['a handle with a direction override', { handle: 'evil‮gnp.exe' }],
    ['a handle with a newline', { handle: 'two\nlines' }],
    ['an http avatar', { avatarUrl: 'http://cdn.example/a.png' }],
    ['a javascript: avatar', { avatarUrl: 'javascript:alert(1)' }],
    ['an avatar with credentials', { avatarUrl: 'https://user:pw@cdn.example/a.png' }],
    ['an avatar URL over 512 characters', { avatarUrl: `https://cdn.example/${'a'.repeat(520)}` }],
    ['a handle that is not a string', { handle: 42 }]
  ])('rejects %s', async (_label, payload) => {
    const res = await send('PATCH', '/social/me', payload);
    expect(res.statusCode).toBe(400);
    expect(db['user'].update).not.toHaveBeenCalled();
  });
});

describe('Apple linking', () => {
  it('no longer accepts a bare subject', async () => {
    const res = await send('POST', '/social/link/apple', { appleSub: '001234.victim.0001' });
    expect(res.statusCode).toBe(400);
    expect(verifyAppleIdentityToken).not.toHaveBeenCalled();
    expect(db['user'].update).not.toHaveBeenCalled();
  });

  it('refuses a token that does not verify', async () => {
    vi.mocked(verifyAppleIdentityToken).mockRejectedValue(new AppleTokenError('bad signature'));
    const res = await send('POST', '/social/link/apple', { identityToken: 'a'.repeat(40) });
    expect(res.statusCode).toBe(401);
    expect(db['$transaction']).not.toHaveBeenCalled();
  });

  it('links the subject read from a verified token', async () => {
    vi.mocked(verifyAppleIdentityToken).mockResolvedValue({ sub: 'apple-sub-1' });
    db['user'].findUniqueOrThrow.mockResolvedValue({ id: 'u1', appleSub: null });
    db['user'].findUnique.mockResolvedValue(null);
    db['user'].update.mockResolvedValue({ id: 'u1' });

    const res = await send('POST', '/social/link/apple', { identityToken: 'a'.repeat(40) });
    expect(res.json()).toEqual({ id: 'u1', merged: false });
    expect(db['user'].update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { appleSub: 'apple-sub-1' } });
  });

  it('merges into the existing account and un-counts places both had found', async () => {
    vi.mocked(verifyAppleIdentityToken).mockResolvedValue({ sub: 'apple-sub-1' });
    db['user'].findUniqueOrThrow.mockResolvedValue({ id: 'u1', appleSub: null });
    db['user'].findUnique.mockResolvedValue({ id: 'u2', appleSub: 'apple-sub-1' });
    db['discovery'].findMany
      .mockResolvedValueOnce([{ poiId: 'gn-1' }, { poiId: 'gn-2' }]) // the anonymous account's
      .mockResolvedValueOnce([{ poiId: 'gn-2' }]); // of those, already on the claimed account
    db['review'].findMany.mockResolvedValue([]);
    db['reviewVote'].findMany.mockResolvedValue([]);
    db['friendship'].findMany.mockResolvedValue([]);
    db['discovery'].count.mockResolvedValue(5);

    const res = await send('POST', '/social/link/apple', { identityToken: 'a'.repeat(40) });

    expect(res.json()).toEqual({ id: 'u2', merged: true });
    expect(db['discovery'].deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', poiId: { in: ['gn-2'] } } });
    expect(db['pOIStat'].updateMany).toHaveBeenCalledWith({
      where: { poiId: { in: ['gn-2'] } },
      data: { discoveryCount: { decrement: 1 } }
    });
    expect(db['discovery'].updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { userId: 'u2' } });
    expect(db['user'].delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('will not swap one Apple identity for another', async () => {
    vi.mocked(verifyAppleIdentityToken).mockResolvedValue({ sub: 'apple-sub-2' });
    db['user'].findUniqueOrThrow.mockResolvedValue({ id: 'u1', appleSub: 'apple-sub-1' });
    const res = await send('POST', '/social/link/apple', { identityToken: 'a'.repeat(40) });
    expect(res.statusCode).toBe(409);
  });
});

describe('discoveries', () => {
  it('records a place that exists', async () => {
    const res = await send('POST', '/social/discoveries', { poiId: 'gn-1', flightId: 'SU100-2026-05-20' });
    expect(res.json()).toEqual({ created: true });
    expect(db['pOIStat'].upsert).toHaveBeenCalled();
  });

  it('rejects a place the server has never heard of', async () => {
    db['pOI'].findUnique.mockResolvedValue(null);
    const res = await send('POST', '/social/discoveries', { poiId: 'gn-424242' });
    expect(res.statusCode).toBe(404);
    expect(db['discovery'].create).not.toHaveBeenCalled();
  });

  it('accepts places from the bundled datasets without a table lookup', async () => {
    const res = await send('POST', '/social/discoveries', { poiId: 'ne-pp-1234' });
    expect(res.json()).toEqual({ created: true });
    expect(db['pOI'].findUnique).not.toHaveBeenCalled();
  });

  it('caps discoveries per person per day', async () => {
    db['discovery'].count.mockResolvedValue(500);
    const res = await send('POST', '/social/discoveries', { poiId: 'gn-1' });
    expect(res.statusCode).toBe(429);
    expect(db['discovery'].create).not.toHaveBeenCalled();
  });

  it('treats a concurrent duplicate as already recorded, not a server error', async () => {
    db['$transaction'].mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    const res = await send('POST', '/social/discoveries', { poiId: 'gn-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: false });
  });

  it.each([[{}], [{ poiId: '' }], [{ poiId: 'gn 1; drop' }], [{ poiId: 'x'.repeat(200) }]])(
    'rejects a malformed body %j',
    async (payload) => {
      expect((await send('POST', '/social/discoveries', payload)).statusCode).toBe(400);
    }
  );
});

describe('reviews', () => {
  it.each([
    ['a rating above 5', { rating: 6 }],
    ['a rating below 1', { rating: 0 }],
    ['a fractional rating', { rating: 3.5 }],
    ['a rating as text', { rating: '5' }],
    ['a body over 600 characters', { rating: 4, body: 'x'.repeat(601) }]
  ])('rejects %s', async (_label, payload) => {
    const res = await send('PUT', '/social/pois/gn-1/review', payload);
    expect(res.statusCode).toBe(400);
    expect(db['$transaction']).not.toHaveBeenCalled();
  });

  it('does not un-hide a moderated review when it is saved again', async () => {
    db['review'].findUnique.mockResolvedValue({ id: 'r1', rating: 2, hiddenAt: new Date() });
    db['review'].update.mockResolvedValue({ id: 'r1' });

    const res = await send('PUT', '/social/pois/gn-1/review', { rating: 5, body: 'Better now' });

    expect(res.json()).toEqual({ id: 'r1', replaced: true });
    const { data } = db['review'].update.mock.calls[0][0];
    expect(data).toEqual({ rating: 5, body: 'Better now' });
    expect(data).not.toHaveProperty('hiddenAt');
    expect(db['pOIStat'].upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { ratingSum: { increment: 3 } } })
    );
  });

  it('answers 404, not 500, when voting on a review that does not exist', async () => {
    db['reviewVote'].upsert.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint violated on ReviewVote_reviewId_fkey'), { code: 'P2003' })
    );
    const res = await send('POST', '/social/reviews/nope/vote', { helpful: true });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('ReviewVote_reviewId_fkey');
  });

  it('rejects an unknown report reason', async () => {
    const res = await send('POST', '/social/reviews/r1/report', { reason: 'boring' });
    expect(res.statusCode).toBe(400);
  });
});

describe('public profile', () => {
  it('shows dates to the month only', async () => {
    db['user'].findUnique.mockResolvedValue({
      id: 'u9',
      handle: 'Ana',
      avatarUrl: null,
      createdAt: new Date('2026-03-17T08:42:13Z'),
      suspendedAt: null,
      stats: null
    });
    db['discovery'].findMany.mockResolvedValue([
      { poiId: 'gn-1', discoveredAt: new Date('2026-09-23T22:14:05Z') }
    ]);
    db['pOI'].findMany.mockResolvedValue([{ id: 'gn-1', name: 'Mont Blanc' }]);

    const body = (await send('GET', '/social/users/u9')).json();
    expect(body.joinedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(body.recent).toEqual([
      { poiId: 'gn-1', discoveredAt: '2026-09-01T00:00:00.000Z', name: 'Mont Blanc' }
    ]);
  });
});
