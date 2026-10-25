# Optional donor pointers

These are discovery shortcuts, not mandatory architecture or an asset-copy checklist. Inspect actual files and descriptors before reuse.

**Curated Dusk donor:** `/Users/g/code/scratch/chronoforge-dusk-creative/games/chronoforge-dusk`. `_prep/LIVE_ASSETS.json` indexes selected ingredients. Copy only needed dependency closures with provenance, licences, material maps and editable sources. Keep the donor read-only, including the owner's `game/export_presets.cfg`.

- Kaida: `game/assets/kaida/a2/model.glb`; physical descriptors/catalog and `_prep/assets/kaida/sources/a2-physical`.
- Gear: `game/assets/campaign/equipment/`; `prepared_melee.gd` and `melee_profiles.gd` can explain existing mounting/contact choices. Their Godot paths and clocks need adaptation, not wholesale import.
- Motion: selected descriptor clip inputs and retained original Mixamo sources. Inspect skeletons and actual animation contents; a body GLB alone may not include the intended motion.
- Other characters, if later assigned: Vex at `game/assets/vex/local-r1/`, Rune at `game/assets/rune/local-r2/`; grounded-walk transport manifests under `_prep/assets/`. Rune's selected metadata covers hammer/shield/contact, not an archived turn contract.
- Environment meshes, PBR maps and Blender masters are available as ingredients; old Dusk geography and camera contracts are replaceable.
- Optional later references: `_prep/echo_alignment/ui_candidate.patch` is an unverified UI prototype; `game/audio/echo/` and `_prep/audio/render_echo.mjs` contain offline renders of Echo's existing WebAudio, without listening acceptance.

**Main tech9 references:** current `games/chronoforge-echo` supplies visual/game identity; `worldkit` supplies composable scenery; `games/vector-nova` has existing loading, previews, resource management, metrics and local audio tooling. Inspect applicable package instructions and ownership before extracting utilities. A rigid ship cache does not establish safe cloning of animated skeletons.

Dusk's old story, saves, chapter tests, captures and completion estimates do not define the new experiment. No donor cleanup, fallback preservation or fresh model-generation project is required.
