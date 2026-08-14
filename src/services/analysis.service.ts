import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

import { MultipleFilesError, NoFileError, UploadTooLargeError } from '../errors.js';
import { Mp3FrameCounter } from '../parser/mp3-frame-counter.js';
import type { AnalysisReport } from '../parser/types.js';

export interface UploadAnalysis extends AnalysisReport {
  file: { fileName: string; sizeBytes: number };
}

/**
 * Consume the request's multipart body: stream the single file part through
 * the frame counter (no buffering, no temp files) and reject requests with
 * zero or multiple file parts. Non-file fields are ignored.
 */
export async function analyzeSingleUpload(
  request: FastifyRequest,
  maxUploadBytes: number,
): Promise<UploadAnalysis> {
  let analysis: UploadAnalysis | null = null;
  for await (const part of request.parts()) {
    if (part.type !== 'file') continue;
    if (analysis !== null) throw new MultipleFilesError();
    analysis = await analyzeFilePart(part, maxUploadBytes);
  }
  if (analysis === null) throw new NoFileError();
  return analysis;
}

async function analyzeFilePart(
  part: MultipartFile,
  maxUploadBytes: number,
): Promise<UploadAnalysis> {
  const counter = new Mp3FrameCounter();
  let sizeBytes = 0;
  for await (const chunk of part.file) {
    sizeBytes += (chunk as Buffer).length;
    counter.update(chunk as Buffer);
  }
  // @fastify/multipart truncates the stream at limits.fileSize rather than
  // erroring, so the flag is the reliable over-limit signal here.
  if (part.file.truncated) throw new UploadTooLargeError(maxUploadBytes);

  const report = counter.finalize(); // Mp3ParseError is mapped by the app error handler
  return { ...report, file: { fileName: part.filename || 'upload', sizeBytes } };
}
