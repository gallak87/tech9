# Chronoforge Dawn — handoff

**State:** Phase 0 complete and committed. Phase 1.1 is prepared but **not started** —
its four lane definitions were written after the session that would have run them, and
Claude Code loads agent definitions at session start only. **Restart, then follow the
run order below.**

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

## Run order after restart

### 1. `cfd-world` — exposure spot-fix (first, and scoped)

Cheaper now than after Phase 2 scores blown-out frames. Paste this as the prompt:

> Scoped spot-fix only — **do not start Tier 1 world work.** Fix open issue
> `exposure-non-dawn` in `docs/STATUS.json`: exposure is fixed at 1.05 in
> `src/render/postfx.js` (~line 217) and was only ever tuned at dawn. Noon measures
> median 1.801 / white% 40.1 against a band of median 0.09–0.25, white% < 2 — 7x over.
> The cause is not key intensity: `KEY_RAMP` is nearly flat. It is cos-law on the
> ground (sin 11.6° = 0.20 vs sin 61.3° = 0.88) times the sky IBL ramp, product ~8.5x,
> which matches the measured median ratio. **Keep fixed exposure — no auto-exposure.**
> An art-directed hour must not drift. Make exposure a RAMP over sun elevation in the
> same idiom as `SKY_RAMP` and `KEY_RAMP` in `src/render/environment.js`. Verify with
> `node tools/probe.mjs --shots wide --hour <h>` at 6.4, 9.9, 12, 18.5 and 21.5, paste
> every number, and confirm **dawn at 6.4h is unchanged** — it is the signature hour and
> the one frame already signed off. Update the issue in `docs/STATUS.json` when it passes.

### 2. Phase 1.1 — Foundations, three in parallel

`cfd-art`, `cfd-gamedesign`, `cfd-level`. Each def carries its own ownership, gate
and report format.

| Lane | Model/effort | Ships | Gate |
|---|---|---|---|
| `cfd-art` | opus/xhigh | `docs/RIG_SPEC.md` + `rig-spec.json` | Spec self-consistency check runs; real gate is Phase 2 |
| `cfd-gamedesign` | opus/high | `DESIGN_SPEC` + Encounter Framing POC | `tools/framing.mjs --cases all` exits 0, **emits the clearance number** |
| `cfd-level` | sonnet/high | 12 maps in `data/regions/`, `tools/region.mjs` | Exits 0: zero dangling doorways, all reachable from Haventide |

**Gate:** a spec whose artifact was not run does not pass.

**Audio is not in this wave.** It moved to Phase 7, with the battle it scores —
nothing can trigger a sound until Tier 4. Cost: Phase 6 interiors ship silent and
audio picks up interior ambience one phase late.

**`cfd-gamedesign` is the critical path.** Its clearance number is the only input to
1.2. If it fails, 1.2 cannot run and level's placements stay provisional.

### 3. Phase 1.2 — Encounter Placement Pass

`cfd-level` validates all 36 placements against the clearance number and moves the
failures. Needs 1.1 finished, because the number cannot exist before the POC.

## Prepared for you in this session

- Four lane defs in `.claude/agents/cfd-{art,gamedesign,level,audio}.md`
- `CONTRACT.md` §1 — ownership rows for the four Foundations lanes, plus `data/regions/**` declared as level's output and world's input
- `src/main.js` — **one core change**: `__DAWN__.ctx` exposed read-only. The Encounter Framing POC has to *build* a primitives scene, which `post()`/`probe()`/`stats()` cannot do from outside. Verified: boot clean, dawn unchanged at median 0.212, and a control assertion still fails as it should
- The four stale stubs in `agents/` marked **do not use as a prompt** — they said "design-only, no dev work", which fails the 1.1 gate outright
- `ROADMAP.md` items 8, 9, 10 — historian pass on what this phase exposed about the framework
- `GAME_PLAN.md` — audio moved out of Phase 1.1 and Phase 6 into Phase 7; Phase 4's QA gate gained `play.mjs`, an interactive Playwright session a QA agent can drive, because every tool today photographs a frame or measures a scripted run and none lets an agent play the build

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
