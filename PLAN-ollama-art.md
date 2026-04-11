# Plan: Ollama Image Gen Integration

## Status
- [x] Explored Ollama API (`x/flux2-klein` confirmed working, returns `image` key as base64 PNG, 1024×1024 RGB)
- [ ] Immediate patch: wire Ollama into gravelrun art
- [ ] Long-term: make this a first-class pipeline capability

---

## Immediate (gravelrun patch)

### 1. `tools/sprite-gen.js`
- CLI: `node tools/sprite-gen.js <manifest.json> [--sprite <name>]`
- Auto-discovers Ollama at `http://localhost:11434` (no config required)
- `.env` override via `OLLAMA_HOST` if needed later
- Takes prompt + output path per sprite, saves PNG to `games/[game]/src/assets/`
- If Ollama unreachable: exits with clear error message

### 2. `games/gravelrun/sprites-manifest.json`
- One entry per sprite: `{ name, prompt, out }`
- Sprites needed: player (idle + run frames), walker enemy, jumper enemy, ground tile, platform tile
- Prompts: pixel art style, dark industrial palette, black background (composites cleanly against dark game bg)

### 3. `games/gravelrun/src/sprites.js`
- Replace hand-crafted 2D pixel arrays with `Image()` loading
- `imageSmoothingEnabled = false` to keep pixel art crisp at any scale
- Preload all sprites before game loop starts (Promise.all)
- Keep the same external API (`sprites.player.draw(ctx, x, y, ...)`) so game.js changes are minimal

### 4. `games/gravelrun/agents/art.md`
- Document the new workflow: write prompts in manifest → run sprite-gen → iterate
- Replace the "hand-craft pixel arrays" instructions with Ollama-based workflow

---

## Long-term (don't build yet)

### Capability system
```
tech9/
├── capabilities/
│   ├── image-gen.md     ← what it is, invocation, prompt best practices, fallback behavior
│   └── audio-gen.md     ← future
├── tools/
│   ├── sprite-gen.js    ← (built in immediate patch, promoted here)
│   ├── probe.js         ← checks what capabilities are live at runtime
│   └── ...
```

### Director capability awareness
1. `probe.js` runs at scaffold time — checks what's live (Ollama, etc.)
2. Director injects relevant capability docs into agent stubs that need them
3. No hardcoded assumptions; graceful degradation if a capability isn't running

### Per-game `.claude/commands/`
When Director scaffolds a game, also scaffold `.claude/commands/` with one command per active agent:
```
games/[game]/
└── .claude/
    └── commands/
        ├── run-art.md      ← re-runs art agent (with Ollama workflow if available)
        ├── run-dev.md
        └── run-qa.md
```
This lets you re-run any agent independently — critical for sprite iteration loop.

### Config story
- Default: auto-discover `localhost:11434`, no setup required
- Override: `.env` with `OLLAMA_HOST`, `OLLAMA_MODEL`
- Probe result travels with the scaffolded game so agents know what they have

---

## Open questions
- Flux generates RGB (no alpha). Black background blends okay against dark game bg — but
  may need revisiting for games with lighter backgrounds. Future: probe for a segmentation
  model and add background removal step.
- Animation frames: Flux is single-image, not a spritesheet tool. For multi-frame animation,
  either generate per-frame (slow but works) or accept static sprites for now.
