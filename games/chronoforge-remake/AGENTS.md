# Chronoforge remake

Work only in this game. Read `CONTRACT.md` for the runtime boundaries.

## Sprite authoring

New and revised 2D sprites use the local Aseprite workflow in `_prep/README.md`.
Read it before sprite work. Create/edit layered `.aseprite` source files with
Aseprite and its Lua API; use named parts, explicit pivots, tagged timelines,
and fixed canvas/feet registration. Use `_prep/tools/sprites.py` for scaffolding,
rig baking, validation, and PNG/JSON export.

Do not generate sprite sheets or animation strips with imagegen. The user has
explicitly authorized individual high-fidelity Kaida pose references for the
layered run study in `_prep/sources/kaida-run-v3/README.md`; this is the current
exception. These flattened references are not finished animation or rig layers.
Old `sprite-gen/` prompts and `art-lab/` generation records are
historical references, not current instructions. Existing art can be consulted
for character design; author coherent editable sources for replacements.

The user considers the entire art-lab prompting effort unsuccessful. Do not
treat its candidates as approved art. Kaida's starting design reference is
`sprite-gen/kaida-reference.png`. The first Aseprite experiment is documented in
`_prep/sources/kaida-idle-poc/README.md`; it is a reference cutout rig test.
The original pixel-art run v2 was rejected for its appearance. The reference
study is `_prep/sources/kaida-run-v3/README.md`: preserve the detailed idle's
fidelity, establish opposing run poses, then author and inspect each editable
part before animating. Leave the idle source alone. Do not automatically open
the editor or documents; save changes and tell the user when to reload.
Work on **run.right only** until the user approves it. Deliver only the final
running GIF, not contact sheets or every exported atlas. The agent does the
complete authoring and cleanup; manual user editing is optional.

The current detailed right-facing run is `_prep/sources/kaida-run-r1/README.md`:
**r1 hip attachment corrected after review; awaiting review again; a1 unapproved**. Its separate shared
art is `_prep/sources/kaida-parts/right/parts.aseprite` (20 named parts).
Use the r1 build's `--review-only` to export saved cels. `--rebuild` deliberately
replaces the timeline from shared parts and the approved higher-hips motion.
Keep edited sources safe; character-part rebuild and clip rebuild are separate.
The r1 README records the exact authoring process, pixel checks and limits.
The first r1 was rejected for a fixed forward-stride hip over alternating legs.
The waist layer must not own the proximal-thigh fabric; that fabric articulates
with each thigh. Keep the ownership and visible hip-fabric regression checks.

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
