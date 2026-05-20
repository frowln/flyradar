import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import 'dotenv/config';
import { healthRoutes } from './routes/health.js';
import { flightRoutes } from './routes/flights.js';
import { subscriptionRoutes } from './routes/subscription.js';
import { metricsRoutes, incRequest } from './routes/metrics.js';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } }
});

await app.register(helmet);
await app.register(cors, {
  origin: (origin, cb) => {
    const allowed: Array<string | RegExp> = [
      'http://localhost:8081',  // Expo dev
      'http://localhost:3000',
      /^exp:\/\//,              // Expo Go
      /^skyatlas:\/\//,         // production scheme
    ];
    if (!origin || allowed.some(a => typeof a === 'string' ? a === origin : a.test(origin))) {
      cb(null, true);
    } else {
      cb(new Error('CORS not allowed'), false);
    }
  }
});
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['x-device-id'] as string ?? req.ip
});
app.addHook('onRequest', async () => { incRequest(); });

await app.register(healthRoutes);
await app.register(flightRoutes);
await app.register(subscriptionRoutes);
await app.register(metricsRoutes);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`server on :${port}`))
  .catch((e) => { app.log.error(e); process.exit(1); });
