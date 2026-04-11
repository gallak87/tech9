# tech9 — Indie Game Studio Generator

## What This Is
tech9 is a **generator** — not a game. It produces game studios.

Given a game idea, tech9 outputs a scaffolded game repo populated with the right agents,
prompts, and plans for that specific game. The game repo has no knowledge of tech9.

---

## Architecture

```
tech9 (this repo)
│
├── Layer 1: Meta  ←  never exported to game repos
│   ├── Concept Generator  — brainstorm/refine game ideas → game concept doc
│   └── Director           — reads concept doc → selects roles → generates game repo
│
└── Layer 2: Vocabulary  ←  selectively exported per game
    └── Role definitions (prompts, scope, I/O contracts) for every possible agent
```

### How a game gets made
1. **Concept Generator** helps define the game idea → outputs `CONCEPT.md`
2. **Director** reads `CONCEPT.md` → selects roles from the vocabulary → generates the game repo
3. Game repo contains only what that game needs — no meta layer, no generator tooling

---

## Layer 1 — Meta Agents (tech9 only)

### Concept Generator
Helps go from "I want to make a game" to a concrete, scoped game concept.

**Output:** `CONCEPT.md` — game summary, core loop, target feel, scope constraints, known unknowns

### Director
Reads `CONCEPT.md` and assembles the right team for that game.

**Responsibilities:**
- Select roles from the vocabulary based on game complexity
- Generate each agent's prompt with role, scope, inputs, outputs, and dependencies
- Scaffold the game repo structure
- Decide which roles to merge vs split (see guidelines below)
- Write `GAME_PLAN.md` into the generated repo

**Vocabulary expansion rule:** Director works from the static vocabulary only.
If a game needs a role that doesn't exist, Director must propose it with a full role definition
and request human approval before spawning. Approved roles are added back to the vocabulary.

---

## Layer 2 — Vocabulary (All Possible Roles)

### Creative / Design
| Role | Agent | Responsibility |
|------|-------|----------------|
| **Game Designer** | `gamedesign` | Mechanics, systems, core loop, balance, progression rules |
| **Art Director** | `art` | Visual style guide, color palette, UI/UX direction — consumed by Asset Artist |
| **Asset Artist** | `asset` | Sprites, tilesets, animations, environment art — works from Art Director's spec |
| **Level Designer** | `level` | World layout, level structure, pacing through space |
| **Audio Designer** | `audio` | SFX direction, music tone, audio implementation notes |

### Engineering
| Role | Agent | Responsibility |
|------|-------|----------------|
| **Dev** | `dev` | All game code — engine, logic, systems, components |
| **QA** | `qa` | Test plans, bug reports, regression checks, playtest notes |
| **DevOps** | `devops` | Local dev server → build pipeline → CI/CD → deployment. Localhost always comes first. |

### Shipping
| Role | Agent | Responsibility |
|------|-------|----------------|
| **Release** | `release` | Versioning, changelogs, store page copy + assets, launch checklist |
| **Post-Launch** | `postlaunch` | Player support, incident response, dep updates, hotfixes |

---

## When Roles Split vs Merge

A role should be split when its output becomes a **spec that another role consumes**.

| Merged (simple game) | Split (complex game) |
|----------------------|----------------------|
| One Design agent | Art Director → Asset Artist pipeline |
| Game Designer handles levels | Game Designer + Level Designer |
| DevOps handles release | DevOps + Release agent |

The Director makes this call — not the plan.

---

## Generated Game Repo Structure

```
[game-name]/
├── CONCEPT.md         ← from Concept Generator
├── GAME_PLAN.md       ← from Director (phases, team, decisions)
└── agents/
    ├── gamedesign.md  ← role prompt + scope (only roles Director selected)
    ├── dev.md
    ├── qa.md
    └── ...
```

---

## Phase Plan (for building tech9 itself)

### Phase 1 — Define the Vocabulary
- [ ] Write role definitions for all Layer 2 agents (prompt template, I/O contract)
- [ ] Define the `CONCEPT.md` schema
- [ ] Define the `GAME_PLAN.md` schema

### Phase 2 — Build the Meta Agents
- [ ] Concept Generator prompt + workflow
- [ ] Director prompt + team selection logic
- [ ] Director scaffolding output (generates game repo from selections)

### Phase 3 — Prove It Works
- [ ] Run the full pipeline on a real game idea
- [ ] Iterate on role definitions and Director logic based on output quality
- [ ] Ship the game

---

## DevOps: Localhost First

DevOps always delivers a working localhost target before any remote deployment. This is not
optional — it's the first deliverable. Sequence is always:

1. **Local dev server** — game runs on localhost, no build step if possible
2. **QA plays on localhost** — sign-off required before deploy
3. **Build pipeline** — only after QA pass
4. **Deploy** — only after a successful build

This unblocks QA early and prevents deploying broken builds. Deploy target (GitHub Pages,
Netlify, itch.io, etc.) is a separate decision made after the game is playable.

---

## Notes
- tech9 is the factory. Game repos are products. Keep them cleanly separated.
- The Director's job is assembly, not control — once agents are running, they own their domain.
- Art Director output is a doc; Asset Artist consumes it. Don't skip the handoff.
- Tech stack, engine, and release platform are **agent decisions** made per game.
- Post-Launch is optional until there's something shipped.
