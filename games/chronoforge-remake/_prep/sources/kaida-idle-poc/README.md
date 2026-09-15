# Kaida: reference cutout idle proof of concept

**12 frames · 2.16 seconds · 272×480 canvas · seven editable layers.**

This is a small animation/rigging experiment made from the right-facing view in
[`kaida-reference.png`](../../../sprite-gen/kaida-reference.png). It preserves
the reference's illustrated appearance by extracting and separating its pixels
in Aseprite. It is a **reference-derived cutout**, not a newly drawn pixel-art
character or an accepted game asset. No art-lab candidate was used.

## View the result

From `games/chronoforge-remake`, with the local Aseprite setup available:

```sh
python3 _prep/sources/kaida-idle-poc/build.py --review-only
```

The script validates the saved `.aseprite` documents and writes previews under
`_prep/exports/kaida-idle-poc/`:

- [Animated idle](../../exports/kaida-idle-poc/idle.gif)
- [Rest and full inhale side by side](../../exports/kaida-idle-poc/rest-and-inhale.png)
- [Onion-skin comparison](../../exports/kaida-idle-poc/onion.png): rest in cyan,
  full inhale in pink, middle pose underneath.
- [Rig guides](../../exports/kaida-idle-poc/rig-guides.png): orange pivots, cyan
  parent connections, green fixed origin/ground line.
- [Separated parts](../../exports/kaida-idle-poc/parts.png), in layer order.
- [All 12 frames](../../exports/kaida-idle-poc/contact-sheet.png), four columns,
  read left-to-right then top-to-bottom.
- Transparent `sheet.png`, Aseprite `sheet.json`, source receipt and validation.

The GIF has a dark review background and a ground guide. The source document and
PNG sprite sheet retain transparency. GIF color quantization can differ from
the lossless PNG exports. All preview files are generated locally and ignored.

## What moves

The legs/hips stay fixed. The upper body rises two pixels during an inhale and
settles back down. The head has a very small counter-rotation; the near arm
turns through 0.9 degrees and carries the sword with it. The far arm and lower
coat tails move slightly. Frame 12 returns exactly to frame 1.

```text
legs / hips (fixed)
├─ torso (breathing)
│  ├─ head
│  ├─ far arm
│  └─ near arm
│     └─ sword
└─ coat tails
```

The authored silhouette, face, clothing and weapon are reused across the loop.
The Aseprite rig bakes its transforms into normal, individually editable cels.

## Source and reproduction

| File | Purpose |
| --- | --- |
| `master.aseprite` | Layered, one-frame bind pose |
| `animation.aseprite` | Baked, editable `idle.right` timeline |
| `parts.json` | Approved reference hash, crop, part masks and source-space pivots |
| `rig.json` | Canvas-space pivots, parent hierarchy and 12 explicit pose keys |
| `author.lua` | Reference extraction, matte removal, part masks and hidden overlap |
| `review.lua` | GIF, contact sheet, onion skins and rig/part review exports |
| `verify.lua` | Checks specific to this animation |
| `build.py` | Runs authoring, rig baking, validation and export without desktop UI |

To deliberately reproduce both source documents from the original reference:

```sh
python3 _prep/sources/kaida-idle-poc/build.py --replace
```

**`--replace` overwrites manual edits to both source documents.** It authors and
validates in a temporary folder before copying them into this folder. Keep
manual changes committed or copied first. Without `--replace`, the script
refuses to rebuild over existing documents. Use `--review-only` for saved work.

The input hash is checked before processing. The original reference is an RGB
PNG with a painted checkerboard. Aseprite Lua removes connected matte regions,
including the enclosed hair/arm/leg gaps and the pink-tinted matte around the
blade. The right-facing view is reduced 2:1 once, using alpha-aware area samples.
Every animation frame then uses that same source artwork.

Masks are specified in the original reference's coordinates. The layer stack
handles overlap, and small local clone fills cover otherwise hidden shoulder,
waist and leg areas. The sword has its own layer and follows the near arm.

## Validation and limits

On the local Aseprite build, the proof passes checks for:

- All seven layers present in all 12 frames, with the expected tag and timing.
- Identical leg/hip pixels and rendered boot regions in every frame.
- Exact start/end match and a real two-pixel torso displacement at full inhale.
- Each part's animation pixels use colors present in that part's bind image.
- No part touches the canvas edge; the exporter also checks fixed origin,
  full-size cells, frame count, metadata and PNG dimensions.

Rest/inhale, the full frame sheet, layer separation and onion overlays were
inspected. This has not been wired into the game.

This proves a conservative idle. The hidden surfaces use simple clone fills,
and small edge changes remain a normal cutout/nearest-neighbor limitation.
Larger movements need more precise masks and drawn replacement/overlap pixels.
The legs are intentionally one fixed layer here: a run experiment must split
them and establish a complete alternating gait. Final sprite resolution and
painted-versus-pixel finish remain open for review.
