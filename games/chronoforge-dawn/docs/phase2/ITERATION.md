# ITERATION — character forge

Delete when a rigged Kaida animates in the game.

Nothing here is decided. Options and their proof obligations only.

---

# What Phase 2 has to deliver

**One hands-off process: reference manifest in, character in the game out.**

Not a chain of processes a human threads together. One command per character,
runnable unattended, so it can be gauntlet-looped to convergence and then frozen.
Once the heroes are proven, the same command runs the enemies in the background
while other lanes build the rest of `GAME_PLAN.md`.

This is the phase's actual acceptance criterion and it disqualifies options that
otherwise look cheap. **A browser step is not a small cost; it is the whole cost.**
An option that cannot run unattended cannot be the destination, whatever else it
does well.

Distinguish two jobs an option can do:

| | |
|---|---|
| **Probe** | Answers a question once, then gets thrown away. A browser step is fine. |
| **Destination** | Runs unattended, per character, forever. A browser step disqualifies. |

## Already built — do not rebuild

`forge.mjs` is this pipeline. Its header states the design:

> *"The hash cache is not an optimisation. `mesh` is a ~15-minute Hunyuan pass on
> an M1 Pro and `rig` is unmeasured; without skipping, one failure in `rig` costs
> a full re-mesh on every retry."*

| Piece | State |
|---|---|
| Manifest-driven stages, `mesh → rig → install` | Built |
| `sha256(input bytes + stage config)` skip, `out/.hashes.json`, `--force` | Built |
| `--only <name>`, `--stage <stage>`, `--list` | Built |
| `install` — copies to `assets/`, writes the bone map | Built |
| Vite watch → `forge:character` hot swap | Built |
| `ref-gen.mjs` — manifest → reference images, local via Ollama | Built |
| `stages/mesh.mjs` | **Refuses.** Prints its intended command. |
| `stages/rig.mjs` | **Refuses.** Prints its intended command. |

**The hands-off goal reduces to filling in two stage modules.** Everything on
either side of them exists and works.

## The pose conflict

The reference cannot be authored in the bind silhouette.

| Wants | Why |
|---|---|
| Arms **away** from the torso, A-pose at 45° | `README.md` §Pitfalls: *"Arms flat at the sides merge with the torso and reconstruct as one mass."* |
| Arms **down** along −Y | The spec bind. `upperArm_L` offset `[0, -0.28, 0]`. |

These are incompatible in one image. Resolving it in the reference is not
possible; resolving it at import is — see `ITERATION_MAYBE.md`. That makes the
rebind a **pipeline stage**, not only a retarget fix.

---

# Current state

| | State |
|---|---|
| Reference images | Generated. `ref-gen.mjs`, output accepted. |
| Mesh — Meshy 6 Lite (hosted) | One mesh produced, measured, then wiped. Human holds a local copy. |
| Mesh — Hunyuan3D-2.1-mlx (local) | Runs. One success, one failure, cause unattributed. Output not retained. |
| Mesh — code-built | Works. The only character in the game today. |
| Rig — any auto-rigger | **Never run on a generated mesh.** |
| Engine loader | Works. Loads, scales, maps 19/19, animates — proven against a Mixamo stock rig. |
| Retarget delta | Unbuilt. Blocked on knowing the target bind. |
| Live reload | Works. Vite watch → `forge:character`. |

## On disk

| Path | What |
|---|---|
| `assets/kaida-not.glb` | Mixamo stock character, rigged, 12,609 tri. Animates in game. |
| `assets/kaida-not.bones.json` | 19/19 mapped, `reviewed: true`, `bindMode: additive` |
| `docs/phase2/fbx/kaida-not.fbx` | Its source FBX |
| `docs/phase2/ref/*.png` | Reference images. `*-raw.png` gitignored. |
| `docs/phase2/out/` | Empty |
| `docs/phase2/meshy_output/kaida/` | The Meshy export: `kaida.fbx` + four 2048² maps. Tracked. |

A generated mesh exists, unrigged. No *rigged* generated mesh exists.

---

# Mesh options

## M1 — Meshy 6 Lite, hosted

| | |
|---|---|
| Proven | Produced a textured Kaida from `kaida-plain` in minutes, free tier, first try. Kept at `docs/phase2/meshy_output/kaida/`. |
| Measured | 1 mesh, 40,954 verts / 81,928 tris, one UV set, one material, base_color + normal + roughness + metallic @ 2048², ~1.90 m, scale 1.0 at origin, A-pose, arms clear of torso. **No armature, no vertex groups.** |
| Unproven | Whether the mesh survives rigging. Whether the free tier's licence permits use in a shipped game — the UI advertises "commercial-safe exports" as a paid upgrade. |
| Must prove | Rigs successfully, deforms acceptably. See R-gate. |
| Cost | Browser step per character. Hosted dependency, no SLA. |

Fingers are fused. Socket attachment at `hand_R` is unaffected; finger bones
would deform nothing.

## M2 — Hunyuan3D-2.1-mlx, local

| | |
|---|---|
| Proven | Both stages run. One complete textured `.glb` produced. |
| Unproven | Reproducibility. Why the second run failed. |
| Must prove | Seed determinism, then a controlled A/B. See Q3. |
| Cost | ~20 min per run on this machine. No external dependency, no licence question. |

### The two runs

| Run | Image | Steps / octree | Seed | Result |
|---|---|---|---|---|
| A | `ref/k-copy.png` 128² | 50 / 256 | unset | Full textured `.glb` |
| B | `ref/kaida-painterly-raw.png` 1024² | 50 / 256 | unset | Flat SDF, no crossings, `ValueError` |

Run A's command, recovered from shell history, passed neither `--steps` nor
`--octree-resolution`, so both runs used the defaults and are parameter-identical.

```
[dit] step 49/50  min=-4.399 max=+5.098
[dit] step 50/50  min=-3.234 max=+2.388     <- discontinuity at the final step
[SDF] n=274625 nan=0 min=-0.9995 max=-0.9976 |min|=0.9976 crossings=NO
Hierarchical Volume Decoding [r129]: 0 points
ValueError: need at least one array to concatenate
```

### The two inputs are the same image

`compare-refs.py` reproduces this:

| | `k-copy.png` | `kaida-painterly-raw.png` |
|---|---|---|
| green bg mean RGB | 47 / 245 / 38 | 47 / 245 / 38 |
| subject h_frac | 0.938 | 0.939 |
| mean abs diff @128² | — | **2.06** (resampling noise) |
| after `preprocess_image` → 518² | mean −0.1502 std 0.7274 | mean −0.1564 std 0.7338 |

`k-copy.png` alpha is 255 everywhere, so the RGBA→white composite at
`pipeline_mlx.py:79-85` is a no-op. **Alpha is not a variable.**

### Retracted

A prior revision of this file claimed *"the input image needs a solid
background; a transparent one does not survive the masking step."* The failing
image has a solid background. Never tested. Deleted. Two related claims in
`README.md` §Pitfalls were retracted in the same pass.

### What is unattributed

Two variables, one uncontrolled:

1. Input pixel resolution — 128² upscaled to 518 vs 1024² downscaled to 518
2. **Seed unset in both runs.** Different initial latents. n=1 vs n=1.

No cause can be assigned until a seed is pinned. Resolution may be causal; the
failure may equally be a coin flip.

## M3 — code-built, status quo

| | |
|---|---|
| Proven | Ships today. `src/actors/rig.js`, the only character that exists. |
| Must prove | Nothing. |
| Cost | The reason this track exists: rigid skinning cannot close joint gaps, and hand-authored cross-section tables do not scale to four characters. `README.md` §Phase 2.0.2. |

Live fallback if every rig option fails. The loader keeps the code-built path
intact by design.

---

# Rig options

## R-gate — the one test all of R1–R3 share

**Deformation, not load success.** Rig, pose to `victory`, inspect the shoulder
and hip. Generated topology has no edge loops at joints.

`README.md` §Stage 2 states the property that makes this cheap:

> *"If the shoulders deform badly there they will deform badly however it is
> rigged."*

If that holds, **one round trip through the cheapest rigger answers the
viability of the whole auto-rig family.** A failure at R-gate is a property of
the mesh, not of the rigger, and sends the work to M3 rather than to R2 or R3.

`PLAN-forge.md` build order says the same:

> *"Generated topology has no edge loops at joints; if auto-rigged weights
> collapse at the shoulder, steps 3 and 4 are not worth building."*

## R1 — Mixamo auto-rigger — **probe only, cannot be the destination**

| | |
|---|---|
| Proven | Produces `mixamorig:` rigs this codebase already ingests — `assets/kaida-not.glb` is one, and it animates. `rig-import.sh` + `fbx2glb.py` were built for its output. |
| Unproven on a generated mesh | Everything. Never run on one. |
| Must prove | Accepts 81,928 tris. Embedded textures survive the round trip. R-gate. |
| Cost | **Browser step per character. No public API.** |
| **Verdict** | **Disqualified as the destination.** No unattended path exists, so it cannot satisfy the acceptance criterion for any character, ever. Viable only as a throwaway R-gate probe. |

Known property, not an argument for choosing it: a T-pose download lands on the
same bind as `kaida-not`, so the retarget delta becomes one constant rather than
a per-rigger unknown.

Two mandatory details if run:

- **Export from Blender with Path Mode: Copy + Embed Textures.** The Meshy FBX
  references its PNGs by external path; Mixamo does not follow them. An
  unembedded upload returns a grey character.
- **Download Pose: T-pose, no animation.** `fbx2glb.py` drops animation anyway;
  the game's clips drive the skeleton. "Original Pose" reintroduces an unknown bind.

## R2 — Meshy's own rigger

| | |
|---|---|
| Proven | Nothing here. Not run. |
| Unproven | Bone naming, bind pose, whether rigging is on the free tier, what the REST API covers and costs. |
| Must prove | Everything R1 must, plus that its skeleton maps onto the 19-bone contract, plus an unattended API path. |
| Cost | Unknown. A paid dependency and an unresolved licence question if it becomes the destination. |
| **Verdict** | Possible destination **only** via its API. Unverified on every axis. Fallback if UniRig is not released. |

`bones.json` is data, so an unknown naming scheme is absorbable. An unknown bind
is not — it puts the retarget delta back to an unknown.

## R3 — UniRig, local — **the only candidate destination**

| | |
|---|---|
| Proven | Nothing here. Not installed. |
| Unproven | Whether the released components suffice. `stages/rig.mjs` already warns: *"components ship progressively and the skinning half may not be out."* |
| Must prove | Installs and runs, emits named humanoid bones, then R-gate. |
| Cost | A local setup session. No account, no browser, no rate limit. |
| **Verdict** | **The only rig option that can run unattended without a paid API.** Load-bearing for the phase goal. |

`stages/rig.mjs` already carries the intended invocation and the setup commands.
Filling it in is the work, not designing it.

**Verifying whether UniRig installs and runs is the highest-information cheap
action available** — no GPU time, no browser, and nothing else is blocked on it.
If the skinning half is not released, the hands-off goal needs a different answer
today and that changes the plan more than any other single fact.

Caveat: using UniRig as both the R-gate probe and the destination makes a failure
ambiguous — bad mesh topology, or immature tool. If that ambiguity bites, a
one-off R1 probe is the tiebreaker.

## R4 — no auto-rig

Keep M3. Closes the track. The generated-mesh decision in `README.md`
§Phase 2.0.2 would need revisiting.

---

# Open questions

Ordered by what unblocks the most for the least spend.

## Q0 — does UniRig install and run?

**~30 minutes. No GPU time, no browser, no 20-minute generation.**

Load-bearing for the acceptance criterion: it is the only rig option that can run
unattended without a paid API. `stages/rig.mjs` names the setup commands and says
to read the repo README first.

- Runs → the hands-off pipeline is achievable. Fill in `stages/rig.mjs`, and get
  Q1 answered by the tool that will actually ship.
- Skinning half not released → the destination must be Meshy's API or a manual
  step for heroes only. Re-plan before investing anywhere else.

Answer this before Q1. It decides which tool Q1 should be run with.

## Q1 — does any auto-rigger survive generated topology?

**One R-gate run answers it.** Cheapest path is R1 with the Meshy mesh already
exported.

- Pass → the rig track is viable; Q2 becomes worth building.
- Fail → the ceiling is the mesh. M3, or a topology-aware retopo step nobody has
  scoped.

Also resolves: Mixamo's poly ceiling vs 81,928 tris; whether embedded textures
round-trip; whether `rig-import.sh` handles a non-Mixamo-authored mesh.

## Q2 — retarget delta

`PLAN-forge.md` Piece 2.3. Clips in `poses.js` write absolute rotations against a
bind whose limbs hang along −Y. Mixamo binds in T-pose with non-identity rest
rotations. `bindMode: additive` keeps the character upright but carries the
T-pose spread into every clip.

Blocked on knowing the target bind. **If R1 is the path, it is unblocked now** —
the bind is the one in `assets/kaida-not.glb`, already on disk, and the delta is
solvable and testable with no new mesh. Under R2 or R3 it stays blocked until
that rigger has run once.

Derive the per-bone correction quaternion. Do not eyeball Euler offsets.

## Q3 — Hunyuan3D reproducibility

Only if M2 is revived.

**Q3a — verify the seed plumbs through.** ~90 s.

```
--image ref/k-copy.png --steps 2 --octree-resolution 128 --seed 0 --shape-only
```

Run twice. Identical `[dit]` min/max = the seed works and every later run is
controlled. Different = the `--seed` edit is wrong.

**Q3b — one variable, same seed.** ~17 min each, `--shape-only`.

| | Image | Seed | Steps | Octree |
|---|---|---|---|---|
| A | `ref/k-copy.png` 128² | 0 | 50 | 256 |
| B | `ref/kaida-painterly-raw.png` 1024² | 0 | 50 | 256 |

- B fails → resolution is causal; downscale refs before feeding them.
- B succeeds → run A's failure was nondeterministic; instability is the defect
  and Q4 becomes the first suspect.

## Q4 — two divergences from upstream, both unverified

Found by reading, not by running. Neither is a diagnosis.

**Q4a — terminal sigma.** `pipeline_mlx.py:151` feeds `np.linspace(0, 1, n)`,
matching Hunyuan3D's reversed convention. Upstream
`hy3dshape/schedulers.py:218` appends a terminal `1.0`;
`mlx_arsenal/diffusion/schedulers.py:146` appends `0.0`, the diffusers
convention.

```
steps=50   mlx deltas: +0.0204 ... +0.0204  LAST=-1.0000   sum=+0.0000
           up  deltas: +0.0204 ... +0.0204  LAST=+0.0000   sum=+1.0000
```

Step formula is identical in both. The port's final step subtracts a full
velocity from the finished latent; the integration sums to zero.

**This does not explain runs A and B.** Both used 50 steps, both took the same
`-1.0` step, and A produced a complete mesh. Candidate explanation for
instability (Q3b), not for the observed difference.

**Q4b — missing image preprocessing.** Upstream routes the conditioning image
through `ImageProcessorV2` (`preprocessors.py:30`) — bbox recenter to 85% with a
white border, `INTER_CUBIC` to 512. `pipeline_mlx.preprocess_image` does none of
it: composite on white, `BILINEAR` to 518, no recenter. Quality risk, not a crash.

Neither upstream nor the port runs rembg in the shape path. A green background
survives both.

---

# Diagnostics

Read-only. Neither writes to the project.

```bash
blender --background --python docs/phase2/inspect-fbx.py -- <file.fbx>
python3 docs/phase2/compare-refs.py <image-a> <image-b>
```

`inspect-fbx.py` reports armature presence, bone count, mesh/tri counts, UV
sets, vertex groups, world bounds and material textures. It produced the M1
numbers above.

`compare-refs.py` reports background colour, subject bbox, and the post-
`preprocess_image` 518² tensor statistics for two images. It produced the M2
comparison above and is the evidence for the retraction.

---

# Environment

| | |
|---|---|
| Machine | Apple M1 Pro, 16 GB unified, 10 cores |
| env | uv venv, Python 3.12, at `3d-gen/Hunyuan3D-2.1-mlx/.venv` |
| activate | `source 3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate` |
| clone | `3d-gen/Hunyuan3D-2.1-mlx`, branch `g/fixup-osx-arm`, gitignored |
| weights | 13 GB cached at `~/.cache/huggingface/hub/models--dgrauet--hunyuan3d-2.1-mlx`. Both stages resident; nothing re-downloads. |
| versions | `venv-lock.txt` |
| Blender | 5.1.1. `import_scene.fbx` and `import_scene.gltf` both confirmed. |

The conda env `hunyuan_mlx` and `~/.venvs/forge310` were both abandoned. Any doc
naming them is stale.

`requirements.txt` is not installed. Its pins predate cp312/arm64 wheels, so they
fall back to source builds and fail. The env is unpinned latest. Three installs
build it, and `setup-3dgen.sh` runs them:

1. `mlx mlx-arsenal safetensors Pillow trimesh scikit-image PyMCubes scipy huggingface_hub xatlas opencv-python`
2. `torch torchvision diffusers accelerate transformers einops pyyaml tqdm pymeshlab`
3. `omegaconf`

`hy3dshape/__init__.py` imports `pipelines.py`, `postprocessors.py` and
`preprocessors.py`, all upstream PyTorch, so any MLX import from that package
requires the whole torch stack.

## setup-3dgen.sh is UNVERIFIED

Never built an environment from nothing. Verify before relying on it:

```bash
mv docs/phase2/3d-gen/Hunyuan3D-2.1-mlx/.venv{,.bak}
bash docs/phase2/setup-3dgen.sh
source docs/phase2/3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate
npm run forge:smoke-demo
```

Reaching Stage 1 complete means it reproduces. `.venv.bak` is the fallback.

---

# generate.py

`3d-gen/Hunyuan3D-2.1-mlx/generate.py`. Gitignored via `3d-gen/`; tracked only
in the fork's own repo on branch `g/fixup-osx-arm`.

| Flag | Purpose |
|---|---|
| `--steps` (50), `--octree-resolution` (256) | Sampling |
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

`npm run forge:kaida` points at `ref/kaida-painterly-raw.png` and passes no seed.
It reproduces run B, the failing case.

---

# Rig import

```bash
bash docs/phase2/rig-import.sh <file.fbx> [name]
npm run forge:view -- <path.glb>
```

Name defaults to `kaida`. Animation is dropped. Then check
`assets/<name>.bones.json` and set `"reviewed": true`; a re-import keeps a
reviewed map when every mapped bone still exists.

`?forge=kaida` loads an asset installed as `kaida`. `?forge=kaida:<name>` drives
the character `kaida` from a differently named asset — how the stand-in runs.

Bare `npm run forge:view` fails: it defaults to `out/kaida.glb` and `out/` is
empty.

## Two things this had to solve

**Sanitised bone names.** `GLTFLoader` turns spaces into underscores and drops
`. : / [ ]`, so `mixamorig:Hips` arrives as `mixamorigHips`. `bones.json` is
written from the raw glTF JSON where the colon survives, so every Mixamo rig
mapped 0/19 and fell back to code-built. `resolveBoneMap` indexes both spellings.

**Unit mismatch.** Mixamo FBX carries a unit scale Blender applies to object
transforms but not bone translations — mesh in metres, skeleton in centimetres.
`fbx2glb.py` bakes object scale into the data. Without it the loader measures a
4 mm character and scales it ×437.

The Meshy FBX has neither problem: scale 1.0, no armature to mismatch.

---

# The stand-in

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

Proved: the name mapper handles a real rig (19/19, no edits); scale
normalisation, ground contact and the clip system drive a foreign skeleton;
hot-swap on `assets/` works.

Did not prove: anything about generated topology. It is a stock Mixamo mesh with
clean joint loops.

---

# TODO

- npm script with parameters for `rig-import.sh`, covering both `kaida` and
  `kaida-not`, so two entries prove the parameterisation rather than hardcoding one.
- Keep raw source downloads out of `assets/`. That directory is installed game
  assets and is what the `vite.config.js` watcher scans for `*.glb`.
  `docs/phase2/fbx/` already holds `kaida-not.fbx`.
- `forge-manifest.json` `venv`, `mesh.repo` and `rig.repo` paths are stale, and
  its `_venv` names an `env-lock.yml` that does not exist. Inert — `mesh` and
  `rig` refuse via `stages/_setup.mjs` — but `refuse()` prints those commands.
  Left untouched pending a rig decision.
- `setup-3dgen.sh` unverified. `mlx-forge`, needed for INT8 conversion, is
  unrecorded. Weights are fetched by `from_pretrained`, not by setup.

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
| `pip install` | `requirements.txt` carries two Chinese PyPI mirrors as `--extra-index-url` | `setup.py` runs arbitrary code. Already executed. |
| Meshy 6 Lite | hosted, free tier | Output is a downloaded file, no runtime dependency. **Licence for shipped use unverified.** |
| Mixamo | hosted, Adobe login | No SLA. Keep downloaded FBX on disk; do not re-rig on demand. |
