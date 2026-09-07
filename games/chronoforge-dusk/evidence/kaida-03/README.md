# Kaida a1 native verification

**Development-scene coverage at the source digest below.** Current walking/running behavior is verified by the [coastal locomotion summary](../environment-06/README.md#exact-content). The diagnostic foundation suite is opt-in for shared importer/fixture changes; it is not a second release gate. 04 is paused. 06 provides the current coastal exploration scene.

## Results

| Check | Result |
| --- | --- |
| Packaged native gameplay | 61 passed |
| Fresh-process saved state | 6 passed |
| Pipeline validation | 23 passed |
| Native report integrity | 4 passed |
| Test command selection | Kaida by default; foundation explicitly selected |

Raw reports and logs stay local under the [evidence policy](../README.md); prior committed reports are in Git history.

The native gameplay run exercises ordinary startup before reset, five imported clips, continuous running carry, movement, walls, slopes, full strike/contact/recovery/return, reactions, grounded actor contact, reloads, saved tuning and frame pacing. Fresh run IDs and matching runtime source digests prevent stale results; external keyboard/mouse presses invalidate the run. The reports show no external input.

The current prepared package rebuilds from the a1 master and matches the shipped model, sword and descriptor byte-for-byte. The packaged resources contain only the a1 Kaida path. Original inputs and current editable sources remain upstream.

## Build and performance

Godot 4.6.3, Forward+ / Metal, Apple M1 Pro, 1920×1080 internal rendering and a 60 FPS active cap. The app uses the official universal Mac template with a verified ad-hoc signature. Intel execution is not verified.

Runtime source SHA-256: `516f216e06edb475a5b26406f17860e0045428214c67d68a86d78c88c82cf705`.

| Interval | Samples | Mean ms | p95 ms | Max ms | Frames >33 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Idle | 599 | 16.67 | 18.15 | 19.24 | 0 |
| Traversal | 599 | 16.67 | 18.38 | 20.96 | 0 |
| Repeated strikes | 600 | 16.84 | 18.50 | 119.26 | 1 |

These are capped desktop-session frame intervals, with up to 600 samples per interval. The repeated-strike sample includes one 119 ms stall; the evidence does not establish locked 60 FPS. Capture and reload intervals are separate. GPU time is unavailable. Current scene measurements are in the [environment summary](../environment-06/README.md#native-performance).

## Captures and limits

[Neutral inspection](kaida-neutral.png), [traversal](kaida-traverse.png), [blade contact](kaida-contact.png).

Body proportions, detailed finger contact, whole-body motion and audio polish remain provisional. Defeat uses a held hurt pose and a fall that can intersect props. The harmless target is a diagnostic mannequin. [Release contents and controls](../../releases/kaida-a1.md).
