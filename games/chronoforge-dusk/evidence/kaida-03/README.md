# Kaida a1 native verification

**Release gate: Kaida gameplay and cold restart.** The diagnostic foundation suite is opt-in for shared importer/fixture changes; it is not a second release gate. 04 is paused. Environment preparation for a real game scene is the next direction after release review.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Packaged native gameplay | 61 passed | [Report](native-kaida.json), [log](native-kaida.log) |
| Fresh-process saved state | 6 passed | [Restart report](native-kaida-restart.json) |
| Pipeline validation | 23 passed | [Local checks](pipeline-tests.log) |
| Native report integrity | 4 passed | [Helper checks](native-helper-tests.log) |
| Test command selection | Kaida by default; foundation explicitly selected | [Dispatch checks](command-routing.log) |

The native gameplay run exercises ordinary startup before reset, five imported clips, continuous running carry, movement, walls, slopes, full strike/contact/recovery/return, reactions, grounded actor contact, reloads, saved tuning and frame pacing. Fresh run IDs and matching runtime source digests prevent stale results; external keyboard/mouse presses invalidate the run. The reports show no external input.

The current prepared package rebuilds from the a1 master and matches the shipped model, sword and descriptor byte-for-byte. The packaged resources contain only the a1 Kaida path. Original inputs and current editable sources remain upstream. No body, animation or equipment changes are part of release cleanup.

## Build and performance

Godot 4.6.3, Forward+ / Metal, Apple M1 Pro, 1920×1080 internal rendering and a 60 FPS active cap. The app uses the official universal Mac template with a verified ad-hoc signature. Intel execution is not verified.

Runtime source SHA-256: `516f216e06edb475a5b26406f17860e0045428214c67d68a86d78c88c82cf705`.

| Interval | Samples | Mean ms | p95 ms | Max ms | Frames >33 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Idle | 599 | 16.67 | 18.15 | 19.24 | 0 |
| Traversal | 599 | 16.67 | 18.38 | 20.96 | 0 |
| Repeated strikes | 600 | 16.84 | 18.50 | 119.26 | 1 |

These are capped desktop-session frame intervals, with up to 600 samples per interval. The repeated-strike sample includes one 119 ms stall; the evidence does not establish locked 60 FPS. Capture and reload intervals are separate. GPU time is unavailable. Environment integration will need its own representative scene measurements.

## Captures and limits

[Neutral inspection](kaida-neutral.png), [traversal](kaida-traverse.png), [blade contact](kaida-contact.png).

Body proportions, detailed finger contact, whole-body motion and audio polish remain provisional. Defeat uses a held hurt pose and a fall that can intersect props. The harmless target is a diagnostic mannequin. [Release contents and controls](../../releases/kaida-a1.md).
