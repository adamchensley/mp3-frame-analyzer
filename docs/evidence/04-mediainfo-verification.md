# mediainfo cross-verification

> Generated 2026-08-14T19:35:53.396Z · Node v25.2.1 · darwin arm64 · regenerate with `npm run evidence` `-- --xl`

The assignment suggests verifying results with mediainfo. This document records that verification for the provided sample and explains the expected off-by-one between the two tools.
## mediainfo (full parse)

```text
$ mediainfo --ParseSpeed=1 -f test/fixtures/sample.mp3   # relevant lines
Format                                   : MPEG Audio
Duration                                 : 159059
Duration                                 : 2 min 39 s
Duration                                 : 2 min 39 s 59 ms
Duration                                 : 00:02:39.059
Overall bit rate mode                    : VBR
Overall bit rate mode                    : Variable
Overall bit rate                         : 73327
Overall bit rate                         : 73.3 kb/s
Format version                           : Version 1
Format profile                           : Layer 3
Format settings                          : Joint stereo / MS Stereo
Duration                                 : 159086
Duration                                 : 2 min 39 s 86 ms
Duration                                 : 00:02:39.086
Bit rate mode                            : VBR
Bit rate mode                            : Variable
Samples count                            : 7014528
Frame count                              : 6089
```

## This service

```text
frameCount (physical, returned by /file-upload) : 6090
frames.byKind.audio                             : 6089
frames.byKind.vbrHeader                         : 1
vbrHeader.declaredFrameCount (from Xing header) : 6089
timing.totalSamples                             : 7014528
timing.durationSeconds                          : 159.06
```

## Reconciliation

mediainfo reports **6089** because it counts audio frames only — equivalently, it trusts the frame count declared inside the Xing header, which excludes the header frame itself (its samples count, 7,014,528 = 6089 × 1152, confirms this). This service counts **every physical MPEG frame in the file** per the assignment instruction, so `POST /file-upload` returns **6090** = 6089 audio frames + 1 Xing metadata frame. `POST /analyze` reports both figures. The two tools agree exactly once the metadata frame is accounted for; this is a documented decision, not an off-by-one error.
