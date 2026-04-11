# tech9

An indie game studio that runs on Claude subagents.

You give it a game idea. It assembles a team of specialized agents — designer, artist, dev, QA, audio, devops — scoped exactly to what that game needs. The agents build the game. You play it.

---

## Games built with tech9

| Game | Status | Play |
|------|--------|------|
| [🧑‍🚀gravelrun](games/gravelrun/) | alpha | [▶ play](https://gallak87.github.io/tech9/) |
| [🐍snake](games/snake/) | shipped | [▶ play](https://gallak87.github.io/tech9/snake/) |

---

## How it works

```
You: "snake but the snake is a train"
        │
        ▼
Concept Generator  →  CONCEPT.md   (what are we building, exactly?)
        │
        ▼
Director           →  GAME_PLAN.md  (which agents do we need, and in what order?)
        │
        ▼
agents/            →  one .md stub per role, each with scope + I/O contract
        │
        ▼
Agents build the game
```

Two layers:
- **Meta layer** (Concept Generator + Director) — lives in this repo only, never exported
- **Vocabulary** (all possible agent roles) — selectively exported per game based on complexity

---

## Quickstart

```
/generate <your game idea>
```

That's it. The `/generate` skill simulates the full pipeline — Concept Generator → Director → scaffolded game repo under `games/[name]/`.

---

## The Agent Vocabulary

Not every game needs every agent. The Director picks from these:

| Agent | Role |
|-------|------|
| `gamedesign` | Mechanics, systems, core loop, balance |
| `art` | Visual style guide, palette, direction |
| `asset` | Sprites, tilesets, animations |
| `level` | World layout, level structure |
| `audio` | SFX, music direction |
| `dev` | All game code |
| `qa` | Playtesting, bug reports |
| `devops` | Local dev server → build → deploy |
| `release` | Versioning, changelogs, store page |
| `postlaunch` | Support, incidents, maintenance |

Simple game → fewer agents. Complex game → more. The Director decides.

---

## DevOps philosophy: localhost first

DevOps always targets localhost before any deployment. QA plays the game locally before a
single byte goes to production. Deploy only when the game is playable and QA has signed off.

---

## Adding a new role

If the Director needs a role that doesn't exist in the vocabulary, it must:
1. Propose the new role with a full definition (name, responsibility, inputs, outputs)
2. Get human approval
3. The approved role gets added back to the vocabulary here

No free-form agent generation — the vocabulary grows deliberately.

---

## Project structure

```
tech9/
├── PLAN.md              ← architecture + vocabulary reference
├── README.md            ← you are here
├── .claude/commands/    ← slash commands (/generate)
├── games/               ← one folder per generated game
│   └── snake/
│       ├── CONCEPT.md
│       ├── GAME_PLAN.md
│       ├── agents/      ← agent stubs for this game
│       └── src/         ← game source code
└── .github/workflows/   ← CI/CD per game
```
