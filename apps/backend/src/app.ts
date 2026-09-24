import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { healthRoutes } from './routes/health.js';
import { flightRoutes } from './routes/flights.js';
import { subscriptionRoutes } from './routes/subscription.js';
import { metricsRoutes, incRequest } from './routes/metrics.js';
import { socialRoutes } from './routes/social.js';
import { errorHandler } from './errorHandler.js';

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
}

/**
 * Structured JSON in production, where logs are collected and queried rather
 * than read; pretty-printed only on a developer's terminal. pino-pretty also
 * costs a worker thread per process that production has no use for.
 */
export function loggerOptions(env: NodeJS.ProcessEnv = process.env): FastifyServerOptions['logger'] {
  const level = env['LOG_LEVEL'] || 'info';
  if (env['NODE_ENV'] === 'production') return { level };
  return { level, transport: { target: 'pino-pretty' } };
}

/**
 * Which hops to believe about the client's address.
 *
 * Behind nginx every request arrives from nginx, so without this the rate
 * limiter saw one client — the proxy — and throttled everyone together. `true`
 * is not the default even in production: it believes the *leftmost*
 * X-Forwarded-For entry, which the client writes itself. One hop means "the
 * address nginx saw", which is the real one. `TRUST_PROXY` accepts `true`,
 * `false`, a hop count, or a comma-separated list of proxy addresses/CIDRs.
 */
export function trustProxyFromEnv(env: NodeJS.ProcessEnv = process.env): boolean | number | string {
  const raw = env['TRUST_PROXY']?.trim();
  if (!raw) return env['NODE_ENV'] === 'production' ? 1 : false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

const allowedOrigins: Array<string | RegExp> = [
  'http://localhost:8081',  // Expo dev
  'http://localhost:3000',
  /^exp:\/\//,              // Expo Go
  /^skyatlas:\/\//,         // production scheme
];

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? loggerOptions(),
    trustProxy: trustProxyFromEnv()
  });

  // The app sends `Content-Type: application/json` on every request, bodiless
  // DELETEs included, and Fastify's stock parser answers a JSON request with
  // an empty body with 400 — so deleting a review could fail before reaching
  // the route. Empty now means "no body"; anything else still goes through the
  // stock parser and its prototype-poisoning checks.
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const text = body.toString();
    if (text === '') return done(null, undefined);
    parseJson(req, text, done);
  });

  await app.register(helmet);
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
    // Keyed by address, not by X-Device-Id: the device id is whatever the
    // client says it is, so keying on it gave every request its own bucket to
    // anyone who varied the header. The cost is that people behind one NAT
    // (airport Wi-Fi, carrier-grade NAT) share a budget — the number to raise
    // if that starts to bite, rather than going back to a client-chosen key.
    keyGenerator: (req) => req.ip
  });
  app.setErrorHandler(errorHandler);
  app.addHook('onRequest', async () => { incRequest(); });

  await app.register(healthRoutes);
  await app.register(flightRoutes);
  await app.register(subscriptionRoutes);
  await app.register(metricsRoutes);
  await app.register(socialRoutes);

  return app;
}
