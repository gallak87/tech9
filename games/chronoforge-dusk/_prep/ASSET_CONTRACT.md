# Runtime asset handoff — format 1

**Runtime format 1** supports rigid diagnostic fixtures, static props and skinned characters with embedded role clips and separate equipment. [Kaida a1](../releases/kaida-a1.md) is the current playable release. The game owns this contract and [the loader](../game/assets/asset_assembly.gd); production recipes consume it.

## Delivering a prepared candidate

Keep immutable downloads, FBX, Blender sources, recipes and current prepared packages under `_prep/`. Deliver only selected runtime files under `game/assets/<asset-id>/<revision>/`, then add the descriptor's `res://` path to [content/candidates.json](../game/content/candidates.json). Run Godot's normal import before launching or exporting. There is no file upload service, runtime GLTFDocument importer, or provider adapter.

A candidate is an immutable descriptor plus GLB dependencies during a comparison. Changed bytes require a new working identity. At graduation, the current source, package and runtime use one alpha identity; superseded working copies are removed after the release is committed. Original inputs and current editable sources stay in the checkout; Git retains prior iterations. Import success makes an asset inspectable, not visually accepted.

**Current release: [Kaida a1](../releases/kaida-a1.md).** The stable model generation is r2. Source, prepared package, runtime descriptor and saved selections use a1. The release manifest pins the actual model and equipment hashes. There is no separate live intermediate-export identity.

See the complete working example: [mannequin-slate-r1.json](../game/assets/fixtures/mannequin-slate-r1.json). Its generating source is [fixtures/generate.py](fixtures/generate.py). All its animation is diagnostic rigid motion, not Kaida animation.

```json
{
  "format": 1,
  "asset_id": "diagnostic.mannequin",
  "revision": "slate-r1",
  "label": "Diagnostic mannequin / slate-r1",
  "kind": "character",
  "animation_mode": "rigid",
  "placeholder": true,
  "model": {"path": "res://assets/fixtures/mannequin-slate-r1.glb", "sha256": "<64 lowercase hex digits; see working example>"},
  "dimensions": {"height_m": 1.85, "radius_m": 0.34, "forward": "-Z", "up": "+Y", "origin": "ground"},
  "clips": {
    "idle": {"file": "res://assets/fixtures/mannequin-slate-r1.glb", "name": "idle", "loop": true}
  },
  "attachments": [],
  "motion": {"traversal": "controller", "action": "controller", "clips": "in_place"}
}
```

The abbreviated example above illustrates field shapes. A character requires **idle, walk, run, attack and hurt** roles, as in the linked complete descriptor.

## Exact runtime requirements

| Field | Current meaning |
| --- | --- |
| `format` | Integer `1`; reject unsupported versions. No compatibility adapter. |
| `asset_id`, `revision`, `label` | Nonempty identity and human-readable label. Use immutable revision paths. |
| `kind` | `character` or `prop`. The development character selector currently expects characters. |
| `animation_mode` | `none`, `rigid` or `skeletal`. Static assets have no clips. Skeletal declarations require an imported Skeleton3D, but deformation must be inspected in the native game. |
| `placeholder` | `true` for diagnostic assets; displays an explicit NOT KAIDA notice. Omitted/false means a candidate awaiting visual acceptance, never automatic acceptance. |
| `model` | `{path, sha256}` for a prepared GLB under `res://assets/`. SHA-256 covers original GLB bytes, including embedded resources. |
| `dimensions` | Metres; `+Y` up, `-Z` forward, feet/placement pivot at ground origin. Height is 0.1–20 m; collider radius 0.05–5 m. These are validity bounds, not production budgets. Imported visual dimensions/facing still need in-game inspection. |
| `clips` | Gameplay role → `{file, name, loop}`. **Format 1 requires all clips embedded in the model GLB.** `file` must equal `model.path`; `name` is the exact imported AnimationPlayer name. Assemble/retarget upstream before delivery. Separate animation libraries can be added after a concrete need; they are not silently supported now. |
| `attachments` | Array of `{id, model, socket_path, position_m, rotation_degrees}`. `model` is a separate GLB reference with its own hash. The node path is relative to the imported scene root. Transforms are three numeric components. The working grip is `Fixture/Torso/RightArm/Grip`. |
| skeletal attachment alternative | Replace `socket_path` with `skeleton_path` and `bone`; the loader creates a BoneAttachment3D. Path and bone must exist. Review the first skeletal fixture with the game lane in 02; matching names alone do not prove a useful rest pose or grip. |
| `motion` | Characters require `{traversal: controller, action: controller, clips: in_place}`. The actor/controller owns traversal and facing. The rehearsal component owns battle approach/return. |

Embed materials and textures in GLB. Production provenance should record material/color-space assignments, geometry/texture counts, exporter settings, rig/rest pose and clip durations. Those are producer facts and visual validation inputs, not additional runtime provider fields in format 1. Do not apply Blender-to-glTF axis conversion a second time in Godot.

The game defaults `gltf/embedded_image_handling` to `3` so embedded image bytes remain losslessly embedded in the imported scene, rather than becoming independently editable PNG dependencies outside the GLB hash. Existing `.import` overrides remain game-owned and need explicit review when changing this policy. [Godot 4.6 image handling](https://docs.godotengine.org/en/4.6/classes/class_gltfstate.html#enum-gltfstate-handlebinaryimagemode).

The loader validates identity, hashes, field shapes, bounds, motion policy, named clips and attachment references. It does **not** prove weight quality, rest pose compatibility, actual in-place motion, material correctness or measured visual bounds. 02 must supply evidence for those with its first skeletal model and static prop. Current import settings generate no visual-mesh collision; Godot-owned CapsuleShape3D and the authored patch own physics.

## Import, runtime ownership and errors

Godot imports GLB to PackedScene/AnimationPlayer normally. The game instantiates that scene under its CharacterBody3D, resolves attachments and duplicates animation libraries per instance before applying declared loops. It does not edit generated imported scenes. Source GLB bytes are retained in native exports by the small `source_hashes` EditorExportPlugin solely to verify identity; the runtime still loads Godot's imported scene. This duplicates the selected source bytes in the bundle and can be revisited when production sizes justify a build-time hash manifest.

There is one impact authority: `game/gameplay/rehearsal.gd`. The rehearsal manually advances the imported attack and emits one `impact(action_id)` at the saved clip fraction, then freezes both actors for the saved hit-stop duration. It starts the target’s hurt or basic defeat presentation and signals bounded sound/effects. Approach, planting, recovery and return remain controller-owned. Active actions snapshot contact/tempo/hit-stop tuning at trigger, so editing controls applies to the next replay. Clip method tracks do not deliver gameplay effects. Rehearsal contains no damage, rewards, ATB or target selection rules.

A failed candidate produces an explicit IMPORT FAILED message. An already loaded actor remains visible with its **previous identity**; startup failure leaves no successful actor. No failed Kaida load is reported as a successful fixture load. Removed clips, sockets and changed accepted hashes are errors, not implicit substitutions.

## Accepted tuning

F6 / **Save candidate + tuning** records the selected descriptor, asset revision, model hash, game build revision, timestamp, game source digest, camera, lighting, traversal, stride calibration, attack tempo and contact/hit-stop settings in `user://accepted_tuning.json`. Writes use a temporary file then rename; the preceding record is retained as `.previous`. F7 restores the accepted pair; a cold launch restores it automatically. Unsaved changes are labeled. An accepted file whose candidate has disappeared or whose model hash changed reports an error.

This saves **candidate gameplay tuning**, not the owner’s visual/motion acceptance of Kaida. Format-1 saves from 01 receive defaults for the added 03 controls while retaining their previous values. Real asset acceptance must pair its revision with the game revision, these settings and visual/motion/performance evidence described in [VALIDATION.md](../VALIDATION.md). Reimport must preserve game-owned scripts/settings. Do not replace a running comparison's assets in place.
