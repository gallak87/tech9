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

---

## Deferred (post-v1 of current games)

- **Autotile / transition tiles** — biome boundary blending. Requires world layout locked first.
- **Pixi port for Chronoforge** — Canvas 2D headroom sufficient through Phase 5. Worth doing after ship.
- **Obsidian/graph index for LESSONS** — useful at scale, not needed until meta/LESSONS.md is unmanageable (3-4 more games).
- **Multi-tool support** — `.agents/` root with per-tool adapters. Claude-only for now.
