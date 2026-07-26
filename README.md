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

Confirm → before saying **let's go**, switch to Opus. Agents are doing real multi-file reasoning across phases — Sonnet will work but Opus holds context better and makes fewer wrong turns. Each phase ends with a playable localhost build.

---

## Godot games

Most games here are web (Canvas2D / Pixi / Three.js) and need nothing installed. The 3D ones are Godot and need a bridge so agents can actually *see* what they build.

| Game | Stack |
|------|-------|
| [duneglide](games/duneglide/) | Godot 4.6, Forward+ |
| [void-fracture](games/void-fracture/) | Godot 4.6, Forward+ |

Without the bridge an agent can write GDScript but can't launch the game, read the scene tree, inject input, or take a screenshot — so it's coding blind and you become the render loop. With it, it runs the game, flies it with synthetic input, screenshots the result, checks the frame budget, and iterates on its own.

### Setup

Needs [Godot 4.4+](https://godotengine.org/download) and Node 18+.

```bash
npm run mcp:setup
```

That clones [tugcantopaloglu/godot-mcp](https://github.com/tugcantopaloglu/godot-mcp), builds it, finds your Godot binary, and writes a project-scoped `.mcp.json`. Restart Claude Code, then confirm with `/mcp`.

```bash
npm run mcp:check    # report status, change nothing
```

Overrides, if the defaults guess wrong:

```bash
GODOT_MCP_DIR=~/src/godot-mcp \
GODOT_PATH=/Applications/Godot.app/Contents/MacOS/Godot \
  npm run mcp:setup
```

`.mcp.json` is generated per machine (absolute paths) and gitignored. **If you already have `godot-mcp` configured at user level — check `claude mcp list` — skip this; a project-scoped copy would just register a duplicate.**

Verify it end to end by asking Claude to run `games/duneglide` and screenshot it.

### The in-game half

The MCP server is only one side. Each Godot project also carries `mcp_interaction_server.gd` at its root, registered as an autoload:

```ini
[autoload]
McpInteractionServer="*res://mcp_interaction_server.gd"
```

It opens a TCP JSON server on `127.0.0.1:9090` and is what the `game_*` tools actually talk to. **Copy it into any new Godot project or none of them work.** The port is overridable (`--mcp-port=N`, or `GODOT_MCP_PORT`) so two games can run side by side for comparison.

Gotchas worth knowing before you lose an hour to them:

- `--headless --check-only` **hangs on Apple Silicon**. Background it and `pkill -f "Godot.*headless"`.
- New `class_name` scripts are invisible to a launched game until the class cache exists. Run `Godot --headless --editor --quit --path .` once after adding one, or you get `Identifier "X" not declared in the current scope`.
- Don't `await` inside the `game_eval` tool — it deadlocks against the server's busy mutex.

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
├── tools/               ← sprite-gen, scaffold, probe, setup-godot-mcp
├── vocab/               ← agent role definitions
├── meta/                ← Concept Generator + Director
└── games/
    └── <game>/
        ├── CONCEPT.md
        ├── GAME_PLAN.md
        ├── agents/
        └── src/
```
