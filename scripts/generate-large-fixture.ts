/**
 * Generates a large synthetic CBR MP3 (320 kbps @ 44.1 kHz) for streaming /
 * memory evidence. Frame count is exact by construction, so the parser's
 * result can be verified against ground truth at any size.
 *
 * CLI: tsx scripts/generate-large-fixture.ts [sizeMb] [outPath]
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { frame } from '../test/helpers/mp3-builder.js';

export interface LargeFixture {
  filePath: string;
  sizeBytes: number;
  frameCount: number;
}

export async function generateLargeCbrFixture(
  filePath: string,
  targetMb: number,
): Promise<LargeFixture> {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const singleFrame = frame({ bitrateKbps: 320, sampleRateHz: 44100 }); // 1044 bytes
  const frameCount = Math.ceil((targetMb * 1024 * 1024) / singleFrame.length);
  const framesPerBatch = 1024;
  const batch = Buffer.concat(Array.from({ length: framesPerBatch }, () => singleFrame));

  const stream = createWriteStream(filePath);
  let written = 0;
  while (written < frameCount) {
    const n = Math.min(framesPerBatch, frameCount - written);
    const chunk = n === framesPerBatch ? batch : batch.subarray(0, n * singleFrame.length);
    if (!stream.write(chunk)) {
      await new Promise<void>((resolve) => stream.once('drain', () => resolve()));
    }
    written += n;
  }
  await new Promise<void>((resolve) => stream.end(resolve));
  return { filePath, sizeBytes: frameCount * singleFrame.length, frameCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sizeMb = Number(process.argv[2] ?? '100');
  const outPath = process.argv[3] ?? `test/fixtures/generated/cbr-${sizeMb}mb.mp3`;
  const result = await generateLargeCbrFixture(outPath, sizeMb);
  console.log(
    `wrote ${result.filePath}: ${result.sizeBytes.toLocaleString()} bytes, ` +
      `${result.frameCount.toLocaleString()} frames`,
  );
}
