import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';

/**
 * Resolves the caller to a User row, creating one on first contact.
 *
 * Accounts start anonymous and attached to a device, because asking someone to
 * sign in before they have collected anything loses most of them. The row exists
 * from the first request so discoveries have an owner; signing in with Apple
 * later claims that same row and keeps the collection intact.
 */

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

const DEVICE_HEADER = 'x-device-id';

export async function attachUser(req: FastifyRequest, reply: FastifyReply) {
  const deviceId = req.headers[DEVICE_HEADER];
  if (typeof deviceId !== 'string' || deviceId.length < 8) {
    return reply.code(400).send({ error: 'Missing device id' });
  }

  const platform = typeof req.headers['x-platform'] === 'string' ? req.headers['x-platform'] : 'unknown';

  const device = await prisma.device.upsert({
    where: { id: deviceId },
    update: { lastSeen: new Date() },
    create: {
      id: deviceId,
      platform,
      user: { create: { locale: localeOf(req) } }
    },
    include: { user: true }
  });

  // A device whose user was detached (account deleted) gets a fresh anonymous one.
  if (!device.userId) {
    const user = await prisma.user.create({ data: { locale: localeOf(req) } });
    await prisma.device.update({ where: { id: deviceId }, data: { userId: user.id } });
    req.userId = user.id;
    return;
  }

  if (device.user?.suspendedAt && req.method !== 'GET') {
    return reply.code(403).send({ error: 'Account suspended' });
  }

  req.userId = device.userId;
}

function localeOf(req: FastifyRequest): string {
  const header = req.headers['accept-language'];
  if (typeof header !== 'string') return 'en';
  return header.slice(0, 2).toLowerCase();
}

/** Throws rather than returning undefined, so route handlers can rely on it. */
export function userIdOf(req: FastifyRequest): string {
  if (!req.userId) throw new Error('attachUser must run before this handler');
  return req.userId;
}
