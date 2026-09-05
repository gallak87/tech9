#!/usr/bin/env bash
# Reproduce the 3D generation environment on a new machine.
#
# NOT YET VERIFIED ON A CLEAN MACHINE — see ITERATION.md §Logistical review.
# It records what worked here; it has never been run from nothing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${HUNYUAN3D_REPO:-$HERE/3d-gen/Hunyuan3D-2.1-mlx}"
PIN="32931e2"                      # "fix: ensure it works on arm" — main moving would break this silently
ENV_NAME="${HUNYUAN3D_ENV:-hunyuan_mlx}"

echo "==> clone at $PIN"
if [ ! -d "$REPO_DIR/.git" ]; then
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone https://github.com/dgrauet/Hunyuan3D-2.1-mlx "$REPO_DIR"
fi
git -C "$REPO_DIR" checkout --quiet "$PIN"

echo "==> conda env '$ENV_NAME' from env-lock.yml"
# Python 3.11. 3.10 and 3.12 were both tried and failed, and requirements.txt
# needed edits to resolve on arm64 — the lock is the reproducible artifact.
if ! conda env list | grep -q "^$ENV_NAME "; then
  conda env create -n "$ENV_NAME" -f "$HERE/env-lock.yml"
else
  echo "    exists, skipping"
fi

PY="$(conda run -n "$ENV_NAME" python -c 'import sys; print(sys.executable)')"

cat <<EOF

==> ready
  env     $ENV_NAME
  python  $PY
  repo    $REPO_DIR

INT8 weights are a separate offline step; the published repo is fp16, which
peaks ~10GB against a recommended 32GB:

  mlx-forge convert hunyuan3d-2.1 --quantize --bits 8 --output ./models/hunyuan3d-2.1-int8
  export HUNYUAN3D_MLX_WEIGHTS_DIR=<that directory>

Smoke test:
  npm run forge:smoke
EOF
