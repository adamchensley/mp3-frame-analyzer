/**
 * Builders for synthetic MP3 byte streams used by the unit tests and the
 * evidence scripts. These construct real MPEG-1 Layer III byte layouts so
 * the parser is always tested against honest input.
 */
import { Buffer } from 'node:buffer';

import type { ChannelMode } from '../../src/parser/types.js';

export interface FrameOptions {
  bitrateKbps?: number;
  sampleRateHz?: 44100 | 48000 | 32000;
  padding?: boolean;
  crc?: boolean;
  channelMode?: ChannelMode;
  /** Byte value used to fill the frame body (0x00 contains no false syncs). */
  fill?: number;
}

const BITRATE_INDEX: Record<number, number> = {
  32: 1,
  40: 2,
  48: 3,
  56: 4,
  64: 5,
  80: 6,
  96: 7,
  112: 8,
  128: 9,
  160: 10,
  192: 11,
  224: 12,
  256: 13,
  320: 14,
};
const SAMPLE_RATE_INDEX: Record<number, number> = { 44100: 0, 48000: 1, 32000: 2 };
const CHANNEL_MODE_BITS: Record<ChannelMode, number> = {
  stereo: 0,
  'joint-stereo': 1,
  'dual-channel': 2,
  mono: 3,
};

export function frameLength(bitrateKbps: number, sampleRateHz: number, padding = false): number {
  return Math.floor((144 * bitrateKbps * 1000) / sampleRateHz) + (padding ? 1 : 0);
}

/** A single valid MPEG-1 Layer III frame with a zero-filled body. */
export function frame(options: FrameOptions = {}): Buffer {
  const {
    bitrateKbps = 128,
    sampleRateHz = 44100,
    padding = false,
    crc = false,
    channelMode = 'joint-stereo',
    fill = 0x00,
  } = options;
  const bitrateIndex = BITRATE_INDEX[bitrateKbps];
  const sampleRateIndex = SAMPLE_RATE_INDEX[sampleRateHz];
  if (bitrateIndex === undefined || sampleRateIndex === undefined) {
    throw new Error(`unsupported bitrate/sample rate: ${bitrateKbps}/${sampleRateHz}`);
  }
  const buffer = Buffer.alloc(frameLength(bitrateKbps, sampleRateHz, padding), fill);
  buffer[0] = 0xff;
  buffer[1] = 0xe0 | (0b11 << 3) | (0b01 << 1) | (crc ? 0 : 1); // MPEG-1, Layer III
  buffer[2] = (bitrateIndex << 4) | (sampleRateIndex << 2) | ((padding ? 1 : 0) << 1);
  buffer[3] = CHANNEL_MODE_BITS[channelMode] << 6;
  return buffer;
}

export interface XingFrameOptions extends FrameOptions {
  declaredFrames?: number;
  declaredBytes?: number;
  withToc?: boolean;
  quality?: number;
  /** "Xing" for VBR, "Info" for CBR. */
  tag?: 'Xing' | 'Info';
}

/** A first frame carrying a Xing/Info header (non-mono, no CRC layout). */
export function xingFrame(options: XingFrameOptions = {}): Buffer {
  const {
    declaredFrames,
    declaredBytes,
    withToc = false,
    quality,
    tag = 'Xing',
    ...frameOptions
  } = options;
  const buffer = frame({ bitrateKbps: 64, ...frameOptions });
  const header = { crc: frameOptions.crc ?? false, mono: frameOptions.channelMode === 'mono' };
  let cursor = 4 + (header.crc ? 2 : 0) + (header.mono ? 17 : 32);
  buffer.write(tag, cursor, 'ascii');
  const flags =
    (declaredFrames !== undefined ? 0x1 : 0) |
    (declaredBytes !== undefined ? 0x2 : 0) |
    (withToc ? 0x4 : 0) |
    (quality !== undefined ? 0x8 : 0);
  buffer.writeUInt32BE(flags, cursor + 4);
  cursor += 8;
  if (declaredFrames !== undefined) {
    buffer.writeUInt32BE(declaredFrames, cursor);
    cursor += 4;
  }
  if (declaredBytes !== undefined) {
    buffer.writeUInt32BE(declaredBytes, cursor);
    cursor += 4;
  }
  if (withToc) cursor += 100;
  if (quality !== undefined) buffer.writeUInt32BE(quality, cursor);
  return buffer;
}

/** An ID3v2 tag: 10-byte header + zero-filled body (+ footer when flagged). */
export function id3v2(bodySize: number, options: { footer?: boolean; version?: number } = {}): Buffer {
  const { footer = false, version = 4 } = options;
  const buffer = Buffer.alloc(10 + bodySize + (footer ? 10 : 0));
  buffer.write('ID3', 0, 'ascii');
  buffer[3] = version;
  buffer[4] = 0;
  buffer[5] = footer ? 0x10 : 0;
  buffer[6] = (bodySize >>> 21) & 0x7f;
  buffer[7] = (bodySize >>> 14) & 0x7f;
  buffer[8] = (bodySize >>> 7) & 0x7f;
  buffer[9] = bodySize & 0x7f;
  return buffer;
}

/** A 128-byte ID3v1 trailer. */
export function id3v1(): Buffer {
  const buffer = Buffer.alloc(128);
  buffer.write('TAG', 0, 'ascii');
  return buffer;
}

/** Bytes that can never contain a frame sync (no 0xFF anywhere). */
export function junk(length: number, fill = 0x11): Buffer {
  return Buffer.alloc(length, fill);
}

/** A PNG-looking payload: valid PNG signature, sync-free filler. */
export function pngBytes(length = 2048): Buffer {
  const buffer = Buffer.alloc(length, 0xab);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  return buffer;
}

/** A frame-sized block whose header claims MPEG-2 — invalid for this parser. */
export function mpeg2StyleBlock(length = 300): Buffer {
  const buffer = Buffer.alloc(length);
  buffer[0] = 0xff;
  buffer[1] = 0xe0 | (0b10 << 3) | (0b01 << 1) | 1; // version bits "10" = MPEG-2
  buffer[2] = (9 << 4) | (0 << 2);
  buffer[3] = 0;
  return buffer;
}

export function concat(...parts: Buffer[]): Buffer {
  return Buffer.concat(parts);
}
