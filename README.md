# tech9

An indie game studio that runs on Claude subagents.

You give it a game idea. It assembles a team of specialized agents — designer, artist, dev, QA, audio, devops — scoped exactly to what that game needs. The agents build the game. You play it.

---

## Games built with tech9

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
You: "snake but the snake is a train"
        │
        ▼
Concept Generator  →  CONCEPT.md       (what are we building?)
        │
        ▼
Director           →  GAME_PLAN.md     (which agents, in what order?)
        │
        ▼
Agents             →  agents/*.md      (scoped stubs per role)
        │
        ▼
Agents build the game, phase by phase
```

Each agent owns a loop — it runs, self-reviews, and only surfaces to you when blocked.
Slash commands are interrupt points, not triggers.

---

## Quickstart

**1. Write a one-paragraph pitch.**
Use a cheap model (Haiku works) to sharpen your idea into a tight paragraph before you start. Vague input = vague concept.

**2. Run the pipeline.**
```
/generate "your one-paragraph pitch"
```
The Concept Generator drafts `CONCEPT.md`. Review it, push back, iterate until it's right — this is the most important gate. Once you agree, the Director picks the agent roster and presents it for confirmation:

```
Team (6 active):

  Active  Role        Why
  ──────────────────────────────────────────────────────────────
  ✓       gamedesign  ATB math, skill trees, economy balance
  ✓       art         Visual style + all sprite production via Ollama
  ✓       audio       SFX variants + stinger cues = real work
  ✓       dev         Engine, battle system, base management, menus
  ✓       devops      Localhost + deploy (absorbs release)
  ✓       historian   Post-phase learnings → feeds future gens
  ✗       asset       Merged into art
  ✗       level       Skipped — handcrafted map supplied by user
  ✗       postlaunch  Out of scope

  8 phases: Scaffold → Design (parallel) → Overworld → Battle →
            Base → Progression → Polish → Ship

  Does this team and phase plan look right?
```

Confirm, adjust, or push back — then the agents start building phase by phase.

**3. Image generation (optional).**
Agents call `/run-art` internally when they need sprites. This requires Ollama running locally with a Flux model:
```bash
ollama run x/flux2-klein
```
If Ollama isn't available the art agent falls back to placeholder sprites — colored shapes with labels. The game is fully playable either way; real sprites swap in when gen is available.

**4. Watch the agents run.**
Each phase ends with a deployable build. The devops agent serves it on localhost so you can play it before anything ships.

---

## Between phases — the iteration loop

After each phase completes:

- **Play the build.** Does it feel right? Note anything broken or off.
- **Commit what's done.** Each phase should be a clean commit. Don't carry forward broken state.
- **Unblock agents.** If an agent surfaced a decision (ambiguous mechanic, art direction call, UX layout), answer it before the next phase starts.
- **Interrupt if needed.** Slash commands let you reach into a running agent:

| Command | What it does |
|---------|-------------|
| `/run-<agent>` | Start or resume that agent's loop |
| `/proof-<agent>` | Pause after the next proof unit, show it, wait for input |
| `/status-<agent>` | Report loop position without interrupting |
| `/reset-<agent>` | Restart that agent from scratch |

Game-specific variants (`/run-art:terrain`, `/run-art:portraits`) are scaffolded by the Director based on what the game needs.

---

## The Agent Vocabulary

Not every game needs every agent. The Director picks from these:

| Agent | Role |
|-------|------|
| `gamedesign` | Mechanics, systems, core loop, balance |
| `art` | Visual style, sprite gen, art direction |
| `level` | World layout, level structure |
| `audio` | SFX, music direction |
| `dev` | All game code |
| `devops` | Local dev server → build → deploy |
| `historian` | Post-phase learnings → feeds future gens |

Simple game → fewer agents. Complex game → more. The Director decides.

---

## Project structure

```
tech9/
├── README.md
├── ROADMAP.md           ← framework evolution + patch-outs
├── skills/              ← slash command definitions
├── tools/               ← sprite-gen, scaffold, probe utilities
├── vocab/               ← agent role definitions
├── meta/                ← Concept Generator + Director prompts
└── games/
    └── <game>/
        ├── CONCEPT.md
        ├── GAME_PLAN.md
        ├── agents/      ← agent stubs for this game
        └── src/         ← game source
```
