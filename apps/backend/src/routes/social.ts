import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { attachUser, userIdOf } from '../middleware/currentUser.js';
import { requireAuth } from '../middleware/auth.js';
import {
  verifyAppleIdentityToken,
  AppleTokenError,
  AppleKeysUnavailableError
} from '../auth/apple.js';
import { linkApple, recomputeStats } from '../services/accounts.js';

/**
 * Accounts, discoveries, reviews and the leaderboard.
 *
 * Two rules run through all of it:
 *
 *  · Aggregates are maintained on write. "347 people have flown over this" is
 *    read on every place card and changes a few times per flight, so it is a
 *    counter, not a COUNT(*).
 *
 *  · Anything a person can type is reportable and hideable. App Store Guideline
 *    1.2 requires it, and a review system without moderation is a liability the
 *    day it gets popular rather than a feature.
 *
 * Every body and parameter is parsed before use: these routes write rows other
 * people read, so a malformed value is refused here rather than stored.
 */

const MAX_BODY = 600;
const MAX_HANDLE = 24;
const LEADERBOARD_SIZE = 50;
const REVIEW_PAGE = 20;
/**
 * Far above what a real flight produces (a long-haul route names ~90 places),
 * low enough that a script cannot inflate the rarity numbers everyone sees.
 */
const MAX_DISCOVERIES_PER_DAY = 500;
/**
 * Places from the datasets bundled with the app ("ne-pp-1234"). They exist on
 * the device, not in the POI table, so they cannot be checked against it; the
 * pattern and the daily cap are what bound them.
 */
const BUNDLED_PLACE = /^ne-[a-z]{2}-[\w-]+$/;

/** Reasons a person can pick when reporting. Free text goes in `note`. */
const REPORT_REASONS = ['spam', 'offensive', 'off_topic', 'false_info', 'other'] as const;

// --- schemas ----------------------------------------------------------------

const rowId = z.string().min(1).max(64).regex(/^[\w-]+$/);
const poiId = z.string().min(1).max(128).regex(/^[\w.:-]+$/);
/**
 * Control characters, and the invisible direction overrides (U+202E and kin)
 * that make a name render as something other than what it is. Emoji joiners
 * stay allowed. Reviews and notes may also contain line breaks and tabs.
 */
const unsafeText = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const unsafeLine = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const safeText = (s: string) => !unsafeText.test(s);
const safeLine = (s: string) => !unsafeLine.test(s);

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const schemas = {
  poiParams: z.object({ poiId }),
  idParams: z.object({ id: rowId }),
  profilePatch: z.object({
    handle: z
      .string()
      .trim()
      .min(2, `Handle must be 2–${MAX_HANDLE} characters`)
      .max(MAX_HANDLE, `Handle must be 2–${MAX_HANDLE} characters`)
      .refine(safeLine, 'Handle contains unsupported characters')
      .optional(),
    // Shown to other people as an image source, so only https, and bounded.
    avatarUrl: z
      .string()
      .trim()
      .max(512)
      .refine(isHttpsUrl, 'avatarUrl must be an https URL')
      .nullable()
      .optional()
  }),
  linkApple: z.object({ identityToken: z.string().min(20).max(8192) }),
  discovery: z.object({
    poiId,
    flightId: z.string().max(64).regex(/^[\w.:-]+$/).nullish()
  }),
  reviewsQuery: z.object({ cursor: rowId.optional() }),
  review: z.object({
    rating: z.number().int().min(1).max(5),
    body: z
      .string()
      .trim()
      .max(MAX_BODY, `Review must be at most ${MAX_BODY} characters`)
      .refine(safeText, 'Review contains unsupported characters')
      .nullish()
  }),
  vote: z.object({ helpful: z.boolean().optional() }),
  report: z.object({
    reason: z.enum(REPORT_REASONS),
    note: z.string().trim().max(MAX_BODY).refine(safeText, 'Unsupported characters').nullish()
  }),
  follow: z.object({ blocked: z.boolean().optional() })
};

/** Parses or answers 400; the caller returns when it gets undefined. */
function parse<T extends z.ZodType>(schema: T, value: unknown, reply: FastifyReply): z.infer<T> | undefined {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  reply.code(400).send({
    // The app shows `error` as-is, so it carries the first specific reason.
    error: result.error.issues[0]?.message ?? 'Invalid request',
    details: z.flattenError(result.error)
  });
  return undefined;
}

/** Whether a place id names something that exists — on the server or in the app. */
async function placeExists(id: string): Promise<boolean> {
  if (BUNDLED_PLACE.test(id)) return true;
  return (await prisma.pOI.findUnique({ where: { id }, select: { id: true } })) !== null;
}

/**
 * Public dates are shown to the month. A profile listing exact timestamps of
 * when someone opened places mid-flight is a record of where they were, and when.
 */
function toMonth(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 'P2002';
}

export const socialRoutes: FastifyPluginAsync = async (app) => {
  // Hooks here are scoped to this plugin, so they only run for /social routes.
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', attachUser);

  // --- account ------------------------------------------------------------

  app.get('/social/me', async (req) => {
    const userId = userIdOf(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { stats: true }
    });
    return {
      id: user.id,
      handle: user.handle,
      avatarUrl: user.avatarUrl,
      linked: Boolean(user.appleSub ?? user.googleSub),
      stats: user.stats ?? emptyStats(user.id)
    };
  });

  app.patch('/social/me', async (req, reply) => {
    const userId = userIdOf(req);
    const body = parse(schemas.profilePatch, req.body, reply);
    if (!body) return reply;
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.handle !== undefined ? { handle: body.handle } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {})
      }
    });
    return { id: user.id, handle: user.handle, avatarUrl: user.avatarUrl };
  });

  /**
   * Claims the anonymous account with an Apple identity.
   *
   * Takes Apple's signed identity token, never a bare subject: the subject is
   * an identifier, not a secret, and accepting it from the body let anyone who
   * knew one merge their device into that person's account.
   */
  app.post('/social/link/apple', async (req, reply) => {
    const userId = userIdOf(req);
    const body = parse(schemas.linkApple, req.body, reply);
    if (!body) return reply;

    let appleSub: string;
    try {
      appleSub = (await verifyAppleIdentityToken(body.identityToken)).sub;
    } catch (e) {
      if (e instanceof AppleTokenError) {
        return reply.code(401).send({ error: 'Invalid Apple identity token' });
      }
      if (e instanceof AppleKeysUnavailableError) {
        return reply.code(503).send({ error: 'Apple sign-in is unavailable, try again later' });
      }
      throw e;
    }

    const result = await prisma.$transaction((tx) => linkApple(tx, userId, appleSub), {
      timeout: 15_000
    });
    if (result.kind === 'conflict') {
      return reply.code(409).send({ error: 'Account is already linked to a different Apple ID' });
    }
    return { id: result.id, merged: result.kind === 'merged' };
  });

  // --- discoveries --------------------------------------------------------

  /**
   * Records that this person opened this place. Idempotent: opening a card twice
   * is not two discoveries, which is what keeps the counters honest.
   */
  app.post('/social/discoveries', async (req, reply) => {
    const userId = userIdOf(req);
    const body = parse(schemas.discovery, req.body, reply);
    if (!body) return reply;
    const { poiId: place, flightId } = body;

    // Counted before anything else: past the cap there is nothing to look up.
    const today = await prisma.discovery.count({
      where: { userId, discoveredAt: { gte: startOfUtcDay() } }
    });
    if (today >= MAX_DISCOVERIES_PER_DAY) {
      return reply.code(429).send({ error: 'Daily discovery limit reached' });
    }
    if (!(await placeExists(place))) {
      return reply.code(404).send({ error: 'Unknown place' });
    }

    let created: boolean;
    try {
      created = await prisma.$transaction(async (tx) => {
        const existing = await tx.discovery.findUnique({
          where: { userId_poiId: { userId, poiId: place } }
        });
        if (existing) return false;
        await tx.discovery.create({ data: { userId, poiId: place, flightId: flightId ?? null } });
        await tx.pOIStat.upsert({
          where: { poiId: place },
          create: { poiId: place, discoveryCount: 1 },
          update: { discoveryCount: { increment: 1 } }
        });
        return true;
      });
    } catch (e) {
      // The same card opened twice at once: the other request recorded it.
      if (!isUniqueViolation(e)) throw e;
      created = false;
    }
    if (created) await recomputeStats(prisma, userId);
    return { created };
  });

  /**
   * The passive-social numbers shown on a place card: how many people have been
   * here, and how rare that makes it.
   */
  app.get('/social/pois/:poiId/stats', async (req, reply) => {
    const params = parse(schemas.poiParams, req.params, reply);
    if (!params) return reply;
    const [stat, totalUsers] = await Promise.all([
      prisma.pOIStat.findUnique({ where: { poiId: params.poiId } }),
      prisma.user.count()
    ]);
    const discoveries = stat?.discoveryCount ?? 0;
    return {
      discoveries,
      reviews: stat?.reviewCount ?? 0,
      rating: stat && stat.reviewCount > 0 ? stat.ratingSum / stat.reviewCount : null,
      /** Share of all users who have opened it — the basis for "rare find". */
      rarity: totalUsers > 0 ? discoveries / totalUsers : 0
    };
  });

  // --- reviews ------------------------------------------------------------

  app.get('/social/pois/:poiId/reviews', async (req, reply) => {
    const params = parse(schemas.poiParams, req.params, reply);
    if (!params) return reply;
    const query = parse(schemas.reviewsQuery, req.query, reply);
    if (!query) return reply;
    const rows = await prisma.review.findMany({
      where: { poiId: params.poiId, hiddenAt: null },
      orderBy: { createdAt: 'desc' },
      take: REVIEW_PAGE,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, handle: true, avatarUrl: true } },
        _count: { select: { votes: true } }
      }
    });
    return {
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        createdAt: r.createdAt,
        helpful: r._count.votes,
        author: { id: r.user.id, handle: r.user.handle, avatarUrl: r.user.avatarUrl }
      })),
      nextCursor: rows.length === REVIEW_PAGE ? rows[rows.length - 1]!.id : null
    };
  });

  /** One review per person per place — writing again replaces the previous one. */
  app.put('/social/pois/:poiId/review', async (req, reply) => {
    const userId = userIdOf(req);
    const params = parse(schemas.poiParams, req.params, reply);
    if (!params) return reply;
    const body = parse(schemas.review, req.body, reply);
    if (!body) return reply;
    const { poiId: place } = params;
    const { rating } = body;
    const text = body.body || null;

    if (!(await placeExists(place))) {
      return reply.code(404).send({ error: 'Unknown place' });
    }

    // Read and write together, so the counters move by exactly what changed.
    const { review, previous } = await prisma.$transaction(async (tx) => {
      const previous = await tx.review.findUnique({
        where: { userId_poiId: { userId, poiId: place } }
      });
      // Editing leaves moderation alone: clearing `hiddenAt` here let anyone
      // republish a hidden review by saving it again.
      const review = previous
        ? await tx.review.update({ where: { id: previous.id }, data: { rating, body: text } })
        : await tx.review.create({ data: { userId, poiId: place, rating, body: text } });
      await tx.pOIStat.upsert({
        where: { poiId: place },
        create: { poiId: place, reviewCount: 1, ratingSum: rating },
        update: previous
          ? { ratingSum: { increment: rating - previous.rating } }
          : { reviewCount: { increment: 1 }, ratingSum: { increment: rating } }
      });
      return { review, previous };
    });

    return { id: review.id, replaced: Boolean(previous) };
  });

  app.delete('/social/pois/:poiId/review', async (req, reply) => {
    const userId = userIdOf(req);
    const params = parse(schemas.poiParams, req.params, reply);
    if (!params) return reply;
    const { poiId: place } = params;

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.review.findUnique({ where: { userId_poiId: { userId, poiId: place } } });
      if (!existing) return false;
      await tx.review.delete({ where: { id: existing.id } });
      await tx.pOIStat.updateMany({
        where: { poiId: place },
        data: { reviewCount: { decrement: 1 }, ratingSum: { decrement: existing.rating } }
      });
      return true;
    });
    return { deleted };
  });

  app.post('/social/reviews/:id/vote', async (req, reply) => {
    const userId = userIdOf(req);
    const params = parse(schemas.idParams, req.params, reply);
    if (!params) return reply;
    const body = parse(schemas.vote, req.body, reply);
    if (!body) return reply;
    const helpful = body.helpful !== false;
    await prisma.reviewVote.upsert({
      where: { reviewId_userId: { reviewId: params.id, userId } },
      create: { reviewId: params.id, userId, helpful },
      update: { helpful }
    });
    return { ok: true };
  });

  /**
   * Abuse report. Required by App Store Guideline 1.2 for user-generated
   * content, and the only way a moderator learns anything is wrong.
   */
  app.post('/social/reviews/:id/report', async (req, reply) => {
    const userId = userIdOf(req);
    const params = parse(schemas.idParams, req.params, reply);
    if (!params) return reply;
    const body = parse(schemas.report, req.body, reply);
    if (!body) return reply;
    await prisma.report.create({
      data: {
        reporterId: userId,
        reviewId: params.id,
        reason: body.reason,
        note: body.note || null
      }
    });
    return { ok: true };
  });

  // --- people -------------------------------------------------------------

  app.get('/social/leaderboard', async () => {
    const rows = await prisma.userStats.findMany({
      orderBy: { xp: 'desc' },
      take: LEADERBOARD_SIZE,
      include: { user: { select: { id: true, handle: true, avatarUrl: true, suspendedAt: true } } }
    });
    return {
      entries: rows
        .filter((r) => !r.user.suspendedAt)
        .map((r, i) => ({
          rank: i + 1,
          userId: r.userId,
          handle: r.user.handle,
          avatarUrl: r.user.avatarUrl,
          xp: r.xp,
          level: r.level,
          flights: r.flights,
          places: r.placesDiscovered,
          countries: r.countries
        }))
    };
  });

  /** A public profile: what someone chose to be called, and what they have seen. */
  app.get('/social/users/:id', async (req, reply) => {
    const params = parse(schemas.idParams, req.params, reply);
    if (!params) return reply;
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: { stats: true }
    });
    if (!user || user.suspendedAt) return reply.code(404).send({ error: 'Not found' });

    const recent = await prisma.discovery.findMany({
      where: { userId: user.id },
      orderBy: { discoveredAt: 'desc' },
      take: 12,
      select: { poiId: true, discoveredAt: true }
    });

    // Discovery stores only the id, so a profile listed raw ids — a visitor saw
    // "poi-hindukush" where a place name belongs. Named here rather than on the
    // device, because these are someone else's finds: the reader has never
    // downloaded the package they came from and cannot resolve them locally.
    const named = await prisma.pOI.findMany({
      where: { id: { in: recent.map((d) => d.poiId) } },
      select: { id: true, name: true }
    });
    const nameOf = new Map(named.map((p) => [p.id, p.name]));

    return {
      id: user.id,
      handle: user.handle,
      avatarUrl: user.avatarUrl,
      joinedAt: toMonth(user.createdAt),
      stats: user.stats ?? emptyStats(user.id),
      // null, never the id: the client shows a neutral label instead.
      recent: recent.map((d) => ({
        poiId: d.poiId,
        discoveredAt: toMonth(d.discoveredAt),
        name: nameOf.get(d.poiId) ?? null
      }))
    };
  });

  app.post('/social/users/:id/follow', async (req, reply) => {
    const userId = userIdOf(req);
    const params = parse(schemas.idParams, req.params, reply);
    if (!params) return reply;
    const body = parse(schemas.follow, req.body, reply);
    if (!body) return reply;
    if (userId === params.id) return reply.code(400).send({ error: 'Cannot follow yourself' });
    await prisma.friendship.upsert({
      where: { followerId_followedId: { followerId: userId, followedId: params.id } },
      create: { followerId: userId, followedId: params.id, blocked: body.blocked ?? false },
      update: { blocked: body.blocked ?? false }
    });
    return { ok: true };
  });

  app.get('/social/friends', async (req) => {
    const userId = userIdOf(req);
    const rows = await prisma.friendship.findMany({
      where: { followerId: userId, blocked: false },
      include: {
        followed: { select: { id: true, handle: true, avatarUrl: true, stats: true } }
      }
    });
    return {
      friends: rows.map((r) => ({
        id: r.followed.id,
        handle: r.followed.handle,
        avatarUrl: r.followed.avatarUrl,
        stats: r.followed.stats ?? emptyStats(r.followed.id)
      }))
    };
  });
};

function emptyStats(userId: string) {
  return {
    userId,
    flights: 0,
    distanceKm: 0,
    placesDiscovered: 0,
    countries: 0,
    xp: 0,
    level: 1
  };
}
