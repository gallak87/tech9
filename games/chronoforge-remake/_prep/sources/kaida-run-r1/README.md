# Kaida run — r1

**Complete first detailed pass; awaiting user visual review. Not a1.**
Scope is `run.right`: 16 frames × 50 ms, an 800 ms loop on an 896×640
transparent canvas. The origin is fixed at **(400, 590)**. The source has
**20 editable layers / 320 cels**, a `run.right` tag and joint-pivot slices.

- Editable timeline: `animation.aseprite`
- Shared character art: `../kaida-parts/right/parts.aseprite`
- One review GIF: `../../exports/kaida-run-r1/running.gif`
- Build/check receipt: `validation.json`

Idle and game runtime assets are unchanged. This revision is for review;
promotion to a1 and runtime integration require the user's later decision.
Nothing launches automatically. If the source is already open in Aseprite,
reload it from disk after a deliberate rebuild.

## Commands

From `games/chronoforge-remake`, with the pinned local Aseprite built:

```sh
# Usual command: use the saved timeline and preserve any edited cels.
python3 _prep/sources/kaida-run-r1/build.py --review-only

# Deliberately replace the timeline from the saved shared parts and motion.
python3 _prep/sources/kaida-run-r1/build.py --rebuild
```

On a fresh device, run `python3 _prep/tools/aseprite.py setup` first. The
committed source is sufficient for review/export; rebuilding the parts is
optional. A full recipe reconstruction is:

```sh
python3 _prep/sources/kaida-parts/right/build.py --rebuild
python3 _prep/sources/kaida-run-r1/build.py --rebuild
```

These commands use native Aseprite Lua for pixels and Python's standard library
for orchestration. No imagegen calls, API keys, extensions, desktop session or
uncommitted downloads are required after local toolchain setup. The checked-in
pose reference supplies the detailed appearance. Setup/build binaries remain
ignored in `_prep/.local/`.

Both builds protect existing sources unless `--rebuild` or `--review-only` is
explicit. Rebuilds replace cel edits, so save/commit those first. Candidates
are staged and checked before the saved source is replaced. Changing shared
parts does not silently change an existing timeline: rebuild that clip when
ready. Re-exporting cannot recover unsaved editor changes.

## Exact construction sequence

1. **Reference registration** (`a6f13732`): place the approved opposing poses
   on a fixed canvas; mark anatomical hips, knees, ankles, shoulders, elbows,
   wrists, neck and sword grip in `../kaida-run-v3/blocking/`.
2. **Motion scaffold** (`5bea59a5`): animate alternating foot contact/recovery,
   fixed-length bones, hip movement, torso lean and arm swing. Six stance
   frames per foot and four flight frames distinguish this from a walk.
3. **Body-volume proof** (`1100d221`, then `5fbafe25`): review silhouette and
   attachment before detailed art. Make hand and sword share a grip/rotation;
   the blade points up at both mid-run passing poses. Lift the pelvis and
   upper body **35.25 px** (15% of the original pelvis-to-ground height), with
   horizontal foot travel scaled to 94% to retain the 145/145 px leg lengths.
   The user authorized the detailed pass from this higher-hips version.
4. **Shared detailed parts** (`71ac3480`): trace the approved full-stride reference into
   20 individually owned layers using Aseprite Lua. Clean each isolation and
   reconstruct hidden joints, jacket shoulder, cloth attachment and sword
   handle. Separate knee armor from shins. See
   [the part-authoring record](../kaida-parts/right/README.md).
5. **Detailed timeline**: `render.lua` maps the saved parts onto the approved
   motion, then bakes ordinary editable Aseprite cels. The same artwork appears
   in every frame; no individually generated animation frames or crossfaded
   whole poses are used. Knee plates rotate with thighs. The weapon and right
   glove use the same socket/angle. Tails have a small delayed sway.
6. **Boot contact correction**: measure the actual transformed boot's bottom
   pixels, place it on the intended ground/lift track, and solve the knee
   again using the unchanged 145/145 px bones. Hip position and horizontal
   foot travel stay fixed. `art-poses.json` records those final leg joints.
7. **Saved-pixel review/export**: reopen the timeline, check every part and
   joint, inspect all phases and layer isolations, and export through the
   existing fixed-cell PNG/JSON workflow. Internal contact sheets, isolated
   parts, frames and the atlas stay in ignored `exports/`; deliver one GIF.

## Sampling and fidelity

This is high-color painted sprite artwork. Source textures use a single
premultiplied-alpha bilinear transform into the final cels, avoiding accumulated
resampling across frames. The silhouette proof's nearest-neighbor flat colors
would not preserve this reference's shading. Original face, armor engraving,
fabric, hair and blade detail are retained; reconstructed hidden areas are
simpler. The recipe removes any isolated resampling islands of at most four
pixels and rejects a larger detached component; the receipt records removals.

The GIF uses one 256-color palette derived from the **entire** loop, no dithering,
and a fixed dark background/ground line. Source cels and PNG exports retain
full RGBA. The GIF is reopened and compared pixel-for-pixel with its quantized
preview; it is not falsely claimed to equal the original high-color RGBA.

## Checks

`build.py` runs all of these against the staged or saved candidate:

- Motion constraints, alternating support, continuous guide samples, preserved
  higher-hips adjustment, constant detailed-leg lengths and grip angles.
- All 320 saved cels present, each with one connected opaque component;
  one connected assembled character per frame; no canvas clipping.
- **256 local pixel-overlap checks** at hips, knees, ankles, shoulders, elbows,
  wrists, neck and grip. These catch detached artwork even if joints agree.
- All **32 actual boot bottoms** match the intended contact/lift track.
- Fixed canvas/origin, `run.right` tag, frame preservation in PNG/JSON export.
- GIF dimensions, 16 frames, timing, infinite loop and exact roundtrip of the
  quantized preview. Quantization error against RGB is recorded separately.

`validation.json` contains source/input/GIF hashes and results. Rich per-cel
reports live beside the local GIF. Numerical checks establish consistency,
not subjective animation approval; r1 still needs the user's visual review.

Verified on macOS arm64 with the pinned local build: 23 workshop tests and
8 motion tests passed. Both no-flag overwrite guards refused existing sources.
Review-only export preserved both `.aseprite` files and reproduced identical
GIF and PNG/JSON bytes. Other supported hosts can rebuild the pinned toolchain;
this art checkpoint has not been executed on those hosts.

## What can be reused

The separate character parts, pivots, contact solver, validators and export
pipeline can support later right-facing actions. Walk/attacks need their own
motion and often replacement drawings for changed perspective/foreshortening.
This r1 is a planar cutout animation, with limited torso/head turning and modest
cloth follow-through. It is not a universal rig, and it does not establish the
quality of left/up/down views or other characters. Author those after reviewing
this benchmark. Do not revive the rejected full-set or scripted v2 artwork.
