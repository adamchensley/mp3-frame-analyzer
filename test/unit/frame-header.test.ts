import { describe, expect, it } from 'vitest';

import { tryParseFrameHeader } from '../../src/parser/frame-header.js';
import { frame } from '../helpers/mp3-builder.js';

function parse(bytes: Uint8Array) {
  return tryParseFrameHeader(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
}

describe('tryParseFrameHeader (U-HDR)', () => {
  // Independently computed: floor(144 * bitrate / 44100), no padding.
  const lengthsAt44100: Array<[number, number]> = [
    [32, 104],
    [40, 130],
    [48, 156],
    [56, 182],
    [64, 208],
    [80, 261],
    [96, 313],
    [112, 365],
    [128, 417],
    [160, 522],
    [192, 626],
    [224, 731],
    [256, 835],
    [320, 1044],
  ];

  it.each(lengthsAt44100)('decodes %d kbps @ 44.1 kHz to %d bytes', (kbps, expected) => {
    const header = parse(frame({ bitrateKbps: kbps, sampleRateHz: 44100 }));
    expect(header).not.toBeNull();
    expect(header?.bitrateKbps).toBe(kbps);
    expect(header?.frameLengthBytes).toBe(expected);
  });

  it.each([
    [64, 44100, 208, 209],
    [128, 48000, 384, 385],
    [320, 32000, 1440, 1441],
  ] as const)('padding adds one byte (%d kbps @ %d Hz)', (kbps, rate, plain, padded) => {
    expect(parse(frame({ bitrateKbps: kbps, sampleRateHz: rate }))?.frameLengthBytes).toBe(plain);
    expect(
      parse(frame({ bitrateKbps: kbps, sampleRateHz: rate, padding: true }))?.frameLengthBytes,
    ).toBe(padded);
  });

  it('extracts CRC protection and channel mode', () => {
    const plain = parse(frame({ crc: false, channelMode: 'mono' }));
    expect(plain?.crcProtected).toBe(false);
    expect(plain?.channelMode).toBe('mono');

    const protectedHeader = parse(frame({ crc: true, channelMode: 'dual-channel' }));
    expect(protectedHeader?.crcProtected).toBe(true);
    expect(protectedHeader?.channelMode).toBe('dual-channel');
  });

  it('rejects candidates without a full 11-bit frame sync', () => {
    expect(tryParseFrameHeader(0xfe, 0xfb, 0x92, 0x40)).toBeNull();
    expect(tryParseFrameHeader(0xff, 0xdb, 0x92, 0x40)).toBeNull(); // sync bits 0xE0 not set
  });

  it.each([
    ['MPEG-2.5', 0b00],
    ['reserved version', 0b01],
    ['MPEG-2', 0b10],
  ])('rejects %s headers', (_label, versionBits) => {
    const b1 = 0xe0 | (versionBits << 3) | (0b01 << 1) | 1;
    expect(tryParseFrameHeader(0xff, b1, 0x92, 0x40)).toBeNull();
  });

  it.each([
    ['reserved layer', 0b00],
    ['Layer II', 0b10],
    ['Layer I', 0b11],
  ])('rejects %s headers', (_label, layerBits) => {
    const b1 = 0xe0 | (0b11 << 3) | (layerBits << 1) | 1;
    expect(tryParseFrameHeader(0xff, b1, 0x92, 0x40)).toBeNull();
  });

  it('rejects free-format (0) and invalid (15) bitrate indexes', () => {
    expect(tryParseFrameHeader(0xff, 0xfb, 0x00, 0x40)).toBeNull();
    expect(tryParseFrameHeader(0xff, 0xfb, 0xf0, 0x40)).toBeNull();
  });

  it('rejects the reserved sample-rate index', () => {
    expect(tryParseFrameHeader(0xff, 0xfb, 0x9c, 0x40)).toBeNull(); // rate bits 0b11
  });
});
