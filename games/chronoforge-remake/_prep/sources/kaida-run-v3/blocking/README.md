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
