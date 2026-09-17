# Kaida run v3: detailed pose references

**Status: the detailed [run r1](../kaida-run-r1/README.md) has a hip attachment
correction after its first review and awaits review again. a1 is unapproved.** This directory preserves the approved
reference images and the [motion construction stages](blocking/README.md).
[progress.json](progress.json) records the five checkpoints.

The user approved the new single full-stride image, then the corrected opposite
stride (left leg/right sword arm forward, blade tilted up). The wrist correction
and higher-hips motion were carried into the detailed pass. Shared character art
now lives in [kaida-parts/right](../kaida-parts/right/README.md); the editable
16-frame detailed animation lives in [kaida-run-r1](../kaida-run-r1/README.md).
Idle and runtime assets remain untouched.

## Saved inputs and outputs

| File | Role / limits |
| --- | --- |
| `standing-reference.png` | Initial open standing study. Its checkerboard is baked into opaque pixels; it is not an alpha cutout. |
| `full-stride-reference.png` | User-approved right-leg-leading pose, sword arm trailing. Primary appearance/pose reference for this study. |
| `opposite-stride-reference.png` | User-approved opposing pose: near right thigh overlaps in front while extending backward; far left leg leads, right sword arm forward/up. |
| `motion-guides/screenshot-stride.png` | Exact-pixel crop of the user's earlier screenshot. The original sword tip was already clipped at the left edge. |
| `motion-guides/screenshot-recovery.png` | Exact-pixel crop of the screenshot's second running pose. |
| `prompts.json`, `*-prompt.txt` | Built-in imagegen prompts and roles. No external API key was used. |
| `references.json` | Image hashes, provenance, and review status. |
| `crop-guides.lua` | Aseprite Lua crop recipe; excludes neighboring figures without resizing or repainting. |

The two running generations have opaque dark backgrounds. Cropped screenshots
retain their charcoal background inside the crop, with transparency only outside
the selection. None is a production-ready transparent sprite or separated part.

## Process so far

1. Use the repaired idle export and original design illustration for character
   identity. The user explicitly authorized imagegen pose references to retain
   the painted detail that the simplified scripted v2 did not preserve.
2. Generate a standing study, then a full-stride reference using the idle,
   standing study, and user's existing run screenshot. The user explicitly
   approved the **new single full-stride image**, not the old screenshot.
3. Crop the two original screenshot poses with Aseprite for additional motion
   guides. Keep their source at `../kaida-run-v2/reference-running.png`.
4. Generate the opposite stride from the approved full-stride reference.
   The first attempt moved the sword arm but repeated the leg arrangement;
   reject that attempt as an opposite stride. A targeted lower-body edit
   changed thigh overlap and moved the near thigh's straps to the rear leg.
   The exact initial and correction prompts are saved alongside the result.

The approved opposite pose still has costume drift, including extra thigh buckles,
and changes in shoulder/torso perspective. These need reconciliation against
the approved design before becoming animation cels. Matching two poses does not
establish a seamless loop. The generators are nondeterministic; the committed
image files, rather than rerunning prompts, preserve these exact outputs.

## Completed authoring stage

The subsequent process is documented in the [r1 authoring record](../kaida-run-r1/README.md):
registered references → skeleton → body volumes → isolated detailed parts →
validated detailed timeline. The detailed parts use one approved reference to
avoid costume drift between independently generated poses. Passing poses come
from the approved motion scaffold; no additional generated passing references
or generated animation frames were used.

Re-export the current saved animation without rebuilding it:

```sh
python3 _prep/sources/kaida-run-r1/build.py --review-only
```

Review one running GIF. Do not integrate world or ATB assets, expand movements,
or assign a1 before the user's review. Leave idle alone and never automatically
launch the editor.

## Reproduce the screenshot crops

From `games/chronoforge-remake`, after local Aseprite setup:

```sh
python3 _prep/tools/aseprite.py run -- --batch \
  --script-param root="$PWD" \
  --script-param output="$PWD/_prep/sources/kaida-run-v3/motion-guides" \
  --script _prep/sources/kaida-run-v3/crop-guides.lua
```

This replaces only the two derived guide PNGs. Visual inspection confirmed
neighboring figure fragments are excluded and the retained source poses are
intact, apart from the first sword tip already missing in the original.
