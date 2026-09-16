# Kaida run motion proof

Work toward **r1**, not finished r1 and not alpha/a1. User-approved detailed
references are one folder up. This stage establishes movement before painting.

## Checkpoint 1: reference registration

`reference-study.aseprite` contains both approved poses at one 0.46 scale, with
their pelvis aligned to `[400,355]` on an 896×640 canvas. Ground is y=590.
The original reference pixels remain on a locked layer; anatomical landmarks
are on a separate editable layer. Right/sword limbs are coral, left limbs blue.
The landmarks are hand-identified estimates, not an automatically recovered rig.

We retain the source drawings' pose/volume differences for inspection instead
of stretching them until they falsely appear to match. The motion scaffold
will use consistent limb lengths; detailed part artwork must reconcile the
extra buckles, perspective and costume differences during the art stage.

`design.json` records proportions, source registration and planned motion
settings. `register.lua` creates the editable reference study using Aseprite.
Run from the game directory after local Aseprite setup:

```sh
python3 _prep/tools/aseprite.py run -- --batch \
  --script-param root="$PWD/_prep/sources/kaida-run-v3/blocking" \
  --script-param raster="$PWD/_prep/lua/pixel/raster.lua" \
  --script-param output="$PWD/_prep/sources/kaida-run-v3/blocking/reference-study.aseprite" \
  --script _prep/sources/kaida-run-v3/blocking/register.lua
```

This deliberately replaces the study document from its recipe. It does not
change the references, idle, game sprites, or any other Aseprite source.

## Checkpoint 2: motion scaffold

`skeleton.aseprite` is a 16-frame, 800 ms right-facing run with separate limb,
spine, hip, head and weapon layers. `poses.json` stores every joint and contact;
`motion.py` computes the guides and `draw.lua` draws them through Aseprite.
Bone lengths stay fixed and the hips belong to the rotating pelvis. Right/sword
limbs are coral; left limbs are blue. The full pose references guide extremes,
while landing, passing and recovery drawings establish a viable loop.

Both legs have six stance frames, half a cycle apart, and there are four frames
of flight. During stance the foot moves backward at constant horizontal speed
relative to the fixed body, as required for an in-place run. The boot polygon's
lowest point sets ground contact; rotating feet do not penetrate the floor.
The sword remains attached to the right hand. A first linear arm transition
let the blade approach the floor; bending the elbow during passing corrected it.

```sh
python3 _prep/sources/kaida-run-v3/blocking/build.py --review-only
python3 -m unittest discover -s _prep/sources/kaida-run-v3/blocking -p 'test_*.py'
```

Use `--rebuild` instead of `--review-only` to deliberately replace the scaffold
from the recipe. An existing document is preserved unless that flag is given.
The build verifies fixed bone lengths, alternating stance/flight, floor and
grip constraints, and 256 samples between frames for reachable joints and blade
clearance. Six regression cases include a stuck left leg, a detached thigh,
ground penetration, detached grip and repeated contact timing. Saved source
dimensions/layers/origin are reopened and checked. The exported GIF is reopened
and compared to every rendered source pixel and frame duration; looping is checked.
These checks do not replace visual motion review.

Draft review output: `_prep/exports/kaida-run-v3/skeleton/running.gif`.
