# phase2-retry

A character pipeline built contract-first. `docs/phase2/` is the previous
attempt and its findings are still good reading; nothing here depends on it.

```bash
npm run retry:gate                      # prove the pipeline. seconds, no GPU.
npm run retry:map -- <rigged.glb>       # propose a bone map from a rig's names
npm run retry:check -- <file.glb>       # validate any glb against the contract
```

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

| Stage | State |
|---|---|
| reference — concept → image | not built. `docs/phase2/ref-gen.mjs` works and can be lifted. |
| mesh — image → static mesh | not built. Tool undecided. |
| rig — mesh → skeleton + weights | not built. **Tool undecided — this is the open question.** |
| **canonicalise — any rig → the contract** | **built, passing on a synthetic rig and a real one** |
| validate — assert the contract | **built, passing** |
| install → game | not built. `docs/phase2/stages/install.mjs` works and can be lifted. |

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

## What it does not prove

**That an auto-rigger can rig a generated mesh at all.** Both rungs start from
something already rigged. That question is upstream of everything here and is
still open — see `../phase2/ITERATION.md`.

The good news is that it is now the *only* open question on this path. Whatever
rigs the mesh, canonicalise takes it from there.

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
