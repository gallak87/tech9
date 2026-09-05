# phase2-retry — the character pipeline

Reference image → mesh → rig → **canonicalise → install → in the game**.

The last three stages are built and proven. The first two need a tool decision.

```bash
npm run retry:gate                          # prove the pipeline. seconds, no GPU.
npm run retry:probe -- <asset.glb>          # does the engine load and animate it right?
npm run retry:probe -- <asset.glb> --shot   # ...and screenshot it in-game
npm run retry:shot -- --forge kaida --moves # nine states + a contact sheet
npm run retry:ref                           # regenerate reference images (Ollama)
npm run retry:all                           # gate + probe
```

**To see a character: `npm run retry:shot -- --forge <name> --moves`.** It writes
nine PNGs and a contact sheet. Do not hand-compose one.

Play-test: `npm run dev` → `localhost:5190/?play=1&dev=2&forge=kaida`

---

# Current state

| | |
|---|---|
| **Contract** | `CONTRACT.md`, enforced by `contract.mjs`. One skeleton, one bind pose, one way in. |
| **canonicalise** | Any rigged file → the contract. Blender, headless. |
| **install** | Validates, then copies. Refuses anything that violates the contract. |
| **Engine** | Assumes the contract. No bone map, no mode flag, no branch on origin. |
| **probe** | 33 checks. Passes on `assets/kaida.glb`. |
| **gate** | Both rungs pass — a synthetic rig and a real Mixamo one. |
| `assets/kaida.glb` | Installed, renders, animates through all seven clips. |

That character is a **stock Mixamo stand-in** taken through the whole pipeline.
It proves every stage downstream of rigging.

`docs/phase2/` was the previous attempt and has been deleted. What was still
live moved here: the Meshy source mesh to `source/`, its reference images to
`source/ref/`, and the tool comparison to **Tool options** below. Its findings
that still matter are in `PITFALLS.md`.

| Stage | State |
|---|---|
| `reference` — concept → image | built, `npm run retry:ref`. Local, via Ollama. |
| `mesh` — image → static mesh | adapter built, **backend undecided** |
| `rig` — mesh → skeleton + weights | adapter built, **backend undecided** |
| `canonicalise` | built, proven |
| `install` | built, proven |

Backends are manifest config, not code. Choosing a tool is a config change.

---

# What's next

## 1. Rig the real Kaida

The mesh exists — Meshy output at `docs/phase2-retry/source/kaida/`. Prepped
for upload:

```bash
npm run retry:prep-mixamo     # → out/kaida-for-mixamo.fbx
```

One file, 0.9 MB: no armature, one mesh, one UV set, **no textures**, decimated
to 24,000 tris, sitting on the floor.

Textures are stripped because Mixamo rejects uploads carrying full-size maps —
measured, same mesh, 5.7 MB textured rejected and 0.9 MB geometry-only accepted.
They travel around the round trip instead and `canonicalise` puts them back.
`--keep-textures 1` if a service does accept them.

Decimate **before** rigging, never after — reducing a rigged mesh degrades the
skin weights it already carries. 24k is also the right neighbourhood for the
game: the stand-in this pipeline was proven against is 12,609 tris.

Then upload, place markers, rig, and download the **character** — FBX Binary,
T-pose, **no animation**. The contract forbids animation and `canonicalise`
strips it; picking one only makes a bigger file with a step to undo.

Upload to Mixamo, **take the auto-rig path** (see `PITFALLS.md`), download FBX
Binary with no animation, then:

```bash
cp <downloaded.fbx> docs/phase2-retry/out/kaida-rigged.fbx    # .glb works too
npm run retry:map -- docs/phase2-retry/out/kaida-rigged.fbx --out docs/phase2-retry/out/kaida.bones.json
# review every line, set "reviewed": true
node docs/phase2-retry/pipeline.mjs docs/phase2-retry/manifest.json --only kaida --stage canonicalise --force
node docs/phase2-retry/pipeline.mjs docs/phase2-retry/manifest.json --only kaida --stage install --force
npm run retry:probe -- assets/kaida.glb --shot
```

## 2. The question that decides the phase

**Can an auto-rigger handle generated topology?** Everything proven so far
starts from something already rigged. A generated mesh has no clean structure at
the joints, and if the shoulder collapses when the arm moves, the ceiling is the
mesh rather than anything downstream.

Step 1 answers it. `npm run retry:probe --shot` measures it and shows it.

## 3. Wire the chosen backends into the pipeline

`mesh` and `rig` are still adapters that refuse. Both stages are currently done
by hand; wiring them means giving each a `backend` and a `command` in the
manifest. Neither hosted tool has an API worth building on, so this stays manual
until a local option exists.

## 4. Regenerate the references in a T-pose

```bash
npm run retry:ref                      # all characters
npm run retry:ref -- --only kaida      # one
```

Needs Ollama on `:11434`. Writes `ref/<name>-painterly.png` and
`ref/<name>-plain.png`, chroma-keyed to real alpha, plus `--raw` for the unkeyed
render.

**The prompts now ask for a T-pose with fingers spread.** They asked for an
A-pose at 45° because that sat closer to the game's bind pose — a reason that no
longer exists, since `canonicalise` re-poses any incoming rest to the spec. What
is left is what each stage actually wants:

| | |
|---|---|
| Reconstruction | limbs clear of the torso, or it fuses them into the body |
| Auto-riggers | Mixamo asks outright: *"have your character in T-pose and fingers spread apart"* |

A T-pose serves both. The existing Kaida mesh was generated from the A-pose
reference and rigged fine, so this is an improvement rather than a fix —
regenerate when quality is worth a round trip, not before.

## 5. Per-character, when it comes up

- **Height.** In-game measurement can disagree with the file — the stand-in came
  out ~5% short. Cosmetic at that size; the error scales with how far the mesh
  extends past the skeleton, so a character with big hair may be worse. Check
  the probe's `source height` line per character.
- **Poly budget.** `kaida-not` is 12,609 tris. The Meshy mesh is 81,928. Decimate
  **before** rigging, never after.

---

# Tool options

## Mesh

| | |
|---|---|
| **Meshy 6 Lite** — in use | Hosted, free tier. Produced a clean single mesh with a full PBR texture set, first try. Licence for shipped use unverified. |
| Hunyuan3D-2.1-mlx | Local, runs on this machine. ~20 min per attempt, one success and one unattributed failure on record. Not pursued. |

## Rig

| | |
|---|---|
| **Mixamo** — in use | Browser only, no public API. Rejects uploads carrying full-size textures. Free. |
| Meshy's own rigger | Untried. Would avoid the upload round trip and keep textures. Unknown skeleton and bind; check the free tier before spending clicks. |
| UniRig, SkinTokens | CUDA only. **Ruled out for this machine** — see `PITFALLS.md`. |

Both current choices are manual. That is the standing constraint on making the
lane hands-off, and it is a tooling problem rather than a design one — the
pipeline takes whatever either produces.

---

# The idea

`CONTRACT.md` defines exactly one kind of character. The pipeline makes an
arbitrary rigged file satisfy it; the engine assumes it. No per-asset mode flag,
no fallback path, no branch on where an asset came from.

## Why canonicalisation is a stage, not a fix

The game has **one** hand-authored animation library and it must drive every
character. Auto-riggers bind a skeleton to the mesh in whatever pose the mesh was
generated in, so no two characters arrive alike. Canonicalisation is what makes a
shared animation library possible at all — it would exist whichever rest pose
were canonical, because no generator emits one by chance.

## What install does not do

There is no bone map to install. Under the contract a character's joints **are**
the spec's names, so the engine looks them up directly.

---

# The probe

`npm run retry:probe -- <asset.glb>`

Loads a character through the real `src/actors` code and measures the result in
degrees. Node only.

```
--id <name>         character to build              default: the file's basename
--clips a,b,c       clips to check                  default: all seven
--t <n>             time to sample each clip        default: 0.25
--match-max <deg>   divergence from the code-built rig   default: 12
--limb-max <deg>    bind limb deviation             default: 8
--spine-min <y>     minimum hips→head Y             default: 0.9
--json / --quiet
--shot              also capture in-game (needs the dev server)
--shot-port <n>     default 5190
--shot-out <dir>    default shots/probe
```

Exit 0 all pass, 1 any fail, 2 could not run.

What it checks:

| | |
|---|---|
| Structure | 19 joints resolved by spec name |
| Normalisation | no rescaling needed, height is `HERO_M`, ankle-to-sole measured |
| **Skin** | the mesh follows the skeleton — mesh width vs hand span |
| Bind | upright, shoulders across X, every hanging segment along −Y |
| Clips | upright, and **matches the code-built rig posed identically** |
| `--shot` | the forged glb reached the screen; png written |

The clip check compares against the code-built character because the clips were
hand-authored against it. No absolute angle can separate *"cast raises an arm
overhead"* from *"the arm is inverted"*; the authored rig can.

## In-game capture

```bash
npm run retry:shot -- --forge kaida                    # one shot
npm run retry:shot -- --forge kaida --moves            # nine states + contact sheet
npm run retry:shot -- --forge kaida --moves --out shots/x --port 5190
```

Reports whether the glb actually swapped in, echoes every `[forge]` console line,
and prints the live scene graph's bone angles alongside the mesh's own extents —
which is how a skeleton that is correct while the mesh is not gets caught.

`--moves` drives nine states through the game's own **key input** — idle, walk,
sprint, turn-left, strafe-right, attack, cast, victory, hurt — captures each, and
composes them into `<name>-contact-sheet.png`. One image to look at or send.

Driving the game's own input matters: posing the rig from outside would skip
Animator → retarget → skin → screen, which is the exact stack the render defects
lived in. The sheet is built by laying the captures out as HTML and
screenshotting them in the browser that is already open, so it adds no
dependency.

---

# Design rules

1. **One way to do each thing.** No mode flags, no back-compat branches.
2. **Fix causes, not symptoms.**
3. **Refuse rather than guess.** A bone map is `reviewed: false` until a human
   says otherwise, and `canonicalise` will not run on an unreviewed one.
4. **Measure, never assume.** The only constants are the contract's own.
5. **One place per convention.** `spec_dir()` in `canonicalise.py` is the only
   code that knows glTF is Y-up and Blender is Z-up.
6. **The spec is imported, never restated.** Joint names and offsets come from
   `docs/specs/rig.mjs`.
7. **Verify, do not infer.** Check the thing itself, not a proxy for it.

---

# Files

| | |
|---|---|
| `CONTRACT.md` | The contract in prose. Normative. |
| `PITFALLS.md` | **Read before debugging anything.** Traps that cost real time. |
| `contract.mjs` | The contract as checks. Pure Node, sub-second. |
| `pipeline.mjs` | The runner. Manifest-driven stages, hash skip. |
| `manifest.json` | Characters and stage config. |
| `gate.mjs` | Both rungs. |
| `stages/*.mjs` | `mesh`, `rig`, `canonicalise`, `install`. |
| `tools/canonicalise.py` | Blender. Rename, align rest, bake skin, normalise. |
| `tools/suggest-map.mjs` | Proposes a bone map from a rig's own joint names. |
| `tools/check.mjs` | Validate one file. |
| `tools/ingame.mjs` | In-game capture and live measurement. |
| `tools/prep-for-mixamo.py` | Re-export a mesh as FBX with textures embedded. |
| `tools/ref-gen.mjs` | Concept → reference images, via Ollama. Keys the chroma background to alpha. |
| `reference-manifest.json` | The prompts. Pose reasoning lives in its `_pose` key. |
| `tools/inspect-fbx.py` | Report what is inside an FBX. |
| `tools/dump-joints.py` | Bone names from an FBX, for `suggest-map`. |
| `tools/extract-textures.py` | Write a mesh's embedded textures out, role-named. |
| `source/kaida/` | The Meshy mesh and its texture PNGs. The character's origin. |
| `source/ref/` | Reference images the mesh was generated from. |
| `textures/kaida/` | Role-named maps, re-attached after rigging. |
| `test/probe.mjs` | The probe. |
| `test/make-fixture.py` | Builds the gate's deliberately wrong input. |

`out/` and `.gate/` are gitignored scratch and both rebuild from the manifest.
Nothing in there is worth keeping — wipe it whenever it gets confusing. The only
file that has to be there before a run is the rigged character you downloaded,
as `out/<name>-rigged.fbx` or `.glb`.

---

# For the next agent

- Run `npm run retry:gate && npm run retry:probe -- assets/kaida.glb` first. Seconds, and it tells you the truth.
- **Read `PITFALLS.md`.** Every entry cost an hour or more.
- The pipeline architecture is built. Two stage modules are empty; that is the work.
- Do not add a mode flag. If an asset does not fit the contract, fix it in
  `canonicalise.py` or change the contract deliberately.
- The human runs long jobs. Ask, and say exactly which command and why.
