import type { FrameHeader, VbrHeaderInfo } from './types.js';

/**
 * How much of the first frame must be inspected to find a VBR header:
 * header(4) + optional CRC(2) + max side info(32) + tag(4) + flags(4)
 * + frame count(4) + byte count(4) + TOC(100) + quality(4).
 */
export const VBR_SCAN_BYTES = 158;

const XING = 0x58696e67; // "Xing" — VBR
const INFO = 0x496e666f; // "Info" — CBR written by LAME-family encoders
const VBRI = 0x56425249; // "VBRI" — Fraunhofer

/**
 * Inspect the first bytes of the first frame (header included) for a
 * Xing/Info/VBRI header. `frameBytes` may be shorter than the full frame;
 * every read is bounds-checked.
 */
export function detectVbrHeader(frameBytes: Uint8Array, header: FrameHeader): VbrHeaderInfo | null {
  const sideInfoBytes = header.channelMode === 'mono' ? 17 : 32;
  const xingOffset = 4 + (header.crcProtected ? 2 : 0) + sideInfoBytes;
  return readXingOrInfo(frameBytes, xingOffset) ?? readVbri(frameBytes, 4 + 32);
}

function readXingOrInfo(bytes: Uint8Array, offset: number): VbrHeaderInfo | null {
  const tag = readU32(bytes, offset);
  if (tag !== XING && tag !== INFO) return null;
  const flags = readU32(bytes, offset + 4);
  if (flags === null) return null;

  let cursor = offset + 8;
  let declaredFrameCount: number | null = null;
  let declaredByteCount: number | null = null;
  let hasToc = false;
  let qualityIndicator: number | null = null;
  if (flags & 0x1) {
    declaredFrameCount = readU32(bytes, cursor);
    cursor += 4;
  }
  if (flags & 0x2) {
    declaredByteCount = readU32(bytes, cursor);
    cursor += 4;
  }
  if (flags & 0x4) {
    hasToc = bytes.length >= cursor + 100;
    cursor += 100;
  }
  if (flags & 0x8) {
    qualityIndicator = readU32(bytes, cursor);
  }
  return {
    present: true,
    kind: tag === XING ? 'Xing' : 'Info',
    declaredFrameCount,
    declaredByteCount,
    hasToc,
    qualityIndicator,
  };
}

function readVbri(bytes: Uint8Array, offset: number): VbrHeaderInfo | null {
  if (readU32(bytes, offset) !== VBRI) return null;
  // "VBRI" + version(2) + delay(2) + quality(2) + byte count(4) + frame count(4)
  return {
    present: true,
    kind: 'VBRI',
    declaredFrameCount: readU32(bytes, offset + 14),
    declaredByteCount: readU32(bytes, offset + 10),
    hasToc: false,
    qualityIndicator: readU16(bytes, offset + 8),
  };
}

function readU32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readU16(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}
