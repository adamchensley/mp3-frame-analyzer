import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { Mp3FrameCounter } from '../../src/parser/mp3-frame-counter.js';
import { Mp3ParseError } from '../../src/parser/types.js';
import type { AnalysisReport } from '../../src/parser/types.js';
import {
  concat,
  frame,
  id3v1,
  id3v2,
  junk,
  mpeg2StyleBlock,
  pngBytes,
  xingFrame,
} from '../helpers/mp3-builder.js';

const sampleBytes = readFileSync(new URL('../fixtures/sample.mp3', import.meta.url));

function parseAll(bytes: Uint8Array, chunkSize = bytes.length): AnalysisReport {
  const counter = new Mp3FrameCounter();
  for (let i = 0; i < bytes.length; i += chunkSize) {
    counter.update(bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return counter.finalize();
}

describe('Mp3FrameCounter (U-PRS)', () => {
  it('01: counts a simple run of audio frames', () => {
    const report = parseAll(concat(frame(), frame(), frame()));
    expect(report.frameCount).toBe(3);
    expect(report.frames.byKind).toEqual({ audio: 3, vbrHeader: 0 });
    expect(report.warnings).toEqual([]);
  });

  it('03: skips a leading ID3v2 tag and reports it', () => {
    const report = parseAll(concat(id3v2(500), frame(), frame(), frame(), frame(), frame()));
    expect(report.frameCount).toBe(5);
    expect(report.tags.id3v2).toEqual({ present: true, version: '2.4.0', totalSizeBytes: 510 });
    expect(report.layout.audioStartOffset).toBe(510);
  });

  it('04: honours the ID3v2 footer flag (10 extra bytes)', () => {
    const report = parseAll(concat(id3v2(200, { footer: true }), frame(), frame()));
    expect(report.frameCount).toBe(2);
    expect(report.tags.id3v2.totalSizeBytes).toBe(220);
    expect(report.layout.audioStartOffset).toBe(220);
  });

  it('05: resyncs over junk before the first frame', () => {
    const report = parseAll(concat(junk(100), frame(), frame(), frame(), frame()));
    expect(report.frameCount).toBe(4);
    expect(report.warnings).toEqual([
      expect.objectContaining({ code: 'RESYNC', bytesSkipped: 100 }),
    ]);
  });

  it('06: counts a truncated final frame and warns', () => {
    const full = frame();
    const bytes = concat(frame(), frame(), frame(), full.subarray(0, Math.floor(full.length / 2)));
    const report = parseAll(bytes);
    expect(report.frameCount).toBe(4);
    expect(report.warnings.map((w) => w.code)).toEqual(['TRUNCATED_FINAL_FRAME']);
  });

  it('07: rejects empty input', () => {
    const counter = new Mp3FrameCounter();
    expect(() => counter.finalize()).toThrowError(Mp3ParseError);
    try {
      new Mp3FrameCounter().finalize();
    } catch (error) {
      expect((error as Mp3ParseError).message).toMatch(/empty/i);
    }
  });

  it('08: rejects non-MP3 bytes (PNG)', () => {
    expect(() => parseAll(pngBytes())).toThrowError(Mp3ParseError);
  });

  it('09: classifies a 128-byte TAG trailer as ID3v1, not trailing junk', () => {
    const report = parseAll(concat(frame(), frame(), frame(), frame(), id3v1()));
    expect(report.frameCount).toBe(4);
    expect(report.tags.id3v1.present).toBe(true);
    expect(report.layout.trailingBytes).toBe(0);
    expect(report.warnings).toEqual([]);
  });

  it('10: detects a Xing header frame and classifies it separately', () => {
    const bytes = concat(xingFrame({ declaredFrames: 3, declaredBytes: 999, quality: 78 }), frame(), frame(), frame());
    const report = parseAll(bytes);
    expect(report.frameCount).toBe(4);
    expect(report.frames.byKind).toEqual({ audio: 3, vbrHeader: 1 });
    expect(report.vbrHeader).toEqual({
      present: true,
      kind: 'Xing',
      declaredFrameCount: 3,
      declaredByteCount: 999,
      hasToc: false,
      qualityIndicator: 78,
    });
  });

  it('10b: detects an Info header (CBR) the same way', () => {
    const report = parseAll(concat(xingFrame({ declaredFrames: 2, tag: 'Info' }), frame(), frame()));
    expect(report.vbrHeader.kind).toBe('Info');
    expect(report.frames.byKind).toEqual({ audio: 2, vbrHeader: 1 });
  });

  it('11: resyncs over junk between frames', () => {
    const report = parseAll(concat(frame(), junk(37), frame(), frame()));
    expect(report.frameCount).toBe(3);
    expect(report.warnings).toEqual([expect.objectContaining({ code: 'RESYNC', bytesSkipped: 37 })]);
  });

  it('12: a file with only MPEG-2-style blocks is unsupported', () => {
    expect(() => parseAll(concat(mpeg2StyleBlock(), mpeg2StyleBlock()))).toThrowError(
      /No MPEG-1 Layer III frames/,
    );
  });

  it('13: builds a bitrate histogram and detects VBR', () => {
    const bytes = concat(
      frame({ bitrateKbps: 128 }),
      frame({ bitrateKbps: 128 }),
      frame({ bitrateKbps: 192 }),
      frame({ bitrateKbps: 320 }),
    );
    const report = parseAll(bytes);
    expect(report.frames.byBitRateKbps).toEqual({ '128': 2, '192': 1, '320': 1 });
    expect(report.format.bitRateMode).toBe('VBR');
    expect(parseAll(concat(frame(), frame())).format.bitRateMode).toBe('CBR');
  });

  it('14: reports unrecognised trailing bytes', () => {
    const report = parseAll(concat(frame(), frame(), junk(50)));
    expect(report.frameCount).toBe(2);
    expect(report.layout.trailingBytes).toBe(50);
    expect(report.warnings).toEqual([
      expect.objectContaining({ code: 'TRAILING_BYTES', bytesSkipped: 50 }),
    ]);
  });

  it('counts padded and CRC-protected frames', () => {
    const bytes = concat(frame({ padding: true }), frame({ crc: true }), frame());
    const report = parseAll(bytes);
    expect(report.frames.padded).toBe(1);
    expect(report.frames.withCrc).toBe(1);
  });

  it('guards against use after finalize()', () => {
    const counter = new Mp3FrameCounter();
    counter.update(frame());
    counter.finalize();
    expect(() => counter.update(frame())).toThrowError(/finalize/);
    expect(() => counter.finalize()).toThrowError(/twice/);
  });
});

describe('Mp3FrameCounter against the provided sample (ground truth)', () => {
  const expectSampleReport = (report: AnalysisReport) => {
    expect(report.frameCount).toBe(6090);
    expect(report.frames.byKind).toEqual({ audio: 6089, vbrHeader: 1 });
    expect(report.vbrHeader.kind).toBe('Xing');
    expect(report.vbrHeader.declaredFrameCount).toBe(6089);
    expect(report.tags.id3v2).toEqual({ present: true, version: '2.4.0', totalSizeBytes: 44 });
    expect(report.tags.id3v1.present).toBe(false);
    expect(report.layout).toEqual({ audioStartOffset: 44, bytesParsed: 1458172, trailingBytes: 0 });
    expect(report.frames.byBitRateKbps).toEqual({
      '32': 49,
      '40': 11,
      '48': 23,
      '56': 102,
      '64': 2352,
      '80': 3374,
      '96': 136,
      '112': 27,
      '128': 11,
      '160': 5,
    });
    expect(report.frames.bySampleRateHz).toEqual({ '44100': 6090 });
    expect(report.frames.byChannelMode).toEqual({ stereo: 1, 'joint-stereo': 6089 });
    expect(report.frames.padded).toBe(0);
    expect(report.frames.withCrc).toBe(0);
    expect(report.format).toEqual({
      mpegVersion: '1',
      layer: 'III',
      sampleRateHz: 44100,
      channelMode: 'joint-stereo',
      bitRateMode: 'VBR',
      averageBitRateKbps: 73.3,
    });
    expect(report.timing.totalSamples).toBe(7014528);
    expect(report.timing.durationSeconds).toBeCloseTo(159.06, 2);
    expect(report.warnings).toEqual([]);
  };

  it('whole-buffer parse matches ground truth (6090 physical frames)', () => {
    expectSampleReport(parseAll(sampleBytes));
  });

  it('02: is chunk-boundary independent (1-byte and odd-sized chunks)', () => {
    expectSampleReport(parseAll(sampleBytes, 1));
    expectSampleReport(parseAll(sampleBytes, 7));
    expectSampleReport(parseAll(sampleBytes, 64 * 1024));
  });
});
