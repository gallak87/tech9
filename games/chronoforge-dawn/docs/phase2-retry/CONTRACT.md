# The character contract

One skeleton. One bind pose. One way in.

Every character that enters the game satisfies this, whatever produced it. The
pipeline's job is to make that true and to prove it; the engine's job is to
assume it. Nothing in the engine branches on where an asset came from.

---

## Why a canonical skeleton exists at all

The game has **one hand-authored animation library** — 7 clips, 93 posed joint
values in `src/actors/poses.js` — and it must drive **every** character.

Auto-riggers fit a skeleton to the mesh **in whatever pose the mesh was
generated in**. Two characters generated from two references arrive on two
different skeletons in two different rest poses. A shared animation library
cannot drive that.

So the pipeline canonicalises: every rigged character is brought onto the same
skeleton, in the same rest pose, at the same scale, before it reaches the game.

**This is a required stage, not a correction.** It is not compensating for a bad
input — it is the step that makes a shared animation library possible at all. It
would exist no matter which rest pose were chosen as canonical, because no
generator emits the canonical one by chance.

---

## 1. Skeleton

19 joints, names and hierarchy exactly as `docs/specs/rig.mjs` `JOINTS` declares.

```
hips
  spine_lower → spine_upper → neck → head
  spine_upper → shoulder_{L,R} → upperArm → lowerArm → hand
  hips        → upperLeg_{L,R} → lowerLeg → foot
```

An asset may carry extra joints — twist bones, an armature root, fingers, toes.
They are ignored, not removed, and must not sit **between** two spec joints in
the hierarchy. A spec joint's parent in the asset must be its spec parent.

## 2. Rest pose

**Limbs hang along −Y. Character faces +Z.** Joint offsets exactly as `JOINTS`
declares, in metres.

This is the pose an unposed clip returns to, so it is the pose the animation
library is authored against. It is canonical because changing it would mean
re-authoring 30 hand-tuned arm values across 7 clips to buy nothing — a
generated mesh needs canonicalising to *some* rest pose either way.

## 3. Scale and placement

- **1.72 m** crown to sole, matching `HERO_M`.
- Soles at **y = 0**. Not the hips, not the mesh's bounding box centre.
- **+Z is forward.** The character faces +Z in the rest pose.
- Metres. No unit scale left on the armature or the mesh objects.

## 4. Skin

One skinned mesh. One material. Skin weights normalised, at most 4 influences
per vertex.

## 5. Sockets

Not bones. Resolved by the engine from `SOCKETS` in `docs/specs/rig.mjs`, hung
off the joints named there. Weapons are separate meshes and are never fused.

## 6. File

glTF binary (`.glb`). Skinning included, animation excluded — the asset supplies
the skeleton, the game supplies the motion.

**Exported in its bind pose.** Rest and bind are the same pose, so a vertex sits
where its POSITION accessor says it does. Tools may rely on that rather than
resolving joint matrices to find out how tall the character is.

---

## What the engine may assume

Everything above, unconditionally. There is **no** per-asset mode flag, no
fallback path, and no branch on the asset's origin. An asset either satisfies
the contract or it does not load.

Anything that would need the engine to adapt to an asset is a pipeline bug and
gets fixed in the pipeline.
