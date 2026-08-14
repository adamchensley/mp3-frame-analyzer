/**
 * Response shapes returned by the API. Kept in sync by hand with
 * src/parser/types.ts + src/services/analysis.service.ts on the server —
 * the server is the single source of truth.
 */
export type ChannelMode = 'stereo' | 'joint-stereo' | 'dual-channel' | 'mono';

export interface AnalysisWarning {
  code:
    | 'RESYNC'
    | 'TRUNCATED_FINAL_FRAME'
    | 'TRAILING_BYTES'
    | 'MIXED_SAMPLE_RATES'
    | 'MIXED_CHANNEL_MODES';
  message: string;
  bytesSkipped?: number;
}

export interface UploadAnalysis {
  frameCount: number;
  file: { fileName: string; sizeBytes: number };
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
  vbrHeader: {
    present: boolean;
    kind: 'Xing' | 'Info' | 'VBRI' | null;
    declaredFrameCount: number | null;
    declaredByteCount: number | null;
    hasToc: boolean;
    qualityIndicator: number | null;
  };
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
    totalSamples: number;
    durationSeconds: number;
    msPerFrameAtPrimaryRate: number;
  };
  layout: { audioStartOffset: number; bytesParsed: number; trailingBytes: number };
  warnings: AnalysisWarning[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
