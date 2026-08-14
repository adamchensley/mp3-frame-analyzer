import { describe, expect, it } from 'vitest';

import { buildNarrative } from './narrative';
import type { UploadAnalysis } from './types';

/** The provided sample's real report, as returned by POST /analyze. */
const sampleReport: UploadAnalysis = {
  frameCount: 6090,
  file: { fileName: 'sample.mp3', sizeBytes: 1458172 },
  format: {
    mpegVersion: '1',
    layer: 'III',
    sampleRateHz: 44100,
    channelMode: 'joint-stereo',
    bitRateMode: 'VBR',
    averageBitRateKbps: 73.3,
  },
  tags: {
    id3v2: { present: true, version: '2.4.0', totalSizeBytes: 44 },
    id3v1: { present: false },
  },
  vbrHeader: {
    present: true,
    kind: 'Xing',
    declaredFrameCount: 6089,
    declaredByteCount: 1458128,
    hasToc: true,
    qualityIndicator: 0,
  },
  frames: {
    physicalTotal: 6090,
    byKind: { audio: 6089, vbrHeader: 1 },
    byBitRateKbps: {
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
    },
    bySampleRateHz: { '44100': 6090 },
    byChannelMode: { stereo: 1, 'joint-stereo': 6089 },
    padded: 0,
    withCrc: 0,
  },
  timing: {
    samplesPerFrame: 1152,
    totalSamples: 7014528,
    durationSeconds: 159.06,
    msPerFrameAtPrimaryRate: 26.122,
  },
  layout: { audioStartOffset: 44, bytesParsed: 1458172, trailingBytes: 0 },
  warnings: [],
};

describe('buildNarrative (U-NAR)', () => {
  it('tells the sample story with the 6,090 = 6,089 + 1 reconciliation', () => {
    const text = buildNarrative(sampleReport).join('\n');
    expect(text).toContain('**ID3v2.4.0** metadata tag occupying 44 bytes');
    expect(text).toContain('a **Xing** VBR header');
    expect(text).toContain('declares **6,089 audio frames**');
    expect(text).toContain('**6,090**: 6,089 audio frames plus 1 metadata frame');
    expect(text).toContain('mediainfo report 6,089');
    expect(text).toContain('32–160 kbps');
    expect(text).toContain('2 min 39.06 s');
    expect(text).toContain('parsed cleanly');
  });

  it('adapts when there is no VBR header and warnings exist', () => {
    const report: UploadAnalysis = {
      ...sampleReport,
      vbrHeader: {
        present: false,
        kind: null,
        declaredFrameCount: null,
        declaredByteCount: null,
        hasToc: false,
        qualityIndicator: null,
      },
      frames: { ...sampleReport.frames, byKind: { audio: 6090, vbrHeader: 0 } },
      tags: {
        id3v2: { present: false, version: null, totalSizeBytes: null },
        id3v1: { present: true },
      },
      layout: { ...sampleReport.layout, audioStartOffset: 0 },
      warnings: [{ code: 'TRAILING_BYTES', message: 'junk', bytesSkipped: 12 }],
    };
    const text = buildNarrative(report).join('\n');
    expect(text).toContain('No Xing/Info/VBRI header was found');
    expect(text).toContain('**6,090 physical MPEG frames**, all of them audio');
    expect(text).toContain('ID3v1 tag closes the file');
    expect(text).toContain('1 observation');
    expect(text).not.toContain('ID3v2** metadata');
  });
});
