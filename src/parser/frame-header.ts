import type { ChannelMode, FrameHeader } from './types.js';

export const FRAME_HEADER_BYTES = 4;
export const SAMPLES_PER_FRAME = 1152;

// MPEG-1 Layer III bitrate table, kbps, indexed by the 4-bit bitrate field.
// Index 0 is "free format" and 15 is invalid — both rejected (out of scope).
const BITRATE_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const SAMPLE_RATE_HZ = [44100, 48000, 32000, 0];
const CHANNEL_MODES: ChannelMode[] = ['stereo', 'joint-stereo', 'dual-channel', 'mono'];

const MPEG1_VERSION_BITS = 0b11;
const LAYER_III_BITS = 0b01;

/**
 * Decode 4 candidate bytes as an MPEG-1 Layer III frame header.
 * Anything else — other MPEG versions or layers, free/invalid bitrate,
 * reserved sample rate — returns null and is treated as "not a frame".
 */
export function tryParseFrameHeader(
  b0: number,
  b1: number,
  b2: number,
  b3: number,
): FrameHeader | null {
  const hasFrameSync = b0 === 0xff && (b1 & 0xe0) === 0xe0;
  if (!hasFrameSync) return null;

  const versionBits = (b1 >> 3) & 0b11;
  const layerBits = (b1 >> 1) & 0b11;
  if (versionBits !== MPEG1_VERSION_BITS || layerBits !== LAYER_III_BITS) return null;

  const bitrateKbps = BITRATE_KBPS[(b2 >> 4) & 0x0f] ?? 0;
  const sampleRateHz = SAMPLE_RATE_HZ[(b2 >> 2) & 0b11] ?? 0;
  if (bitrateKbps === 0 || sampleRateHz === 0) return null;

  const padding = ((b2 >> 1) & 1) === 1;
  const crcProtected = (b1 & 1) === 0;
  const channelMode = CHANNEL_MODES[(b3 >> 6) & 0b11] ?? 'stereo';
  const frameLengthBytes = Math.floor((144 * bitrateKbps * 1000) / sampleRateHz) + (padding ? 1 : 0);

  return { bitrateKbps, sampleRateHz, padding, crcProtected, channelMode, frameLengthBytes };
}
