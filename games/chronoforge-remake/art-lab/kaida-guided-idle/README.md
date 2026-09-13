# Kaida guided idle experiment · 2026-09-13

Two poses made with the built-in imagegen tool, using the existing Kaida sprite and a separate drawn pose guide. The user chose the existing tool; no ControlNet installation, model downloads, API key, or additional paid service was configured.

Open http://127.0.0.1:4179/art-lab/kaida-guided-idle/ while the existing remake server is running. The page shows the reference and both generated poses at the same cell size, with a slow A/B comparison and guide disclosure. No automatic recentering, warping, or frame registration is applied. The page is standalone and is not included in the game's static release or runtime.

## Inputs

- `reference.png`: exact first 181×181 cell of the original Kaida atlas.
- `edit-target.png`: that same sprite duplicated at integer 4× scale in two matching 768×1024 cells, on a transparent 1536×1024 canvas.
- `pose-guides.png`: separate cyan skeletons and gold fixed foot/sword anchors. The inhale asks shoulders to rise six canvas pixels and the head four pixels. Lower-body landmarks and sword anchors are identical.
- `guide-landmarks.json`: all guide coordinates, offsets and scale.
- `prepare.mjs`: dependency-free Node script that rebuilds these inputs from the original atlas. This prepares visual references, not ControlNet tensors or an editing-mask parameter.
- `prompt.txt`: exact first generation prompt.
- `cleanup-prompt.txt`: exact follow-up requesting only background extraction.

## Actual outcome

`candidate-v1.png` and its review copy `candidate.png` are the unmodified first output. It contains two comparable poses, with a visible small upper-body change, but repaints Kaida's details instead of preserving the resting drawing exactly. The overall two-cell layout is maintained; exact anatomical/foot-coordinate adherence has not been measured.

The output also contains a baked gray checkerboard and faint background artifacts. Its PNG color type is 2 (RGB), with no `tRNS` chunk, rather than genuine transparency. One targeted background-only imagegen edit produced `cleanup-attempt.png`, which also lacks transparency and further changed pixels. It is retained as evidence, not selected as a better asset. No additional imagegen retries were made.

The experiment therefore does **not** establish a production-ready sprite/animation workflow. Pose-guide images were suggestions, not enforced constraints. No game code, current idle implementation, attack animation, other characters, or saved game data were changed by this experiment.

## Checks

Inspected the source/reference, guide and both generated outputs. Checked PNG dimensions/format, inline script syntax and whitespace. No browser, game playthrough, or gameplay simulation was run. The optional two-pose flip is a user-facing comparison aid, not a finished idle loop.

Generation provenance and hashes are in `generation.json`. Source images from the tool remain in the default generated-images directory; workspace copies are included here.
