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
  git -C "$REPO_DIR" apply "$HERE/3d-gen-arm.patch"
  echo "    applied 3d-gen-arm.patch"
fi

if [ -d "$VENV" ]; then
  echo "==> .venv exists, leaving it. Delete it yourself to rebuild."
else
  echo "==> uv venv, python 3.12"
  uv venv --python 3.12 "$VENV"
  # Deviations that made the previous environment unreasonable, not repeated:
  # transformers upgraded past its pin, and torch installed (dev-only, for the
  # parity harness). Install requirements only; add nothing by hand.
  uv pip install --python "$VENV/bin/python" -r "$REPO_DIR/requirements.txt"
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
