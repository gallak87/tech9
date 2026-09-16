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
clearance. Eight regression cases include a stuck left leg, a detached thigh,
ground penetration, detached grip, repeated contact timing, independent sword
rotation and a downward blade during passing. Saved source
dimensions/layers/origin are reopened and checked. The exported GIF is reopened
and compared to every rendered source pixel and frame duration; looping is checked.
These checks do not replace visual motion review.

Draft review output: `_prep/exports/kaida-run-v3/skeleton/running.gif`.

## Checkpoint 3: colored body volumes and silhouette

`bodies.aseprite` uses the same joint tracks for ten independently editable
body-part layers plus a hidden joint-guide layer. Each leg keeps its own color
and thigh-band count: **right/coral/two bands**, **left/blue/one band**. The sword
stays in the coral right hand. Torso and pelvis are gray, hair magenta and tails
teal/magenta. These are construction shapes, not Kaida's final art or palette.

`draw-bodies.lua` builds the silhouette around the joints, with shoulder/hip
underlaps, a connected grip, boot silhouettes and simple hair/tail follow-through.
`verify-bodies.lua` reopens the actual saved cels and checks every visible part
and full composite for disconnected pixels, samples opaque paths through all
limbs, checks the saved boot support pixels, and verifies hand/weapon overlap.
Recovery knees may sit below their lifted boots; the checks distinguish that
from a planted foot penetrating the ground. Guides stay hidden in the preview.

### Wrist correction from the user's motion review

The user found that the neutral hand cap did not follow the sword, which pointed
down during the middle phase. The weapon now inherits the hand's angle: forearm
rotation plus a bounded wrist bend (-40° to +15°). The hand is an oriented fist,
with a grip socket 12 pixels along its local axis; the sword uses that same
socket and angle. During both passing poses the blade points forward/up.
The elbow folds before the upper arm moves forward, maintaining floor clearance
without a separate weapon angle track. Skeleton and body sources were rebuilt.

### Higher hips review variant

The user approved the movement and asked to raise the hips approximately 15%
while keeping the forward lean. `pelvis_raise_fraction=0.15` lifts the pelvis
and its attached upper body **35.25 px**: 15% of the original 235 px distance
from reference pelvis to ground. The same torso/hip angles, bob amplitude,
wrist motion, timing and vertical foot tracks are retained. Knees are re-solved
at the higher hip sockets with the same 145 px thigh/shin lengths.

The old forward foot reach becomes 295 px from the raised hip, beyond the
290 px leg length. `stride_scale=0.94` slightly narrows the horizontal foot
track to keep the legs reachable with a bent knee at landing. Foot contact
timing and ground height stay fixed. Both settings are explicit design inputs
so this trial is easy to adjust or revert after the user's comparison.

```sh
python3 _prep/sources/kaida-run-v3/blocking/build.py --stage bodies --review-only
```

Use `--stage bodies --rebuild` only to replace edited cels from the recipe.
If joint tracks change, rebuild both skeleton and body stages. Draft GIF:
`_prep/exports/kaida-run-v3/bodies/running.gif` (896×640, 16×50 ms, looping).
The build checks all 16 saved frames, 4,224 limb-path pixel samples, and the
GIF's complete pixel/timing round trip. No desktop launch is required.

**Review pause before detailed artwork:** judge cadence, leg alternation,
weight/hip movement and the broad sword swing. Face, colors and shading are
deliberately placeholders. After motion review, the remaining stages are clean
detailed parts (including hidden surfaces and alternate views) and full-cycle
cleanup. Only the completed first detailed pass becomes **r1**. **a1** is a
later user-approved graduation; neither label has been applied yet.
