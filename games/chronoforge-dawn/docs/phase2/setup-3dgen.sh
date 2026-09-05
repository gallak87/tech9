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
  # Verbatim from the port's README "### Install". requirements.txt is the
  # upstream PyTorch/CUDA path and is not used here.
  uv pip install --python "$VENV/bin/python" \
    mlx mlx-arsenal safetensors Pillow trimesh scikit-image PyMCubes scipy
  # Stage 2 only. xatlas has no cp312 wheel, so this is allowed to fail while
  # we are running --shape-only.
  uv pip install --python "$VENV/bin/python" huggingface_hub xatlas opencv-python \
    || uv pip install --python "$VENV/bin/python" huggingface_hub opencv-python
fi

cat <<EOF

==> ready
  python  $VENV/bin/python
  repo    $REPO_DIR

Gate before anything else — the port's own end-to-end test for the shape path,
which their CI never runs:

  cd $REPO_DIR && .venv/bin/python tests/test_stage1_to_stage2.py

Then:
  FORGE_PY=$VENV/bin/python npm run forge:smoke-demo
EOF
