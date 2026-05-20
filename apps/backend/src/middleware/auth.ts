import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ') || auth.length < 20) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}
