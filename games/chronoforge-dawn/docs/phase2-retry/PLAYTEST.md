# Play-test

One URL. The character is already installed.

```bash
npm run dev
```

```
http://localhost:5190/?play=1&dev=2&forge=kaida
```

`?forge=kaida` loads `assets/kaida.glb`, which the pipeline produced and
validated. Move her with the normal controls and screenshot whatever looks off.

---

## What this build is

A **stock Mixamo character**, run through the new pipeline end to end:

```
assets/kaida-not.glb  →  canonicalise  →  install  →  assets/kaida.glb
```

It is not a generated Kaida. Generating one is blocked on the rig backend, which
is still undecided. What it does test is everything downstream of that: the
contract, the canonicaliser, install, and the simplified engine.

## What changed in the engine

The loader now assumes the contract instead of adapting to each asset.

| Gone | Why |
|---|---|
| `assets/<id>.bones.json` | The contract names joints with the spec's own names, so the lookup *is* the map |
| `bindMode` / `absolute` / `additive` | The contract fixes the bind to the spec rest pose, so one solve is correct |
| `faceYawDeg` per asset | The contract fixes the character facing +Z |
| The "map is not reviewed" warning | Reviewing moved upstream, to the pipeline, where it can refuse |

An asset that does not satisfy the contract now fails to load with the reason,
rather than loading in a degraded way. `assets/kaida-not.glb` is one such asset —
it is the raw Mixamo file and will no longer load directly. That is intended.

## What is already proven, without eyes

```bash
npm run retry:all
```

| | |
|---|---|
| `retry:gate` | The pipeline **produces** a contract asset — from a synthetic rig and a real one |
| `retry:engine` | The engine **consumes** one — 19/19 joints by name, no rescaling, bind hangs along −Y, a clip moves the rig |

So the maths is checked. What a screenshot adds is whether she *looks* right:
proportions, whether the skin tears at the shoulder, whether she stands on the
ground rather than through it.

## What to look for

| | |
|---|---|
| Standing | Feet on the ground, upright, facing the camera. Not sunk, not floating, not inverted. |
| Idle | Arms hang at her sides. If they stick outward she is stuck in the rigger's bind and canonicalise did not take. |
| Moving | Shoulders and hips deform without creasing or collapsing. |
| Scale | She should match the world's sense of 1.72 m. |

The arms are the tell. Everything the old dual-mode retarget existed to work
around shows up there first.
