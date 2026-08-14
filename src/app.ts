import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { toAppError } from './errors.js';
import { registerAnalyzeRoute } from './routes/analyze.js';
import { registerFileUploadRoute } from './routes/file-upload.js';
import { registerHealthRoute } from './routes/health.js';

export interface BuildAppOptions {
  maxUploadBytes: number;
  logger?: FastifyServerOptions['logger'];
  /**
   * Directory of built front-end assets to serve at `/`; `false` disables
   * static serving. Defaults to `web/dist` when that directory exists.
   */
  staticRoot?: string | false;
  /**
   * When set, every request except /healthz must carry a matching
   * x-origin-verify header. Used behind CloudFront so the ALB cannot be
   * driven directly; unset locally.
   */
  originVerifySecret?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  // Handlers must be set before any plugin registration: when a later
  // register() boots the instance, already-registered routes bind whatever
  // error handler exists at that moment (regression-tested in I-API).
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} was not found.`,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error);
    if (appError.statusCode >= 500) {
      request.log.error({ err: error }, 'request failed unexpectedly');
    } else {
      request.log.info({ code: appError.code, err: undefined }, 'request rejected');
    }
    void reply
      .status(appError.statusCode)
      .send({ error: { code: appError.code, message: appError.message } });
  });

  if (options.originVerifySecret) {
    const secret = options.originVerifySecret;
    app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/healthz') return; // ALB health checks bypass CloudFront
      if (request.headers['x-origin-verify'] === secret) return;
      await reply
        .status(403)
        .send({ error: { code: 'FORBIDDEN', message: 'Direct origin access is not allowed.' } });
    });
  }

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: options.maxUploadBytes,
      // Allow a second file part through so the route can answer with a
      // clear MULTIPLE_FILES error instead of a generic busboy failure.
      files: 2,
      fields: 10,
    },
  });

  registerHealthRoute(app);
  registerFileUploadRoute(app, options.maxUploadBytes);
  registerAnalyzeRoute(app, options.maxUploadBytes);

  const defaultWebDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/dist');
  const staticRoot =
    options.staticRoot === false
      ? null
      : (options.staticRoot ?? (existsSync(defaultWebDist) ? defaultWebDist : null));
  if (staticRoot) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      setHeaders: (res, filePath) => {
        // Vite emits content-hashed filenames under assets/ — cache those hard.
        const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader(
          'cache-control',
          immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  return app;
}
