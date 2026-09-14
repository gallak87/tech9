# Rune run experiment

Rejected one-shot generation. The six-frame rows repeatedly use the same leading leg, so this is not an alternating run cycle. This candidate is preserved for comparison only and is not wired into gameplay.

- `candidate.png`: untouched built-in imagegen output, 1536 × 1024; 6 columns × 3 rows (right, back/up, front/down).
- `prompt.txt`: exact generation prompt. Reference: approved `assets/rune-idle.png`.
- `generation.json`: provenance, measured background and approximate crop bounds.

The checkerboard is painted into the PNG: every alpha value is 255. The first sprite extends 11 pixels beyond the nominal first column boundary. Actual row separation is clean. The original file remains under the generated-images directory recorded in the provenance.

No retry, runtime mirroring, art editing, game wiring, or browser playtesting was performed.
