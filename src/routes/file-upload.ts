import type { FastifyInstance } from 'fastify';

import { analyzeSingleUpload } from '../services/analysis.service.js';

/**
 * The assignment contract: POST /file-upload -> { "frameCount": <number> }.
 * The response schema pins the shape — nothing else may leak into the body.
 */
export function registerFileUploadRoute(app: FastifyInstance, maxUploadBytes: number): void {
  app.post(
    '/file-upload',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: { frameCount: { type: 'number' } },
            required: ['frameCount'],
            additionalProperties: false,
          },
        },
      },
    },
    async (request) => {
      const analysis = await analyzeSingleUpload(request, maxUploadBytes);
      return { frameCount: analysis.frameCount };
    },
  );
}
