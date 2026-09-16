# Kaida run v3: detailed pose references

**Status: reference checkpoint, not an animation or layered rig.**
The user approved `full-stride-reference.png` (the new single running pose),
then requested the opposite stride: left leg and right sword arm forward,
with the sword tilted up. The user also approved the corrected `opposite-stride-reference.png`.
Both approvals concern the pose references; the layered animation has not been
authored or approved. Idle and game assets are untouched.

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

## Next authoring stage

- Fix one canvas, scale, pelvis origin and ground line for both key poses.
- Reconcile costume details and validate anatomical limb identity/occlusion.
- Author named parts one at a time in Aseprite, including hidden joint surfaces.
  Inspect each part alone and the composite with that part hidden; avoid the
  earlier idle rig's problem of neighboring body fragments left in cutouts.
- Keep near/far limb identity stable; sword stays attached to the right hand.
  Use appropriate alternate drawings where perspective changes, rather than
  stretching the flattened reference to cover missing anatomy.
- Add one mid-run passing reference for each leg: one supporting leg and the
  other knee recovering under the pelvis. Together with the two extremes these
  make four key poses, not a complete animation. Then author contact/compression
  and intermediate cels; check
  both legs' contacts, hips, grip and hair/tail follow-through across a loop.
- Review one running GIF. Do not integrate world or ATB assets before approval.

This stage has not yet produced `.aseprite` layers, cels, a rig or a GIF.
Leave the idle alone and do not automatically launch the editor.

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
