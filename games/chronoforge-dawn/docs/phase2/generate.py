#!/usr/bin/env python3
"""Hunyuan3D-2.1 MLX shape + texture generation.

Lives outside the model clone so it is version-controlled independently; the
clone is disposable and gitignored. Point at it with --repo or HUNYUAN3D_REPO.
"""
import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np

# Generation is statically driven: one reference, one mesh, every run.
SEED = 42

# pipeline_mlx.ShapePipeline.__call__ default.
GUIDANCE_SCALE = 5.0

DEFAULT_REPO = Path(__file__).resolve().parent / "3d-gen" / "Hunyuan3D-2.1-mlx"


def install_step_probe(pipe, total, verbose=False):
    """Tick the denoising loop.

    pipeline_mlx runs num_inference_steps DiT forwards with no output, which is
    the long silence before the first [SDF] line. scheduler.step is called once
    per iteration and returns the updated latents, so wrapping it gives both a
    counter and a place to inspect the latent.

    Verbose reports latent min/max/nan per step. If the latent goes NaN at step
    k the failure is the DiT, not the VAE decode where it surfaces.
    """
    cls = pipe.scheduler.__class__
    original = cls.step
    state = {"i": 0, "t0": time.time()}

    def probed(self, *args, **kwargs):
        out = original(self, *args, **kwargs)
        state["i"] += 1
        i = state["i"]
        elapsed = time.time() - state["t0"]
        eta = elapsed / i * (total - i)

        if verbose:
            stats = ""
            try:
                a = np.array(out, copy=False).astype(np.float32)
                finite = np.isfinite(a)
                n_nan = int((~finite).sum())
                stats = (f"  nan={n_nan} min={a[finite].min():+.3f} max={a[finite].max():+.3f}"
                         if finite.any() else "  ALL NaN")
            except Exception as exc:
                stats = f"  <stats unavailable: {exc}>"
            print(f"[dit] step {i:>3}/{total}  {elapsed:6.1f}s  ~{eta:6.1f}s left{stats}", flush=True)
        else:
            end = "\n" if i >= total else ""
            print(f"\r[dit] step {i}/{total}  {elapsed:6.1f}s elapsed  ~{eta:6.1f}s left   ",
                  end=end, flush=True)
        return out

    cls.step = probed


def install_sdf_probe(vae):
    """Log SDF field statistics at every hierarchical decoding level.

    The near-surface mask keeps a voxel when the SDF changes sign across it OR
    when |sdf| < 0.95. A NaN field fails both — NaN comparisons are always False
    — and presents as `0 points`, then as a bare numpy concatenate error several
    frames later. These stats separate that from a genuinely surfaceless field.
    """
    cls = vae.__class__
    original = cls._query_sdf_volume

    def probed(self, xyz_samples, features, num_chunks=10000):
        if xyz_samples.shape[0] == 0:
            sys.exit(
                "\n[SDF] no near-surface voxels at this level.\n"
                "      The field never crosses mc_level and no voxel is within 0.95 of it.\n"
                "      Check the stats above: an all-NaN field is a numerics failure "
                "(try --precision int8),\n"
                "      a finite field with a large minimum |sdf| means the latent "
                "resolved no surface.\n"
            )
        vals = original(self, xyz_samples, features, num_chunks)
        finite = np.isfinite(vals)
        n_nan = int((~finite).sum())
        if finite.any():
            f = vals[finite]
            print(f"[SDF] n={vals.size} nan={n_nan} "
                  f"min={f.min():+.4f} max={f.max():+.4f} mean={f.mean():+.4f} "
                  f"|min|={np.abs(f).min():.4f} crossings={'yes' if (f.min() < 0 < f.max()) else 'NO'}")
        else:
            print(f"[SDF] n={vals.size} nan={n_nan} — FIELD IS ENTIRELY NaN")
        return vals

    cls._query_sdf_volume = probed


def resolve_weights(precision):
    """Map --precision onto HUNYUAN3D_MLX_WEIGHTS_DIR, which from_pretrained honours."""
    if precision == "fp16":
        return "dgrauet/hunyuan3d-2.1-mlx"

    weights = os.environ.get("HUNYUAN3D_MLX_WEIGHTS_DIR")
    if not weights:
        sys.exit(
            f"--precision {precision} needs converted weights; the published repo is fp16.\n"
            f"  mlx-forge convert hunyuan3d-2.1 --quantize --bits "
            f"{'8' if precision == 'int8' else '4'} --output ./models/hunyuan3d-2.1-{precision}\n"
            f"  export HUNYUAN3D_MLX_WEIGHTS_DIR=<that directory>\n"
        )
    return weights


def main():
    p = argparse.ArgumentParser(description="Hunyuan3D-2.1 MLX generation")
    p.add_argument("--image", required=True, help="reference image, RGBA is composited onto white upstream")
    p.add_argument("--output", default="output.glb")
    p.add_argument("--repo", default=os.environ.get("HUNYUAN3D_REPO", str(DEFAULT_REPO)))
    p.add_argument("--precision", default="fp16", choices=["fp16", "int8", "int4"],
                   help="fp16 peaks ~10GB and wants 32GB of unified memory; int8 ~6GB")
    p.add_argument("--steps", type=int, default=50, help="dominates runtime; 8 is enough to smoke-test")
    p.add_argument("--shape-only", action="store_true", help="skip texture synthesis (~9 min)")
    p.add_argument("--views", type=int, default=6)
    p.add_argument("--texture-size", type=int, default=512)
    # TEMPORARY. Delete both once Kaida's values are settled and hardcode them,
    # noting which run fixed them.
    p.add_argument("--octree-resolution", type=int, default=256)
    p.add_argument("--mc-level", type=float, default=0.0, help="iso level the near-surface mask compares against")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="per-step latent min/max/nan; locates a NaN at the step it appears")
    args = p.parse_args()

    repo = Path(args.repo).resolve()
    if not (repo / "hy3dshape").is_dir():
        sys.exit(f"no hy3dshape/ under {repo} — pass --repo or set HUNYUAN3D_REPO")
    sys.path.insert(0, str(repo / "hy3dshape"))
    sys.path.insert(0, str(repo / "hy3dpaint"))

    image = Path(args.image).resolve()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    shape_out = output if args.shape_only else output.with_name(output.stem + "_shape.glb")

    from hy3dshape.pipeline_mlx import ShapePipeline

    print(f"[*] shape · {image.name} · {args.precision} · {args.steps} steps · "
          f"octree {args.octree_resolution} · mc_level {args.mc_level} · "
          f"guidance {GUIDANCE_SCALE} · seed {SEED}")
    if args.verbose:
        print(f"[*] repo {repo}")
        print(f"[*] weights {resolve_weights(args.precision)}")
    t0 = time.time()
    shape_pipe = ShapePipeline.from_pretrained(resolve_weights(args.precision))
    print(f"[+] weights loaded in {time.time() - t0:.0f}s")
    install_step_probe(shape_pipe, args.steps, args.verbose)
    install_sdf_probe(shape_pipe.vae)

    mesh = shape_pipe(
        str(image),
        num_inference_steps=args.steps,
        guidance_scale=GUIDANCE_SCALE,
        octree_resolution=args.octree_resolution,
        mc_level=args.mc_level,
        seed=SEED,
    )
    mesh.export(str(shape_out))
    print(f"[+] shape → {shape_out}  ({len(mesh.vertices)} verts, {len(mesh.faces)} faces) "
          f"in {time.time() - t0:.0f}s")

    if args.shape_only:
        return

    print(f"[*] texture · {args.views} views · {args.texture_size}px")
    from textureGenPipeline_mlx import Hunyuan3DPaintConfigMLX, Hunyuan3DPaintPipelineMLX

    paint = Hunyuan3DPaintPipelineMLX(
        Hunyuan3DPaintConfigMLX(max_num_view=args.views, resolution=args.texture_size)
    )
    paint(mesh_path=str(shape_out), image_path=str(image),
          output_mesh_path=str(output), save_glb=True)
    shape_out.unlink(missing_ok=True)
    print(f"[+] textured → {output}")


if __name__ == "__main__":
    main()
