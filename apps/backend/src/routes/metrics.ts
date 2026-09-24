import type { FastifyPluginAsync } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

const counters = { requests: 0, packagesBuilt: 0, errors: 0 };

export function incRequest(): void { counters.requests++; }
export function incPackage(): void { counters.packagesBuilt++; }
export function incError(): void { counters.errors++; }

/** Compared as digests so neither the length nor the content leaks through timing. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Prometheus text for the scraper, and for nobody else.
 *
 * Request and error counts are a map of how the service is doing — useful to
 * whoever is attacking it too. Without `METRICS_TOKEN` the route answers as if
 * it did not exist; with it, the scraper sends `Authorization: Bearer <token>`.
 * nginx also refuses the path, so the scraper reaches it on the internal network.
 */
export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/metrics', async (req, reply) => {
    const expected = process.env['METRICS_TOKEN'];
    if (!expected) return reply.callNotFound();

    const auth = req.headers.authorization;
    const presented = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!presented || !tokenMatches(presented, expected)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    reply.type('text/plain');
    return `# HELP skyatlas_requests_total Total HTTP requests
# TYPE skyatlas_requests_total counter
skyatlas_requests_total ${counters.requests}

# HELP skyatlas_packages_built_total Total flight packages built
# TYPE skyatlas_packages_built_total counter
skyatlas_packages_built_total ${counters.packagesBuilt}

# HELP skyatlas_errors_total Total errors
# TYPE skyatlas_errors_total counter
skyatlas_errors_total ${counters.errors}
`;
  });
};
