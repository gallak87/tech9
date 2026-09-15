# Kaida — complete movement review draft

**Historical, rejected cutout draft.** The user reported offset legs, weak hip
rotation, arm overlap, debris, and feet inherited from a standing pose. Technical
export checks did not prove visual quality. Do not integrate or expand this
set. The active work is the [single originally drawn run](../kaida-run-v2/README.md).
`npm run sprites:kaida` now targets that proof; commands below explicitly name
this old source for historical reproduction only.

**36 clips / 352 frames**, authored from `sprite-gen/kaida-reference.png` with
local Aseprite scripts. Covers every existing Kaida renderer state in all four
directions. This is a review draft; no runtime assets or game code are replaced.

The artwork is a rigged **illustrated reference cutout**, continuing the idle
proof of concept. It is not a newly drawn pixel-art character. Hair, clothes,
armor and the blade retain the reference's painted details across the timeline.
Large rotations expose some cutout seams and reconstructed cloth; approval of
the movement/style and joint cleanup still belong to the art review.

## Reproduce on another machine

From `games/chronoforge-remake`, after the prerequisites in `_prep/README.md`:

```sh
npm run aseprite:setup
python3 _prep/sources/kaida-full-set/build.py --review-only
```

No desktop launch, image generation service, pip package, or extra graphics
library is needed. Aseprite performs extraction, raster deformation, cel baking,
PNG/JSON export and GIF encoding. Python authors poses and orchestrates the build.
The Aseprite checkout and binaries remain in ignored `_prep/.local/`.

Direct Python equivalent:

```sh
python3 _prep/sources/kaida-full-set/build.py --review-only
```

### Edit and rebuild

- `parts.json`: approved reference hash, foreground masks, anatomical joints,
  view registration and layer order, in reference-image coordinates.
- `master-right.aseprite`, `master-down.aseprite`, `master-up.aseprite`: nine
  editable bind-part layers per reference view. Draw hidden surfaces/refine
  edges here before rebaking.
- `poses.py`: authored motion curves, leg inverse kinematics, depth projection,
  arm counter-swing, combat anticipation/recovery and loop timing.
- `rig.json`: explicit generated poses, parent attachments, foot contacts and
  tag playback rules. Floating-point coordinates are resolved only at raster time.
- `animation.aseprite`: 352 independently editable cel frames on ten named
  layers, including a separate far-side weapon layer for left-facing poses.

```sh
# After drawing on the saved masters or editing rig.json:
python3 _prep/sources/kaida-full-set/build.py --bake-only

# After editing poses.py: regenerate keys, then bake the saved artwork.
python3 _prep/sources/kaida-full-set/poses.py
python3 _prep/sources/kaida-full-set/build.py --bake-only

# After editing masks, or to reproduce everything from the original reference:
python3 _prep/sources/kaida-full-set/build.py --replace

# After editing animation cels manually: retain those edits and export them.
python3 _prep/sources/kaida-full-set/build.py --review-only
```

`--bake-only` deliberately replaces timeline edits. `--replace` deliberately
replaces masters, pose keys and timeline edits. The default refuses existing
source documents. Work is staged and verified before replacing the documents.
The three master views are independent. Left-facing cels derive from the
three-quarter view with a separately keyed far-hand weapon/gesture and changed
layer depth, rather than moving the sword into the other anatomical hand.
Fine asymmetric costume details in that derived turn remain subject to review.

## Animation coverage

Every row has `.right`, `.left`, `.down`, and `.up` tags:

| State | Frames per direction | Frame time | Playback / intent |
| --- | ---: | ---: | --- |
| idle | 12 | 100 ms | Loop; breathing and small settling motion |
| walk | 12 | 80 ms | Loop; alternating stance and passing feet |
| run | 12 | 60 ms | Loop; alternating contacts and two flight poses |
| attack | 10 | 70 ms | Once; windup, slash, follow-through, recover |
| cast | 10 | 90 ms | Once; free-hand charge/release and recover |
| hurt | 6 | 70 ms | Once; recoil and recover |
| defend | 8 | 100 ms | Loop; bent-knee blade guard |
| victory | 10 | 100 ms | Loop; raised blade celebration |
| down | 8 | 110 ms | Once; fall, then hold final pose |

World movement uses the first three rows. ATB uses idle/run and the six action
rows; all four action directions are supplied even though the current battle
renderer mainly needs left/right. `runtime-map.json` records the future adapter
contract for basic attack, all four Kaida skills, linked attacks, guard, damage,
victory and defeat. Dash/leap travel and return positions remain the battle
motion controller's responsibility; they use run/attack poses with its lift.

This atlas is **not compatible with the current six-column row sampler**.
Promotion will need tag/duration sampling, attack phase remapping, the fixed
origin, world distance-driven stride phase, ATB contact timing and scale review.
Do not point the old renderer at this PNG. No integration is part of this draft.

## What the rig does

- Both legs have distinct hip/knee/ankle chains. Side-view two-bone IK solves
  each foot target; neither leg is frozen or copied from the other.
- Each run leg has five contact poses and seven recovery poses, offset by half
  a cycle. Frames 6 and 12 (one-based) have both feet airborne. A 12-frame loop
  lasts 720 ms. Walking includes double support and no flight.
- Shared mesh vertices blend the knee/elbow transitions. Front/back motion
  foreshortens along each leg's lane instead of swinging the knees sideways.
- The head and shoulders follow the torso. The blade pivot follows the keyed
  wrist; coat motion trails the pelvis. Pose transforms reset to the bind each
  frame, so clothing and blade details do not accumulate drift.
- Hidden thigh roots continue behind the pelvis. Pants behind the crossing
  sword are completed from adjacent cloth. This supports the rig, but does not
  invent a full unseen character turnaround.
- Every frame is **384 × 384**, with a full-canvas origin slice at **(192, 328)**.
  Empty border space accommodates the raised blade and fallen silhouette.
  Body height is approximately 216 pixels. Export never trims or rescales cells.

## Review files and verification

Regenerated in ignored `_prep/exports/kaida-full-set/`:

- `running.gif`: the single running preview requested for chat (fixed crop, 2× nearest-pixel enlargement).
- `run.right.gif`: the same cycle on its full native canvas.
- `run-onion.png`: overlaid opposing contact poses.
- `all-movements.png`: labelled sheet with every frame, at half native scale.
- `sheet.png`, `sheet.json`: full-resolution, fixed-cell atlas and metadata.
- `<state>.<direction>.gif` / `.png`: playback and full-resolution contact sheet.
- `validation.json`, `receipt.json`: checks, source/export hashes and draft status.

GIFs use a fixed camera and faint floor line. Non-looping action GIFs briefly
hold their last frame for review before restarting; the native clip durations
and `loop: false` metadata remain authoritative for future runtime playback.

The build reopens the saved Aseprite document and checks all 352 frames: named
parts, durations/tags, fixed origin, opaque canvas margin, and reference-part
color retention. It checks both run-leg cels change through the cycle, explicit
half-cycle contact alternation, foot lift and two flight frames. The generic
workshop exporter then checks the PNG/JSON dimensions and full-cell registration.
These checks protect consistency; visual review determines whether the animation
and cutout style are suitable for the game.
