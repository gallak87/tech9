"""Compare two reference images as the shape pipeline sees them. Read-only.

  python3 docs/phase2/compare-refs.py <a.png> <b.png>

Needs Pillow and numpy:
  source docs/phase2/3d-gen/Hunyuan3D-2.1-mlx/.venv/bin/activate

Written to settle whether two inputs that produced different pipeline outcomes
were actually different inputs. Reports the chroma background, the subject's
framing, and the statistics of the 518-square tensor that reaches DINOv2 after
pipeline_mlx.preprocess_image — which is the only thing the model ever sees.
"""
import sys

import numpy as np
from PIL import Image

ENCODER_SIZE = 518  # ShapePipeline.image_encoder.image_size


def green_mask(rgb):
    r, g, b = (rgb[..., i].astype(np.int16) for i in range(3))
    return (g > 120) & (g - r > 45) & (g - b > 45)


def as_model_sees_it(path):
    """Mirror pipeline_mlx.preprocess_image: composite RGBA on white, resize, scale."""
    im = Image.open(path)
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    else:
        im = im.convert("RGB")
    im = im.resize((ENCODER_SIZE, ENCODER_SIZE), Image.BILINEAR)
    return np.asarray(im, dtype=np.float32) / 127.5 - 1.0


def report(path):
    im = Image.open(path)
    rgb = np.asarray(im.convert("RGB"))
    h, w = rgb.shape[:2]
    print(f"\n=== {path}  mode={im.mode} size={im.size}")

    if im.mode == "RGBA":
        alpha = np.asarray(im)[..., 3]
        # All-opaque alpha makes the composite-on-white a no-op, so an RGBA file
        # is not automatically a keyed one.
        print(f"  alpha: min={alpha.min()} max={alpha.max()} "
              f"opaque={(alpha == 255).mean():.3f} clear={(alpha == 0).mean():.3f}")

    mask = green_mask(rgb)
    if mask.any():
        px = rgb[mask].astype(np.float32)
        print(f"  green bg: frac={mask.mean():.3f} "
              f"mean={px.mean(0).round(1)} std={px.std(0).round(1)}")
    ys, xs = np.where(~mask)
    if len(ys):
        print(f"  subject: h_frac={(ys.max() - ys.min() + 1) / h:.3f} "
              f"w_frac={(xs.max() - xs.min() + 1) / w:.3f} "
              f"margins t={ys.min() / h:.3f} b={(h - 1 - ys.max()) / h:.3f}")

    t = as_model_sees_it(path)
    print(f"  as fed to DINOv2 ({ENCODER_SIZE}²): "
          f"mean={t.mean():+.4f} std={t.std():.4f}")
    return t


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    a, b = sys.argv[1], sys.argv[2]
    ta, tb = report(a), report(b)

    print(f"\n=== difference")
    print(f"  518² tensor mean abs diff = {np.abs(ta - tb).mean():.4f}")

    # Content comparison at a common size, so resolution alone does not register
    # as a difference in subject matter.
    n = min(Image.open(a).size[0], Image.open(b).size[0])
    ra, rb = (np.asarray(Image.open(p).convert("RGB").resize((n, n), Image.BILINEAR),
                         dtype=np.int16) for p in (a, b))
    d = np.abs(ra - rb).mean()
    print(f"  pixels @{n}² mean abs diff = {d:.2f}"
          f"{'   <- same image, resampling noise only' if d < 5 else ''}")


if __name__ == "__main__":
    main()
