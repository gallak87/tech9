# tech9 — Roadmap

## Current state

Pipeline is built and running. `/generate` spawns a Concept Generator → Director → Scaffolder, then phases run as subagents. Games ship to GitHub Pages. Five games built: snake, gravelrun, skyrift, void-sentinel, chronoforge.

```
/generate → concept confirmed → roster confirmed → subagents build phase by phase
/run-art  → art agent proof loop → self-review → batch gen via Ollama
/expand   → find thin spots → propose → declare → hand off to agents
```

---

## Open items

### 1. Subagent spawning for /run-art and /expand

`/generate` now spawns agents. `/run-art` and `/expand` still rely on Claude in the
current conversation rather than spawning subagents. Same pattern needs wiring:

- `/run-art` → spawn art agent as subagent with manifest + style spec as context
- `/expand` → spawn relevant agent(s) after user confirms proposals

### 2. Director emits game-specific CLI

Director knows the concept, asset categories, and phase plan — enough to declare
game-specific command handles rather than leaving the author to derive them.

- Add `scripts[]` block to `team_config.json` output
- Naming: `<primitive>:<category>` (e.g. `run-art:terrain`, `proof-art:heroes`)
- Scaffolder writes these as per-game `.claude/commands/` stubs
- Snake-scale games get no art scripts; tilemap RPGs get the full set

### 3. Historian wiring

Role definition exists (`vocab/roles/11_historian.json`). Not yet wired into the pipeline.

- `meta/LESSONS.md` — create if it doesn't exist; Historian appends after each game's final phase
- `meta/02_director.md` — read `meta/LESSONS.md` filtered by concept tags on every run
- `meta/01_concept-generator.md` — same
- Graduation: lessons proven across 2+ games get patched into framework defaults and removed from LESSONS.md

EXAMPLE AGENT STORY:
- plan: chronoforge-multiworld-drops in user root captures a work change that should be fed back to /expand and maybe /run-art - something that should apply to future games, delegating generating sprites to node commands so user can run themselves and not burn tokens, keep these tasks as first to go to agents can work while that happens

### 4. Separate engine / assets / gameplay

**TODO — do not carve this out yet, but design toward it.**

The goal: a reusable Godot engine block that multiple games sit on top of, so a new game is
content and rules rather than another terrain renderer. Three layers, cleanly separated:

- **engine** — terrain/clipmap, controller + camera rigs, dev overlay, MCP bridge, shader
  library. Game-agnostic, no gameplay assumptions.
- **assets** — meshes, materials, palettes, audio. Swappable per game.
- **gameplay** — rules, events, progression, HUD. The only part that should differ between
  two games in the same style.

duneglide is the first real candidate to extract from — its terrain, glide controller, chase
camera and dev overlay are all game-agnostic already, and the whole point of the free-roam
hub-and-events design is that other games could reuse it.

Other Godot-tier follow-ups live in `GODOT_ROADMAP.md`.

Open questions to answer before extracting: Godot addon vs git submodule vs plain copied
directory; how the scaffolder instantiates a game against an engine version; whether the
engine carries its own `project.godot` fragments or the game owns all config.

### 5. Scrollable-map reset-view

Any map/overlay with pan + zoom needs a reset-view control from day one. Easy to forget.

- Add to `gamedesign` role UX checklist
- Default keybind: `R`. Button label: `RESET VIEW [R]`

### 6. Slash command dispatcher / specialized agent routing

Current pipeline uses generic slash commands that run in the same context. The idea: each command switches to a purpose-built agent with narrowed system prompt, tools, and RAG context — rather than one agent that tries to do everything.

- `/dev` — file system + component docs, no infra access
- `/devops` — CI/CD, cloud CLI, secrets; changes require explicit approval
- `/test` — test runners, coverage; no write access to src
- `/map` — scans codebase, emits dependency graph so agents know what they're touching before acting

**Why it matters for tech9:** `/run-art`, `/expand`, `/generate` are already routing to different agents — this is just making the boundary explicit and narrowing tool access per route. Reduces hallucination surface, cleaner permission model, and lets agents hand off results to each other (devops sets up env → signals dev to update the badge).

Key implementation pieces:
- Each command gets its own system prompt file in `.claude/commands/`
- Director emits a `tool_access[]` block in `team_config.json` (extends item 2 above)
- Chain protocol: agent emits a structured `handoff` payload instead of prose; receiving agent reads it as first context

### 7. Capability probes should be uniform

`tools/probe.js` supports `--json` and `/generate` parses it. `npm run mcp:check` prints prose
only, so the godot-mcp gate has to be read by eye while the image-gen one is mechanical.

As more capabilities land this gets worse. Convention worth setting now: **every capability in
`capabilities/` exposes a probe that emits `--json` in a common shape**, and `tools/scaffold.js`
folds them all into the single `capabilities` object it already builds. Then the Director's
availability gates are code, not judgement.

Godot-specific half of this is tracked as item 3 in `GODOT_ROADMAP.md`.
### 8. Agent file layout is inverted

Found building Chronoforge Dawn Phase 1.1. Two sets of agent files exist on different
axes and both are load-bearing — but the names say the opposite of what they are.

| Today | Should be | Why |
|---|---|---|
| `games/<slug>/agents/*.md` | `games/<slug>/lanes/` | Durable, checked in, part of the game |
| `.claude/agents/cfd-*.md` | disciplines, namespaced by game | Temporary build scaffolding, deleted when the game is declared complete |

A `cfd-*` def is disposable; a `games/<slug>/agents/*.md` stub is not. The current
names imply the reverse. The `cfd-` prefix is a namespace doing a folder's job,
because discovery is `~/.claude/agents/` and `<project-root>/.claude/agents/` only —
a game subfolder is never discovered.

- Rename after chronoforge-dawn ships; mid-build it breaks every path in every def
- Add a "declare game complete" step that sweeps that game's disciplines out of `.claude/agents/`
- `tools/scaffold.js` should emit both sets, not just the stubs

### 9. Scaffolder discipline stubs go stale on contact

Every stub in `games/chronoforge-dawn/agents/` said *"Phase 1 — Foundations:
design-only pass, no dev work."* The game plan's actual 1.1 gate is *"a spec whose
artifact was not run does not pass."* A stub used as a prompt would have produced
four documents and failed the gate.

Worse, `level.md` listed its outputs as `platform rects, enemy list, player start,
exit position` — platformer boilerplate — for a game whose level deliverable is a
twelve-map RPG graph.

The stubs are generated once from `team_config.json` and never reconciled against
`GAME_PLAN.md`, which the Director writes afterward. They drift immediately and
silently, and they look authoritative.

- Scaffolder should generate stubs **after** the phase plan, or regenerate them when it changes
- A stub whose "Current Phase Goal" contradicts its phase's QA gate should fail `validate-vocab`
- Cheapest interim fix: stop shipping a per-phase goal in the stub at all, and point at `GAME_PLAN.md`

### 10. Harness before game — first real evidence

Chronoforge Dawn built 3 of 15 probes plus a GPU screenshot harness in Phase 0, before
any game code. Two findings already paid for it:

- A dev panel built in Phase 0 immediately surfaced that exposure is fixed at 1.05 and tuned only at dawn — noon measures 7x over band. Found before a single hero was modelled, not after a critic scored blown-out frames in Phase 2.
- The probe answered *why* in numbers (cos-law on the ground times the sky IBL ramp, product ~8.5x, matching the measured median ratio) rather than starting an argument about the look.

Both are the thesis working. Do not graduate this into a framework default until a
second game repeats it — but it is the strongest candidate on the list.

---

## Baked — no longer open

These were recurring per-game re-discoveries. All patched into the framework as defaults.

| What | Where it landed |
|------|----------------|
| Screen-blend for flux black backgrounds | `tools/scaffold.js` — injected into dev stub; Pixi `BLEND_MODES.SCREEN` for non-`tile_` sprites |
| Sprite fidelity prompt contract | `tools/scaffold.js` — 64px default, full style prefix in manifest stub |
| Rendering tier selection (default Pixi) | `meta/02_director.md` — Director picks tier; `tools/scaffold.js` — tier-specific skeleton |
| Agent loop contract | `run-art.md` — proof→self-review→batch. Slash commands are interrupt points, not triggers |
| Dev tool contract | `tools/dev-tool-contract.md` — one tool per domain, `window.__DEV_TOOLS__` env gate |
| Historian vocab role | `vocab/roles/11_historian.json` — graduation model defined |
| Art proof pass | `run-art.md` — agent self-reviews proof before batching, surfaces only when blocked |
| Godot as a first-class tier | `rendering_tier: godot` — schema, Director tier table, `tools/scaffold.js` emits `project.godot` + MCP autoload |
| Godot role family | `vocab/roles/12_godot_dev`, `13_godot_techart`, `14_godot_tools` — `dev` marked web-only and mutually exclusive |
| godot-mcp as a capability | `capabilities/godot-mcp.md` — probe, verify loop, debugging technique, gotchas. Injected into every Godot agent stub |
| Godot stack template | `vocab/templates/stacks/stack-godot.md` — Forward+, TAA ban, vertex-displacement rules |
| Historian first pass | `games/duneglide/LESSONS.md` + Godot/3D section of `meta/LESSONS.md` |
| validate-vocab reads its own schema | `tools/validate-vocab.js` — was hardcoding rules and failing on valid roles, so its output was ignored |
| `phaser` tier dropped, silent stack-template miss made loud | `tools/scaffold.js` `VALID_TIERS` and `meta/02_director.md` no longer offer `phaser` (never shipped a game, no `stack-phaser.md`, not in the concept schema enum). `renderAgentStub`'s stack-template lookup now `console.warn`s on an unmapped tier or missing template file instead of silently emitting nothing |
| Godot dev tool contract | `tools/dev-tool-contract.md` `## Godot` section — overlay lifecycle, cheap vs expensive knobs, freeze+orbit camera, CPU/GPU parity harness, sourced from duneglide's `DevTool.gd` / `DebugParity.gd` |
| `mcp_interaction_server.gd` promoted out of a game directory | `tools/godot/mcp_interaction_server.gd` is now the canonical donor `tools/scaffold.js` copies from, not `games/duneglide/` |

---

## Deferred (post-v1 of current games)

- **Autotile / transition tiles** — biome boundary blending. Requires world layout locked first.
- **Pixi port for Chronoforge** — Canvas 2D headroom sufficient through Phase 5. Worth doing after ship.
- **Obsidian/graph index for LESSONS** — useful at scale, not needed until meta/LESSONS.md is unmanageable (3-4 more games).
- **Multi-tool support** — `.agents/` root with per-tool adapters. Claude-only for now.
