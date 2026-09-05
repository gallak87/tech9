# Chronoforge Dawn — roadmap

13 phases. A tier ships playable and verified before the next starts.

| # | Phase | Gate | State |
|---|---|---|---|
| 0 | Engine Skeleton, Contract & First Light | shot.mjs exits 0, 0 console errors, budget OK | **done** |
| 1.1 | Foundations & Paper Prototypes *(parallel)* | every spec ships a runnable artifact | next |
| 1.2 | Encounter Placement Pass | 36 placements satisfy combat clearance | |
| 2 | **Character Look Gate** | rig.mjs: identical palette across poses. **2-round hard stop** | |
| 3 | The Harness | all tools run and exit 0 | |
| 4 | Tier 1 — World & Light | depth+normal prepass exists, region.mjs connected, fog continuous, no grid, **play.mjs drivable**, critic ≥8.5 on 2 regions | |
| 5 | Tier 2 — Traversal | walk.mjs: 3-min route, 60fps, no clips | |
| 6 | Tier 3 — Places & Interiors | door.mjs: every door in 12 maps, no soft-lock | |
| 7 | Tier 4 — Encounters & Battle | duel.mjs: 200 seeded battles, loot matches tables; 4 sounds rendered and listened to | |
| 8 | Tier 5 — Progression & Menus | save.mjs byte-identical round-trip | |
| 9 | Tier 6 — Settlement & Economy | econ.mjs: 4h sim, no starve, no runaway | |
| 10 | Region Buildout | remaining 6 regions, critic scores each **individually** | |
| 11 | Vertical Slice, Blind Gate & Release | blind A/B vs prototype, v1.0.0 live | |

## Why the gates sit where they do

Early gates are for decisions that are **unvalidated AND expensive to reverse**.

- **Rig approach** (Phase 2) — a generated mesh loads and animates; auto-rigging one is unsolved.
  Failing that throws away the whole character pipeline. `docs/phase2-retry/`.
- **Encounter push-in** (Phase 1.1) — decided late; failing it changes battle, world clutter, and
  the camera contract.
- **ATB math** — deliberately *not* early. It is a port of tuned numbers, cheap to fix.
  `duel.mjs` catches it at Tier 4.

## AO and DOF

The effects are fit-and-finish and can land any time. The **depth+normal prepass they read is
not** — depth cannot share the MSAA scene target, so retrofitting it into a finished render path
is structural. Tier 1 builds the prepass even though nothing consumes it yet.

## Two-stage region fidelity

Tier 1 finishes **2 of 8** regions: Haventide (`grassland_ruins`) and Emberline (`neon_wastes`).
Different biomes on purpose — that proves the system generalises rather than hand-tuning one map.
The other 6 ship blocked in and come up in Phase 10.

**Deferring fidelity never defers correctness.** `region.mjs`, `walk.mjs` and `door.mjs` pass on
all 12 maps from Tier 1 on. No exemptions.

## World shape

12 maps: 8 outdoor regions + 4 city interiors. 8 biomes. 36 placed encounters. 18 doorway edges.
8 world drops (one per region, separate from enemy drop tables). Build plots are **Haventide only**.
Source of truth for the port: `games/chronoforge/src/world.js`.
