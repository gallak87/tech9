#!/usr/bin/env bash
# Run the clone's generate.py. All arguments pass straight through.
#
#   bash docs/phase2/forge.sh --image ref/x.png --output out/x.glb --steps 8
#
# --image and --output are resolved relative to docs/phase2/ before the cd,
# because generate.py's sys.path inserts are relative and require the repo as
# the working directory.
#
# The venv must already be active. This does not activate it, so a wrong
# interpreter fails loudly rather than running.
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

args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --image|--output)
      case "$2" in
        /*) path="$2" ;;
        *)  path="$HERE/$2" ;;
      esac
      args+=("$1" "$path"); shift 2 ;;
    *)
      args+=("$1"); shift ;;
  esac
done

mkdir -p "$HERE/out"
cd "$REPO"
exec python generate.py "${args[@]}"
