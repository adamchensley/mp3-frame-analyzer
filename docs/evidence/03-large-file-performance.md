# Large-file streaming performance

> Generated 2026-08-14T19:35:53.373Z · Node v25.2.1 · darwin arm64 · regenerate with `npm run evidence` `-- --xl`

The parser processes uploads as a stream with O(1) memory: files are read in 64 KB chunks from disk (the same chunked path a multipart upload takes) and the resident set size is sampled throughout. Synthetic CBR fixtures have exact expected frame counts by construction; they are generated on demand into `test/fixtures/generated/` (git-ignored) by `scripts/generate-large-fixture.ts`.
| File | Size | Frames (expected) | Frames (counted) | Parse time | Throughput | RSS before | RSS peak | Result |
|------|------|-------------------|------------------|------------|------------|-----------|----------|--------|
| Provided sample (VBR) | 1.4 MB | 6,090 | 6,090 | 2 ms | 668 MB/s | 161 MB | 161 MB | ✅ pass |
| Synthetic CBR 10 MB (320 kbps) | 10.0 MB | 10,044 | 10,044 | 6 ms | 1553 MB/s | 165 MB | 167 MB | ✅ pass |
| Synthetic CBR 100 MB (320 kbps) | 100.0 MB | 100,439 | 100,439 | 45 ms | 2221 MB/s | 167 MB | 173 MB | ✅ pass |
| Synthetic CBR 1 GB (320 kbps) | 1.00 GB | 1,028,489 | 1,028,489 | 310 ms | 3306 MB/s | 173 MB | 174 MB | ✅ pass |

_RSS peak staying flat as file size grows by orders of magnitude is the O(1)-memory evidence: the process never holds more than the current chunk plus fixed-size counters._
