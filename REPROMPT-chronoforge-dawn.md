# Re-prompt — chronoforge-dawn

Paste the block below into a fresh session as the `/generate` input. It is the original
prompt, unchanged. The **Appendix** at the end is the only new material: it says what
already exists on disk and what must not be overwritten.

---

## The prompt

aight so check it - i built a very thin 2d overhead rpg- check out chronoforge

i want a remake :) i want a super polished, AAA style remake - read the concept_plan and produce your own well defined prompt for a chronoforge remake, lets call it chronoforge-dawn

the prompt should feed the slash-generate command - we only have 33% session usage left this round so lets start with producing a viable plan/architecture/loop system and verification system like we did with vulpine (the tools/ folder sort of blew up but it helped produce something observable so agents cant just say "done")

noww here's the fun part - before you do this - i saw a really strong prompt style someone posted on line im going to drop it here as a REFERENCE - i want you to reuse this style of prompt but make it for chronoforge-dawn - if you need a reminder or have questions lmk -- here's the ref promp

-----------

# Goal

Build a Cities: Skylines II–class city builder in Three.js (latest release) + Vite, plain ES modules, from this empty folder. The bar is AAA: photographic PBR materials, physically plausible sun/sky/shadows, atmospheric depth, a living city at night, believable roads and traffic. Never programmer art.

# How to work

1. Architecture first. Before any feature code, write ARCHITECTURE.md: one folder per subsystem (terrain, environment, roads, zoning, buildings, props, traffic, effects, simulation, tools, ui, audio, demo city), a shared world data model, the public API each module must expose, the events it emits, units (metres, +Y up), determinism (seeded RNG only), a performance budget (≥50 fps at 1080p, ≤1500 draw calls) and an asset policy (CC0 only: Poly Haven, ambientCG, or procedural). Isolate module failures so one broken module never takes the game down.

2. Build the verification loop before the game. A headless-Chrome screenshot tool that loads the app, waits until ready, sets a camera preset and time of day, and writes PNG + a JSON log (console errors, fps, draw calls). Every module also ships a "showcase" mode that stages a representative scene of just that module. No agent may claim anything it hasn't screenshotted and looked at.

3. Fan out. Use multi-agent orchestration ("ultracode"). One builder agent per module, each owning only its folder. Run in waves ordered by dependency: (1) terrain, sky/weather, roads, simulation, UI, audio, effects; (2) zoning, buildings, props, traffic, build tools; (3) demo city. Between waves, one integrator agent (the only one allowed to touch core) applies builders' core-change requests and fixes the seams.

4. Gauntlet every module. After each builder round, a separate critic agent (a brutal AAA art director who writes no code) takes its own screenshots at several times of day and zoom levels, checks the API contract, console errors and perf, and scores 0–10 against real Cities: Skylines II reference screenshots: 10 = indistinguishable, 8.5 = AAA with nits, 7 = good indie, 5 = programmer art. Pass = ≥8.5 with zero errors. Below that, the builder gets the ranked issue list and goes again, up to 4 rounds.

5. Final gate. A whole-game critic scores the demo city. Then blind judges get pairs of screenshots labelled only A and B (ours vs. Cities: Skylines II, order shuffled) and say which looks better and why.

6. /loop until every critic passes. Persist scores and open issues to docs/STATUS.json so each iteration resumes from the weakest module, not from scratch.

# Rules

- Never inflate scores. Report real numbers, failed rounds and what is still missing.
- Never edit another module's folder. Core changes go through the integrator.
- Keep the dev server running and the app loadable at all times; other agents are screenshotting it.
- Do not ask me questions. Make routine decisions yourself, state assumptions, keep going.

-----------

again since we only have 33% usage left on the 5h window, use it to create solid fundamental concepts and ideas - i do have ollama so we can generate if we need but i have terrible models (klein) lol so if you prefer hand-crafting your own lmk (the main issue i ran into with klein was it could never regen characters in a different stance or with a different weapon identically, the character would always look slightly different)

i want this new chronoforge-dawn to have very similar mechanics but AAA game style (map, exploration, battle style)

stack rank the mechanics - basics first, world, moving around, entering/exiting buildings, later enemies and fight scene (which chronoforge did a kick ass job at, i think you can take that and make it even sweeter) - then finally the farming/building/towncenter stuff last

---

## Appendix — current state, read before writing anything

Two requirements must survive into whatever you write:

**1. Architecture first.** Before any feature code, `ARCHITECTURE.md` and `CONTRACT.md`:
one folder per subsystem (`world`, `render`, `actors`, `traversal`, `places`, `battle`,
`progression`, `settlement`, `fx`, `ui`, `audio`, `tools`), a shared world data model and
a single `ctx` object every module receives, the public API each module exposes and the
events it emits, units (metres, +Y up), seeded RNG only (`Math.random()` is a defect), a
budget of 60 fps at 1080p / ≤900 draw calls / 16.6 ms, and the no-binary-assets art policy.
Isolate module failures so one broken module never blanks the screen.

**2. Verification loop before the game.** Nothing ships without an instrument. Screenshots
answer "how does it look"; they do not answer "does it deadlock", "does it drift", "can you
get out of the room". Those need a probe, and the probe is part of the deliverable. **No
agent may claim anything it has not screenshotted and opened, or measured with the probe
that answers that question.**

### This is not an empty folder

Phase 0 and a Phase 1.1 prep pass already shipped. **Do not clobber source.**

| Exists — keep | |
|---|---|
| `src/` (25 files) | engine skeleton, `ctx`, `__DAWN__` debug API, render stack, module stubs |
| `tools/` (4) | `shot.mjs`, `probe.mjs`, `lintrng.mjs`, `lib/harness.mjs` — the working harness |
| `shots/` (22) | Phase 0 captures, including the signed-off dawn frame |
| `docs/STATUS.json` | phase-0 gates, frame budget, dawn probe baselines, 10 open issues |
| `CONCEPT.md`, `concept.json` | 46 scope constraints, threejs tier |
| `ARCHITECTURE.md`, `CONTRACT.md` | hand-written in Phase 0; the Scaffolder does not emit these |
| `index.html`, `package.json`, `vite.config.js` | |

| Absent — recreate | |
|---|---|
| `team_config.json` | Director output |
| `GAME_PLAN.md` | Scaffolder output |
| `agents/*.md` | the roster |

### Rules for this run

- Phase 0 is done and its gates pass. Start the plan at Phase 1.1.
- Dawn at 6.4h is signed off — median 0.212, p90 0.51, 0% blown white. Do not regress it.
  Exposure ramps over sun elevation (`EXPOSURE_RAMP` in `src/render/environment.js`),
  fixed per hour, no metering.
- Ignore the "33% session usage" line above as a budget.
- Check the harness before planning:
  `cd games/chronoforge-dawn && node tools/probe.mjs --shots wide --hour 6.4`
