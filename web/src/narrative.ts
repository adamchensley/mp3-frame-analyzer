/**
 * Turns an analysis report into the "story of your file" paragraphs.
 * Pure (no DOM) so it is unit-testable; `**bold**` spans are the only markup
 * and are rendered by the caller after HTML-escaping.
 */
import { formatBytes, formatCount, formatDuration } from './format';
import type { UploadAnalysis } from './types';

export function buildNarrative(report: UploadAnalysis): string[] {
  const { file, tags, vbrHeader, frames, format, timing, layout, warnings } = report;
  const paragraphs: string[] = [];

  const opening: string[] = [
    `Your file **${file.fileName}** is ${formatBytes(file.sizeBytes)} (${formatCount(file.sizeBytes)} bytes).`,
  ];
  if (tags.id3v2.present) {
    opening.push(
      `It opens with an **ID3v${tags.id3v2.version ?? '2'}** metadata tag occupying ${formatCount(
        tags.id3v2.totalSizeBytes ?? 0,
      )} bytes, so MPEG audio begins at byte ${formatCount(layout.audioStartOffset)}.`,
    );
  } else if (layout.audioStartOffset > 0) {
    opening.push(`MPEG audio begins at byte ${formatCount(layout.audioStartOffset)}.`);
  } else {
    opening.push('It begins immediately with MPEG audio — there is no ID3v2 metadata tag.');
  }
  if (tags.id3v1.present) opening.push('A legacy 128-byte ID3v1 tag closes the file.');
  paragraphs.push(opening.join(' '));

  if (vbrHeader.present) {
    const kindLabel =
      vbrHeader.kind === 'Info'
        ? 'an **Info** header (the constant-bitrate variant of the Xing header)'
        : `a **${vbrHeader.kind}** VBR header`;
    const declared =
      vbrHeader.declaredFrameCount !== null
        ? ` It declares **${formatCount(vbrHeader.declaredFrameCount)} audio frames**${
            vbrHeader.hasToc ? ' and carries a seek table' : ''
          }.`
        : '';
    paragraphs.push(
      `The first MPEG frame is not audio: it is ${kindLabel} — a table of contents the encoder ` +
        `wrote into a structurally valid frame.${declared}`,
    );
  } else {
    paragraphs.push('No Xing/Info/VBRI header was found — every frame in this file carries audio.');
  }

  if (frames.byKind.vbrHeader > 0) {
    paragraphs.push(
      `Counting **every physical MPEG frame** — which is what this service reports — gives ` +
        `**${formatCount(frames.physicalTotal)}**: ${formatCount(frames.byKind.audio)} audio ` +
        `frames plus ${formatCount(frames.byKind.vbrHeader)} metadata frame. Tools such as ` +
        `mediainfo report ${formatCount(frames.byKind.audio)} for files like this because they ` +
        `exclude the metadata frame.`,
    );
  } else {
    paragraphs.push(
      `The file contains **${formatCount(frames.physicalTotal)} physical MPEG frames**, all of ` +
        `them audio.`,
    );
  }

  const bitrates = Object.keys(frames.byBitRateKbps).map(Number);
  const bitrateStory =
    format.bitRateMode === 'VBR'
      ? `variable bitrate spanning ${Math.min(...bitrates)}–${Math.max(...bitrates)} kbps ` +
        `(averaging ${format.averageBitRateKbps} kbps)`
      : `a constant ${bitrates[0] ?? format.averageBitRateKbps} kbps`;
  paragraphs.push(
    `The audio is MPEG-1 Layer III at ${format.sampleRateHz / 1000} kHz, ` +
      `${format.channelMode.replace('-', ' ')}, ${bitrateStory}. Each frame holds ` +
      `${formatCount(timing.samplesPerFrame)} samples (≈${timing.msPerFrameAtPrimaryRate} ms), ` +
      `for a duration of ${formatDuration(timing.durationSeconds)}.`,
  );

  paragraphs.push(
    warnings.length === 0
      ? 'The stream parsed cleanly: every byte between the tags is accounted for by valid ' +
          'frames, with no resyncs and no truncation.'
      : `Parsing finished with ${warnings.length} ` +
          `${warnings.length === 1 ? 'observation' : 'observations'} — see the integrity ` +
          `section below.`,
  );

  return paragraphs;
}
