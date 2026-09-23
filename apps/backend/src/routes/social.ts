import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { attachUser, userIdOf } from '../middleware/currentUser.js';

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
 */

const MAX_BODY = 600;
const MAX_HANDLE = 24;
const LEADERBOARD_SIZE = 50;
const REVIEW_PAGE = 20;

/** Reasons a person can pick when reporting. Free text goes in `note`. */
const REPORT_REASONS = ['spam', 'offensive', 'off_topic', 'false_info', 'other'] as const;

export const socialRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    // Only the social surface needs a user; other routes stay device-only.
    if (req.url.startsWith('/social')) await attachUser(req, reply);
  });

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

  app.patch<{ Body: { handle?: string; avatarUrl?: string } }>('/social/me', async (req, reply) => {
    const userId = userIdOf(req);
    const handle = req.body.handle?.trim();
    if (handle !== undefined && (handle.length < 2 || handle.length > MAX_HANDLE)) {
      return reply.code(400).send({ error: `Handle must be 2–${MAX_HANDLE} characters` });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(handle !== undefined ? { handle } : {}),
        ...(req.body.avatarUrl !== undefined ? { avatarUrl: req.body.avatarUrl } : {})
      }
    });
    return { id: user.id, handle: user.handle, avatarUrl: user.avatarUrl };
  });

  /**
   * Claims the anonymous account with an Apple identity.
   *
   * If that Apple subject already has an account, the two are merged rather than
   * duplicated — someone reinstalling the app must not end up with two atlases.
   */
  app.post<{ Body: { appleSub: string } }>('/social/link/apple', async (req, reply) => {
    const userId = userIdOf(req);
    const { appleSub } = req.body;
    if (!appleSub || appleSub.length < 6) return reply.code(400).send({ error: 'Bad subject' });

    const existing = await prisma.user.findUnique({ where: { appleSub } });
    if (existing && existing.id !== userId) {
      await prisma.$transaction([
        prisma.device.updateMany({ where: { userId }, data: { userId: existing.id } }),
        // Discoveries are unique per (user, poi); collisions mean the place was
        // already found on the other account, so the anonymous row is dropped.
        prisma.discovery.deleteMany({
          where: {
            userId,
            poiId: {
              in: (
                await prisma.discovery.findMany({
                  where: { userId: existing.id },
                  select: { poiId: true }
                })
              ).map((d) => d.poiId)
            }
          }
        }),
        prisma.discovery.updateMany({ where: { userId }, data: { userId: existing.id } }),
        prisma.user.delete({ where: { id: userId } })
      ]);
      await recomputeStats(existing.id);
      return { id: existing.id, merged: true };
    }

    const user = await prisma.user.update({ where: { id: userId }, data: { appleSub } });
    return { id: user.id, merged: false };
  });

  // --- discoveries --------------------------------------------------------

  /**
   * Records that this person opened this place. Idempotent: opening a card twice
   * is not two discoveries, which is what keeps the counters honest.
   */
  app.post<{ Body: { poiId: string; flightId?: string } }>(
    '/social/discoveries',
    async (req, reply) => {
      const userId = userIdOf(req);
      const { poiId, flightId } = req.body;
      if (!poiId) return reply.code(400).send({ error: 'poiId required' });

      const existing = await prisma.discovery.findUnique({
        where: { userId_poiId: { userId, poiId } }
      });
      if (existing) return { created: false };

      await prisma.$transaction([
        prisma.discovery.create({ data: { userId, poiId, flightId: flightId ?? null } }),
        prisma.pOIStat.upsert({
          where: { poiId },
          create: { poiId, discoveryCount: 1 },
          update: { discoveryCount: { increment: 1 } }
        })
      ]);
      await recomputeStats(userId);
      return { created: true };
    }
  );

  /**
   * The passive-social numbers shown on a place card: how many people have been
   * here, and how rare that makes it.
   */
  app.get<{ Params: { poiId: string } }>('/social/pois/:poiId/stats', async (req) => {
    const { poiId } = req.params;
    const [stat, totalUsers] = await Promise.all([
      prisma.pOIStat.findUnique({ where: { poiId } }),
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

  app.get<{ Params: { poiId: string }; Querystring: { cursor?: string } }>(
    '/social/pois/:poiId/reviews',
    async (req) => {
      const { poiId } = req.params;
      const rows = await prisma.review.findMany({
        where: { poiId, hiddenAt: null },
        orderBy: { createdAt: 'desc' },
        take: REVIEW_PAGE,
        ...(req.query.cursor ? { cursor: { id: req.query.cursor }, skip: 1 } : {}),
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
    }
  );

  /** One review per person per place — writing again replaces the previous one. */
  app.put<{ Params: { poiId: string }; Body: { rating: number; body?: string } }>(
    '/social/pois/:poiId/review',
    async (req, reply) => {
      const userId = userIdOf(req);
      const { poiId } = req.params;
      const rating = Math.round(Number(req.body.rating));
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return reply.code(400).send({ error: 'Rating must be 1–5' });
      }
      const body = req.body.body?.trim().slice(0, MAX_BODY) || null;

      const previous = await prisma.review.findUnique({
        where: { userId_poiId: { userId, poiId } }
      });

      const review = await prisma.review.upsert({
        where: { userId_poiId: { userId, poiId } },
        create: { userId, poiId, rating, body },
        update: { rating, body, hiddenAt: null, hiddenReason: null }
      });

      await prisma.pOIStat.upsert({
        where: { poiId },
        create: { poiId, reviewCount: 1, ratingSum: rating },
        update: previous
          ? { ratingSum: { increment: rating - previous.rating } }
          : { reviewCount: { increment: 1 }, ratingSum: { increment: rating } }
      });

      return { id: review.id, replaced: Boolean(previous) };
    }
  );

  app.delete<{ Params: { poiId: string } }>('/social/pois/:poiId/review', async (req) => {
    const userId = userIdOf(req);
    const { poiId } = req.params;
    const existing = await prisma.review.findUnique({ where: { userId_poiId: { userId, poiId } } });
    if (!existing) return { deleted: false };

    await prisma.$transaction([
      prisma.review.delete({ where: { id: existing.id } }),
      prisma.pOIStat.update({
        where: { poiId },
        data: { reviewCount: { decrement: 1 }, ratingSum: { decrement: existing.rating } }
      })
    ]);
    return { deleted: true };
  });

  app.post<{ Params: { id: string }; Body: { helpful?: boolean } }>(
    '/social/reviews/:id/vote',
    async (req) => {
      const userId = userIdOf(req);
      const helpful = req.body.helpful !== false;
      await prisma.reviewVote.upsert({
        where: { reviewId_userId: { reviewId: req.params.id, userId } },
        create: { reviewId: req.params.id, userId, helpful },
        update: { helpful }
      });
      return { ok: true };
    }
  );

  /**
   * Abuse report. Required by App Store Guideline 1.2 for user-generated
   * content, and the only way a moderator learns anything is wrong.
   */
  app.post<{ Params: { id: string }; Body: { reason: string; note?: string } }>(
    '/social/reviews/:id/report',
    async (req, reply) => {
      const userId = userIdOf(req);
      const reason = req.body.reason;
      if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
        return reply.code(400).send({ error: 'Unknown reason', allowed: REPORT_REASONS });
      }
      await prisma.report.create({
        data: {
          reporterId: userId,
          reviewId: req.params.id,
          reason,
          note: req.body.note?.slice(0, MAX_BODY) ?? null
        }
      });
      return { ok: true };
    }
  );

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
  app.get<{ Params: { id: string } }>('/social/users/:id', async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
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
      joinedAt: user.createdAt,
      stats: user.stats ?? emptyStats(user.id),
      // null, never the id: the client shows a neutral label instead.
      recent: recent.map((d) => ({ ...d, name: nameOf.get(d.poiId) ?? null }))
    };
  });

  app.post<{ Params: { id: string }; Body: { blocked?: boolean } }>(
    '/social/users/:id/follow',
    async (req, reply) => {
      const userId = userIdOf(req);
      if (userId === req.params.id) return reply.code(400).send({ error: 'Cannot follow yourself' });
      await prisma.friendship.upsert({
        where: { followerId_followedId: { followerId: userId, followedId: req.params.id } },
        create: { followerId: userId, followedId: req.params.id, blocked: req.body.blocked ?? false },
        update: { blocked: req.body.blocked ?? false }
      });
      return { ok: true };
    }
  );

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

/**
 * Recomputes a person's leaderboard row.
 *
 * Cheap enough to run on every discovery, and running it there means the board
 * is never stale — the alternative is a nightly job that makes the number a
 * person just earned invisible until tomorrow.
 */
async function recomputeStats(userId: string): Promise<void> {
  const places = await prisma.discovery.count({ where: { userId } });
  const xp = places * 10;
  const level = Math.max(1, Math.floor(xp / 200) + 1);
  await prisma.userStats.upsert({
    where: { userId },
    create: { userId, placesDiscovered: places, xp, level },
    update: { placesDiscovered: places, xp, level }
  });
}
