# ITERATION — shape stage

Delete when the mesh stage produces a usable Kaida.

---

# Environment

| | |
|---|---|
| env | uv venv, Python 3.12, at `3d-gen/Hunyuan3D-2.1-mlx/.venv` |
| activate | `source 3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate` |
| clone | `3d-gen/Hunyuan3D-2.1-mlx`, branch `g/fixup-osx-arm`, gitignored |
| weights | 13 GB cached at `~/.cache/huggingface/hub/models--dgrauet--hunyuan3d-2.1-mlx`. Both stages resident; nothing re-downloads. |
| versions | `venv-lock.txt` |

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

# State

Stage 1 completes and exports a mesh. Stage 2 runs.

```
[SDF] n=274625 nan=0 min=-1.0146 max=+0.7979 mean=-0.9834 |min|=0.0001 crossings=yes
Hierarchical Volume Decoding [r129]: 198770 points
[+] Stage 1 complete.
```

~19 s per denoising step. 8 steps ≈ 2.5 min; 50 steps ≈ 16 min. Stage 2 adds
texture synthesis on top.

## Input requirement

**The input image needs a solid background.** A transparent one does not
survive the pipeline's masking step, and the run ends with a flat SDF field, no
zero crossings, and:

```
Hierarchical Volume Decoding [r129]: 0 points
ValueError: need at least one array to concatenate
```

`pipeline_mlx.py:81-85` composites RGBA onto white using the alpha as a paste
mask, which is not equivalent to a solid background when the transparent pixels
carry their own RGB.

Which solid background is best is untested. `ref-gen.mjs --raw` emits the
unkeyed render; the keyed variant is what fails.

---

# Running

```bash
source docs/phase2/3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate

npm run forge:smoke-demo   # the port's demo image, 8 steps, octree 128
npm run forge:kaida        # full quality, both stages
```

`forge.sh` passes every argument through to `generate.py` and resolves
`--image` and `--output` relative to `docs/phase2/`. Add npm scripts by adding
argument lists.

Directly:

```bash
cd docs/phase2/3d-gen/Hunyuan3D-2.1-mlx
python generate.py --image <abs path> --output <abs path> --steps 8 --octree-resolution 128
```

---

# generate.py

In the clone. Uncommitted there. Two additions:

- `--steps` (default 50) and `--octree-resolution` (default 256)
- `install_probes()` — monkeypatches `scheduler.step` and the VAE's
  `_query_sdf_volume`, so nothing in the package changes

```
[dit] step   1/8    19.3s  ~ 135.1s left  ( 19.3s/step)  nan=0 min=-3.974 max=+4.102
[SDF] n=274625 nan=0 min=-1.0146 max=+0.7979 mean=-0.9834 |min|=0.0001 crossings=yes
```

| Output | Meaning |
|---|---|
| `nan=` matches `n=` | numerics failure |
| `crossings=NO` | no surface resolved; no mesh will be built |
| `crossings=yes` | field has a surface |

`guidance_scale` is 7.5 and `--precision` is parsed but unused, so runs are
fp16. `seed` is not passed, so runs are not reproducible.

---

# Untuned

| Knob | Now | Note |
|---|---|---|
| `guidance_scale` | 7.5 | `pipeline_mlx.ShapePipeline.__call__` defaults to 5.0 |
| `seed` | unset | `mx.random.seed` is applied at `pipeline_mlx.py:127` when passed |
| `--precision` | parsed, unused | int8 needs an offline `mlx-forge` conversion; fp16 peaks ~10 GB |
| `mc_level` | 0.0 | iso threshold the near-surface mask compares against |
| input background | untested | only that a solid one works |

---

# Traps

- **`requirements.txt` has no `mlx`.** Neither does upstream's. CI installs `mlx mlx-arsenal numpy Pillow pytest opencv-python-headless` separately.
- **Pinned versions fail on cp312/arm64**; unpinned resolve. Not a uv-versus-pip difference.
- **xatlas is `xatlas-python` on conda-forge**, `xatlas` on PyPI.
- **`open3d` is imported nowhere** in the repo.
- **`generate.py` needs the repo as the working directory** — its `sys.path` inserts are relative.

---

# Logistical review — TODO

`setup-3dgen.sh` unverified. `mlx-forge`, needed for INT8 conversion, is
unrecorded. Weights are fetched by `from_pretrained`, not by setup.

---

# Supply chain

| | Origin | Risk |
|---|---|---|
| weights | HF `dgrauet/hunyuan3d-2.1-mlx`, `.safetensors` | Low — safetensors cannot execute on load |
| model + upstream code | Tencent | Large company, widely used |
| MLX port | `dgrauet` fork, single maintainer, 95 commits ahead | The trust step taken |
| `pip install` | requirements.txt carries two Chinese PyPI mirrors as `--extra-index-url` | `setup.py` runs arbitrary code. Already executed. |
