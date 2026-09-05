#!/usr/bin/env bash
# Import a rigged FBX into the game: convert, register, install.
#
#   bash docs/phase2/rig-import.sh <file.fbx> [name]
#
# name defaults to kaida, which is the character the loader drives. Any other
# name needs ?forge=kaida:<name> to be seen.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME="$(cd "$HERE/../.." && pwd)"

FBX="${1:?usage: rig-import.sh <file.fbx> [name]}"
NAME="${2:-kaida}"
[ -f "$FBX" ] || { echo "no such file: $FBX" >&2; exit 1; }
command -v blender >/dev/null || { echo "blender not found: brew install --cask blender" >&2; exit 1; }

GLB="$HERE/out/$NAME-rigged.glb"
mkdir -p "$HERE/out"

echo "==> 1/3 convert"
blender --background --python "$HERE/fbx2glb.py" -- "$FBX" "$GLB" 2>&1 | grep -E '^\[fbx\]|Error' || true
[ -f "$GLB" ] || { echo "conversion produced nothing" >&2; exit 1; }

echo "==> 2/3 register '$NAME' in the manifest"
NAME="$NAME" python3 - "$HERE/forge-manifest.json" <<'PY'
import copy, json, os, sys
from collections import OrderedDict
path, name = sys.argv[1], os.environ["NAME"]
d = json.load(open(path), object_pairs_hook=OrderedDict)
if any(c["name"] == name for c in d["characters"]):
    print(f"    already present")
else:
    e = copy.deepcopy(d["characters"][0]); e["name"] = name
    d["characters"].append(e)
    open(path, "w").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
    print(f"    added")
PY

echo "==> 3/3 install"
cd "$GAME"
node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only "$NAME" --stage install --force

cat <<EOF

==> done
  assets/$NAME.glb
  assets/$NAME.bones.json     <- check the mapping, then set "reviewed": true

Load with ?play=1&dev=1&forge=$NAME
EOF
