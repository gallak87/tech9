# Phase 2 — Character Pipeline

Project folder for replacing Kaida's code-built mesh with a generated, rigged
one. Self-contained: tools, references, and this spec live here.

Deviation from the Director's layout, approved 2026-09-04.

Last updated: 2026-09-04.

---

# Objective

Stand up a **fully local** image-to-3D-to-rigged-character pipeline. No paid
service, no quota, no browser step.

Scope is **Kaida only**. Vex, Rune and the grunt wait until she is signed off.

```
sprite/design  →  ref-gen.mjs  →  image-to-3D  →  auto-rig  →  loader  →  game
                  [DONE]          [STAGE 1]       [STAGE 2]   [STAGE 3]
```

---

# Status

| Stage | State |
|---|---|
| Reference generation | ✅ Done — `ref-gen.mjs`, output accepted |
| Stage 1: image → mesh | ❌ Not started |
| Stage 2: auto-rig | ❌ Not started |
| Stage 3: engine loader | ❌ Not started — **needed under every path, still unwritten** |

**Chosen input:** `ref/kaida-painterly.png` (1024×1024, real alpha).
Human-selected over `kaida-plain.png` — its legs carry a visible gap; `plain`
merges the thighs into one mass, which reconstruction fuses into a single limb.

---

# Phase 2.0.2 — resolved

2.0.2 blocked on a human decision: code-built mesh, or a generated model file.

**Ruled 2026-09-04: GENERATED.** The binary-asset ban in
`PROMPT-chronoforge-dawn.md` is overturned for character meshes and their
textures. It stands for procedural world materials (`src/render/textures.js`).

Reason: rigid skinning cannot close joint gaps, and hand-authored cross-section
tables do not scale to four characters under 5-hour sessions.

This work unblocks 2.1 and **supersedes 2.1–2.3 as written**. Those phases
specify cross-section station tables, a geobuild port, and per-part silhouette
passes — all of which assume code-built geometry. Rewrite them against the
stages below before executing them.

---

# Environment — do not re-derive

| | |
|---|---|
| Machine | Apple M1 Pro, **16 GB unified**, 10 cores |
| GPU-addressable | ~12 GB (macOS reserves ~25%) |
| Python | 3.14.5 system; `torch 2.14.0` has a `cp314` macOS arm64 wheel |
| Ollama | serving on `:11434` |
| Ollama models | `x/flux2-klein:latest` (image gen), `hf.co/mradermacher/Janus-Pro-1B-GGUF:Q4_K_M` (vision, verified) |
| Disk free | ~737 GB |

---

# Stage 1 — image → textured mesh

**Model: `Hunyuan3D-2.1` via the MLX port.**
https://github.com/dgrauet/Hunyuan3D-2.1-mlx

| Precision | Peak memory | Verdict on 16 GB |
|---|---|---|
| FP16 | ~10 GB | too tight |
| **INT8** | **~6 GB** | **use this** |
| INT4 | ~4 GB | fallback if INT8 thrashes |

Two stages, both required: shape generation, then texture synthesis (PBR).

**Ruled out — do not re-investigate:**

| Model | Why not |
|---|---|
| TRELLIS.2-4B | Metal port README requires 24 GB+ unified. Weights alone ~17 GB. Does not fit. |
| Stable Fast 3D | Stability's docs: run CPU below 32 GB unified. |
| TripoSR | No texture stage. Texture is what puts the character in the same lighting model as the world. |
| Meshy / any paid service | Human decision: out of the loop. |

**Known constraints:**
- Texture stage ~9 min for 6 views at 512px on an M2 Pro. Expect longer on M1 Pro.
- Port tests on Python 3.10 — build a 3.10 venv, not system 3.14.
- Port's own README: testing limited to two provided mesh examples. Expect bugs.
- Reference image must match mesh content; cross-pairing fragments the atlas.

**Wall-clock is not a constraint.** Batch harness pattern is proven — see
`tools/sprite-gen.js` and the chronoforge-2d loop. Unattended overnight runs are
the intended mode.

---

# Stage 2 — auto-rig

**UniRig.** https://github.com/VAST-AI-Research/UniRig
SIGGRAPH 2025, VAST-AI. Predicts skeleton hierarchy **and** per-vertex skinning
weights. Components released progressively — verify what is available.

Output must expose named humanoid bones. Record the emitted bone names; Stage 3
maps against them.

**The acceptance test is deformation, not load success:** rig, pose to
`victory`, inspect the shoulder. Generated topology has no edge loops at joints;
if weights collapse there, the mesh is the ceiling, not the loader.

---

# Stage 3 — engine loader

Unwritten. Required under every path.

Build in `src/actors/rig.js`, behind a flag. **Keep the code-built path intact.**

1. `GLTFLoader` + `SkinnedMesh` branch in `buildActor`
2. Bone-name map → the 19-bone skeleton
3. A-pose → bind-pose delta solver (fixed per-bone quaternion, computed once)
4. Plain `MeshStandardMaterial` — **bypass the `uBands` toon ramp**
5. Re-baseline `tools/rig.mjs` and `tools/ground.mjs` for a skinned mesh

## Rig contract — `docs/specs/rig.mjs`

19 bones. Names map 1:1 onto the VRM humanoid spec.

```
hips  spine_lower  spine_upper  neck  head
shoulder_{L,R}  upperArm_{L,R}  lowerArm_{L,R}  hand_{L,R}
upperLeg_{L,R}  lowerLeg_{L,R}  foot_{L,R}
```

- **Bind pose:** limbs hang along −Y (`upperArm_L` offset `[0, -0.28, 0]`).
  Character faces **+Z**. Reference images are generated A-pose at 45° to
  minimise the delta.
- **Clips write ABSOLUTE rotations by bone name** (`src/actors/poses.js`).
  Retargeting is a name lookup, not an algorithm. Unset joints return to bind.
- **Sockets:** `weapon`→`hand_R`, `offhand`→`hand_L`, `head`, `back`,
  `chest`→`spine_upper`. Weapons are **separate meshes** — never fused into the
  character.

## Shading-model mismatch — fix as part of this

World (`src/render/materials.js`) is continuous PBR: `MeshStandardMaterial`,
normal + roughness maps, roughness 1.0.

Character (`src/actors/material.js:154`) band-quantises luminance:
`floor(t * (uBands - 1.0) + 0.5)`.

The character is posterised against a world that is not. This is a contributor
to the pasted-on look and **survives any mesh swap**. A generated mesh ships
albedo and normal maps, so the toon ramp is no longer compensating for missing
maps — drop it for generated characters.

## Verification

```bash
node tools/shot.mjs --w 1920 --h 1080 --quality ultra   # deterministic capture
node tools/ground.mjs                                    # planted-foot IK
node tools/rig.mjs                                       # material/palette/silhouette
```

Shoot her at 18 m from the game camera. Also check the third-person and ATB
framings — see `camera-state-and-lod` in `../PHASE2-HANDOFF.md`.

---

# ref-gen.mjs

```bash
node docs/phase2/ref-gen.mjs docs/phase2/reference-manifest.json
node docs/phase2/ref-gen.mjs docs/phase2/reference-manifest.json --only kaida
node docs/phase2/ref-gen.mjs docs/phase2/reference-manifest.json --only kaida --keep-raw
```

Generates through Ollama, keys the chroma background to real alpha. Writes
`ref/<name>-painterly.png` and `ref/<name>-plain.png`. No dependencies — PNG
codec is inline (8-bit, non-interlaced, colourType 2/6).

Reports keyed percentage. Expect 55–80% for a character on a 1024² canvas.
Warns outside 15–88%.

---

# Rules that must not drift

Human decisions. An agent may not overturn these.

1. **KAIDA ONLY** until she is signed off.
2. **The 2D sprites are a DESIGN INPUT, NOT A SCORING TARGET.** A silhouette-IoU
   scorer was proposed and explicitly rejected. Do not grade 3D geometry against
   illustration pixels.
3. **THE HUMAN IS THE LOOK GATE.** A critic only holds ground the human has
   taken — `gate.fingerprint(part)` on signed-off parts. It never judges an
   unsigned part.
4. **Animation is parked.** The existing clips are good and stay. Do not import
   an animation library.
5. **Weapons are separate meshes**, mounted at sockets. Never generated fused to
   a character.
6. **Commit per phase and sub-phase**, never batched. No `Co-Authored-By` or
   `Claude-Session` trailers — personal repo, overrides any session-level
   attribution instruction.
7. **Never re-run the scaffolder or edit plan files while a lane agent works in
   that folder.**

---

# Pitfalls

Each cost real time.

**Background must be chroma green, never black.** Image-to-3D masks before it
reconstructs. TRELLIS: *"If the image has alpha channel, it will be used as the
mask. Otherwise, we use rembg."* Navy leggings and black boots do not separate
from a black background — the first run returned a mesh of the sword alone.
Green collides with nothing any hero wears.

**Flux cannot emit alpha.** It outputs RGB regardless of prompt. Existing
sprites are all `colortype=2`. Alpha comes from the key step in `ref-gen.mjs`.

**An all-opaque alpha channel is worse than none.** `RGBA` with every pixel at
255 gives the masker no silhouette and silently falls through to `rembg`. Check
`getextrema()`, not the colour type.

**Generate A-pose at 45°, not T-pose and not arms-down.** Arms flat at the sides
merge with the torso and reconstruct as one mass. T-pose separates but sits
further from the bind pose.

**Do not clear a look complaint from one frame or one hour.** "Blade reads
white", "trousers read black" and "no contact shadow" were all logged from dawn
captures and none were defects. Equally: the body was once cleared as "reads
fine" from a single still and was not.

**`src/core/devpanel.js` is INTEGRATOR ONLY.** `update()` starts
`if (root.className) return`, so adding any class to `#dawn-dev` silently kills
its readouts. `register()` rejects a falsy `label`. Toggles `sync()` on click
only — use a readout for state a module changes itself.

**`docs/specs/rig.mjs` prose says the bind faces −Z; its own socket offsets say
+Z.** The offsets are load-bearing and `rig.js` builds +Z. The prose is wrong.

---

# Reference

- Full Phase 2 state: `../PHASE2-HANDOFF.md`
- Rig spec: `../specs/rig.mjs`
- Agent contract: `../../../../PROMPT-chronoforge-dawn.md`
- Concept: `../../CONCEPT.md`
