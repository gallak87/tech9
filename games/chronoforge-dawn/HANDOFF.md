# Chronoforge Dawn — handoff

**State:** Phase 0 complete and committed. Next is Phase 1.1.

## What this is

AAA remake of `games/chronoforge`. Three.js + Vite. The prototype's *content* was fine —
its presentation was flat. We keep the game, replace the rendering.

Three calls that are easy to reverse by accident:

1. **Three.js 3D world, fixed 55° overhead camera.** Characters pixel-snapped to read as sprites.
2. **No sprite pipeline.** Characters are code-built 3D rigs, posed, weapons on sockets. This is
   the fix for "the hero looks different in every stance" — a rig is identical by construction.
3. **Harness before game.** 15 probes in `tools/`. No claim without a screenshot or a number.

## Read these, in order

| File | What it's authoritative for |
|---|---|
| `../../PROMPT-chronoforge-dawn.md` | How agents work. The 8 defects. Tool contract. |
| `CONCEPT.md` | What the game is. 46 scope constraints. |
| `GAME_PLAN.md` | 13 phases, agents per phase, gates. |
| `CONTRACT.md` | File ownership. Nobody edits outside their lane. |
| `ARCHITECTURE.md` | `ctx` shape, module APIs, budget. |
| `docs/STATUS.json` | Live state, open issues, `nextPhase`. |

## Next: Phase 1.1 — Foundations (parallel)

| Agent | Ships | Not just a spec — an artifact that could fail |
|---|---|---|
| `art` | Rig system spec | proven in Phase 2 |
| `gamedesign` | Encounter Framing POC | primitives only. **Must emit the combat clearance number.** |
| `level` | 12 maps as data files | validated offline. Provisional encounter placements. |
| `audio` | 4 synthesised sounds | playable files, not descriptions |

**Gate:** a spec whose artifact was not run does not pass.

Then **1.2** — level validates all 36 encounter placements against the clearance number.

## Open from Phase 0

Both Tier 1 work, both in `STATUS.json`:

- **No AO or contact shadow.** Half of defect 3. Props read as pasted on — visible in `shots/phase0/hero.png`.
- **No DOF.** Needs a resolved depth prepass; cannot share the MSAA target. Do not bolt it on.

## Gotchas

- Dev server may be running on `127.0.0.1:5190`. Lanes should pick a unique port.
- Scaffolder emits `sprites-manifest.json` + `run-art.md` on every run. **Delete both** — this
  game has no sprite pipeline.
- Scaffolder will not overwrite `GAME_PLAN.md`. `rm` it first or the plan goes stale silently.
- Never re-scaffold or edit plan files while a lane agent is working in that folder.
