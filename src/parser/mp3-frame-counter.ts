import { Buffer } from 'node:buffer';

import { FRAME_HEADER_BYTES, SAMPLES_PER_FRAME, tryParseFrameHeader } from './frame-header.js';
import { ID3V1_TAG_BYTES, ID3V2_HEADER_BYTES, startsWithId3v1Tag, tryParseId3v2Header } from './id3.js';
import { Mp3ParseError } from './types.js';
import type {
  AnalysisReport,
  AnalysisWarning,
  ChannelMode,
  FrameHeader,
  VbrHeaderInfo,
} from './types.js';
import { VBR_SCAN_BYTES, detectVbrHeader } from './xing.js';

type State = 'start' | 'skip-id3v2' | 'seek-header' | 'in-frame' | 'finalized';

const NO_VBR_HEADER: VbrHeaderInfo = {
  present: false,
  kind: null,
  declaredFrameCount: null,
  declaredByteCount: null,
  hasToc: false,
  qualityIndicator: null,
};

/**
 * Streaming MPEG-1 Layer III frame counter.
 *
 * Feed the raw byte stream through `update()` in chunks of any size (a
 * header split across chunks is handled), then call `finalize()` once for
 * the report. Memory use is O(1) in the file size: apart from the current
 * chunk, the counter retains only a small carry buffer, the first ~158
 * bytes of the first frame (VBR-header scan), and fixed-size counters.
 * Chunks are never mutated and must not be mutated by the caller after
 * being handed off.
 */
export class Mp3FrameCounter {
  private state: State = 'start';
  private pending: Buffer = Buffer.alloc(0);
  private bytesReceived = 0;

  private frameCount = 0;
  private id3v2: { version: string; totalSizeBytes: number } | null = null;
  private id3v2Remaining = 0;
  private frameRemaining = 0;

  private firstFrameHeader: FrameHeader | null = null;
  private firstFrameCapture: Buffer[] = [];
  private captureRemaining = 0;
  private vbrScanDone = false;
  private vbrHeader: VbrHeaderInfo | null = null;

  private audioStartOffset = 0;
  private skipRunLength = 0;
  private skipRunPrefix: number[] = [];
  private resyncedBytes = 0;
  private truncatedFinalFrame = false;

  private readonly byBitRate = new Map<number, number>();
  private readonly bySampleRate = new Map<number, number>();
  private readonly byChannelMode = new Map<ChannelMode, number>();
  private paddedFrames = 0;
  private crcFrames = 0;
  private totalFrameBytes = 0;

  update(chunk: Uint8Array): void {
    if (this.state === 'finalized') throw new Error('update() called after finalize()');
    if (chunk.length === 0) return;
    this.bytesReceived += chunk.length;
    const incoming = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    this.pending = this.pending.length === 0 ? incoming : Buffer.concat([this.pending, incoming]);
    this.consume();
  }

  finalize(): AnalysisReport {
    if (this.state === 'finalized') throw new Error('finalize() called twice');

    if (this.state === 'in-frame' && this.frameRemaining > 0) {
      this.truncatedFinalFrame = true;
      // The first frame may have ended before the VBR scan window filled.
      if (this.frameCount === 1 && !this.vbrScanDone) this.runVbrScan();
    }
    // Unconsumed carry bytes (a partial header, a partial ID3 preamble)
    // become part of the final skip run.
    for (let i = 0; i < this.pending.length && this.skipRunPrefix.length < 3; i++) {
      this.skipRunPrefix.push(this.pending[i] ?? 0);
    }
    this.skipRunLength += this.pending.length;
    this.pending = Buffer.alloc(0);
    this.state = 'finalized';

    if (this.frameCount === 0) {
      throw new Mp3ParseError(
        'UNSUPPORTED_FORMAT',
        this.bytesReceived === 0
          ? 'The uploaded file is empty.'
          : 'No MPEG-1 Layer III frames were found. The file does not appear to be an MPEG-1 Audio Layer III (.mp3) file.',
      );
    }

    // Classify whatever followed the last frame: exactly 128 bytes starting
    // "TAG" is an ID3v1 tag; anything else is unrecognised trailing data.
    let id3v1Present = false;
    let trailingBytes = 0;
    if (this.skipRunLength === ID3V1_TAG_BYTES && startsWithId3v1Tag(this.skipRunPrefix)) {
      id3v1Present = true;
    } else {
      trailingBytes = this.skipRunLength;
    }

    return this.buildReport(id3v1Present, trailingBytes);
  }

  private consume(): void {
    for (;;) {
      switch (this.state) {
        case 'start': {
          if (this.pending.length < 3) return;
          const looksLikeId3 =
            this.pending[0] === 0x49 && this.pending[1] === 0x44 && this.pending[2] === 0x33;
          if (looksLikeId3) {
            if (this.pending.length < ID3V2_HEADER_BYTES) return;
            const id3 = tryParseId3v2Header(this.pending);
            if (id3) {
              this.id3v2 = { version: id3.version, totalSizeBytes: id3.totalSizeBytes };
              this.advance(ID3V2_HEADER_BYTES);
              this.id3v2Remaining = id3.totalSizeBytes - ID3V2_HEADER_BYTES;
              this.state = 'skip-id3v2';
              break;
            }
          }
          this.state = 'seek-header';
          break;
        }
        case 'skip-id3v2': {
          const n = Math.min(this.id3v2Remaining, this.pending.length);
          this.advance(n);
          this.id3v2Remaining -= n;
          if (this.id3v2Remaining > 0) return;
          this.state = 'seek-header';
          break;
        }
        case 'seek-header': {
          while (this.pending.length >= FRAME_HEADER_BYTES) {
            const header = tryParseFrameHeader(
              this.pending[0] ?? 0,
              this.pending[1] ?? 0,
              this.pending[2] ?? 0,
              this.pending[3] ?? 0,
            );
            if (header) {
              this.beginFrame(header);
              break;
            }
            this.skipOneByte();
          }
          // beginFrame() flips the state; TS can't see through the mutation.
          if ((this.state as State) !== 'in-frame') return; // need more bytes for a full header
          break;
        }
        case 'in-frame': {
          const n = Math.min(this.frameRemaining, this.pending.length);
          if (n === 0) return;
          this.captureForVbrScan(this.pending.subarray(0, n));
          this.advance(n);
          this.frameRemaining -= n;
          if (this.frameRemaining > 0) return;
          if (this.frameCount === 1 && !this.vbrScanDone) this.runVbrScan();
          this.state = 'seek-header';
          break;
        }
        case 'finalized':
          return;
      }
    }
  }

  private beginFrame(header: FrameHeader): void {
    if (this.skipRunLength > 0) {
      this.resyncedBytes += this.skipRunLength;
      this.skipRunLength = 0;
      this.skipRunPrefix = [];
    }
    if (this.frameCount === 0) {
      this.audioStartOffset = this.bytesReceived - this.pending.length;
      this.firstFrameHeader = header;
      this.captureRemaining = Math.min(header.frameLengthBytes, VBR_SCAN_BYTES);
    }

    this.frameCount += 1;
    this.byBitRate.set(header.bitrateKbps, (this.byBitRate.get(header.bitrateKbps) ?? 0) + 1);
    this.bySampleRate.set(
      header.sampleRateHz,
      (this.bySampleRate.get(header.sampleRateHz) ?? 0) + 1,
    );
    this.byChannelMode.set(
      header.channelMode,
      (this.byChannelMode.get(header.channelMode) ?? 0) + 1,
    );
    if (header.padding) this.paddedFrames += 1;
    if (header.crcProtected) this.crcFrames += 1;
    this.totalFrameBytes += header.frameLengthBytes;

    this.captureForVbrScan(this.pending.subarray(0, FRAME_HEADER_BYTES));
    this.advance(FRAME_HEADER_BYTES);
    this.frameRemaining = header.frameLengthBytes - FRAME_HEADER_BYTES;
    this.state = 'in-frame';
  }

  private captureForVbrScan(bytes: Buffer): void {
    if (this.captureRemaining <= 0) return;
    const take = bytes.subarray(0, Math.min(bytes.length, this.captureRemaining));
    this.firstFrameCapture.push(Buffer.from(take));
    this.captureRemaining -= take.length;
    if (this.captureRemaining === 0) this.runVbrScan();
  }

  private runVbrScan(): void {
    this.vbrScanDone = true;
    if (!this.firstFrameHeader || this.firstFrameCapture.length === 0) return;
    this.vbrHeader = detectVbrHeader(Buffer.concat(this.firstFrameCapture), this.firstFrameHeader);
    this.firstFrameCapture = [];
    this.captureRemaining = 0;
  }

  private skipOneByte(): void {
    if (this.skipRunPrefix.length < 3) this.skipRunPrefix.push(this.pending[0] ?? 0);
    this.skipRunLength += 1;
    this.advance(1);
  }

  private advance(n: number): void {
    this.pending = this.pending.subarray(n);
  }

  private buildReport(id3v1Present: boolean, trailingBytes: number): AnalysisReport {
    const first = this.firstFrameHeader;
    if (!first) throw new Error('invariant: buildReport() requires at least one frame');

    const vbrFrames = this.vbrHeader ? 1 : 0;
    const audioFrames = this.frameCount - vbrFrames;
    const primarySampleRate = first.sampleRateHz;
    const totalSamples = audioFrames * SAMPLES_PER_FRAME;
    const durationSeconds = totalSamples / primarySampleRate;
    const audioBytes = this.totalFrameBytes - (this.vbrHeader ? first.frameLengthBytes : 0);
    const averageBitRateKbps = durationSeconds > 0 ? (audioBytes * 8) / durationSeconds / 1000 : 0;

    // The VBR header frame often differs from the audio (bitrate, channel
    // mode), so CBR/VBR judgment and consistency warnings exclude it.
    const audioBitRates = new Map(this.byBitRate);
    const audioSampleRates = new Map(this.bySampleRate);
    const audioChannelModes = new Map(this.byChannelMode);
    if (this.vbrHeader) {
      decrement(audioBitRates, first.bitrateKbps);
      decrement(audioSampleRates, first.sampleRateHz);
      decrement(audioChannelModes, first.channelMode);
    }

    const warnings: AnalysisWarning[] = [];
    if (this.resyncedBytes > 0) {
      warnings.push({
        code: 'RESYNC',
        message: `Skipped ${this.resyncedBytes} byte(s) of non-frame data inside the audio stream to regain frame sync.`,
        bytesSkipped: this.resyncedBytes,
      });
    }
    if (this.truncatedFinalFrame) {
      warnings.push({
        code: 'TRUNCATED_FINAL_FRAME',
        message:
          'The last frame header is valid but its body is cut short by the end of the file; the frame is still counted.',
      });
    }
    if (trailingBytes > 0) {
      warnings.push({
        code: 'TRAILING_BYTES',
        message: `${trailingBytes} byte(s) of unrecognised data follow the last frame.`,
        bytesSkipped: trailingBytes,
      });
    }
    if (audioSampleRates.size > 1) {
      warnings.push({
        code: 'MIXED_SAMPLE_RATES',
        message:
          'Frames with different sample rates were found; duration and bitrate figures use the first frame’s rate.',
      });
    }
    if (audioChannelModes.size > 1) {
      warnings.push({
        code: 'MIXED_CHANNEL_MODES',
        message: 'Frames with different channel modes were found.',
      });
    }

    const dominantModes = audioFrames > 0 ? audioChannelModes : this.byChannelMode;
    let dominantChannelMode: ChannelMode = first.channelMode;
    let dominantCount = 0;
    for (const [mode, count] of dominantModes) {
      if (count > dominantCount) {
        dominantChannelMode = mode;
        dominantCount = count;
      }
    }

    return {
      frameCount: this.frameCount,
      format: {
        mpegVersion: '1',
        layer: 'III',
        sampleRateHz: primarySampleRate,
        channelMode: dominantChannelMode,
        bitRateMode: audioBitRates.size > 1 ? 'VBR' : 'CBR',
        averageBitRateKbps: round(averageBitRateKbps, 1),
      },
      tags: {
        id3v2: this.id3v2
          ? { present: true, version: this.id3v2.version, totalSizeBytes: this.id3v2.totalSizeBytes }
          : { present: false, version: null, totalSizeBytes: null },
        id3v1: { present: id3v1Present },
      },
      vbrHeader: this.vbrHeader ?? NO_VBR_HEADER,
      frames: {
        physicalTotal: this.frameCount,
        byKind: { audio: audioFrames, vbrHeader: vbrFrames },
        byBitRateKbps: toSortedRecord(this.byBitRate),
        bySampleRateHz: toSortedRecord(this.bySampleRate),
        byChannelMode: Object.fromEntries(this.byChannelMode),
        padded: this.paddedFrames,
        withCrc: this.crcFrames,
      },
      timing: {
        samplesPerFrame: SAMPLES_PER_FRAME,
        totalSamples,
        durationSeconds: round(durationSeconds, 3),
        msPerFrameAtPrimaryRate: round((SAMPLES_PER_FRAME / primarySampleRate) * 1000, 3),
      },
      layout: {
        audioStartOffset: this.audioStartOffset,
        bytesParsed: this.bytesReceived,
        trailingBytes,
      },
      warnings,
    };
  }
}

function decrement<K>(map: Map<K, number>, key: K): void {
  const value = map.get(key);
  if (value === undefined) return;
  if (value <= 1) map.delete(key);
  else map.set(key, value - 1);
}

function toSortedRecord(map: Map<number, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), v]),
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
