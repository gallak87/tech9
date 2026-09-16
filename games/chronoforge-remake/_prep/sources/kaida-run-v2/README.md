# Kaida: original Aseprite run proof

**Status: rejected by the user for its appearance. Historical tooling example.**
The current detailed-art study is [Kaida run v3](../kaida-run-v3/README.md).
The old full-set cutout draft was rejected for offset legs, weak pelvis motion,
arm overlap, background debris, and standing-pose feet. This proof draws Kaida
as original pixel art through Aseprite's Lua API. It uses no sampled reference
pixels, cutout masks, imagegen frames, or external image-generation service.

The agent authors and checks the complete result. Manual editing is optional.
The new style deliberately simplifies the painted reference into readable pixel
clusters; whether that simplification suits the game is part of this review.
No world or ATB assets, animation mappings, or game code have been changed.

## Reproduce it on another device

From `games/chronoforge-remake`, install the platform prerequisites in
[the workshop README](../../README.md), then:

```sh
npm run aseprite:setup
npm run sprites:kaida -- --review-only
```

The result to show the user is **only**
`_prep/exports/kaida-run-v2/running.gif`: 576×480, nearest-neighbor 3× display of
a 192×160 canvas, eight 90 ms drawings, a 720 ms indefinite loop. The camera and
ground are fixed. No desktop launch or service account is required.

To recreate the editable timeline from the committed drawing recipe:

```sh
npm run sprites:kaida -- --rebuild
```

`--rebuild` deliberately replaces cel edits in `animation.aseprite`.
`--review-only` preserves the authored timeline. Running without either flag
refuses an existing timeline. Authoring, validation, GIF creation, and repeat
exports happen in a fresh temporary directory before replacing the source.
A failed drawing/check preserves the previous source and review files.

Without Node, use `python3 _prep/sources/kaida-run-v2/build.py --review-only`.
Use `py -3` on Windows. Python's standard library and our pinned local Aseprite
are sufficient. The toolchain remains ignored in `_prep/.local/`.

## What was authored

| File | Purpose |
| --- | --- |
| `animation.aseprite` | Editable RGB source: nine named layers, eight cels per layer, `run.right` tag, fixed `origin`, bind socket slices, and the design palette saved as editor swatches. |
| `design.json` | Canvas, feet origin `[110,144]`, palette, layer order, exact boot outline, limb lengths, timing, gait parameters. |
| `draw.lua` | Kaida's original pixel drawing: connected silhouettes, face/hair clusters, jacket, armor, belts, boots, and sword. Draws every frame in Aseprite. Never opens a reference PNG. |
| `poses.py` / `poses.json` | Reproducible pose generator / saved joint positions and foot-contact tracks. Python does geometry and orchestration, not image editing. |
| `verify.lua` | Character-specific checks of the reopened cels and composite pixels. |
| `build.py` | Guarded author/review commands, motion checks, exports, receipts. |
| `reference-running.png` | User-provided running reference, retained as a visual guide. |
| `references.json` | SHA-256 hashes and intended use of both visual references. |
| `../../lua/pixel/raster.lua` | Shared integer-pixel lines, filled polygons, discs, continuous limb silhouettes, and coordinate transforms. |
| `../../lua/pixel/review.lua` | Shared fixed-camera GIF, diagnostic frames/onion comparison, and GIF round-trip verification. |
| `../../tools/puppet_math.py` | Shared rotations, two-bone inverse kinematics, smooth pose tracks. |

The original `sprite-gen/kaida-reference.png` defines her short magenta hair,
teal cropped jacket, steel armor, dark trousers, belt pouches, and magenta sword.
The user's running reference defines the forward lean, side-facing boots,
trailing sword arm, and pumping free arm. Neither contributes pixels to this
source. There is no background-removal stage and no white fringe to erase.

## Exact authoring and correction process

1. **Choose one view and one action.** Fix the canvas, full-canvas origin,
   palette, proportions, and silhouette before making more clips. This proof
   covers `run.right` only; the former 36-clip draft is not approved art.
2. **Draw the anatomy in motion.** The forward lean is built into shoulder,
   neck, and waist positions. The pelvis turns ±6°, the torso counter-rotates,
   and both hip sockets belong to that moving pelvis. The head follows the
   neck with stable facial pixel clusters to avoid crawling eye/hair details.
3. **Pose feet first.** Each leg spends 32% of its cycle in stance; the other
   leg is half a cycle ahead. The planted foot moves backward relative to the
   in-place character. The recovery foot lifts up to 25 native pixels. Flight
   drawings occur between alternating contacts. The exact rotated boot polygon
   determines the ankle height so the sole/toe touches the same ground line.
4. **Solve and draw connected legs.** Two-bone inverse kinematics locates each
   knee from its hip and ankle, retaining 23/27-pixel bone lengths. Impossible
   reaches fail instead of stretching. Draw the full joint silhouette first,
   then pants, straps, knee plates, greaves, and boots along those guides.
5. **Make occlusion explicit.** The far arm is behind the torso, the near arm
   is in front, and the hand covers the sword grip. The free fist pumps more
   strongly than the trailing sword arm. The belt/pouches rotate with the
   pelvis. Coat tails lag the body. Far limbs use a darker palette.
6. **Inspect poses and correct the drawing recipe.** In this pass we increased
   the free arm's swing, lightened its dark glove for continuity against the
   review background, stabilized face details, and lowered the free fist arc
   after finding it too close to her chin at the top of the swing. We also
   corrected shading polygons to use their fill color at the edge, removing
   accidental dark outlines inside the face and hair. Changes went into `poses.py`
   or `draw.lua`, then all eight cels were redrawn. There is no blind cleanup
   filter that discards small components to make a test pass.
7. **Check actual saved art.** Reopen the Aseprite document and check its pixels,
   contacts, colors, occlusion, timing, tags, canvas, and source registration.
   Export and reopen again. The final GIF must preserve every displayed pixel
   and every frame duration. Repeated atlas PNG/JSON exports must match exactly.
8. **Show one GIF, then wait for art approval.** Contact/onion diagnostics and
   the atlas remain local review aids. Passing checks is not visual approval.
   Keep this proof outside the runtime until the user chooses to use it.

Onion skinning is an overlay of neighboring frames that helps judge arcs and
spacing; it does not generate poses or rig a character. Our diagnostic
`onion.png` overlays the two opposing contact drawings. If using the optional
editor, open the source with the launcher and toggle Aseprite onion skinning
with F3. All authoring/export steps above also work headlessly.

## Verification recorded for this checkpoint

On the existing macOS arm64 Aseprite 1.3.18.5 source build:

- Eight populated frames and all nine layers survive save/reopen. One tag covers
  all frames; every frame retains the full canvas and fixed origin.
- Each leg has three stance drawings and five recovery drawings, half a cycle
  apart. Two drawings have both feet airborne. No double support.
- Hip sockets, leg lengths, and shoulder attachments remain coherent.
- Actual rendered boot support matches the pose's expected height within one
  native pixel. Planted boot bottoms stay at y=144 within that tolerance.
- Every layer and the composed character form one connected opaque component
  per frame. All art colors belong to the declared palette. No alpha fringes
  or pixels on the canvas boundary. These checks are appropriate to this
  character without detached effects, not a universal rule for all art.
- Far-arm pixels overlap under the torso in every frame, with the required
  layer order. The free arm does not intersect the head. This is an overlap safeguard, not an automatic anatomy critique.
- GIF dimensions, all eight timings, all pixels, and indefinite looping are
  checked after encoding. Repeated atlas exports match byte for byte.
- `npm run test:prep` covers the original 14 workshop tests plus nine run
  regressions, including corrupted saved pixels, a lowered planted foot, a
  detached thigh, a stuck leg, and preservation of an existing timeline.

Disposable `_prep/exports/kaida-run-v2/validation.json` records the source,
recipes, reference hashes, per-frame pixel checks, and export/GIF results.
The saved `.aseprite` and script inputs are committed; the GIF and diagnostics
are regenerated. Other operating systems have setup paths but this art pipeline
has only been executed on macOS arm64 here.

## Reuse for another character or creature

Reuse the local setup, raster primitives, coordinate math, guarded build,
registration, GIF review, and verification pattern. Author a **new character
painter and movement plan**: its proportions, facing, silhouettes, joints,
contact sequence, layer order, materials, and follow-through need design work.
A quadruped needs four foot tracks and its own gait; a flying creature needs
wing poses and different contact checks. A snake would use a body curve rather
than this two-leg solver. Start each with one representative animation and
adapt the checks to that anatomy before expanding the set.

For revisions to this proof, edit `draw.lua` for appearance, `design.json` for
palette/limb lengths/boot outline, and `poses.py` for motion, then `--rebuild`.
Changes to body proportions also require matching the anchors in `poses.py` and
the anatomical drawing coordinates in `draw.lua`.
For direct cel edits, save in Aseprite and `--review-only`. If a cel edit changes
a contact pose, also update its guide/check expectations deliberately.

Sprite AI remains an optional external candidate-art tool. This proof neither
installs it nor depends on its API, tokens, or output. See its
[official Aseprite documentation](https://www.sprite-ai.art/docs/aseprite)
for the separate account-backed workflow.
