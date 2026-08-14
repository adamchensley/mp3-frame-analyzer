# File matrix — sizes and shapes

> Generated 2026-08-14T19:35:52.526Z · Node v25.2.1 · darwin arm64 · regenerate with `npm run evidence` `-- --xl`

Files of different sizes and shapes run through the streaming parser, each with a ground-truth expectation known by construction (synthetic files) or verified independently with mediainfo (the provided sample). Warnings are the parser’s integrity observations, surfaced to clients via `POST /analyze`.
| # | Shape | Size | Expected | Actual | Warnings | Parse | Result |
|---|-------|------|----------|--------|----------|-------|--------|
| 1 | Provided sample — VBR, ID3v2.4 tag, Xing header | 1.4 MB | 6090 frames | 6090 frames | — | 4.0 ms | ✅ pass |
| 2 | Synthetic CBR — 100 × 128 kbps frames, no tags | 40.7 KB | 100 frames | 100 frames | — | 0.1 ms | ✅ pass |
| 3 | Synthetic VBR — Xing header + 200 mixed-bitrate frames | 112.3 KB | 201 frames | 201 frames | — | 0.1 ms | ✅ pass |
| 4 | ID3v2 tag with footer flag + 50 frames | 20.7 KB | 50 frames | 50 frames | — | 0.1 ms | ✅ pass |
| 5 | Junk-prefixed — 100 junk bytes before 40 frames | 16.4 KB | 40 frames | 40 frames | RESYNC | 0.1 ms | ✅ pass |
| 6 | Mid-stream corruption — 30 frames, 37 junk bytes, 30 frames | 24.5 KB | 60 frames | 60 frames | RESYNC | 0.0 ms | ✅ pass |
| 7 | Truncated final frame — 10 full + half a frame | 4.3 KB | 11 frames | 11 frames | TRUNCATED_FINAL_FRAME | 0.0 ms | ✅ pass |
| 8 | ID3v1 trailer — 25 frames + 128-byte TAG block | 10.3 KB | 25 frames | 25 frames | — | 0.1 ms | ✅ pass |
| 9 | Padding + CRC mix — 20 padded / 20 CRC-protected frames | 16.3 KB | 40 frames | 40 frames | — | 0.0 ms | ✅ pass |
| 10 | Empty file (0 bytes) | 0 B | UNSUPPORTED_FORMAT | UNSUPPORTED_FORMAT | — | 0.0 ms | ✅ pass |
| 11 | PNG bytes masquerading as .mp3 | 2.0 KB | UNSUPPORTED_FORMAT | UNSUPPORTED_FORMAT | — | 0.2 ms | ✅ pass |
| 12 | MPEG-2-style headers only (out of scope by spec) | 900 B | UNSUPPORTED_FORMAT | UNSUPPORTED_FORMAT | — | 0.1 ms | ✅ pass |

**12/12 shapes behave as specified.**

_Shapes constructed by `test/helpers/mp3-builder.ts`; the matrix parse uses 64 KB chunks. Chunk-boundary independence down to 1-byte chunks is covered by test `U-PRS 02` in the automated suite (evidence doc 01)._

## Live HTTP checks

The same shapes exercised end-to-end through the real Fastify app (via light-my-request injection — identical code path to a live socket):

| Request | Expected | Actual | Body (truncated) | Result |
|---------|----------|--------|------------------|--------|
| POST /file-upload with sample.mp3 | 200 | 200 | `{"frameCount":6090}` | ✅ pass |
| POST /analyze with sample.mp3 | 200 | 200 | `{"frameCount":6090,"format":{"mpegVersion":"1","layer":"III","sampleRateHz":4…` | ✅ pass |
| POST /file-upload with a PNG | 422 | 422 | `{"error":{"code":"UNSUPPORTED_FORMAT","message":"No MPEG-1 Layer III frames w…` | ✅ pass |
| POST /file-upload without a file part | 400 | 400 | `{"error":{"code":"NO_FILE","message":"Request must be multipart/form-data con…` | ✅ pass |
| POST /file-upload 2 MB junk vs 1 MB cap | 413 | 413 | `{"error":{"code":"FILE_TOO_LARGE","message":"The uploaded file exceeds the ma…` | ✅ pass |
| GET /file-upload (wrong method) | 404 | 404 | `{"error":{"code":"NOT_FOUND","message":"Route GET /file-upload was not found."}}` | ✅ pass |
| GET /healthz | 200 | 200 | `{"status":"ok"}` | ✅ pass |
