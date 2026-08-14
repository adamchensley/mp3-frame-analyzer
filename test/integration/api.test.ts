import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { UploadAnalysis } from '../../src/services/analysis.service.js';
import { concat, frame, junk, pngBytes } from '../helpers/mp3-builder.js';

const sampleBytes = readFileSync(new URL('../fixtures/sample.mp3', import.meta.url));

interface FilePart {
  bytes: Uint8Array;
  filename?: string;
  field?: string;
}

/** Build a real multipart/form-data payload using the platform FormData codec. */
async function multipartPayload(files: FilePart[], fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  for (const file of files) {
    form.append(
      file.field ?? 'file',
      new Blob([file.bytes]),
      file.filename ?? 'upload.mp3',
    );
  }
  const encoded = new Response(form);
  return {
    payload: Buffer.from(await encoded.arrayBuffer()),
    headers: { 'content-type': encoded.headers.get('content-type') ?? '' },
  };
}

describe('API integration (I-API)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ maxUploadBytes: 500 * 1024 * 1024, serveStatic: false });
  });
  afterAll(async () => {
    await app.close();
  });

  it('01: /file-upload returns exactly {"frameCount":6090} for the sample', async () => {
    const { payload, headers } = await multipartPayload([
      { bytes: sampleBytes, filename: 'sample.mp3' },
    ]);
    const response = await app.inject({ method: 'POST', url: '/file-upload', payload, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.body).toBe('{"frameCount":6090}');
  });

  it('01b: accepts any multipart field name, per the unversioned assignment contract', async () => {
    const { payload, headers } = await multipartPayload([
      { bytes: concat(frame(), frame()), field: 'anything-goes' },
    ]);
    const response = await app.inject({ method: 'POST', url: '/file-upload', payload, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ frameCount: 2 });
  });

  it('02: multipart body without a file part is NO_FILE', async () => {
    const { payload, headers } = await multipartPayload([], { note: 'no file here' });
    const response = await app.inject({ method: 'POST', url: '/file-upload', payload, headers });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'NO_FILE' } });
  });

  it('02b: a non-multipart request is NO_FILE', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      payload: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'NO_FILE' } });
  });

  it('03: a PNG upload is 422 UNSUPPORTED_FORMAT with a useful message', async () => {
    const { payload, headers } = await multipartPayload([
      { bytes: pngBytes(), filename: 'image.mp3' },
    ]);
    const response = await app.inject({ method: 'POST', url: '/file-upload', payload, headers });
    expect(response.statusCode).toBe(422);
    const body = response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNSUPPORTED_FORMAT');
    expect(body.error.message).toMatch(/MPEG-1 Layer III/);
  });

  it('03b: an empty file upload is 422 with an "empty" message', async () => {
    const { payload, headers } = await multipartPayload([
      { bytes: new Uint8Array(0), filename: 'empty.mp3' },
    ]);
    const response = await app.inject({ method: 'POST', url: '/file-upload', payload, headers });
    expect(response.statusCode).toBe(422);
    expect((response.json() as { error: { message: string } }).error.message).toMatch(/empty/i);
  });

  it('04: an upload over the configured cap is 413 FILE_TOO_LARGE', async () => {
    const capped = await buildApp({ maxUploadBytes: 1024 * 1024, serveStatic: false });
    try {
      const { payload, headers } = await multipartPayload([
        { bytes: junk(2 * 1024 * 1024), filename: 'big.mp3' },
      ]);
      const response = await capped.inject({ method: 'POST', url: '/file-upload', payload, headers });
      expect(response.statusCode).toBe(413);
      expect(response.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
    } finally {
      await capped.close();
    }
  });

  it('05: unknown routes and wrong methods get the JSON error envelope', async () => {
    const get = await app.inject({ method: 'GET', url: '/file-upload' });
    expect(get.statusCode).toBe(404);
    expect(get.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const nowhere = await app.inject({ method: 'POST', url: '/nope' });
    expect(nowhere.statusCode).toBe(404);
    expect(nowhere.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('06: /analyze returns the full report for the sample', async () => {
    const { payload, headers } = await multipartPayload([
      { bytes: sampleBytes, filename: 'sample.mp3' },
    ]);
    const response = await app.inject({ method: 'POST', url: '/analyze', payload, headers });
    expect(response.statusCode).toBe(200);
    const report = response.json() as UploadAnalysis;
    expect(report.frameCount).toBe(6090);
    expect(report.file).toEqual({ fileName: 'sample.mp3', sizeBytes: 1458172 });
    expect(report.frames.byKind).toEqual({ audio: 6089, vbrHeader: 1 });
    expect(report.vbrHeader.kind).toBe('Xing');
    expect(report.vbrHeader.declaredFrameCount).toBe(6089);
    expect(report.format.bitRateMode).toBe('VBR');
    expect(report.timing.durationSeconds).toBeCloseTo(159.06, 1);
    expect(report.warnings).toEqual([]);
  });

  it('07: /healthz responds ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('08: two file parts is 400 MULTIPLE_FILES', async () => {
    const { payload, headers } = await multipartPayload([
      { bytes: concat(frame(), frame()) },
      { bytes: concat(frame(), frame()), field: 'second' },
    ]);
    const response = await app.inject({ method: 'POST', url: '/file-upload', payload, headers });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'MULTIPLE_FILES' } });
  });

  it('origin verification: rejects requests without the secret when configured', async () => {
    const guarded = await buildApp({
      maxUploadBytes: 1024,
      serveStatic: false,
      originVerifySecret: 's3cret',
    });
    try {
      const denied = await guarded.inject({ method: 'GET', url: '/nope' });
      expect(denied.statusCode).toBe(403);
      const health = await guarded.inject({ method: 'GET', url: '/healthz' });
      expect(health.statusCode).toBe(200);
      const allowed = await guarded.inject({
        method: 'GET',
        url: '/nope',
        headers: { 'x-origin-verify': 's3cret' },
      });
      expect(allowed.statusCode).toBe(404);
    } finally {
      await guarded.close();
    }
  });
});
