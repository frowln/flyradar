import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import { toSupportedLocale } from '../locales.js';

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
/**
 * The shape of an id the app mints (`dev_<ms>_<random>`). The value becomes a
 * primary key and is echoed into logs, so anything outside a plain token
 * alphabet — or long enough to bloat an index — is refused at the door.
 */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const PLATFORMS = new Set(['ios', 'android', 'web', 'windows', 'macos']);

export async function attachUser(req: FastifyRequest, reply: FastifyReply) {
  const deviceId = req.headers[DEVICE_HEADER];
  if (typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) {
    return reply.code(400).send({ error: 'Missing or malformed device id' });
  }

  const platformHeader = req.headers['x-platform'];
  const platform =
    typeof platformHeader === 'string' && PLATFORMS.has(platformHeader) ? platformHeader : 'unknown';

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
  return toSupportedLocale(req.headers['accept-language']);
}

/** Throws rather than returning undefined, so route handlers can rely on it. */
export function userIdOf(req: FastifyRequest): string {
  if (!req.userId) throw new Error('attachUser must run before this handler');
  return req.userId;
}
