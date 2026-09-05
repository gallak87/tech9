# ITERATION_MAYBE — import-time rebind

Untested proposal. Nothing here has been run. Delete if it fails, or fold into
`ITERATION.md` if it works.

Alternative to `PLAN-forge.md` Piece 2.3, the per-bone retarget delta. The delta
makes one rig work. This would make every rig work, and moves the correction out
of the engine into `fbx2glb.py`.

---

# The coupling it targets

Clips in `src/actors/poses.js` encode a **rest silhouette**, not just a rest
axis. From that file's own header:

> *"Axis reminder for this rig (character faces +Z, limbs hang along −Y):
> spine +rx = lean forward, arm −rx = swing forward"*

Every value is hand-tuned against arms-down: `p.set('shoulder_L', 0.02 + br*0.03,
0, 0.16)` is a shrug **given an arm hanging along −Y**. Applied to a T-pose bind
it means something else.

This is the only place a code-built assumption is still load-bearing. The two
comparable leaks were both closed by measuring off the asset instead:

| Leak | Closed by |
|---|---|
| Ankle-to-sole baked into `ground.js` | `const sole = a.soleM ?? SOLE` — measured in `measureLegs`, code-built value demoted to a default |
| Bone names assumed | `bones.json` is data; `resolveBoneMap` handles interposed twist bones and sanitised names |
| **Bind silhouette** | **Nothing yet** |

---

# The claim

`docs/specs/rig.mjs` `JOINTS` entries carry `name`, `parent` and `offset`.
**No rest rotations** — every spec bone's rest orientation is identity.

If that holds, a clip's absolute rotation `q(b)` *is* its displacement from rest,
and `bindMode: additive` — `W(b) = W_spec(b)·B(b)` — is already the correct
composition. What remains wrong is not the math. It is that the target rig's
bind puts the arm somewhere else, so identity displacement lands in a T rather
than at the character's sides.

**So the residual is a rest-pose mismatch, not a rotation-space mismatch.**
Fix the rest pose and `additive` should be correct with no engine change.

---

# The proposal

In Blender, at import, before the GLB export in `fbx2glb.py`:

1. Pose the armature into the spec rest — limbs along −Y, facing +Z
2. `bpy.ops.pose.armature_apply()` — Apply Pose as Rest Pose
3. Export as today

Blender recomputes the bind matrices **and** carries the skin with them, so the
vertices end up laid out around the new rest.

---

# Why this is not the thing already rejected

`src/actors/gltf-actor.js` rejects the runtime version, correctly:

> *"Zeroing each bone's rest rotation to match the spec frames and recomputing
> the bind inverses renders correctly at rest and wrong the instant anything
> moves — the vertices are still laid out around the A-posed bones."*

That objection is about three.js, which cannot relayout vertices. Blender can.
Different operation, same goal. **Read that comment before assuming this
duplicates it.**

---

# What is uncertain

| | |
|---|---|
| Apply Pose as Rest Pose fidelity | Historically fussy with multiple meshes, shape keys, and non-uniform scale. The Meshy mesh is single-mesh with no shape keys, which is the easy case. |
| Whether the spec rest is reachable | The target rig must be posable into arms-down without gimbal or twist artefacts. Untested on any rig. |
| Whether `additive` is then exactly right | Rests on the "no rest rotations" reading above. Verify against `gltf-actor.js`'s derivation, do not assume. |
| Interposed bones | The retarget's `pre` term exists for twist bones and armature roots the spec does not have. Rebinding must not invalidate it. |

---

# How to test it, cheaply

**No new mesh and no rigger decision required.** `assets/kaida-not.glb` is a
rigged Mixamo character already on disk.

1. Open `docs/phase2/fbx/kaida-not.fbx` in Blender
2. Pose the arms down to the spec silhouette, Apply Pose as Rest Pose
3. Export GLB, install as a third name — **not** `kaida-not`, so the working
   stand-in survives for comparison
4. Load it and run a clip with arm motion

| Outcome | Reading |
|---|---|
| Animates correctly with `bindMode: additive` | The claim holds. Move the rebind into `fbx2glb.py`. |
| Correct at rest, wrong once moving | The `gltf-actor.js` objection applies to Blender too. Abandon; build Piece 2.3. |
| Skin tears or collapses at the shoulder | Apply-Pose-as-Rest fidelity is the problem, not the theory. Retry on a cleaner rig before abandoning. |

Compare against `shots/additive-*.png`, which hold the current stand-in's output.

---

# What it would unlock

- Piece 2.3 becomes unnecessary. The correction is one Blender operator, not a
  per-bone quaternion solve in the load path.
- `bindMode` could eventually go. Every rig arrives on the same rest.
- **The rigger choice becomes reversible.** `ITERATION.md` §Rig options R1/R2/R3
  differ mainly in what bind they hand back. Normalising the bind at import
  makes that difference stop mattering, so picking one stops being a commitment.

That last point is the reason to try it before choosing a rigger, not after.

---

# What would kill it

- Apply Pose as Rest Pose does not preserve skin weights faithfully enough
- The spec rest is not reachable from an auto-rigger's bind without artefacts
- `additive` turns out not to be exactly correct even on a matched rest, meaning
  the spec's identity rest rotations are not the whole story

Any of those sends the work back to `PLAN-forge.md` Piece 2.3 as written.
