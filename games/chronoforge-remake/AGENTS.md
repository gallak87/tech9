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
The current proof is `_prep/sources/kaida-run-v2/README.md`: original pixel
art drawn through Aseprite Lua, with connected joint silhouettes, explicit
contact poses, and saved-pixel checks. Read that process before revising Kaida.
Work on **run.right only** until the user approves it. Deliver only the final
running GIF, not contact sheets or every exported atlas. The agent does the
complete authoring and cleanup; manual user editing is optional.

The earlier `_prep/sources/kaida-full-set/` cutout draft was rejected for offset
legs, weak hips, arm overlap, floating pixels, and standing-pose feet. Its 36
clips are historical, unapproved art. Do not expand or integrate them.

Aseprite has layers/cels and scripting, not a native skeletal animation system.
Use scripted pose guides and redraw coherent pixel clusters into editable cels.
Onion skinning helps inspect adjacent poses; it does not create animation.
Reuse tooling for other characters, but author their anatomy, silhouettes, and
motion individually. Preserve fixed feet/canvas registration and inspect actual
pixels; passing metadata checks alone never establishes art quality.

Commit our scripts, rig JSON, and authored `.aseprite` sources. Never add the
Aseprite checkout, submodules, Skia archives, executables, or local build state
to git. All toolchain material belongs in ignored `_prep/.local/`.
Draft exports belong in ignored `_prep/exports/`; promote finished assets into
`assets/` with their source and runtime mapping in the same checkpoint.
