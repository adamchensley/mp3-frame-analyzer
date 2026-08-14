# MP3 Frame Analyzer

A TypeScript service that accepts an MP3 upload and returns the number of MPEG-1 Audio Layer III
frames in the file — built for the Foundation Health technical assessment, then taken a few steps
further: a rich `/analyze` endpoint, a small front-end that narrates the analysis, generated test
evidence, and a deployed, autoscaled, WAF-fronted AWS environment defined in CDK.

The MP3 frame parsing is **hand-written** (`src/parser/`) — no MP3-parsing packages are used
anywhere in the dependency tree.

- **Live demo:** https://d108sd7zgbz3ji.cloudfront.net
- **Assignment endpoint:** `POST /file-upload` → `{"frameCount": <number>}`

```bash
curl -F "file=@test/fixtures/sample.mp3" https://d108sd7zgbz3ji.cloudfront.net/file-upload
# → {"frameCount":6090}
```

![Analysis UI](docs/images/ui-overview.jpg)

## Quickstart

Requires Node 22+ (`.nvmrc`).

```bash
npm ci && npm --prefix web ci   # install API + front-end deps
npm run dev                     # API on http://localhost:3000
```

Test it (the provided sample is committed as a fixture):

```bash
curl -F "file=@test/fixtures/sample.mp3" http://localhost:3000/file-upload
# → {"frameCount":6090}
```

Everything else:

```bash
npm test                # unit + integration suite (59 tests)
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit
npm run evidence        # regenerates docs/evidence/ from real runs
npm --prefix web run dev  # front-end dev server on :5173 (proxies to :3000)
docker build -t mp3-frame-analyzer . && docker run -p 3000:3000 mp3-frame-analyzer
```

## A note on frame counting (the Xing/VBR header)

This service counts **every physical MPEG frame in the file**, per the assignment's instruction to
"count the number of frames in the file". Most MP3s produced by modern encoders — including the
provided sample — begin with a **Xing/Info VBR header**: a structurally valid MPEG-1 Layer III
frame that stores encoder metadata (frame count, byte count, seek table) instead of audio. For the
provided sample, `POST /file-upload` therefore returns `{"frameCount": 6090}` — 6,089 audio frames
**plus** the 1 metadata frame.

Tools such as `mediainfo` report **6,089** for the same file because they count only audio frames
(equivalently, they trust the Xing header's declared count, which excludes itself — mediainfo's
samples count, 7,014,528 = 6,089 × 1,152, confirms this). The `POST /analyze` endpoint reports
both figures and reconciles them explicitly. This is a deliberate, documented decision, not an
off-by-one: see [docs/evidence/04-mediainfo-verification.md](docs/evidence/04-mediainfo-verification.md)
for the recorded cross-check.

## API

### `POST /file-upload` — the assignment contract

`multipart/form-data` with one file part (any field name). Success:

```json
{ "frameCount": 6090 }
```

### `POST /analyze` — the full report

Same request; returns file/format/tag details, the VBR header contents, frames broken down by
kind, bitrate, sample rate and channel mode, timing, layout, and integrity warnings. This is what
the front-end renders.

### Errors

All errors share one envelope: `{ "error": { "code": "...", "message": "..." } }`.

| Status | Code                 | When                                                 |
| ------ | -------------------- | ---------------------------------------------------- |
| 400    | `NO_FILE`            | No file part / body is not multipart                 |
| 400    | `MULTIPLE_FILES`     | More than one file part                              |
| 413    | `FILE_TOO_LARGE`     | Exceeds the cap (default 500 MB, `MAX_UPLOAD_BYTES`) |
| 422    | `UNSUPPORTED_FORMAT` | No MPEG-1 Layer III frames found (wrong/empty file)  |
| 404    | `NOT_FOUND`          | Unknown route or method                              |
| 500    | `INTERNAL`           | Unexpected failure (details only in server logs)     |

`GET /healthz` serves load-balancer health checks; `GET /` serves the front-end.

## How it works

The parser (`src/parser/mp3-frame-counter.ts`) is a streaming state machine with **O(1) memory**:
the multipart stream is piped straight into it — no temp files, no whole-file buffering.

1. Skip the ID3v2 tag if present (sync-safe size, footer flag honoured).
2. Find a frame header: 11-bit sync, MPEG-1 + Layer III required; free/invalid bitrate and
   reserved sample-rate indexes rejected.
3. Compute the frame length — `⌊144 × bitrate / sampleRate⌋ + padding` — and jump exactly that
   far. Frame bodies are never scanned, so false sync bytes inside audio can't miscount.
4. On garbage, resync byte-by-byte (counted and reported); classify a trailing 128-byte `TAG`
   block as ID3v1; count a truncated final frame if its header was complete (reported as a
   warning).
5. The first frame's opening bytes are inspected for a Xing/Info/VBRI header so the metadata
   frame can be classified separately and its declared count reconciled.

Evidence that this streams: a **1 GB** synthetic file parses in ~290 ms at ~3.5 GB/s with peak RSS
~20 MB above baseline — see
[docs/evidence/03-large-file-performance.md](docs/evidence/03-large-file-performance.md).

## Testing & evidence

- `npm test` — 59 tests: table-driven header decoding (every bitrate/sample-rate index), parser
  shapes (ID3 variants, junk, truncation, Xing/Info, MPEG-2 rejection), chunk-boundary
  independence (the sample fed 1 byte at a time), narrative rendering, and the full HTTP error
  matrix against the real app.
- `npm run evidence` regenerates **[docs/evidence/](docs/evidence/)** — four human-readable
  documents produced from real runs: the verbose suite output, a 12-shape file matrix with live
  HTTP checks, large-file streaming performance, and the mediainfo cross-verification.
- Ground truth for the sample was established two independent ways (a throwaway reference parser
  and `mediainfo --ParseSpeed=1`) before the TypeScript parser was written.

## Deployment (AWS, us-east-1)

```
client ── HTTPS ──> CloudFront + WAF ── HTTP + origin-verify header ──> ALB ──> ECS Fargate (2–10 tasks)
                     │  managed rules,          (SG locked to CloudFront    │
                     │  per-IP rate limit        origin-facing prefix list) └─> CloudWatch logs/alarms/dashboard
GitHub Actions ── OIDC (no stored keys) ──> ECR (scan-on-push, immutable tags) + cdk deploy
```

Defined entirely in **CDK (TypeScript)** under `infra/` — five stacks: network (VPC, 2 AZs, flow
logs), repository (ECR), service (Fargate + ALB + autoscaling + alarms), edge (CloudFront + WAF),
and CI/CD (GitHub OIDC deploy role). Deploy order and details: [infra/README.md](infra/README.md).

Security posture: uploads are **never persisted** (streamed and discarded); the task role has no
AWS permissions beyond logs and reading its origin-verify secret; containers run non-root with a
read-only filesystem; images are immutable SHA-tagged and scanned; the WAF ships AWS managed rules
**with `SizeRestrictions_BODY` set to Count** (it would otherwise block any upload over 8 KB) plus
a per-IP rate limit. Because the public URL is the default CloudFront domain, the CloudFront→ALB
hop is HTTP (no ACM cert is possible for `*.elb.amazonaws.com`), mitigated by the prefix-list SG
and the origin-verify header; a custom domain + ACM would upgrade this to end-to-end TLS.

## Design decisions

- **Fastify** over Express: first-class streaming multipart, typed, schema-pinned responses (the
  `/file-upload` response schema guarantees nothing leaks into the contract).
- **422 for unsupported formats**: the request itself is well-formed; the entity isn't processable.
- **Parser is dependency-free and framework-agnostic** — `update(chunk)` / `finalize()` — so it is
  unit-tested without HTTP and reusable outside Fastify.
- **The size cap is explicit** (413 + documented env var) rather than an undocumented failure.
- **Synthetic fixtures are built, not committed**: tests construct real byte layouts via
  `test/helpers/mp3-builder.ts`, so every edge case is legible in code.

## Known limitations / with more time

- Free-format bitrate (index 0) and MPEG-2/2.5 / Layers I–II are rejected as unsupported —
  out of scope per the brief.
- Resync validates a single header; a lookahead (validate the _next_ header too) would harden
  parsing of deliberately adversarial files.
- For very large files behind slower links, an S3 presigned-upload + async job flow would beat a
  synchronous upload; it changes the API contract, so it's documented rather than built.
- CloudFront→ALB TLS via a custom domain + ACM, staging environment, and canary deploys.

## Repository tour

```
src/            API (Fastify) — routes, services, config, error model
src/parser/     the hand-written streaming MP3 parser (zero dependencies)
web/            front-end (Vite + vanilla TS, no runtime deps)
infra/          AWS CDK app (five stacks)
test/           unit + integration suites, fixtures, synthetic-MP3 builders
scripts/        evidence + large-fixture generators
docs/           PLAN.md, SPEC.md, screenshots, generated evidence
```
