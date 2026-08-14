# Unit & integration test evidence

> Generated 2026-08-14T19:09:36.869Z · Node v25.2.1 · darwin arm64 · regenerate with `npm run evidence` `-- --xl`

Full verbose output of the automated suite (`vitest run --reporter=verbose`). Suites map to the spec: `U-HDR` frame-header decoding, `U-PRS` streaming parser shapes and edge cases, `U-NAR` front-end narrative, `I-API` HTTP contract and error matrix (docs/SPEC.md §6.2).
```text
RUN  v3.2.7 /Users/adamhensley/mp3Analyzer

 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 32 kbps @ 44.1 kHz to 104 bytes 1ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 40 kbps @ 44.1 kHz to 130 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 48 kbps @ 44.1 kHz to 156 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 56 kbps @ 44.1 kHz to 182 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 64 kbps @ 44.1 kHz to 208 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 80 kbps @ 44.1 kHz to 261 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 96 kbps @ 44.1 kHz to 313 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 112 kbps @ 44.1 kHz to 365 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 128 kbps @ 44.1 kHz to 417 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 160 kbps @ 44.1 kHz to 522 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 192 kbps @ 44.1 kHz to 626 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 224 kbps @ 44.1 kHz to 731 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 256 kbps @ 44.1 kHz to 835 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > decodes 320 kbps @ 44.1 kHz to 1044 bytes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > padding adds one byte (64 kbps @ 44100 Hz) 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > padding adds one byte (128 kbps @ 48000 Hz) 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > padding adds one byte (320 kbps @ 32000 Hz) 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > extracts CRC protection and channel mode 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects candidates without a full 11-bit frame sync 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects MPEG-2.5 headers 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects reserved version headers 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects MPEG-2 headers 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects reserved layer headers 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects Layer II headers 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects Layer I headers 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects free-format (0) and invalid (15) bitrate indexes 0ms
 ✓ test/unit/frame-header.test.ts > tryParseFrameHeader (U-HDR) > rejects the reserved sample-rate index 0ms
 ✓ web/src/narrative.test.ts > buildNarrative (U-NAR) > tells the sample story with the 6,090 = 6,089 + 1 reconciliation 10ms
 ✓ web/src/narrative.test.ts > buildNarrative (U-NAR) > adapts when there is no VBR header and warnings exist 0ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 01: /file-upload returns exactly {"frameCount":6090} for the sample 19ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 01b: accepts any multipart field name, per the unversioned assignment contract 2ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 02: multipart body without a file part is NO_FILE 1ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 02b: a non-multipart request is NO_FILE 1ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 03: a PNG upload is 422 UNSUPPORTED_FORMAT with a useful message 1ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 03b: an empty file upload is 422 with an "empty" message 1ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 04: an upload over the configured cap is 413 FILE_TOO_LARGE 42ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 05: unknown routes and wrong methods get the JSON error envelope 1ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 06: /analyze returns the full report for the sample 3ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 07: /healthz responds ok 0ms
 ✓ test/integration/api.test.ts > API integration (I-API) > 08: two file parts is 400 MULTIPLE_FILES 1ms
 ✓ test/integration/api.test.ts > API integration (I-API) > origin verification: rejects requests without the secret when configured 2ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 01: counts a simple run of audio frames 1ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 03: skips a leading ID3v2 tag and reports it 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 04: honours the ID3v2 footer flag (10 extra bytes) 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 05: resyncs over junk before the first frame 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 06: counts a truncated final frame and warns 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 07: rejects empty input 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 08: rejects non-MP3 bytes (PNG) 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 09: classifies a 128-byte TAG trailer as ID3v1, not trailing junk 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 10: detects a Xing header frame and classifies it separately 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 10b: detects an Info header (CBR) the same way 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 11: resyncs over junk between frames 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 12: a file with only MPEG-2-style blocks is unsupported 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 13: builds a bitrate histogram and detects VBR 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > 14: reports unrecognised trailing bytes 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > counts padded and CRC-protected frames 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter (U-PRS) > guards against use after finalize() 0ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter against the provided sample (ground truth) > whole-buffer parse matches ground truth (6090 physical frames) 3ms
 ✓ test/unit/mp3-frame-counter.test.ts > Mp3FrameCounter against the provided sample (ground truth) > 02: is chunk-boundary independent (1-byte and odd-sized chunks) 260ms

 Test Files  4 passed (4)
      Tests  59 passed (59)
   Start at  15:09:36
   Duration  446ms (transform 86ms, setup 0ms, collect 172ms, tests 397ms, environment 0ms, prepare 122ms)
```
