# ITERATION — shape stage

Delete when the mesh stage produces a usable Kaida.

---

# Environment

| | |
|---|---|
| conda env | `hunyuan_mlx`, Python 3.11.14 |
| reproduce | `env-lock.yml` (not requirements.txt) |
| clone | `3d-gen/Hunyuan3D-2.1-mlx` at `32931e2`, gitignored |
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

```
Hierarchical Volume Decoding [r65]:  274625 points
Hierarchical Volume Decoding [r129]: 0 points (of 2146689 total)
ValueError: need at least one array to concatenate
```

`decode_to_mesh` keeps a voxel when either holds:

```python
curr_mask  = self._extract_near_surface_mask(grid_logits, mc_level)   # sign change
curr_mask += (np.abs(grid_logits) < 0.95).astype(np.int32)            # near iso level
```

Zero points means neither held for any of 274,625 voxels. `np.abs(nan) < 0.95`
is False and NaN sign comparisons are False, so an all-NaN field fails both.

## Reading the probe

`generate.py` prints `[SDF]` per level.

A NaN in `[dit]` locates the failure in the DiT; a clean `[dit]` with NaN in
`[SDF]` puts it in the VAE decode.

| Output | Meaning | Next |
|---|---|---|
| `nan=` equals `n=` | numerics | `--precision int8`; fp16 peaks ~10 GB against 16 GB of unified memory |
| finite, `crossings=NO`, large `\|min\|` | latent resolved no surface | sweep `--mc-level`, then guidance |
| finite, `crossings=yes` | field is fine | failure is downstream of the mask |

INT8 weights are an offline conversion:

```bash
mlx-forge convert hunyuan3d-2.1 --quantize --bits 8 --output ./models/hunyuan3d-2.1-int8
export HUNYUAN3D_MLX_WEIGHTS_DIR=<that directory>
```

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
