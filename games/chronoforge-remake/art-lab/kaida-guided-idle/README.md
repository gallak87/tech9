# Kaida guided idle experiment · 2026-09-13

The active preview uses **three poses generated together in one built-in imagegen call**, cycling **1 → 2 → 3 → 2**. The old endpoints and rejected separately generated middle are not used.

Open http://127.0.0.1:4179/art-lab/kaida-guided-idle/?view=loop with the remake server running. Playback defaults to 300 ms per beat (1.2 seconds per cycle), with adjustable speed and pause/play. All three frames are cropped directly from one sheet; no per-frame recentering, warping, morphing or crossfade is applied.

This page remains a standalone preview of the raw sheet. The guided sheet is preserved in assets/kaida-idle.png; Kaida's current battle idle uses the later eight-frame assets/kaida-idle-fresh.png experiment instead. The guided sheet can be restored through the selection in src/hero-idle.js, which retains its edge-connected matte masking. Attacks and overworld animations still use the original atlas. No ControlNet installation, model download, API key or additional paid service was used.

## Active files

- `candidate-three.png`: unmodified output, 1881×836 RGB PNG, three equal 627×836 cells.
- `three-prompt.txt`: exact prompt for the built-in tool.
- `three-edit-target.png`: input reference repeated into three 768×1024 cells on an opaque charcoal matte.
- `three-pose-guides.png`: rest, halfway inhale and full inhale; fixed feet/pelvis/sword anchors and shoulder rises of 0, 3 and 6 input pixels.
- `three-landmarks.json`: the guide coordinates. These are visual suggestions, not enforced constraints.
- `prepare-three.mjs`: dependency-free Node script rebuilding those three input files from the original atlas.
- `candidate.png`: the older pair, used only as a character/style reference and available separately under previous attempts.
- `reference.png`: exact original 181×181 idle cell.
- `generation.json`: source paths, hashes, dimensions and playback sequence.

The output is smaller than requested, but preserves the requested aspect ratio and equal three-column layout. The preview uses the raw cells without correcting alignment.

## Checkerboard diagnosis

Both earlier outputs are RGB PNGs (color type 2) with no `tRNS` chunk. The checkerboard is painted pixel content, not browser transparency. Asking for transparency did not produce alpha. The available built-in tool exposes no dedicated background/alpha argument; its internal model and output-mode choice are unknown.

This pass requests an **opaque charcoal background**, supplies an input target on that matte and prohibits simulated transparency. The result has a clean dark backdrop with no visible checkerboard. **This fixes the preview background, not transparent export.** The generated output was copied unchanged; no color-key extraction or background editing was applied.

Original pair inputs, prompts and outputs remain for provenance. The rejected middle-pose experiment was removed from this workspace; all three active poses were redrawn together.

## Checks

Inspected the input target, guide and generated sheet. Checked PNG headers, equal cell dimensions, inline JavaScript syntax and whitespace. No browser, playthrough, gameplay simulation or animation playtest was run. Exact landmark consistency and perceived motion quality remain for the user's preview review.
