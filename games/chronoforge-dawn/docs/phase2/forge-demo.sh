#!/usr/bin/env bash
# Control run: the port's own demo image through the shape stage.
#
# generate.py's sys.path inserts are relative, so the repo must be the working
# directory. The venv must already be active — this does not activate it, so a
# wrong interpreter fails loudly instead of silently.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$HERE/3d-gen/Hunyuan3D-2.1-mlx"
VENV="$REPO/.venv"

if [ -z "${VIRTUAL_ENV:-}" ]; then
  echo "venv is not activated. Run:" >&2
  echo "  source $VENV/bin/activate" >&2
  exit 1
fi

if [ "$VIRTUAL_ENV" != "$VENV" ]; then
  echo "wrong venv active:" >&2
  echo "  active   $VIRTUAL_ENV" >&2
  echo "  expected $VENV" >&2
  exit 1
fi

mkdir -p "$HERE/out"
cd "$REPO"
exec python generate.py \
  --image assets/demo.png \
  --output "$HERE/out/smoke-demo.glb" \
  --steps 8 \
  --octree-resolution 128
