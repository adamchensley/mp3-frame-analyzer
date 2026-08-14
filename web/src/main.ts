import './styles.css';

import { formatBytes, formatCount, formatDuration } from './format';
import { buildNarrative } from './narrative';
import type { ApiErrorBody, UploadAnalysis } from './types';

const dropZone = document.getElementById('drop-zone') as HTMLLabelElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const statusLine = document.getElementById('status') as HTMLParagraphElement;
const results = document.getElementById('results') as HTMLElement;

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void analyze(file);
});

for (const type of ['dragover', 'dragenter'] as const) {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add('drag-active');
  });
}
for (const type of ['dragleave', 'drop'] as const) {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-active');
  });
}
dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void analyze(file);
});

async function analyze(file: File): Promise<void> {
  statusLine.textContent = `Analyzing ${file.name} (${formatBytes(file.size)})…`;
  results.hidden = true;
  const body = new FormData();
  body.append('file', file);
  try {
    const response = await fetch('/analyze', { method: 'POST', body });
    const payload = (await response.json()) as UploadAnalysis | ApiErrorBody;
    if (!response.ok || 'error' in payload) {
      const message =
        'error' in payload ? payload.error.message : `The server responded ${response.status}.`;
      statusLine.textContent = '';
      renderError(message);
      return;
    }
    statusLine.textContent = '';
    renderReport(payload);
  } catch {
    statusLine.textContent = '';
    renderError('The analysis request failed — check that the server is reachable and try again.');
  }
}

function renderError(message: string): void {
  results.replaceChildren(
    el('div', 'error-card', [
      el('span', 'status-icon', ['✕']),
      el('div', null, [el('strong', null, ['Analysis failed. ']), message]),
    ]),
  );
  results.hidden = false;
}

function renderReport(report: UploadAnalysis): void {
  results.replaceChildren(
    renderTiles(report),
    renderStory(report),
    renderFramesByType(report),
    renderFormatDetails(report),
    renderBitrateChart(report),
    renderIntegrity(report),
  );
  results.hidden = false;
}

function renderTiles(report: UploadAnalysis): HTMLElement {
  const tiles = el('div', 'tiles', [
    tile(formatCount(report.frameCount), 'physical frames', true),
    tile(formatDuration(report.timing.durationSeconds), 'duration'),
    tile(`${report.format.averageBitRateKbps} kbps`, `${report.format.bitRateMode} average`),
    tile(`${report.format.sampleRateHz / 1000} kHz`, 'sample rate'),
    tile(report.format.channelMode.replace('-', ' '), 'channel mode'),
    tile(formatBytes(report.file.sizeBytes), 'file size'),
  ]);
  return section('At a glance', [tiles]);
}

function tile(value: string, label: string, primary = false): HTMLElement {
  return el('div', primary ? 'tile tile-primary' : 'tile', [
    el('span', 'tile-value', [value]),
    el('span', 'tile-label', [label]),
  ]);
}

function renderStory(report: UploadAnalysis): HTMLElement {
  const paragraphs = buildNarrative(report).map((text) => {
    const p = el('p', null, []);
    p.innerHTML = renderBold(text);
    return p;
  });
  return section('The story of your file', paragraphs);
}

function renderFramesByType(report: UploadAnalysis): HTMLElement {
  const { audio, vbrHeader } = report.frames.byKind;
  const rows = [
    kindRow('Audio frames', audio, report.frameCount),
    kindRow('VBR/metadata header frames', vbrHeader, report.frameCount),
  ];
  const children: HTMLElement[] = [el('div', 'kind-rows', rows)];
  if (vbrHeader > 0) {
    const equation = el('p', 'equation', []);
    equation.innerHTML = renderBold(
      `**${formatCount(report.frameCount)} physical** = ${formatCount(audio)} audio + ` +
        `${formatCount(vbrHeader)} metadata (${report.vbrHeader.kind ?? 'VBR'} header)`,
    );
    children.push(equation);
  }
  return section('Frames by type', children);
}

function kindRow(label: string, count: number, total: number): HTMLElement {
  const share = total > 0 ? (count / total) * 100 : 0;
  return el('div', 'kind-row', [
    el('span', 'kind-label', [label]),
    el('span', 'kind-count', [formatCount(count)]),
    el('span', 'kind-share', [`${share >= 99.9 && share < 100 ? '99.9' : share.toFixed(1)}%`]),
  ]);
}

function renderFormatDetails(report: UploadAnalysis): HTMLElement {
  const entries: Array<[string, string]> = [
    ['MPEG version / layer', `MPEG-${report.format.mpegVersion} Layer ${report.format.layer}`],
    ['Bit rate mode', report.format.bitRateMode],
    ['Samples per frame', formatCount(report.timing.samplesPerFrame)],
    ['Total audio samples', formatCount(report.timing.totalSamples)],
    ['Time per frame', `≈${report.timing.msPerFrameAtPrimaryRate} ms`],
    ['Padded frames', formatCount(report.frames.padded)],
    ['CRC-protected frames', formatCount(report.frames.withCrc)],
    ['Audio starts at byte', formatCount(report.layout.audioStartOffset)],
    [
      'ID3v2 tag',
      report.tags.id3v2.present
        ? `v${report.tags.id3v2.version} (${formatCount(report.tags.id3v2.totalSizeBytes ?? 0)} bytes)`
        : 'none',
    ],
    ['ID3v1 tag', report.tags.id3v1.present ? 'present (128 bytes)' : 'none'],
  ];
  if (report.vbrHeader.present) {
    entries.push([
      `${report.vbrHeader.kind} header`,
      [
        report.vbrHeader.declaredFrameCount !== null
          ? `declares ${formatCount(report.vbrHeader.declaredFrameCount)} frames`
          : 'no frame count field',
        report.vbrHeader.declaredByteCount !== null
          ? `${formatCount(report.vbrHeader.declaredByteCount)} bytes`
          : null,
        report.vbrHeader.hasToc ? 'seek table' : null,
      ]
        .filter(Boolean)
        .join(', '),
    ]);
  }
  const dl = el('dl', 'details-grid', []);
  for (const [term, value] of entries) {
    dl.append(el('dt', null, [term]), el('dd', null, [value]));
  }
  return section('Format details', [dl]);
}

function renderBitrateChart(report: UploadAnalysis): HTMLElement {
  const data = Object.entries(report.frames.byBitRateKbps)
    .map(([kbps, frames]) => ({ kbps: Number(kbps), frames }))
    .sort((a, b) => a.kbps - b.kbps);
  const max = Math.max(...data.map((d) => d.frames));
  const total = data.reduce((sum, d) => sum + d.frames, 0);

  const table = el('table', 'bitrate-table', [
    el('caption', 'visually-hidden', ['Frames per bitrate']),
    el('thead', null, [
      el('tr', null, [
        el('th', null, ['Bitrate']),
        el('th', 'bar-col', ['Distribution']),
        el('th', 'num', ['Frames']),
        el('th', 'num', ['Share']),
      ]),
    ]),
  ]);
  const tbody = el('tbody', null, []);
  for (const d of data) {
    const bar = el('div', 'bar', []);
    bar.style.width = `${Math.max((d.frames / max) * 100, 0.75)}%`;
    const row = el('tr', null, [
      th(`${d.kbps} kbps`),
      el('td', 'bar-col', [el('div', 'bar-track', [bar])]),
      el('td', 'num', [formatCount(d.frames)]),
      el('td', 'num', [`${((d.frames / total) * 100).toFixed(1)}%`]),
    ]);
    row.title = `${d.kbps} kbps — ${formatCount(d.frames)} frames`;
    tbody.append(row);
  }
  table.append(tbody);
  return section('Bitrate distribution', [table]);
}

function renderIntegrity(report: UploadAnalysis): HTMLElement {
  if (report.warnings.length === 0) {
    return section('Integrity', [
      el('div', 'integrity-ok', [
        el('span', 'status-icon', ['✓']),
        'Clean parse — every byte between the tags is accounted for by valid frames.',
      ]),
    ]);
  }
  const items = report.warnings.map((warning) =>
    el('li', null, [el('code', null, [warning.code]), ` — ${warning.message}`]),
  );
  return section('Integrity', [
    el('div', 'integrity-warn', [
      el('span', 'status-icon', ['⚠']),
      `${report.warnings.length} observation${report.warnings.length === 1 ? '' : 's'} while parsing:`,
    ]),
    el('ul', 'warning-list', items),
  ]);
}

/* ---------- tiny DOM + text helpers ---------- */

function section(title: string, children: (HTMLElement | string)[]): HTMLElement {
  return el('section', 'card', [el('h3', null, [title]), ...children]);
}

function el(
  tag: string,
  className: string | null,
  children: (HTMLElement | string)[],
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function th(text: string): HTMLElement {
  const node = document.createElement('th');
  node.scope = 'row';
  node.textContent = text;
  return node;
}

/** Escape HTML, then translate the narrative's `**bold**` spans. */
function renderBold(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
