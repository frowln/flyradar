import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { STATUS_CODES } from 'node:http';
import { incError } from './routes/metrics.js';

const PRISMA_STATUS: Record<string, { status: number; message: string }> = {
  // Unique constraint: the thing being created already exists.
  P2002: { status: 409, message: 'Already exists' },
  // Foreign key: the request refers to something that is not there.
  P2003: { status: 404, message: 'Referenced record not found' },
  // Required record not found for update/delete.
  P2025: { status: 404, message: 'Not found' }
};

function prismaMapping(err: unknown): { status: number; message: string } | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? PRISMA_STATUS[code] : undefined;
}

/**
 * One error shape for everything a route throws.
 *
 * Client errors keep their message — "Rate limit exceeded, retry in 1 minute"
 * is something the caller can act on. Server errors never do: a Prisma or
 * driver message carries table names, query fragments and sometimes values,
 * and the caller can do nothing with it anyway. Those are logged in full and
 * answered generically.
 */
export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  const prisma = prismaMapping(err);
  const thrown = typeof err?.statusCode === 'number' ? err.statusCode : 500;
  const status = prisma?.status ?? (thrown >= 400 && thrown < 600 ? thrown : 500);
  const error = STATUS_CODES[status] ?? 'Error';

  if (status >= 500) {
    incError();
    req.log.error({ err }, 'request failed');
    return reply.code(status).send({ statusCode: status, error, message: 'Internal Server Error' });
  }
  req.log.info({ err: { message: err?.message, code: err?.code } }, 'request rejected');
  // Prisma's own wording describes the query, not the problem; use ours.
  const message = prisma?.message ?? err?.message ?? error;
  return reply.code(status).send({ statusCode: status, error, message });
}
