export type ChannelMode = 'stereo' | 'joint-stereo' | 'dual-channel' | 'mono';

export interface FrameHeader {
  bitrateKbps: number;
  sampleRateHz: number;
  padding: boolean;
  crcProtected: boolean;
  channelMode: ChannelMode;
  /** Total frame length in bytes, the 4 header bytes included. */
  frameLengthBytes: number;
}

export type WarningCode =
  | 'RESYNC'
  | 'TRUNCATED_FINAL_FRAME'
  | 'TRAILING_BYTES'
  | 'MIXED_SAMPLE_RATES'
  | 'MIXED_CHANNEL_MODES';

export interface AnalysisWarning {
  code: WarningCode;
  message: string;
  bytesSkipped?: number;
}

export type VbrHeaderKind = 'Xing' | 'Info' | 'VBRI';

export interface VbrHeaderInfo {
  present: boolean;
  kind: VbrHeaderKind | null;
  /** The count the encoder wrote — excludes the VBR header frame itself. */
  declaredFrameCount: number | null;
  declaredByteCount: number | null;
  hasToc: boolean;
  qualityIndicator: number | null;
}

export interface AnalysisReport {
  /** Every physical MPEG-1 Layer III frame in the file, VBR header frame included. */
  frameCount: number;
  format: {
    mpegVersion: '1';
    layer: 'III';
    sampleRateHz: number;
    channelMode: ChannelMode;
    bitRateMode: 'CBR' | 'VBR';
    averageBitRateKbps: number;
  };
  tags: {
    id3v2: { present: boolean; version: string | null; totalSizeBytes: number | null };
    id3v1: { present: boolean };
  };
  vbrHeader: VbrHeaderInfo;
  frames: {
    physicalTotal: number;
    byKind: { audio: number; vbrHeader: number };
    byBitRateKbps: Record<string, number>;
    bySampleRateHz: Record<string, number>;
    byChannelMode: Partial<Record<ChannelMode, number>>;
    padded: number;
    withCrc: number;
  };
  timing: {
    samplesPerFrame: number;
    /** Audio frames only — the VBR header frame carries no audio. */
    totalSamples: number;
    durationSeconds: number;
    msPerFrameAtPrimaryRate: number;
  };
  layout: {
    audioStartOffset: number;
    bytesParsed: number;
    trailingBytes: number;
  };
  warnings: AnalysisWarning[];
}

export type Mp3ParseErrorCode = 'UNSUPPORTED_FORMAT';

export class Mp3ParseError extends Error {
  constructor(
    readonly code: Mp3ParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'Mp3ParseError';
  }
}
