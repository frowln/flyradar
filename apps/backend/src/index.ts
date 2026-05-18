import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import 'dotenv/config';
import { healthRoutes } from './routes/health.js';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } }
});

await app.register(helmet);
await app.register(cors, { origin: true });
await app.register(healthRoutes);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`server on :${port}`))
  .catch((e) => { app.log.error(e); process.exit(1); });
