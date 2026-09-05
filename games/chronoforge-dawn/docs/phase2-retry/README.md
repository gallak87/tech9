# phase2-retry

A character pipeline built contract-first. `docs/phase2/` is the previous
attempt and its findings are still good reading; nothing here depends on it.

```bash
npm run retry:gate                      # prove the pipeline. seconds, no GPU.
npm run retry:probe -- <asset.glb>      # does the ENGINE load and animate it right?
npm run retry:map -- <rigged.glb>       # propose a bone map from a rig's names
npm run retry:check -- <file.glb>       # validate any glb against the contract
npm run retry:all                       # gate + probe on the installed character
```

## The probe

`npm run retry:probe -- assets/kaida.glb`

Loads a character through the real `src/actors` code and measures the result in
degrees. Node only — no browser, no renderer, no screenshots.

```
--id <name>        character to build          default: the file's basename
--clips a,b,c      clips to check              default: all seven
--t <n>            time to sample each clip     default: 0.25
--arm-max <deg>    limb deviation allowed       default: 55
--limb-max <deg>   bind limb deviation allowed  default: 8
--spine-min <y>    minimum hips→head Y          default: 0.9
--json             machine-readable
--quiet            failures only
```

Exit 0 all pass, 1 any fail, 2 could not run.

**Why it exists.** A character can satisfy every structural check and still
animate into a face-down, splayed heap. That failure was found by eye, from a
screenshot, twice — once per agent — and each time it cost a browser round trip
to see and a guess to explain.

It is measurable. `idle` is nearly the bind pose, so under a correct rig the
limbs barely move; under a broken one they invert. Every check reports its
number whether it passes or fails, so *"is it fixed yet"* is a command and
*"is it getting better"* is a diff.

Currently failing on `assets/kaida.glb`, correctly:

```
✓ bind: upperArm_L hangs along -Y        0°
✗ idle: limbs not inverted               worst upperLeg_R 179.2°   want ≤ 55°
```

Perfect at bind, inverted the moment a clip is applied — see **Known defect**.

---

# The idea

`CONTRACT.md` defines exactly one kind of character. The pipeline's job is to
make an arbitrary rigged file satisfy it; the engine's job is to assume it.
There is no per-asset mode flag, no fallback path, and no branch on where an
asset came from.

That single decision is what removes the class of problem the previous attempt
kept hitting. If an asset needs the engine to adapt, that is a pipeline bug.

## Why canonicalisation is a stage, not a fix

The game has **one** hand-authored animation library and it must drive every
character. Auto-riggers bind a skeleton to the mesh **in whatever pose the mesh
was generated in**, so no two generated characters arrive alike.

Canonicalisation is what makes a shared animation library possible at all. It
would exist whichever rest pose were chosen as canonical, because no generator
emits the canonical one by chance.

---

# Status

```bash
node docs/phase2-retry/pipeline.mjs docs/phase2-retry/manifest.json --only kaida
```

Stages run in order and skip when their inputs have not moved. The skip is not
an optimisation — mesh generation is a ~20 minute pass, so without it a failure
in a later stage costs a full re-mesh on every retry.

| Stage | State |
|---|---|
| `mesh` — image → static mesh | **adapter built, backend undecided.** Refuses with the options and what each costs. |
| `rig` — mesh → skeleton + weights | **adapter built, backend undecided.** This is the open question. |
| `canonicalise` — any rig → the contract | **built, proven** |
| `install` — → the game | **built, proven.** Validates, then copies. Refuses to install anything that violates the contract. |

Backends are manifest config, not code, so choosing a tool is a config change.

## What install no longer does

There is no bone map to install. Under the contract a character's joints **are**
the spec's names, so the engine looks them up directly. The previous pipeline
shipped a per-asset `bones.json` because every asset named its joints
differently — canonicalising upstream deletes that file and the class of bug
where it was wrong at one joint.

## What the gate proves

Two rungs, both run by `npm run retry:gate`:

1. **Synthetic.** Builds a rig deliberately wrong in every way the contract
   cares about — wrong names, T-pose, 3.6 m tall, floating at z=1.22, carrying
   an animation — then runs the real stages and validates the real contract.
2. **Real.** The same stages on `assets/kaida-not.glb`: a stock Mixamo rig,
   75 bones, namespaced names, three spine bones where the spec has two.

```
joints 19/19 · restMaxDeg 0.0 · heightM 1.720 · soleY 0.0000 · animations 0
```

Nothing is stubbed or mocked. The only synthetic thing is rung 1's input.

Separately verified through the runner, on the `probe` manifest entry:

| | |
|---|---|
| canonicalise → install → `assets/probe.glb` | validated, satisfies the contract |
| re-run with unchanged inputs | `skip (inputs unchanged)` |
| `--force` | re-runs |
| install given a non-conforming file | **refuses, listing every violation** |

That last one is the property that matters: a broken character cannot reach the
game by accident.

## What it does not prove

**That an auto-rigger can rig a generated mesh at all.** Both rungs start from
something already rigged. That question is upstream of everything here and is
still open — see `../phase2/ITERATION.md`.

The good news is that it is now the *only* open question on this path. Whatever
rigs the mesh, canonicalise takes it from there.

---

# Known defect — limbs invert under a clip

`npm run retry:probe -- assets/kaida.glb` → 18 pass, 7 fail. The bind pose is
exact; every clip inverts the limbs to ~180° from −Y.

**Cause.** `docs/specs/rig.mjs` declares joints as offsets with no rest
rotations, so the engine's write path assumes every joint's rest rotation is
identity. A Blender-authored bone points along its own local +Y by convention,
so a bone hanging downward carries a 180° rest rotation that survives export.
`canonicalise` fixed the joint *directions* and left those rotations in place.

**The gap is in the contract, not the asset.** `CONTRACT.md` §2 constrains where
joints are and which way limbs point; it never constrained their rest rotations.
Same class of miss as the direct-parentage clause the Mixamo rig caught earlier.

**Do not fix this by restoring a bind mode.** An earlier design carried
`absolute` and `additive` and chose per asset; that is the thing this rebuild
exists to delete. Fix it once, in the contract and the canonicaliser, so every
character that reaches the engine is already right.

---

# Design rules

Held to throughout. Breaking one is how the previous attempt accumulated modes.

1. **One way to do each thing.** No mode flags, no back-compat branches.
2. **Fix causes, not symptoms.** Every gate failure so far was traced to a
   cause and fixed there. The commit log records each one.
3. **Refuse rather than guess.** A bone map is `reviewed: false` until a human
   says otherwise, and `canonicalise` will not run on an unreviewed one. A map
   wrong at one joint produces a character that loads fine and moves wrong.
4. **Measure, never assume.** Height and ground come off the asset. The only
   constants are the contract's own.
5. **One place per convention.** `spec_dir()` is the only code that knows glTF
   is Y-up and Blender is Z-up.
6. **The spec is imported, never restated.** Joint names and offsets come from
   `docs/specs/rig.mjs`. Two copies drift and the gate starts lying.

---

# Files

| | |
|---|---|
| `CONTRACT.md` | The contract in prose. Normative. |
| `contract.mjs` | The contract as checks. Pure Node, sub-second, no Blender. |
| `gate.mjs` | Both rungs. The thing to run. |
| `tools/suggest-map.mjs` | Proposes a bone map from a rig's own joint names. |
| `tools/canonicalise.py` | Blender. Rename, align rest, normalise, strip animation. |
| `tools/check.mjs` | Validate one file. |
| `test/make-fixture.py` | Blender. Builds rung 1's deliberately wrong input. |

`.gate/` is scratch and is rebuilt on every run.

---

# For the next agent

- Run `npm run retry:gate` first. It takes seconds and tells you the truth.
- The open question is the rig stage, and it is a tooling question, not a design
  one. `../phase2/ITERATION.md` has the options and what each must prove.
- Do not add a mode flag. If an asset does not fit the contract, fix it in
  `canonicalise.py` or change the contract deliberately — the contract has been
  wrong once already (it required direct parentage, which rejects any rig with
  more spine bones than the spec) and correcting it was the right call.
- The human runs long jobs. Ask, and say exactly which command and why.
