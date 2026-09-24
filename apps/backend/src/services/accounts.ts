import type { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

/**
 * Recomputes a person's leaderboard row.
 *
 * Cheap enough to run on every discovery, and running it there means the board
 * is never stale — the alternative is a nightly job that makes the number a
 * person just earned invisible until tomorrow.
 */
export async function recomputeStats(db: Db, userId: string): Promise<void> {
  const places = await db.discovery.count({ where: { userId } });
  const xp = places * 10;
  const level = Math.max(1, Math.floor(xp / 200) + 1);
  await db.userStats.upsert({
    where: { userId },
    create: { userId, placesDiscovered: places, xp, level },
    update: { placesDiscovered: places, xp, level }
  });
}

export type LinkResult =
  | { kind: 'linked'; id: string }
  | { kind: 'merged'; id: string }
  | { kind: 'conflict' };

/**
 * Attaches a verified Apple subject to the caller's account.
 *
 * If that subject already has an account, the caller's anonymous one is merged
 * into it rather than duplicated — someone reinstalling the app must not end up
 * with two atlases. Must run inside one transaction: the lookup of what each
 * account holds and the rewrite of it have to see the same rows, or a discovery
 * made mid-merge is lost or double-counted.
 */
export async function linkApple(tx: Db, userId: string, appleSub: string): Promise<LinkResult> {
  const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (current.appleSub === appleSub) return { kind: 'linked', id: userId };
  // Silently trading one Apple identity for another would hand this account's
  // history to whoever holds the second one.
  if (current.appleSub) return { kind: 'conflict' };

  const existing = await tx.user.findUnique({ where: { appleSub } });
  if (!existing) {
    await tx.user.update({ where: { id: userId }, data: { appleSub } });
    return { kind: 'linked', id: userId };
  }

  await mergeInto(tx, userId, existing.id);
  return { kind: 'merged', id: existing.id };
}

/**
 * Moves everything `from` owns onto `to`, then deletes `from`.
 *
 * Deleting the user cascades to whatever is still attached, so every table is
 * moved explicitly first. Where both accounts hold the same thing — a place
 * both discovered, a place both reviewed — the claimed account's row wins and
 * the place's counters are corrected, because one person finding a place once
 * must not keep counting as two.
 */
async function mergeInto(tx: Db, from: string, to: string): Promise<void> {
  await tx.device.updateMany({ where: { userId: from }, data: { userId: to } });

  // Discoveries: unique per (user, place).
  const found = await tx.discovery.findMany({ where: { userId: from }, select: { poiId: true } });
  if (found.length > 0) {
    const both = (
      await tx.discovery.findMany({
        where: { userId: to, poiId: { in: found.map((d) => d.poiId) } },
        select: { poiId: true }
      })
    ).map((d) => d.poiId);
    if (both.length > 0) {
      await tx.discovery.deleteMany({ where: { userId: from, poiId: { in: both } } });
      await tx.pOIStat.updateMany({
        where: { poiId: { in: both } },
        data: { discoveryCount: { decrement: 1 } }
      });
    }
    await tx.discovery.updateMany({ where: { userId: from }, data: { userId: to } });
  }

  // Reviews: one per (user, place). The claimed account's review is kept — it
  // is the one other people have already voted on.
  const reviews = await tx.review.findMany({
    where: { userId: from },
    select: { id: true, poiId: true, rating: true }
  });
  if (reviews.length > 0) {
    const reviewedByBoth = new Set(
      (
        await tx.review.findMany({
          where: { userId: to, poiId: { in: reviews.map((r) => r.poiId) } },
          select: { poiId: true }
        })
      ).map((r) => r.poiId)
    );
    for (const r of reviews.filter((r) => reviewedByBoth.has(r.poiId))) {
      await tx.review.delete({ where: { id: r.id } });
      await tx.pOIStat.updateMany({
        where: { poiId: r.poiId },
        data: { reviewCount: { decrement: 1 }, ratingSum: { decrement: r.rating } }
      });
    }
    await tx.review.updateMany({ where: { userId: from }, data: { userId: to } });
  }

  // Votes: one per (review, user).
  const votes = await tx.reviewVote.findMany({ where: { userId: from }, select: { reviewId: true } });
  if (votes.length > 0) {
    const votedByBoth = (
      await tx.reviewVote.findMany({
        where: { userId: to, reviewId: { in: votes.map((v) => v.reviewId) } },
        select: { reviewId: true }
      })
    ).map((v) => v.reviewId);
    await tx.reviewVote.deleteMany({ where: { userId: from, reviewId: { in: votedByBoth } } });
    await tx.reviewVote.updateMany({ where: { userId: from }, data: { userId: to } });
  }

  await tx.report.updateMany({ where: { reporterId: from }, data: { reporterId: to } });

  // Follows: a follow between the two accounts would become following oneself;
  // one both already have is kept once.
  await tx.friendship.deleteMany({
    where: {
      OR: [
        { followerId: from, followedId: to },
        { followerId: to, followedId: from }
      ]
    }
  });
  const following = await tx.friendship.findMany({ where: { followerId: from }, select: { followedId: true } });
  if (following.length > 0) {
    const shared = (
      await tx.friendship.findMany({
        where: { followerId: to, followedId: { in: following.map((f) => f.followedId) } },
        select: { followedId: true }
      })
    ).map((f) => f.followedId);
    await tx.friendship.deleteMany({ where: { followerId: from, followedId: { in: shared } } });
    await tx.friendship.updateMany({ where: { followerId: from }, data: { followerId: to } });
  }
  const followers = await tx.friendship.findMany({ where: { followedId: from }, select: { followerId: true } });
  if (followers.length > 0) {
    const shared = (
      await tx.friendship.findMany({
        where: { followedId: to, followerId: { in: followers.map((f) => f.followerId) } },
        select: { followerId: true }
      })
    ).map((f) => f.followerId);
    await tx.friendship.deleteMany({ where: { followedId: from, followerId: { in: shared } } });
    await tx.friendship.updateMany({ where: { followedId: from }, data: { followedId: to } });
  }

  await tx.user.delete({ where: { id: from } });
  await recomputeStats(tx, to);
}
