import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import 'dotenv/config';
import { healthRoutes } from './routes/health.js';
import { flightRoutes } from './routes/flights.js';
import { subscriptionRoutes } from './routes/subscription.js';
import { metricsRoutes, incRequest } from './routes/metrics.js';
import { socialRoutes } from './routes/social.js';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } }
});

await app.register(helmet);
const allowedOrigins: Array<string | RegExp> = [
  'http://localhost:8081',  // Expo dev
  'http://localhost:3000',
  /^exp:\/\//,              // Expo Go
  /^skyatlas:\/\//,         // production scheme
];
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(a => typeof a === 'string' ? a === origin : a.test(origin))) {
      cb(null, true);
    } else {
      // Resolve with false so Fastify returns a clean 403 instead of throwing 500.
      cb(null, false);
    }
  }
});
// Reject preflight + actual requests from disallowed origins with 403, not 500.
app.addHook('onRequest', async (req, reply) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.some(a => typeof a === 'string' ? a === origin : a.test(origin))) {
    return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'CORS not allowed' });
  }
});
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    const id = req.headers['x-device-id'];
    if (typeof id === 'string' && id.length > 0) return id;
    return req.ip ?? 'unknown';
  }
});
app.setErrorHandler((err: any, _req, reply) => {
  // Surface rate-limit / validation errors with their intended status code instead of 500.
  const status = typeof err?.statusCode === 'number' ? err.statusCode : 500;
  app.log.error({ err }, 'request failed');
  reply.code(status).send({
    statusCode: status,
    error: err?.name || 'Error',
    message: err?.message || 'Internal Server Error'
  });
});
app.addHook('onRequest', async () => { incRequest(); });

await app.register(healthRoutes);
await app.register(flightRoutes);
await app.register(subscriptionRoutes);
await app.register(metricsRoutes);
await app.register(socialRoutes);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`server on :${port}`))
  .catch((e) => { app.log.error(e); process.exit(1); });
