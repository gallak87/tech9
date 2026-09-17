# Kaida: shared right-view artwork

Step 4 of the run study. `parts.aseprite` is a single-frame, **20-layer**
character source. It is separate from the run timeline so costume corrections
can be reused in later right-facing clips. This is a detailed 2D cutout source,
not a 3D model or a finished multi-direction character.

## Reproduce / inspect

From `games/chronoforge-remake`, after the local Aseprite setup:

```sh
# Inspect and export saved cels; preserves editor changes.
python3 _prep/sources/kaida-parts/right/build.py --review-only

# Deliberately replace the master from the authored recipe.
python3 _prep/sources/kaida-parts/right/build.py --rebuild
```

The scripts never open the editor. Without either flag an existing master is
protected. A rebuild stages and validates its candidate before replacing the
saved source. Native Aseprite Lua performs all raster work; Python only
orchestrates the local executable, files and checks. No image API calls, remote
services or additional Python packages are needed to reproduce this checkpoint.

## How the artwork was built

1. Use `../../kaida-run-v3/full-stride-reference.png` for consistent face,
   costume, colors and surface detail. The approved opposite reference informs
   motion; mixing its different buckles/armor into this master would introduce
   costume changes. Idle remains untouched.
2. Flood only the connected charcoal backdrop, then extract explicitly traced
   ownership polygons from `parts.json`. There is **no leftover-pixel layer**.
3. Extend the hidden joint surfaces with nearby owned colors. `caps` in the
   recipe define those small underlaps. Paint the hidden jacket shoulder panel
   with native polygons; reconstruct the obscured sword handle as one coherent
   grip. `parts-report.json` records the generated underlaps and small discarded
   isolated boundary fragments. These are reconstructed areas, not recovered
   original artwork.
4. Isolate the layers and remove neighboring material: shoulder metal from the
   head/torso, coat from the thigh, thigh/pouch pixels from the tails, and the
   reference's extra pommel from the glove. Deliberate hidden joint overlaps
   remain so articulating a joint does not expose transparency.
5. Separate both knee plates from the shins. The plates follow the thighs in
   animation; rotating them with the calves made folded knees point incorrectly.
6. Save named cels and a `pivot.<part>` slice for every part. Pivots are source
   coordinates, not moving joint tracks. Parts use real alpha, not a checkerboard.

`review.lua` checks one connected opaque component per saved layer and exports
isolated PNGs plus a bind assembly to ignored `exports/kaida-parts/right/`.
Connectivity does not prove correct ownership: the isolated artwork was also
visually inspected. The live run is the stronger test of hidden coverage.

## Editing / reuse

### Hip attachment correction after r1 review

The original `pelvis` mask incorrectly included the proximal right thigh and
its forward-facing trouser folds. The legs could alternate underneath it while
that painted hip still depicted the first stride. A small in-plane pelvis tilt
did not fix this ownership error.

The corrected `pelvis` layer contains the waist belt, pouch and a short central
underlap cloned from clean trouser cloth, with no thigh strap in that bridge.
The visible near seat/hip fabric belongs to `leg.right.thigh` and
articulates from the hip with that thigh. Its actual cloth replaces the earlier
cloned upper cap. The far thigh remains behind it; anatomical near/far identity
does not switch when a different leg leads.

`ownership_checks` explicitly verify three formerly duplicated fabric points:
opaque on the right thigh and transparent on the rigid waist. `fabric_axis`
landmarks follow the painted proximal-thigh direction into the timeline. These
checks target the stuck-hip regression; component/connectivity checks alone
could not catch it. Both stride extremes and both passing poses still require
visual review.
The check was exercised against the committed first-r1 master and rejected it
for leaving stride-specific thigh fabric in the rigid waist.

Edit the saved master in Aseprite, save it, then rebuild a motion timeline.
Changing a mask recipe requires a deliberate parts rebuild. Do not run that
rebuild after manual cel edits unless those edits are preserved elsewhere.

The existing anatomy, palette, joint conventions, export tooling and some
artwork can support right-facing walk/attack studies. Each new action still
needs its own poses and silhouette review, and may require alternate hand,
torso, limb or face drawings. Up/down views need new artwork. Mirroring left
also swaps the asymmetric sword/armor, so it requires a deliberate design
decision. Other characters need their own anatomy and masks.

See [the r1 run](../../kaida-run-r1/README.md) for the motion stage and review.
