# Large-file streaming performance

> Generated 2026-08-14T19:09:37.676Z · Node v25.2.1 · darwin arm64 · regenerate with `npm run evidence` `-- --xl`

The parser processes uploads as a stream with O(1) memory: files are read in 64 KB chunks from disk (the same chunked path a multipart upload takes) and the resident set size is sampled throughout. Synthetic CBR fixtures have exact expected frame counts by construction; they are generated on demand into `test/fixtures/generated/` (git-ignored) by `scripts/generate-large-fixture.ts`.
| File | Size | Frames (expected) | Frames (counted) | Parse time | Throughput | RSS before | RSS peak | Result |
|------|------|-------------------|------------------|------------|------------|-----------|----------|--------|
| Provided sample (VBR) | 1.4 MB | 6,090 | 6,090 | 2 ms | 712 MB/s | 159 MB | 159 MB | ✅ pass |
| Synthetic CBR 10 MB (320 kbps) | 10.0 MB | 10,044 | 10,044 | 6 ms | 1574 MB/s | 163 MB | 166 MB | ✅ pass |
| Synthetic CBR 100 MB (320 kbps) | 100.0 MB | 100,439 | 100,439 | 33 ms | 3069 MB/s | 166 MB | 176 MB | ✅ pass |
| Synthetic CBR 1 GB (320 kbps) | 1.00 GB | 1,028,489 | 1,028,489 | 288 ms | 3558 MB/s | 176 MB | 180 MB | ✅ pass |

_RSS peak staying flat as file size grows by orders of magnitude is the O(1)-memory evidence: the process never holds more than the current chunk plus fixed-size counters._
