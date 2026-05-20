import type { FastifyPluginAsync } from 'fastify';

const counters = { requests: 0, packagesBuilt: 0, errors: 0 };

export function incRequest(): void { counters.requests++; }
export function incPackage(): void { counters.packagesBuilt++; }
export function incError(): void { counters.errors++; }

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/metrics', async (_, reply) => {
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
