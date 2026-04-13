# tech9

An indie game studio that runs on Claude subagents.

You give it a game idea. It builds the game.

---

## Games

| Game | Status | Play |
|------|--------|------|
| [🧑‍🚀gravelrun](games/gravelrun/) | alpha | [▶ play](https://gallak87.github.io/tech9/) |
| [🐍snake](games/snake/) | shipped | [▶ play](https://gallak87.github.io/tech9/snake/) |
| [🛩️skyrift](games/skyrift/) | alpha | [▶ play](https://gallak87.github.io/tech9/skyrift/) |
| [🛰️void-sentinel](games/void-sentinel/) | alpha | [▶ play](https://gallak87.github.io/tech9/void-sentinel/) |
| [⚔️chronoforge](games/chronoforge/) | alpha | [▶ play](https://gallak87.github.io/tech9/chronoforge/) |

---

## How it works

```
  your idea
      │
      ▼
  Concept Generator ── CONCEPT.md ── [ confirm ]
      │
      ▼
  Director ── GAME_PLAN.md ── [ confirm roster + phases ]
      │
      ▼
  Agents build, phase by phase
      │
      ▼
  play it on localhost → ship
```

---

## Quickstart

Sharpen your idea into a tight paragraph first — vague input = vague game. Use a cheap model (Haiku works) to get there fast.

```
/generate "your one-paragraph pitch"
```

**Gate 1 — concept.** The Concept Generator drafts `CONCEPT.md` and stops. Read it, push back, cut scope. Don't proceed until it's right.

**Gate 2 — roster.** The Director proposes a team and stops:

```
  Team (6 active):

  Active  Role        Why
  ──────────────────────────────────────────────────────────────
  ✓       gamedesign  ATB math, skill trees, economy balance
  ✓       art         Visual style + sprite gen via Ollama
  ✓       audio       SFX variants + stinger cues
  ✓       dev         Engine, battle system, menus
  ✓       devops      Localhost + deploy
  ✓       historian   Learnings → feed future gens
  ✗       asset       Merged into art
  ✗       level       Skipped — handcrafted map
  ✗       postlaunch  Out of scope

  8 phases: Scaffold → Design → Overworld → Battle →
            Base → Progression → Polish → Ship

  Does this team and phase plan look right?
```

Confirm → agents start. Each phase ends with a playable localhost build.

---

## Image gen

Agents call `/run-art` internally. Requires Ollama with a Flux model:

```bash
ollama run x/flux2-klein
```

No Ollama → agents fall back to placeholder sprites. Game is fully playable either way.

---

## Between phases

This is where the game gets made. Agents surface decisions — answer them, iterate, get it right here rather than coming back later.

You control the commit/push cadence. Agents won't do it for you. When a phase feels solid:

```
  phase done
      │
      ├── play the build on localhost
      ├── iterate — push back on anything that feels off
      ├── commit when it's right
      └── tell it to continue → next phase
```

The main lever mid-phase is `/run-art` — call it when sprites need a regen. The art agent self-reviews before committing a full batch; step in if something looks wrong. TODO: add more levers

---

## Agent vocabulary

| Agent | Role |
|-------|------|
| `gamedesign` | Mechanics, systems, balance |
| `art` | Visual style, sprite gen |
| `level` | World layout, level structure |
| `audio` | SFX, music direction |
| `dev` | All game code |
| `devops` | Dev server → build → deploy |
| `historian` | Cross-game learnings |

The Director picks what the game needs. Simple game → fewer agents.

---

## Structure

```
tech9/
├── ROADMAP.md           ← framework evolution
├── .claude/commands/    ← slash commands (/generate, /run-art)
├── tools/               ← sprite-gen, scaffold, probe
├── vocab/               ← agent role definitions
├── meta/                ← Concept Generator + Director
└── games/
    └── <game>/
        ├── CONCEPT.md
        ├── GAME_PLAN.md
        ├── agents/
        └── src/
```
