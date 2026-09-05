# ITERATION — character forge

Delete when a generated, rigged Kaida animates in the game.

---

# Where this stands

Two independent tracks. **The rig track is unblocked and untested. The shape
track is parked.**

| Track | State |
|---|---|
| Shape — Hunyuan3D-2.1-mlx, local | Runs. One success, one failure, cause unattributed. Parked. |
| Shape — Meshy 6 Lite, hosted | Produced a usable textured mesh, free, first try. Not rigged. |
| Rig — Mixamo auto-rigger | Chosen. Import path already built. **Never run on a generated mesh.** |
| Retarget delta | Unbuilt. No longer blocked — see Investigate #2. |

---

# Rig track

## Decision: Mixamo, not Meshy's rigger

Mixamo returns `mixamorig:` naming and the same T-pose bind as
`assets/kaida-not.glb`. Consequences:

- `resolveBoneMap` already indexes both `mixamorig:Hips` and `mixamorigHips`
- `fbx2glb.py` already corrects Mixamo's FBX unit scale
- `rig-import.sh` already consumes a Mixamo FBX
- The retarget delta becomes one constant solved against a bind already on disk,
  rather than a per-rigger unknown

Meshy's own rigger produces an unknown skeleton and an unknown bind. Rejected on
that basis, not on quality — its rigger is untested here.

## Meshy 6 Lite output — measured

Source files wiped from `assets/kaida/`; the human holds a local copy. Blender
headless import reported:

```
armatures = 0                      <- NOT RIGGED
meshes    = 1   verts=40,954  tris=81,928
uv_layers = ['UVMap']              vertex_groups = 0
world dims (x,y,z) = 1.159, 0.338, 1.899    scale=1.0  loc=0,0,0
material  = 1, textures = base_color / normal / roughness / metallic @ 2048²
```

| Property | Value | Bearing |
|---|---|---|
| Single mesh, single material, one UV set | — | Correct auto-rigger input |
| ~1.90 m, scale 1.0, at origin | — | `fbx2glb.py`'s scale bake is a no-op here |
| A-pose, arms clear of torso | — | Correct auto-rigger input |
| 81,928 tris | vs `kaida-not` 12,609 | May exceed Mixamo's ceiling. Untested. |
| Fingers fused (paddle hands) | — | Socket attach unaffected; finger bones would deform nothing |

## The loop, untested end to end

| | Step |
|---|---|
| 1 | Blender: import Meshy FBX → export FBX, **Path Mode: Copy** + **Embed Textures** |
| 2 | Mixamo: Upload Character → place markers → rig |
| 3 | Mixamo: Download → **FBX Binary**, Pose: **T-pose**, no animation |
| 4 | `bash docs/phase2/rig-import.sh <file.fbx> kaida` |
| 5 | Check `assets/kaida.bones.json`, set `"reviewed": true` |
| 6 | `?play=1&dev=1&forge=kaida` |

**Step 1 is mandatory.** The Meshy FBX references its PNGs by external path.
Mixamo does not follow them; an unembedded upload returns a grey character and
`assets/kaida.glb` ships with no maps.

**Step 3 pose is mandatory.** `kaida-not` is bound in Mixamo's T-pose — the
reason `bindMode: additive` exists. "Original Pose" reintroduces the unknown
bind that choosing Mixamo was meant to eliminate.

**No Mixamo animations.** `fbx2glb.py` exports `export_animations=False`; the
game's own clips drive the skeleton.

**Do not decimate before rigging.** 81,928 tris wants reducing eventually, but
decimating first adds a variable to an untested loop, and decimating after
rigging degrades the weights. Separate pass, own re-rig.

---

# Shape track — parked

## What happened

| Run | Image | Steps / octree | Seed | Result |
|---|---|---|---|---|
| A | `ref/k-copy.png` 128² | 50 / 256 (defaults) | unset | **Full textured .glb** |
| B | `ref/kaida-painterly-raw.png` 1024² | 50 / 256 | unset | Flat SDF, no crossings, `ValueError` |

Run A's command, recovered from `~/.zsh_history`, passed neither `--steps` nor
`--octree-resolution`. Both runs therefore used identical sampling parameters.
Run A's output is no longer on disk.

Failure signature:

```
[dit] step 49/50  min=-4.399 max=+5.098
[dit] step 50/50  min=-3.234 max=+2.388     <- discontinuity at the final step
[SDF] n=274625 nan=0 min=-0.9995 max=-0.9976 |min|=0.9976 crossings=NO
Hierarchical Volume Decoding [r129]: 0 points
ValueError: need at least one array to concatenate
```

## The inputs are the same image

Measured, not assumed:

| | `k-copy.png` | `kaida-painterly-raw.png` |
|---|---|---|
| green bg mean RGB | 47 / 245 / 38 | 47 / 245 / 38 |
| subject h_frac | 0.938 | 0.939 |
| mean abs diff @128² | — | **2.06** (resampling noise) |
| after `preprocess_image` → 518² | mean −0.1502 std 0.7274 | mean −0.1564 std 0.7338 |

`k-copy.png` alpha is 255 everywhere, so the RGBA→white composite at
`pipeline_mlx.py:79-85` is a no-op. Alpha is not a variable.

## Corrected: the previous background diagnosis was wrong

A prior revision of this file claimed *"the input image needs a solid
background; a transparent one does not survive the masking step."* The failing
image has a solid background. The claim was never tested and is deleted.

## What remains unattributed

Two variables, one uncontrolled:

1. Input pixel resolution — 128² upscaled to 518 vs 1024² downscaled to 518
2. **Seed was unset in both runs.** `mx.random.normal` drew different initial
   latents. n=1 vs n=1.

**No cause can be assigned until a seed is pinned.** Resolution may be causal;
the failure may equally be a coin flip.

## generate.py

`3d-gen/Hunyuan3D-2.1-mlx/generate.py`. Gitignored via `3d-gen/`, tracked only
in the fork's own repo on branch `g/fixup-osx-arm`. Local additions:

| Flag | Purpose |
|---|---|
| `--steps` (50), `--octree-resolution` (256) | Previously added |
| `--seed` | Passes to `ShapePipeline.__call__`; prints the value each run |
| `--shape-only` | Stops after Stage 1, writes the untextured shape to `--output` |
| `install_probes()` | Monkeypatches `scheduler.step` and `_query_sdf_volume` |

`--shape-only` buys clarity, not speed: Stage 1 at 50 steps is ~17 of ~20 min.

`--precision` is parsed and unused. Drop it from commands; it implies an int8
path that does not exist.

| Probe output | Meaning |
|---|---|
| `nan=` matches `n=` | numerics failure |
| `crossings=NO` | no surface resolved; no mesh will be built |
| `crossings=yes` | field has a surface |

---

# Investigate

Ordered. #1 unblocks the project; #4 is optional.

## 1. Close the rig loop — Meshy → Mixamo → game

Run the six steps above. This answers `PLAN-forge.md`'s step-1 risk:

> *"Generated topology has no edge loops at joints; if auto-rigged weights
> collapse at the shoulder, steps 3 and 4 are not worth building."*

Load Kaida, run a clip with arm motion, inspect shoulders and hips. Report the
result as a finding either way. If weights hold, the rigging half is proven and
the shape track is optional.

Unknowns this run resolves: Mixamo's poly ceiling vs 81,928 tris; whether
embedded textures survive the round trip; whether `rig-import.sh` handles a
non-Mixamo-authored mesh.

## 2. Retarget delta — no longer blocked

`PLAN-forge.md` Piece 2.3. Clips in `poses.js` write absolute rotations against
a bind whose limbs hang along −Y. Mixamo binds in T-pose with non-identity rest
rotations. `bindMode: additive` keeps the character upright but carries the
T-pose spread into every clip.

This was blocked on not knowing the target bind. Choosing Mixamo fixes the bind
to the one in `assets/kaida-not.glb`, **already on disk**. Solvable and testable
now, with no new mesh.

Derive the per-bone correction quaternion; do not eyeball Euler offsets.

## 3. Shape pipeline — seed determinism, then the A/B

Only if the shape track is revived.

**3a. Verify the seed plumbs through.** ~90 s total.

```
--image ref/k-copy.png --steps 2 --octree-resolution 128 --seed 0 --shape-only
```

Run twice. Identical `[dit]` min/max on both = the seed works and every
subsequent run is controlled. Different = the `--seed` edit is wrong.

**3b. One variable, same seed.** ~17 min each, `--shape-only`.

| | Image | Seed | Steps | Octree |
|---|---|---|---|---|
| A | `ref/k-copy.png` 128² | 0 | 50 | 256 |
| B | `ref/kaida-painterly-raw.png` 1024² | 0 | 50 | 256 |

- B fails → resolution is causal; downscale refs before feeding them.
- B succeeds → run A's failure was nondeterministic. Run-to-run instability is
  then the real defect, and #4 becomes the first suspect.

## 4. Two divergences from upstream — both unverified

Neither is a diagnosis. Both are real differences between the MLX port and the
PyTorch reference, found by reading, not by running.

**4a. Terminal sigma.** `pipeline_mlx.py:151` feeds `np.linspace(0, 1, n)` —
ascending, matching Hunyuan3D's reversed convention. Upstream
`hy3dshape/schedulers.py:218` appends a terminal `1.0`.
`mlx_arsenal/diffusion/schedulers.py:146` appends `0.0`, the diffusers
convention.

```
steps=50   mlx deltas: +0.0204 ... +0.0204  LAST=-1.0000   sum=+0.0000
           up  deltas: +0.0204 ... +0.0204  LAST=+0.0000   sum=+1.0000
```

The step formula is identical in both (`sample + (sigma_next - sigma) * v`), so
the port's final step subtracts a full velocity from the finished latent and the
integration sums to zero.

**This does not explain runs A and B.** Both used 50 steps, both took the same
`-1.0` step, and A produced a complete mesh. It is a candidate explanation for
instability (#3b), not for the observed difference.

**4b. Missing image preprocessing.** Upstream routes the conditioning image
through `ImageProcessorV2` (`preprocessors.py:30`) — bbox recenter to 85% with a
white border, `INTER_CUBIC` to 512. `pipeline_mlx.preprocess_image` does none of
it: composite on white, `BILINEAR` to 518, no recenter. Quality risk, not a
crash.

Neither upstream nor the port runs rembg in the shape path. A green background
survives both. Green is off-distribution for a model trained on white, but it is
not a hard failure.

---

# Environment

| | |
|---|---|
| env | uv venv, Python 3.12, at `3d-gen/Hunyuan3D-2.1-mlx/.venv` |
| activate | `source 3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate` |
| clone | `3d-gen/Hunyuan3D-2.1-mlx`, branch `g/fixup-osx-arm`, gitignored |
| weights | 13 GB cached at `~/.cache/huggingface/hub/models--dgrauet--hunyuan3d-2.1-mlx`. Both stages resident; nothing re-downloads. |
| versions | `venv-lock.txt` |
| Blender | 5.1.1. `import_scene.fbx` and `import_scene.gltf` both confirmed working. |

`requirements.txt` is not installed. Its pins predate cp312/arm64 wheels, so
they fall back to source builds and fail. The env is unpinned latest.

Three installs build it, and `setup-3dgen.sh` runs them:

1. `mlx mlx-arsenal safetensors Pillow trimesh scikit-image PyMCubes scipy huggingface_hub xatlas opencv-python`
2. `torch torchvision diffusers accelerate transformers einops pyyaml tqdm pymeshlab`
3. `omegaconf`

`hy3dshape/__init__.py` imports `pipelines.py`, `postprocessors.py` and
`preprocessors.py`, all upstream PyTorch, so any MLX import from that package
requires the whole torch stack.

## setup-3dgen.sh is UNVERIFIED

It has never built an environment from nothing. Verify before relying on it:

```bash
mv docs/phase2/3d-gen/Hunyuan3D-2.1-mlx/.venv{,.bak}
bash docs/phase2/setup-3dgen.sh
source docs/phase2/3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate
npm run forge:smoke-demo
```

Reaching Stage 1 complete means it reproduces. `.venv.bak` is the fallback.

---

# Running

```bash
source docs/phase2/3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate

npm run forge:smoke-demo   # the port's demo image, 8 steps, octree 128
npm run forge:kaida        # 50 steps, octree 256, both stages
```

`forge.sh` passes every argument through to `generate.py` and resolves
`--image` and `--output` relative to `docs/phase2/`. Add npm scripts by adding
argument lists.

Directly:

```bash
cd docs/phase2/3d-gen/Hunyuan3D-2.1-mlx
python generate.py --image <abs> --output <abs> --steps 8 --octree-resolution 128 --seed 0 --shape-only
```

`npm run forge:kaida` still points at `ref/kaida-painterly-raw.png` and passes
no seed. It reproduces run B, the failing case.

---

# Rig import

```bash
bash docs/phase2/rig-import.sh <file.fbx> [name]
npm run forge:view -- <path.glb>      # open in Blender
```

Blender headless FBX → GLB, registers the name in the manifest, installs to
`assets/`. Name defaults to `kaida`. Animation is dropped.

Bare `npm run forge:view` fails — it defaults to `out/kaida.glb` and `out/` is
empty.

Then check `assets/<name>.bones.json` and set `"reviewed": true`. A re-import
keeps a reviewed map when every mapped bone still exists.

`?forge=kaida` loads an asset installed as `kaida`. `?forge=kaida:<name>` drives
the character `kaida` from a differently named asset — how the stand-in runs.

## Two things this had to solve

**Sanitised bone names.** `GLTFLoader` turns spaces into underscores and drops
`. : / [ ]`, so a rig authored as `mixamorig:Hips` arrives as `mixamorigHips`.
`bones.json` is written from the raw glTF JSON where the colon survives, so
every Mixamo rig mapped 0/19 and fell back to code-built. `resolveBoneMap`
indexes both spellings.

**Unit mismatch.** Mixamo FBX carries a unit scale Blender applies to object
transforms but not to bone translations — mesh in metres, skeleton in
centimetres. `fbx2glb.py` bakes object scale into the data. Without it the
loader measures a 4 mm character and scales it ×437.

The Meshy FBX has neither problem: scale 1.0, no armature to mismatch.

---

# The stand-in

A rigged Mixamo character animates in the game via
`?play=1&dev=2&forge=kaida:kaida-not`. Installed as `kaida-not` so the `kaida`
slot stays free.

```
12609 tri, source 2.189 m → 1.72 m (×0.7856), sole 0.127 m,
thigh 0.366 shin 0.397, frameScale 1.0000
```

`shots/` holds both outcomes.

| | |
|---|---|
| `absolute-inverted-*.png` | `bindMode: absolute` — upside down, limbs splayed |
| `additive-*.png` | `bindMode: additive` — upright, running, sword tracking |

## What it proved

- The name mapper handles a real rig: 19/19 from Mixamo's naming, no edits
- Scale normalisation, ground contact and the clip system drive a foreign skeleton
- Hot-swap on `assets/` works

Choosing Mixamo for Kaida promotes this from stand-in to rehearsal: same
skeleton, same bind, same `bindMode`.

---

# TODO

- npm script with parameters for `rig-import.sh`, covering both `kaida` and
  `kaida-not`, so two entries prove the parameterisation rather than hardcoding
  one.
- Move raw source downloads out of `assets/`. That directory is installed game
  assets and is what the `vite.config.js` watcher scans for `*.glb`.
  `docs/phase2/fbx/` already holds `kaida-not.fbx`.
- `setup-3dgen.sh` unverified. `mlx-forge`, needed for INT8 conversion, is
  unrecorded. Weights are fetched by `from_pretrained`, not by setup.

---

# Untuned

| Knob | Now | Note |
|---|---|---|
| `guidance_scale` | 7.5 | `pipeline_mlx.ShapePipeline.__call__` defaults to 5.0 |
| `seed` | exposed, unset by default | `--seed` added; no run has used it yet |
| `--precision` | parsed, unused | int8 needs an offline `mlx-forge` conversion; fp16 peaks ~10 GB |
| `mc_level` | 0.0 | iso threshold the near-surface mask compares against |
| input background | untested | the solid-background claim was wrong; nothing is known |

---

# Traps

- **`requirements.txt` has no `mlx`.** Neither does upstream's. CI installs `mlx mlx-arsenal numpy Pillow pytest opencv-python-headless` separately.
- **Pinned versions fail on cp312/arm64**; unpinned resolve. Not a uv-versus-pip difference.
- **xatlas is `xatlas-python` on conda-forge**, `xatlas` on PyPI.
- **`open3d` is imported nowhere** in the repo.
- **`generate.py` needs the repo as the working directory** — its `sys.path` inserts are relative.
- **Blender `File > Open` only opens `.blend`.** FBX and GLB come in through `File > Import`.

---

# Supply chain

| | Origin | Risk |
|---|---|---|
| weights | HF `dgrauet/hunyuan3d-2.1-mlx`, `.safetensors` | Low — safetensors cannot execute on load |
| model + upstream code | Tencent | Large company, widely used |
| MLX port | `dgrauet` fork, single maintainer, 95 commits ahead | The trust step taken |
| `pip install` | requirements.txt carries two Chinese PyPI mirrors as `--extra-index-url` | `setup.py` runs arbitrary code. Already executed. |
| Meshy 6 Lite | hosted, free tier | Output is a downloaded file; no runtime dependency |
| Mixamo | hosted, Adobe login | No SLA. Keep downloaded FBX on disk; do not re-rig on demand. |
