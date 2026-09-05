#!/usr/bin/env bash
# Open a glb in Blender to look at it before it goes near the game.
#
#   npm run forge:view                 docs/phase2/out/kaida.glb
#   npm run forge:view -- <path.glb>   anything else
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLB="${1:-$HERE/out/kaida.glb}"
case "$GLB" in /*) ;; *) GLB="$PWD/$GLB" ;; esac

[ -f "$GLB" ] || { echo "no such file: $GLB" >&2; exit 1; }
command -v blender >/dev/null || { echo "blender not found: brew install --cask blender" >&2; exit 1; }

echo "opening $GLB"
exec blender --python-expr "
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='$GLB')
for a in bpy.context.screen.areas:
    if a.type == 'VIEW_3D':
        for r in a.regions:
            if r.type == 'WINDOW':
                with bpy.context.temp_override(area=a, region=r):
                    bpy.ops.view3d.view_all()
"
