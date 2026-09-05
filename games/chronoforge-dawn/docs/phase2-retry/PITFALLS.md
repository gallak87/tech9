# Pitfalls

Every entry here cost an hour or more to find. Read before debugging.

Each is stated as **what is true** and **how it bites**, not as a story.

---

# Blender

## `armature_apply` does not move a single vertex

It makes the current pose the rest pose and rewrites the bind matrices. The mesh
stays exactly where it was.

**How it bites:** the file comes out internally consistent and wrong. Every bone
reads 0° from −Y, `jointWorld × IBM` is identity to 0.0000 m, every structural
check passes — and the character renders with her arms straight out.

**What to do:** bake the posed deformation into the mesh first, by applying a
*copy* of the armature modifier. The original modifier stays, so the mesh is
still skinned when the rest changes underneath it. `canonicalise.py` does this.

## `read_factory_settings(use_empty=True)` does not leave an empty scene

Blender 5.1's startup scene holds an Icosphere, and the call is **deferred** — the
object materialises during the *next* import, so it lands inside any
before/after diff of `bpy.data.objects`.

**How it bites:** the stray object is measured as part of the character. It made
a 1.72 m character measure 4.4 m and scale to 62% of its correct size.

**What to do:** purge `bpy.data.objects` directly, and define the character as
*the armature plus the meshes that armature skins* rather than by scene
membership. An unskinned mesh is not the character, whatever put it there.

## glTF is Y-up, Blender is Z-up

`spec_dir()` in `canonicalise.py` is the only place that conversion lives. Keep
it that way.

**How it bites:** aligning bones to spec offsets while working in Blender space
puts every limb exactly 90° out.

## Blender 5.x actions have no `.fcurves`

Slotted actions replaced the old API. `action.fcurves.new(...)` raises
`AttributeError`.

**What to do:** use `pose_bone.keyframe_insert(...)`, which works across versions.

## `bpy.ops.transform.resize` needs a 3D-view context

Headless Blender has none.

**What to do:** set `object.scale` directly, then `transform_apply`.

---

# glTF

## A skinned mesh's POSITION accessor is in bind space

Its vertices are placed by the joint matrices, not by the mesh node's transform.

**How it bites:** applying the node transform to the accessor bounds counts it
twice and reports a height that is wrong by that transform.

**What to do:** the contract requires the file be exported in its bind pose, so
bind space *is* scene space and the accessor bounds are already correct. Use them
directly for skinned meshes; use the node transform only for unskinned ones.

## Real rigs carry more joints than the spec

Mixamo ships three spine bones where the spec has two, so something **must** sit
between two spec joints.

**How it bites:** a contract requiring a spec joint's spec parent to be its
*direct* parent rejects a stock Mixamo rig.

**What to do:** require **ancestry**, not parentage. The engine composes through
whatever is in between.

---

# The engine

## The spec declares joints as offsets with no rest rotations

`docs/specs/rig.mjs` gives positions only, which implies every joint's rest
rotation is identity. That is true for the code-built rig and **false for every
real one** — a Blender bone points along its own local +Y, so a limb hanging
downward carries a 180° rest rotation that survives export.

**How it bites:** a write path that assumes identity inverts every limb the
moment a clip is applied. Bind looks perfect; motion is upside down.

**What to do:** the retarget solves `W(b) = q · B(b)`, composing the clip onto
the bind the mesh is actually skinned to. With `B(b)` identity it reduces to the
naive form, so the code-built character is unaffected.

## Do not reintroduce a per-asset bind mode

An earlier design carried `absolute` and `additive` and chose between them per
asset. That branching is what this rebuild exists to delete. There is one
formula and it is the general case.

## The forge branch is asynchronous and falls back silently

A missing, unrigged or unmappable glb leaves the code-built character standing
rather than a hole in the scene — by design.

**How it bites:** a screenshot taken too early and a screenshot taken after a
silent failure look identical.

**What to do:** use `tools/ingame.mjs`. It polls for the glb rather than sleeping,
echoes every `[forge]` console line, and exits non-zero if the glb never reached
the screen. `tools/shot.mjs` is the look-dev harness and cannot tell you this —
it drives its own camera presets and its `--js` hook does not return values.

---

# Testing

## Measuring bones does not tell you what renders

Bones and skin are separate. A character whose skeleton is perfect can render in
the rigger's original pose.

**How it bites:** the probe reported 33/33 on a character whose arms were
visibly out, twice, and both times a screenshot found what the numbers missed.

**What to do:** compare the mesh's own extents against the skeleton. The probe's
`the skin follows the skeleton` check does this — mesh width versus hand span,
which holds for any character.

## An absolute angle cannot judge a pose

`cast` legitimately puts an arm overhead. No fixed threshold separates that from
an inversion.

**What to do:** compare against the code-built character posed identically. The
clips were hand-authored against it, so it is the ground truth.

## Compare segment directions, not world quaternions

Two rigs can point a bone the same way with a different roll about its own axis.
Roll is a rigging convention, not a pose difference.

## Derive checks from the spec, not from names

A hand-picked list of four limb bones passed a character whose arms were held
straight out, because the shoulders that moved them were not in the list.

`hips→upperLeg` is `[0.10, -0.02, 0]` — hip **width** — so demanding it point
downward fails a correct rig. Derive "hangs" from each segment's own offset.

## Verify the thing, not a proxy for it

Judging texture embedding by comparing file sizes concluded the textures were
missing when they were present, and the "fix" relinked an image to the wrong file
on disk.

**What to do:** re-import the output and inspect it.

---

# Hosted tools

## Mixamo's error text is generic — read the console instead

*"Sorry, unable to map your existing skeleton"* is shown for **any** upload
failure, including ones that have nothing to do with skeletons. The browser
console carries the real cause:

```
ERROR occured on generating verlod assets(veroldamo):
Response error from veroldamo: Internal Server Error
```

`veroldamo` is Mixamo's backend (Adobe acquired Verold). An `Internal Server
Error` there is **their** failure, not a verdict on your file.

**How it bites:** an afternoon spent proving a clean file is clean. The FBX had
no armature at all — nothing to map — and the message still said that.

**What to do:** open the console before concluding anything about the file.
Verify the file separately with `tools/inspect-fbx.py`; if it reports
`armatures = 0` and one mesh, the file is a valid auto-rigger input and the
failure is upstream of you. Then retry — server errors are often transient.

When Mixamo does ask whether your character already has a skeleton, answer
**no**. Download **FBX Binary**, **T-pose**, **no animation**.

## Mixamo rejects uploads carrying full-size textures

Measured: two files, both 24,000 tris, differing only in whether the textures
were embedded.

| | size | result |
|---|---|---|
| textured, 4× 2048² maps | 5.7 MB | rejected, backend 500 |
| geometry only | 0.9 MB | **accepted** |

It is not the poly count. It is the textures.

**What to do:** upload geometry only, and carry the textures *around* the round
trip rather than through it. `tools/extract-textures.py` writes them out
role-named; `canonicalise --textures <dir>` puts them back. UVs survive rigging
untouched, so the maps land correctly.

```bash
npm run retry:prep-mixamo -- --strip-textures 1
```

## Reconstruction and rigging want different poses

Mixamo asks for a T-pose with fingers spread. Mesh generation wants an A-pose at
45°, because arms flat at the sides merge with the torso and reconstruct as a
single mass.

One image cannot satisfy both. The A-pose mesh does rig — it is not a blocker —
but if rigging quality is the limit, generating a separate T-pose reference for
the rigging mesh is the lever, not better marker placement.

## Mixamo has no public API

Adobe never published one. There is an internal `mixamo.com/api/v1/` visible in
the browser console, but it is undocumented, needs an Adobe auth token, and
changes without notice. Mixamo is a probe, not a destination.

## Mixamo does not follow external texture paths

Adobe's note: *"make sure embed media is turned on for FBX files to upload your
textures."*

**What to do:** `npm run retry:prep-mixamo`. It verifies embedding by
enumerating the image data and refuses if anything is loose.

## Meshy already embeds its textures

Blender unpacks them to a `.fbm/` sidecar on import and re-embeds on export, so
input and output file sizes match. That is not evidence of failure.

## Mixamo cannot be automated

No public API. It is a probe, not a destination — see the **Tool options** table in `README.md`.

---

# Machine

CUDA-only rigging tools do not run here. This is an M1 Pro with 16 GB unified
memory and no NVIDIA GPU; UniRig needs 8 GB VRAM and SkinTokens needs 14 GB plus
`flash-attn`. Renting a GPU is off the table.

## Ruled out — do not re-explore

| | Why |
|---|---|
| **UniRig**, **SkinTokens** (upstream) | CUDA only. |
| **`localai-org/skin-tokens.cpp`** | Backends are **CPU and Vulkan — no Metal**. On a Mac, Vulkan means MoltenVK translation, untested here and flaky for GGML backends, so in practice it is CPU. Build docs are titled "Build and install on Linux", no macOS is mentioned anywhere, no macOS CI, 11 commits. GGML *has* a Metal backend, so one could be added — that is a contribution, not an afternoon. |
| **`xocialize/mlx-engine-swift`** (the MLX weights' runtime) | Repo describes itself as **"not ready for use"**. One star. Swift library with **no command-line binary**. Needs macOS 26.2+. `meshRig` appears in a capability list with no implementation detail documented. |

CPU-speed rigging is a non-starter for this project. If a local rigger is
revisited, the thing to look for is a **Metal or MLX backend that actually
exists and has a CLI** — not a port that merely runs.
