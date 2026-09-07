# WIP 01 — Recover local image-to-mesh generation

**Status:** plannable; execution deferred. **Reviewed:** 2026-09-07.

This is a bounded investigation and recovery assignment for Chronoforge Dusk's asset lane. The owner is running short of Meshy credits and is willing to tolerate roughly 20-minute local runs. This document authorizes no work by its presence; begin setup or generation only when the owner assigns execution.

## Outcome and boundaries

Recover a reproducible local **image → mesh → textured mesh** route using Hunyuan3D-2.1 MLX on the owner's Mac, or produce a precise, evidenced account of why it is not practical yet. Deliver an unrigged source candidate to Dusk's existing asset workflow. Mixamo, animation finishing, and Kaida's in-game acceptance remain separate work.

Read [Dusk's AGENTS.md](../games/chronoforge-dusk/AGENTS.md), [asset preparation](../games/chronoforge-dusk/_prep/README.md), [Kaida handoff](../games/chronoforge-dusk/_prep/KAIDA_HANDOFF.md), and [runtime contract](../games/chronoforge-dusk/_prep/ASSET_CONTRACT.md). The existing pipeline now handles finished Blender masters; this experiment supplies an upstream source, not a replacement pipeline or viewer.

The owner's request to revive the old local route is a narrow allowance to recover and adapt its generation/setup/diagnostic code and historical test images. Record their source commits. Dawn gameplay, rig canonicalization, installation stages, production meshes, and old instructions remain outside this allowance. In particular, do not inherit its 19-bone contract, animation stripping, or requirement to eliminate manual services.

Keep the current Meshy candidate available. Changing generators does not itself fix Kaida's narrow proportions. Her desired body shape and clean anime/cel-shaded appearance remain a separate visual decision; use the current Dusk reference selected by the owner for the eventual character run.

## What the spot-check established

The current [phase2-retry README](../games/chronoforge-dawn/docs/phase2-retry/README.md) records one local success and one unexplained failure. Its mesh adapter is unconfigured and does not execute Hunyuan. The useful recovery material was in the earlier, deleted `docs/phase2/` directory and remains in Git history.

Historical `ITERATION.md` records:

| Run | Input | Sampling steps | Mesh octree resolution | Seed | Recorded result |
| --- | --- | --- | --- | --- | --- |
| A | `ref/k-copy.png`, 128 × 128 | 50 | 256 | unset | Complete textured GLB; output not retained |
| B | `ref/kaida-painterly-raw.png`, 1024 × 1024 | 50 | 256 | unset | Empty surface during shape extraction |

The recorded failure was:

```text
[dit] step 49/50 min=-4.399 max=+5.098
[dit] step 50/50 min=-3.234 max=+2.388
[SDF] n=274625 nan=0 min=-0.9995 max=-0.9976 crossings=NO
Hierarchical Volume Decoding [r129]: 0 points
ValueError: need at least one array to concatenate
```

This describes a finite field with no zero-crossing surface, followed by inadequate empty-input handling. It does not establish an out-of-memory failure. **The two seeds were uncontrolled, so the larger image has not been shown to cause the failure.** Image pixel dimensions, the encoder's 518 × 518 input, mesh octree resolution, texture-view resolution, and texture-atlas size are separate settings.

The audit also found:

- The archived `k-copy.png` is present and actually 128 × 128 RGBA. Several 1024 × 1024 references survive, but the exact failing `kaida-painterly-raw.png` is absent at the recovery revision. Do not substitute another image and call it an exact reproduction.
- The historical notes report both images contained nearly identical artwork after resampling, and the small image's alpha was fully opaque. Those are historical measurements, not a newly rerun comparison.
- The old clone and virtual environment were absent at the recorded project path and the two alternate locations checked. This was not an exhaustive disk search.
- The Hugging Face snapshot is still present at `/Users/g/.cache/huggingface/hub/models--dgrauet--hunyuan3d-2.1-mlx/snapshots/5b1cf9ae1114c0b046d9385fd4f5ac6570df5287`. Its eight weight files total **13,797,866,055 bytes**. Reading the DiT and shape VAE headers showed F16 tensors; this is not evidence of an INT8 runtime.
- An earlier recoverable wrapper hardcodes seed 42 and maps precision choices to weight locations. Later notes describe a different runner inside the now-missing clone, with a seed argument and an unused precision flag. Recoverable wrapper code is therefore not the exact code used in the two recorded runs.

No generation, package installation, model loading, environment restoration, or pipeline execution occurred during this audit. Weight inspection read metadata headers only. Existing success claims have not been revalidated.

## Recovery sources

Use these exact tech9 history references with `git show`; extract selected files into the experiment directory, never restore the entire old tree over current work.

| Git source | Useful material |
| --- | --- |
| `ab882acc889cef2e8e481acf73b6a64658458672:games/chronoforge-dawn/docs/phase2/` | `ITERATION.md`, `setup-3dgen.sh`, `forge.sh`, `compare-refs.py`, `venv-lock.txt`, and `ref/k-copy.png`; this is the parent of deletion commit `63c1df9` |
| `9398106:games/chronoforge-dawn/docs/phase2/generate.py` | Earlier wrapper with progress, latent/SDF probes and shape-only support; inspect and adapt rather than run unchanged |

The old setup names upstream revision `5fe2194` of [dgrauet/Hunyuan3D-2.1-mlx](https://github.com/dgrauet/Hunyuan3D-2.1-mlx). Resolve and record its full commit before using it. The exact local `g/fixup-osx-arm` branch has not been recovered. If the historical revision cannot be obtained, select and pin an available revision explicitly and label the experiment as a new baseline. Do not silently substitute latest.

The port documents separate shape and paint entry points and a local weights-directory override. Its [shape implementation](https://github.com/dgrauet/Hunyuan3D-2.1-mlx/blob/main/hy3dshape/hy3dshape/pipeline_mlx.py) and README are useful upstream references, but mutable `main` is not the historical environment. Verify behavior in the pinned code actually executed.

## Execution sequence

### 1. Restore a small, isolated environment

Own a new `games/chronoforge-dusk/_prep/local_mesh/` directory for the tracked runner, targeted patches, setup instructions, run metadata and investigation report. Keep its dependency clone, virtual environment and bulky scratch output ignored. Preserve useful generated sources through Dusk's existing retention mechanism. Do not modify the game, asset contract, shared `pipeline.py`, accepted references or another agent's candidates as part of environment recovery.

Use a separate worktree based on the current committed Dusk handoff. Coordinate exclusive MLX/Metal generation time with the owner: worktrees isolate files, not the Mac's GPU and unified memory. Run one generation job at a time and keep it out of performance measurements for the game. Do not close the owner's applications or unload other services without their direction.

Recheck the known clone locations before rebuilding. Reuse the existing weight snapshot read-only and verify its required files/configuration. Avoid redownloading the entire model. Start from Python 3.12, the last documented environment, and use `venv-lock.txt` as evidence to verify. The historical setup installed unpinned packages and was never proven from a clean environment; do not advertise it as a reproducible installer.

Record the working Python, macOS, model commit, local patches, dependency versions, weight snapshot and actual tensor/compute precision. Verify necessary imports and loader compatibility before any long run. If an old pin is unavailable or incompatible, document the minimal replacement. Preserve existing environments and caches.

### 2. Make runs observable and restartable

Build a thin local runner around the pinned model's supported entry points, with explicit seed, input, sampling steps, guidance, octree resolution, weights and stage selection. Expose shape generation and painting an existing shape separately. Use structured subprocess arguments and a known working directory; the old shell-command-template adapter is unnecessary.

For each immutable run directory, retain the exact input/hash, processed conditioning image/tensor fingerprint, parameters, source/dependency/weight identities, log, elapsed time, available memory measurements, exit status and outputs. Record the effective scheduler timestep/sigma sequence and useful latent/SDF diagnostics. Keep the shape even if painting fails. Never delete a successful intermediate after export, as the earlier wrapper did.

Handle empty SDF queries, nonfinite fields, missing zero crossings and empty meshes with specific failure reports. Do not manufacture a surface, shift the extraction threshold until anything appears, or swallow an exception to call a run successful. A clearer error is useful, but does not repair the generation failure.

Check actual precision selection in the loader. An `int8` label, environment variable or conversion command is insufficient: quantized weights must exist and the loader must support their representation. Keep any conversion experiment separate from the FP16 baseline. If memory pressure prevents a practical run, report it or test one supported lower-memory configuration; do not turn this task into a quantization framework project.

### 3. Establish control before expensive comparisons

First run a short shape-only smoke test twice with the same input and seed, for example two sampling steps and octree resolution 128 if supported by the pinned entry point. Its purpose is to test loading, seed plumbing, diagnostics and repeatability; two steps need not produce a usable mesh.

Compare the seeded initial latent and resulting tensors or fingerprints with a documented numerical tolerance where necessary. Matching printed minima and maxima alone does not establish deterministic behavior. If repeated runs differ materially, resolve or quantify that before attributing effects to image resolution.

Then compare 128 × 128 and 1024 × 1024 variants derived from **one retained high-resolution source**, with identical artwork, aspect ratio, alpha/background treatment, crop, seed, guidance, 50 steps and octree resolution 256. Preserve the source and transformation recipe. If the exact old raw image cannot be recovered, label this as a new controlled pair. Run shape-only, sequentially.

Interpret the pair conservatively:

- Both succeed: the old failure remains unexplained; do not declare resolution harmless in every case.
- Only one succeeds: repeat the matched pair with a second seed before claiming a resolution-dependent effect.
- Both fail: investigate the common code/numerical path before trying more artwork.
- Memory failure or process termination: distinguish it from the recorded finite-field/no-surface error.

### 4. Test the recorded suspects, one at a time

Historical notes identify two unverified divergences worth checking against the pinned MLX implementation and corresponding upstream reference:

1. **Terminal scheduler sigma.** The notes report an increasing schedule followed by a terminal zero, producing a final delta of -1 instead of the upstream terminal +1 convention. Inspect the real scheduler configuration, timestep convention and update rule together. Write a small numerical regression check before changing it. This is a hypothesis for instability, not an established cause of the earlier run difference.
2. **Image preprocessing.** The notes report simple white compositing and resizing to 518 in the port, versus foreground recentering/padding in the upstream input path. Inspect the actual conditioning image and foreground coverage. Test a preprocessing change separately from any scheduler patch; do not impose Dawn's chroma-green rule on Dusk's current reference.

Use the same seed/input/settings for before/after comparisons. After a useful shape result, check at least one second seed to avoid treating a lucky output as a generally reliable fix. Keep code patches small and reproducible rather than editing an untracked dependency installation by hand.

Keep the first investigation bounded: two short smoke runs, up to six full shape runs selected from the branches above, and one texture pass once a shape is worth painting. Do not run an exhaustive matrix. If that round remains inconclusive, return the accumulated evidence and a specific proposed next experiment instead of continuing indefinitely. The old ~20-minute total is an observation, not a promise for a restored environment.

### 5. Produce and inspect one Dusk source candidate

Once the control path works, use the owner's current Kaida reference. Check her full body, limb separation and desired proportions in the input first. Preserve aspect ratio and pad deliberately; do not stretch the portrait to a square. Prefer correcting clear proportion problems before expensive rigging. Keep a locally corrected mesh as a new editable version rather than repeatedly spending inference time on an otherwise useful candidate.

Inspect the untextured shape from front, side and back before painting: actual body volume, hair, hands, arms, leg separation and recognizable costume. A technically valid mesh that remains too skinny is a visual rejection, not success on Kaida.

Run texture synthesis only on a useful shape, using a matching reference. Verify that shape-stage model memory is released before loading paint-stage models, or use separate processes. Distinguish texture-view resolution from atlas dimensions and record both. Follow the pinned paint path's mesh preparation requirements without applying an arbitrary destructive decimation budget to the hands.

Retain the unrigged shape, textured export, texture files, editable Blender inspection/correction source and receipt. Reimport the export and inspect UV/material correspondence, geometry and texture presence. A grey or partial output must be labeled as such. Local generation does not guarantee that the final material treatment matches the clean anime reference.

Feed these files into the existing `_prep/pipeline.py retain` mechanism under a distinct `kaida` batch, with local model revision, reference hash, seed, parameters and applicable provenance. Document the handoff in the experiment report. The production agent can then prepare the Blender master and perform the established Mixamo round trip. Do not register an unrigged source as a completed playable character.

## Deliverables and stop conditions

- Reproducible setup/run instructions, pinned working versions and tracked targeted patches.
- Retained run records and a brief results table separating environment failures, numerical failures, surface extraction, texturing and visual suitability.
- An explicit conclusion on the old resolution claim: supported within tested cases, not reproduced, or still inconclusive.
- One inspectable local Kaida source candidate when feasible, with an honest account of remaining proportion/material/rigging work; otherwise the exact blocker and next bounded experiment.

Commit coherent checkpoints for this experiment only, following Dusk's AGENTS.md when execution is assigned. Do not commit another agent's assets or shared edits, push, start rigging, replace accepted Kaida, or claim plan 03 complete. A negative feasibility result with preserved evidence is a valid investigation handoff, but it must not be reported as a working local production pipeline.
