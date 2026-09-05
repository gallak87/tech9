#!/usr/bin/env python3
"""Hunyuan3D-2.1 MLX shape + texture generation.

Lives outside the model clone so it is version-controlled independently; the
clone is disposable and gitignored. Point at it with --repo or HUNYUAN3D_REPO.
"""
import argparse
import os
import sys
from pathlib import Path

import numpy as np

# Generation is statically driven — the same reference must yield the same mesh
# on every run, or a fix cannot be told apart from a different sample.
SEED = 42

# The MLX pipeline's own default. An earlier revision used 7.5, carried over from
# generic diffusion convention; over-guidance in a flow-matching model is a live
# cause of a degenerate latent.
GUIDANCE_SCALE = 5.0

DEFAULT_REPO = Path(__file__).resolve().parent / "3d-gen" / "Hunyuan3D-2.1-mlx"


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
          f"octree {args.octree_resolution} · mc_level {args.mc_level} · seed {SEED}")
    shape_pipe = ShapePipeline.from_pretrained(resolve_weights(args.precision))
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
    print(f"[+] shape → {shape_out}  ({len(mesh.vertices)} verts, {len(mesh.faces)} faces)")

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
