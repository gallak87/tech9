# ITERATION — shape stage debugging

Working notes. **Delete when the mesh stage produces a usable Kaida.**

---

# The failure

```
Hierarchical Volume Decoding [r65]:  274625 points     (= 65³, full dense grid)
Hierarchical Volume Decoding [r129]: 0 points (of 2146689 total)
ValueError: need at least one array to concatenate
```

`_extract_near_surface_mask` found **zero sign changes** across the whole r65
volume. The SDF never crosses `mc_level`, so there is no surface anywhere. The
crash is downstream noise — `_query_sdf_volume` was handed an empty array.

Not a memory error. Not an octree error.

## Two suggestions that were rejected

| Suggestion | Verdict |
|---|---|
| Flatten alpha onto white before passing the image | **No-op.** `pipeline_mlx.py:81-85` already composites RGBA onto white using the alpha as mask. The keyed PNG is the correct input. |
| Drop `octree_resolution` 256 → 128 | **Wrong direction.** 256 *is* the MLX default. It already failed at r129, below 256. Lowering it moves where it fails, not whether. |

---

# What generate.py actually got wrong

`demo.py` is the **PyTorch** demo (`hy3dshape.pipelines`, `tencent/Hunyuan3D-2.1`)
and is not the contract for the MLX path. The real contract is
`pipeline_mlx.ShapePipeline.__call__`:

```python
num_inference_steps: int   = 50,     # generate.py 50    ok
guidance_scale:      float = 5.0,    # generate.py 7.5   DEVIATION
octree_resolution:   int   = 256,    # generate.py 256   ok, is the default
box_v:               float = 1.01,
mc_level:            float = 0.0,
num_chunks:          int   = 10000,
seed:      Optional[int]   = None,   # never passed
```

| Defect | Consequence |
|---|---|
| `guidance_scale=7.5` vs default `5.0` | Invented from generic diffusion convention. Over-guidance in a flow-matching model is a live cause of a degenerate latent, which is exactly a no-sign-change SDF. **Prime suspect.** |
| No seed | Every 15-minute run is unreproducible. A fix cannot be distinguished from a different sample. |
| `--precision` parsed, never used | `from_pretrained` defaults to `dtype=mx.float16`. The 6.10 GB download is FP16, which the port sizes at ~10 GB peak against a recommended 32 GB. This machine has 16 GB. |

One thing it got right: MLX returns the mesh directly. `demo.py`'s `[0]` is the
PyTorch API. Do not add it.

---

# Patch list — generate.py

| # | Change | Form |
|---|---|---|
| 1 | `guidance_scale` 7.5 → **5.0** | hardcode |
| 2 | `seed` → **fixed constant** | hardcode. Generation is statically driven; determinism is the point, and `tools/lintrng.mjs` already treats it as a project value. |
| 3 | `--shape-only` | flag. Stage 2 is ~9 min and stage 1 is what's broken. |
| 4 | `--steps` (default 50) | flag. Dominates runtime; drop to 8 for smoke. |
| 5 | `--octree-resolution` (default 256) | **temporary** flag |
| 6 | `--mc-level` (default 0.0) | **temporary** flag. This is the iso threshold the near-surface mask compares against — the knob directly implicated. |
| 7 | Print SDF min / max / mean / NaN count before the mask | Distinguishes FP16 NaN from a genuinely flat field in one run. |
| 8 | `--precision` → sets `HUNYUAN3D_MLX_WEIGHTS_DIR` | Currently decorative. |

**5 and 6 are scaffolding.** Delete both once Kaida's numbers are settled and
hardcode the values that worked. Leave a comment saying which run fixed them.

INT8 is not a runtime flag — the port's README converts weights offline:

```bash
mlx-forge convert hunyuan3d-2.1 --quantize --bits 8 --output ./models/hunyuan3d-2.1-mlx
```

Then `HUNYUAN3D_MLX_WEIGHTS_DIR` points at that directory. `from_pretrained`
already honours the env var.

## Where generate.py should live

**`docs/phase2/generate.py`, ours and versioned** — not inside the clone. It
takes the repo path from `HUNYUAN3D_REPO` (or `--repo`) and does the
`sys.path.insert` itself. That keeps the 328 MB clone disposable and re-clonable
without losing our work.

---

# Patch list — forge.mjs

Only `stages/mesh.mjs`. Its `command` block emits
`--precision / --views / --texture-size / --output`, invented against a
generate.py that did not exist yet. Make it emit the real flags.

**Keep `refuse()` in place.** Manual driving until the shape stage produces
something. Wiring it in now would automate a broken step.

---

# npm scripts

`games/chronoforge-dawn/package.json`. Config lives in the script, not in flags
typed by hand:

```
forge:smoke   --shape-only --steps 8 --octree-resolution 128    ~1-2 min
forge:shape   --shape-only                                      shape at full quality
forge:full    (nothing)                                         shape + texture
```

Each prefixed with the venv python and `HUNYUAN3D_REPO`. Smoke is not a quality
run — it answers "does the SDF have a surface at all".

---

# Git

**Do not commit the clone.** 328 MB, and it carries its own `.git`, which git
would want to be a submodule.

`docs/phase2/.gitignore` gets `3d-gen/`. Versioned: our `generate.py`, the
manifest, `ref-gen.mjs`, the references. Disposable: the clone, the weights,
`out/`.

---

# Supply chain

Worth being clear about what came from where, since this was flagged.

| | Origin | Risk |
|---|---|---|
| Model weights | HuggingFace `dgrauet/hunyuan3d-2.1-mlx`, **`.safetensors`** | Low. safetensors exists specifically because pickle/`.bin` execute arbitrary code on load. Safetensors cannot. |
| Original model + code | Tencent (Hunyuan3D-2.1) | Large company, widely used, not one developer. |
| MLX port | `dgrauet` fork, single maintainer | The actual trust step taken here. |
| `pip install -r requirements.txt` | | **The real risk surface, already executed.** `setup.py` runs arbitrary code at install time. Weights were never the exposure. |

To audit what the port actually changed versus Tencent's upstream:

```bash
cd docs/phase2/3d-gen/Hunyuan3D-2.1-mlx
git log --oneline | head -30
git remote -v
grep -rn "urllib\|requests\|socket\|subprocess\|eval(\|exec(" --include=*.py hy3dshape hy3dpaint | grep -v test
```

The zcompdump files are unrelated — oh-my-zsh regenerates its completion cache
whenever `$fpath` changes, which the python@3.10 install did.
