#!/usr/bin/env bash
# Build the 3D generation environment.
#
# NON-DESTRUCTIVE. If the clone already exists this touches nothing in it except
# creating .venv/ — no clone, no fetch, no checkout, no patch, no delete. Your
# branch and working tree are left alone.
#
# uv + Python 3.12, matching the port's own CLAUDE.md. One package manager, so
# the environment stops being a variable.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${HUNYUAN3D_REPO:-$HERE/3d-gen/Hunyuan3D-2.1-mlx}"
UPSTREAM_PIN="5fe2194"
VENV="$REPO_DIR/.venv"

command -v uv >/dev/null || { echo "uv not found: brew install uv"; exit 1; }

if [ -d "$REPO_DIR/.git" ]; then
  echo "==> repo exists, leaving it untouched"
  echo "    $REPO_DIR"
  echo "    branch $(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
else
  echo "==> cloning at $UPSTREAM_PIN"
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone https://github.com/dgrauet/Hunyuan3D-2.1-mlx "$REPO_DIR"
  git -C "$REPO_DIR" checkout --quiet "$UPSTREAM_PIN"
  # requirements come from requirements-arm.txt, so the clone stays pristine.
fi

if [ -d "$VENV" ]; then
  echo "==> .venv exists, leaving it. Delete it yourself to rebuild."
else
  echo "==> uv venv, python 3.12"
  uv venv --python 3.12 "$VENV"

  # NOT requirements.txt. Its pins predate cp312/arm64 wheels — transformers
  # ==4.46.0, diffusers==0.30.0, huggingface-hub==0.30.2 — so they fall back to
  # source builds and fail. The environment that reaches the array error is
  # unpinned latest, and installing requirements.txt over it would downgrade
  # roughly half of it.
  #
  # Line 1 is the port README's "### Install". Line 2 is the PyTorch chain that
  # hy3dshape/__init__.py forces by importing pipelines/postprocessors/
  # preprocessors. Line 3 is what turned up after those.
  uv pip install --python "$VENV/bin/python" \
    mlx mlx-arsenal safetensors Pillow trimesh scikit-image PyMCubes scipy \
    huggingface_hub xatlas opencv-python
  uv pip install --python "$VENV/bin/python" \
    torch torchvision diffusers accelerate transformers einops \
    pyyaml tqdm pymeshlab
  uv pip install --python "$VENV/bin/python" omegaconf
fi

cat <<EOF

==> ready
  python  $VENV/bin/python
  repo    $REPO_DIR

==> run it
  cd $REPO_DIR
  source .venv/bin/activate
  python generate.py --image <ref.png> --output <out.glb>

generate.py's sys.path inserts are relative, so the repo must be the working
directory. venv-lock.txt records the versions this was built from.
EOF
