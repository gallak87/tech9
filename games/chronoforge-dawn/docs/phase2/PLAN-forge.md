# Plan — character forge

Get a generated, rigged Kaida into the running game, live-reloading when a new
mesh lands on disk.

Status: steps 1-4 built. The pipeline produces a mesh and a rigged character
animates in the game. The retarget delta specified in Piece 2.3 is unbuilt.
Current state lives in `README.md` and `ITERATION.md`; delete this file once
the pipeline works and fold what survives into the README.

---

# Shape

Three pieces. No dev panel work, no HTTP service, no job runner.

| Piece | What |
|---|---|
| `forge.mjs` | CLI. Manifest-driven stages, skip on input hash. Same shape as `ref-gen.mjs`. |
| GLTF loader | `src/actors/rig.js`, behind a flag. Code-built path stays intact. |
| Watch → HMR | Small inline Vite plugin. Watches `assets/*.glb`, pushes a custom event. |

The human runs the CLI by hand, in a terminal, in parallel with agent work in
other lanes. That flow is proven — it is how chronoforge-2d's sprites were made.

## Out of scope — do not build

A dev-panel button driving the pipeline over HTTP, with SSE progress and a
detached job runner. It solves *"trigger a long job from a browser and watch
progress"*, which is not a problem anyone has here: the human runs CLIs and
reads the terminal, and an agent runs Bash. Recorded so it is not re-proposed.

---

# Build order

| | Step | Verifiable by |
|---|---|---|
| 1 | GLTF loader, hand-dropped glb | Human runs the game. **No glb exists yet — see Validation.** |
| 2 | Watch → HMR | Human touches a glb, sees the swap |
| 3 | `forge.mjs` + `mesh` stage | Human runs the CLI |
| 4 | `forge.mjs` + `rig` stage | Human runs the CLI |

Step 1 first, and alone. Generated topology has no edge loops at joints; if
auto-rigged weights collapse at the shoulder, steps 3 and 4 are not worth
building. It is the step that can invalidate everything downstream.

---

# Piece 1 — `forge.mjs`

`docs/phase2/forge.mjs`, driven by `docs/phase2/forge-manifest.json`.

```bash
node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only kaida
node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only kaida --stage mesh
node docs/phase2/forge.mjs docs/phase2/forge-manifest.json --only kaida --force
```

## Stage contract

```js
export default {
  name: 'mesh',
  inputs:  ['ref/kaida-painterly.png'],
  outputs: ['out/kaida.glb'],
  async run(ctx) { ctx.progress(0.4, 'texture pass 3/6'); }
}
```

| Stage | Runs | Duration | Output |
|---|---|---|---|
| `mesh` | Hunyuan3D-2.1-mlx, conda env `hunyuan_mlx` | ~15 min | `out/kaida.glb` |
| `rig` | UniRig, conda env `hunyuan_mlx` | TBD | `out/kaida-rigged.glb` |
| `install` | in-process copy | <1 s | `assets/kaida.glb` + `assets/kaida.bones.json` |

**Stages skip when every output exists and the input hash matches.** Hash =
sha256(input bytes + stage config), stored in `out/.hashes.json`. Without it a
failure in `rig` costs a 15-minute re-mesh on every retry. `--force` overrides.

Python is a spawned binary, not a second language in the codebase —
`tools/sprite-gen.js` already shells out to `sips`. Fail loudly with the
expected path if the venv is missing.

Progress goes to stdout. No streaming protocol.

---

# Piece 2 — GLTF loader

`src/actors/rig.js`, new branch in `buildActor`, selected by a flag. **The
code-built path must keep working** — it is the only character that exists today.

## Rig contract — `docs/specs/rig.mjs`

19 bones, matching the VRM humanoid set 1:1:

```
hips  spine_lower  spine_upper  neck  head
shoulder_{L,R}  upperArm_{L,R}  lowerArm_{L,R}  hand_{L,R}
upperLeg_{L,R}  lowerLeg_{L,R}  foot_{L,R}
```

1. **Bone-name map.** glb bone names → the 19 above. Read the actual names off
   the rigged glb; do not assume a convention. Persist to
   `assets/<name>.bones.json` so the mapping is inspectable and diffable.

2. **Scale normalisation.** Summing the spec's offsets, the rig is **1.72 m**
   crown-to-ground (`0.96 + 0.14 + 0.22 + 0.08 + 0.32`), feet near y=0. A
   generated glb arrives at arbitrary scale. Normalise on load; do not hand-tune.

3. **Bind-pose delta.** References are generated A-pose at 45°. The spec's bind
   hangs limbs along −Y and faces **+Z**. Clips in `poses.js` write **absolute**
   rotations against that bind, so a per-bone correction quaternion must be
   solved once such that an unposed clip reproduces the glb's own bind. Derive
   it; do not eyeball per-bone Euler offsets.

4. **Material.** Plain `MeshStandardMaterial` using the glb's own maps.
   **Bypass the `uBands` toon ramp** at `src/actors/material.js:155` — the world
   is continuous PBR and the character is currently posterised against it. The
   ramp was compensating for having no maps; a generated mesh ships them.

5. **Sockets.** `weapon`→`hand_R`, `offhand`→`hand_L`, `head`, `back`,
   `chest`→`spine_upper`. Weapons stay separate meshes, never fused.

## Known breakage to handle

- `aPart` / `aInk` are attributes the code-built mesh carries. A glb has neither,
  so `?dev=2` Part isolation breaks. Either re-derive from the glb's node/material
  split or disable Part for generated characters and say so in the panel.
- `tools/rig.mjs` palette-histogram bands are baselined against code-built
  geometry and will need re-surveying. **Do not widen a band to make it pass** —
  that deletes the assertion. Re-survey clean values and tighten to ~1.4×.
- `src/actors/ground.js:124` resolves feet as `a.boneByName.get(\`foot_${side}\`)`.
  **`boneByName` is the seam** — populate it from the map and ground IK works
  unchanged.
- `src/actors/ground.js:50` hardcodes `SOLE = 0.08`, ankle-to-sole, *baked into
  the code-built foot's rest pose*. A generated foot will not match it, and the
  error is a constant float or sink at every slope. **Measure ankle-to-sole off
  the loaded glb and feed it in; do not leave the constant.**

---

# Piece 3 — watch → HMR

`vite.config.js` currently exports a plain object. It gains a small inline
plugin.

A runtime-fetched glb is **not in the module graph**, so Vite will not watch it
on its own:

```js
configureServer(server) {
  server.watcher.add(glbGlob);
  server.watcher.on('change', (f) => {
    if (!f.endsWith('.glb')) return;
    server.ws.send({ type: 'custom', event: 'forge:character', data: { file: f } });
  });
}
```

Client listens under `if (import.meta.hot)` — it does not exist in a production
build. On event: dispose the old `SkinnedMesh` and its material, load the new
glb, re-apply map and normalisation. **Dispose properly**; a hot-swap loop that
leaks geometry will exhaust a 16 GB machine.

---

# Constraints

1. **KAIDA ONLY.** Vex, Rune and the grunt wait.
2. **`src/core/devpanel.js` is INTEGRATOR ONLY.** Not edited by this work.
3. **No new runtime dependencies.** `three` is the only one. `GLTFLoader` ships
   inside the three package.
4. **No `Math.random()`** in `src/` or `tools/` — `tools/lintrng.mjs` enforces it.
5. **Commit per step**, never batched. No `Co-Authored-By` or `Claude-Session`
   trailers — personal repo, overrides any session-level attribution instruction.
6. **The 2D sprites are a design input, not a scoring target.** No silhouette-IoU
   scorer.

---

# Validation

**No glb exists yet, and no agent runs generation or the dev server.** The human
runs everything by hand.

Step 1 therefore ships **untested against a real asset**. To make it testable,
also produce:

`docs/phase2/forge-selftest.mjs` — builds a synthetic rigged glb in memory
(19 bones, matching names, deliberately wrong scale and an A-pose bind), writes
it to `out/`, then asserts the loader's map, normalisation and bind delta
recover the expected pose. Node-only, no browser, no network.

That converts "we think the loader works" into a gate the human can run in one
command, before any 15-minute mesh generation exists.

---

# Risks

| Risk | Handling |
|---|---|
| Auto-rigged weights collapse at the shoulder | This is the point of doing step 1 first. Report it as a finding, do not paper over it. |
| Generated glb bone names unknown until one exists | Map is data (`bones.json`), not hardcoded. Selftest covers the mechanism. |
| Memory — 16 GB shared with Vite and Chrome | Dispose on hot-swap. The dev server has already been killed once by memory pressure. |
| UniRig components released progressively | Step 4 last. Mixamo's free auto-rigger is a manual fallback that still feeds `install`. |

---

# Files

```
docs/phase2/forge.mjs                  new
docs/phase2/forge-manifest.json        new
docs/phase2/forge-selftest.mjs         new
docs/phase2/stages/{mesh,rig,install}.mjs  new
src/actors/gltf-actor.js               new — loader, map, normalise, bind delta
src/actors/rig.js                      modified — flagged branch in buildActor
vite.config.js                         modified — inline watch plugin
```
