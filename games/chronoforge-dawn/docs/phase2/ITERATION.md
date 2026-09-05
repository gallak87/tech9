# ITERATION — shape stage

Delete when the mesh stage produces a usable Kaida.

---

# Environment

| | |
|---|---|
| conda env | `hunyuan_mlx`, Python 3.11.14 |
| reproduce | `env-lock.yml` — conda only. There is no working pip lock. |
| clone | `3d-gen/Hunyuan3D-2.1-mlx`, upstream `5fe2194` + `3d-gen-arm.patch`, gitignored |
| weights | fp16, pulled by `from_pretrained` on first run |

---

# Run

```bash
npm run forge:smoke     # ~1-2 min, shape only, 8 steps, octree 128
npm run forge:shape     # shape at full quality
npm run forge:full      # shape + texture
```

Smoke answers one question: does the SDF have a surface at all. It runs
`--verbose`.

## Output

| Line | Phase |
|---|---|
| `[+] weights loaded in Ns` | model load |
| `[dit] step i/N ... nan= min= max=` | denoising, one per step |
| `[SDF] n= nan= min= max= crossings=` | VAE decode, one per hierarchical level |
| `Hierarchical Volume Decoding [rN]` | the port's own line |

Without `--verbose` the `[dit]` line rewrites in place and carries no latent
stats.

Direct, for sweeping knobs:

```bash
$HOME/miniconda3/envs/hunyuan_mlx/bin/python docs/phase2/generate.py \
  --image docs/phase2/ref/kaida-painterly.png \
  --output docs/phase2/out/smoke.glb \
  --shape-only --steps 8 --octree-resolution 128 --mc-level 0.0
```

---

# Open failure

Shape generation completes, then produces no mesh.

```
[dit] step 8/8   nan=0  min=-3.566  max=+2.419
[SDF] n=274625 nan=0 min=-0.9995 max=-0.9971 mean=-0.9985 crossings=NO
Hierarchical Volume Decoding [r129]: 0 points
```

The SDF field spans **0.0024 across 274,625 samples** and sits at -0.998
throughout. Nothing varies, so no surface is found and no mesh is built.

## Ruled out

| | Evidence |
|---|---|
| Numerics / precision | `nan=0` at every denoising step and in the field. `--precision int8` is not the fix. |
| Input resolution | The encoder normalises whatever it is given; feeding a smaller image cannot help. |
| Transparency | The pipeline composites RGBA before use. Untested as a *quality* factor, not a cause of this. |

| Our reference image | `assets/demo.png`, the image the port ships and was tested against, fails identically at the same settings. |

## Where it is

The port or the environment. Every input-side explanation is eliminated — the
repo's own demo image cannot produce a mesh here.

Next: find whether upstream ever produced a mesh on arm at all. The fork's
history is the place to look; `e8e73ad "run MLX inference in fp16 end-to-end"`
and `f08c3bb "require mlx-arsenal>=0.10.1 for the MoE dtype fix"` both touch
exactly this path.

## Reading the probe

`generate.py` prints `[dit]` per denoising step and `[SDF]` per decode level.

| Output | Meaning |
|---|---|
| `nan=` matches `n=` | numerics failure |
| `crossings=NO`, flat range | no surface resolved |
| `crossings=yes` | field is fine, failure is later |

INT8 weights, if ever needed, are an offline conversion:

```bash
mlx-forge convert hunyuan3d-2.1 --quantize --bits 8 --output ./models/hunyuan3d-2.1-int8
export HUNYUAN3D_MLX_WEIGHTS_DIR=<that directory>
```

---

# Environment traps

- **xatlas is `xatlas-python` on conda-forge.** The pip name resolves to nothing
  there. Its pip freeze entry is a build-machine path that exists on no machine.
- **`env-lock.txt` was deleted** for that reason. `env-lock.yml` is the only
  reproducible artifact.
- **`3d-gen-arm.patch` is required.** Upstream pins `numpy==1.24.4`,
  `pymeshlab==2022.2.post3`, `xatlas==0.0.9`, `cupy-cuda12x` and `bpy`. None
  resolve on arm64. The patch relaxes the first two and drops the rest.
- **npm scripts use `conda run`**, not the env's python binary. The env carries
  hand-installed packages; a bare interpreter path skips activation and
  introduces a variable.

---

# Temporary knobs

`--octree-resolution` and `--mc-level` are scaffolding. Delete both once Kaida's
values settle and hardcode them.

---

# Logistical review — TODO

`setup-3dgen.sh` has never been run from nothing. Unverified:

- `env-lock.yml` is an arm64 macOS export
- `mlx-forge` install is unrecorded
- weights are not fetched by the setup script

---

# Supply chain

| | Origin | Risk |
|---|---|---|
| weights | HF `dgrauet/hunyuan3d-2.1-mlx`, `.safetensors` | Low — safetensors cannot execute on load, unlike pickle |
| model + upstream code | Tencent | Large company, widely used |
| MLX port | `dgrauet` fork, single maintainer | The trust step taken |
| `pip install` | requirements.txt carries two Chinese PyPI mirrors as `--extra-index-url` | The real surface. `setup.py` runs arbitrary code. Already executed. |

Audit the port against upstream:

```bash
cd docs/phase2/3d-gen/Hunyuan3D-2.1-mlx
git log --oneline | head -30
grep -rn "urllib\|requests\|socket\|subprocess\|eval(\|exec(" --include=*.py hy3dshape hy3dpaint | grep -v test
```
