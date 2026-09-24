import 'dotenv/config';
import { assertAuthConfig } from './middleware/auth.js';
import { buildApp } from './app.js';

// Fail before binding a port: a production process that starts without its
// configuration looks healthy to the load balancer while doing the wrong thing.
assertAuthConfig();

const app = await buildApp();

// Node running as PID 1 in a container ignores SIGTERM unless it is handled,
// so `docker stop` would wait out its grace period and then kill mid-request.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, closing`);
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

const port = Number(process.env['PORT'] ?? 3000);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`server on :${port}`))
  .catch((e) => { app.log.error(e); process.exit(1); });
