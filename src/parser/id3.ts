export const ID3V2_HEADER_BYTES = 10;
export const ID3V2_FOOTER_BYTES = 10;
export const ID3V1_TAG_BYTES = 128;

export interface Id3v2Header {
  /** e.g. "2.4.0" */
  version: string;
  /** Header + body + optional footer — the total number of bytes to skip. */
  totalSizeBytes: number;
}

/** Parse an ID3v2 tag header at the start of `bytes` (requires 10 bytes). */
export function tryParseId3v2Header(bytes: Uint8Array): Id3v2Header | null {
  if (bytes.length < ID3V2_HEADER_BYTES) return null;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null; // "ID3"

  const major = bytes[3] ?? 0xff;
  const revision = bytes[4] ?? 0xff;
  const flags = bytes[5] ?? 0;
  const sizeBytes = [bytes[6] ?? 0x80, bytes[7] ?? 0x80, bytes[8] ?? 0x80, bytes[9] ?? 0x80];
  // The spec requires version bytes < 0xFF and sync-safe size bytes (< 0x80);
  // anything else is not a real tag header and falls through to frame seeking.
  if (major === 0xff || revision === 0xff || sizeBytes.some((b) => b >= 0x80)) return null;

  const size =
    ((sizeBytes[0] ?? 0) << 21) |
    ((sizeBytes[1] ?? 0) << 14) |
    ((sizeBytes[2] ?? 0) << 7) |
    (sizeBytes[3] ?? 0);
  const footerBytes = (flags & 0x10) !== 0 ? ID3V2_FOOTER_BYTES : 0;

  return {
    version: `2.${major}.${revision}`,
    totalSizeBytes: ID3V2_HEADER_BYTES + size + footerBytes,
  };
}

/** True when `bytes` begins with the ID3v1 magic "TAG". */
export function startsWithId3v1Tag(bytes: ArrayLike<number>): boolean {
  return bytes.length >= 3 && bytes[0] === 0x54 && bytes[1] === 0x41 && bytes[2] === 0x47;
}
