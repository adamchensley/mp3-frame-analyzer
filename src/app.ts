import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

export interface BuildAppOptions {
  maxUploadBytes: number;
  logger?: FastifyBaseLogger | { level: string } | boolean;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
