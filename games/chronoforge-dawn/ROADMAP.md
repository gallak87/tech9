# Chronoforge Dawn — roadmap

13 phases. A tier ships playable and verified before the next starts.

| # | Phase | Gate | State |
|---|---|---|---|
| 0 | Engine Skeleton, Contract & First Light | shot.mjs exits 0, 0 console errors, budget OK | **done** |
| 0.1 | Twilight & Night Lighting + quality lever | both broken bands inside the STATUS band; 5-notch lever | **done** |
| 1.1 | Systems & Look Specs *(parallel)* | every spec ships a runnable artifact | **done** — 8 files in `docs/specs/`, all exit 0 |
| 1.2 | World Data Port & Heightfields | offline graph walk: every landing real, in-bounds, passable | **done** — `world-graph.mjs` + `heightfields.mjs` PASS |
| 1.3 | Encounter, Doorway & World-Drop Placement | 36 placements clear combat staging; no orphans | **done** — folded into the same two gates |
| 2 | **Character Look Gate** | human drives Kaida on real terrain. **2-round hard stop** | **in progress** — see below |
| 3 | The Harness | all tools run and exit 0 | **6 of 16** — shot, probe, lintrng, rig, ground, region |
| 4a | Tier 1 — World build-out | 12 maps build and switch; `region.mjs` green live | **done** |
| 4b | Tier 1 — Light & Post | depth+normal prepass, fog continuous, no grid, critic ≥8.5 on 2 regions | blocked — `src/render/` frozen |
| 5 | Tier 2 — Traversal | walk.mjs: 3-min route, 60fps, no clips | |
| 6 | Tier 3 — Places & Interiors | door.mjs: every door in 12 maps, no soft-lock | |
| 7 | Tier 4 — Encounters & Battle | duel.mjs: 200 seeded battles, loot matches tables; 4 sounds rendered and listened to | |
| 8 | Tier 5 — Progression & Menus | save.mjs byte-identical round-trip | |
| 9 | Tier 6 — Settlement & Economy | econ.mjs: 4h sim, no starve, no runaway | |
| 10 | Region Buildout | remaining 6 regions, critic scores each **individually** | |
| 11 | Vertical Slice, Blind Gate & Release | blind A/B vs prototype, v1.0.0 live | |

## Phase 2, precisely

The rig question the phase existed to answer is **answered**, and Kaida
**graduated on 2026-09-05**: she loads from `assets/kaida.glb` with no flag, the
code-built rig is what Vex, Rune and the enemies still use, and `?forge=0` is the
A/B. The outline system went with her — it was off by default and already
destroyed on every forge load. Pipeline and stage status in `docs/phase2-retry/`,
which still iterates independently of Phase 4.

Still open: the hand-grip mesh, Vex and Rune, ground contact (2.4) and the human
final gate (2.5). **On hold — see the un-set gate at GAME_PLAN.md Phase 2.5.**

## Why Tier 1 splits

`src/render/` is the surface Kaida's look is judged through. Re-tuning materials,
exposure or post underneath an in-flight character sign-off invalidates every part
already accepted. So Tier 1 splits at the folder boundary:

- **4a** owns `src/world/` — the twelve maps, blocked in. Vertex colour only.
- **4b** owns `src/render/` — sun, sky, IBL, the post chain, the depth+normal
  prepass, fog of war. Starts when the character gate closes.

4a cannot close the Tier 1 gate alone; the critic score needs the lighting.

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
