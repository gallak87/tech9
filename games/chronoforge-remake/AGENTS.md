# Chronoforge remake

Work only in this game. Read `CONTRACT.md` for the runtime boundaries.

## Sprite authoring

New and revised 2D sprites use the local Aseprite workflow in `_prep/README.md`.
Read it before sprite work. Create/edit layered `.aseprite` source files with
Aseprite and its Lua API; use named parts, explicit pivots, tagged timelines,
and fixed canvas/feet registration. Use `_prep/tools/sprites.py` for scaffolding,
rig baking, validation, and PNG/JSON export.

Do not generate sprite sheets, animation strips, or replacement sprite frames
with imagegen. Old `sprite-gen/` prompts and `art-lab/` generation records are
historical references, not current instructions. Existing art can be consulted
for character design; author coherent editable sources for replacements.

The user considers the entire art-lab prompting effort unsuccessful. Do not
treat its candidates as approved art. Kaida's starting design reference is
`sprite-gen/kaida-reference.png`. The first Aseprite experiment is documented in
`_prep/sources/kaida-idle-poc/README.md`; it is a reference cutout rig test.

Aseprite has layers/cels and scripting, not a native skeletal animation system.
Our small Lua cutout rig bakes parented part transforms into editable cels;
finish silhouettes, joints, and motion by hand on the baked timeline.

Commit our scripts, rig JSON, and authored `.aseprite` sources. Never add the
Aseprite checkout, submodules, Skia archives, executables, or local build state
to git. All toolchain material belongs in ignored `_prep/.local/`.
Draft exports belong in ignored `_prep/exports/`; promote finished assets into
`assets/` with their source and runtime mapping in the same checkpoint.
