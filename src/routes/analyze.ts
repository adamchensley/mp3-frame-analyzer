import type { FastifyInstance } from 'fastify';

import { analyzeSingleUpload } from '../services/analysis.service.js';

/** The above-and-beyond endpoint: the full analysis report for the UI. */
export function registerAnalyzeRoute(app: FastifyInstance, maxUploadBytes: number): void {
  app.post('/analyze', async (request) => analyzeSingleUpload(request, maxUploadBytes));
}
