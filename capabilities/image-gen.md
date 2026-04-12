# Capability: image-gen (Ollama)

Locally-hosted image generation via Ollama. Produces PNG sprites from text prompts.
No API key, no network — runs entirely on the machine that's running the game tools.

## Probe

Before using this capability, check whether it's available:

```
node tools/probe.js
```

Output tells you if Ollama is reachable and which models are loaded.
Check specifically for a model with `flux` in the name — that's the image gen model.

If Ollama is not reachable: describe the sprites in a markdown spec instead. Do not block
game progress. Art output in fallback mode is a written spec, not images.

## Invocation

```
node tools/sprite-gen.js <manifest.json>
node tools/sprite-gen.js <manifest.json> --sprite <name>
```

The manifest lives at `games/<game>/sprites-manifest.json`.

### Manifest format

```json
{
  "host":    "http://localhost:11434",
  "model":   "x/flux2-klein",
  "sprites": [
    { "name": "player", "w": 32, "h": 32, "prompt": "...", "out": "src/assets/player.png" },
    { "name": "enemy",  "w": 24, "h": 24, "prompt": "...", "out": "src/assets/enemy.png"  }
  ]
}
```

`host` and `model` are optional — defaults to `localhost:11434` and `x/flux2-klein`.
`OLLAMA_HOST` env var overrides host if set.

**Always set `w` and `h`** matching the game's actual sprite dimensions. Ollama generates 1024×1024
regardless of what you ask for — sprite-gen resizes to `w`×`h` immediately after saving using `sips`.
Without these fields the file stays at 1024×1024 (~800kb) and the game scales it down at runtime,
which is wasteful. A 32×32 PNG should be under 1kb.

## Prompt best practices

Always include:
- `pixel art` — locks the style
- `black background` — composites cleanly against dark game backgrounds
- `retro platformer` or the relevant genre term
- `crisp limited palette` — keeps it readable at small sizes
- Describe silhouette first — that's what reads at 32×32

Describe what distinguishes this sprite from others in the same game (player vs enemy silhouette,
tiles vs characters). At 32×32, unique silhouette is the whole design.

For tiles: add `seamless`, `no border` — makes them tileable without visible seams.

Avoid:
- Photorealistic descriptors (`realistic`, `3D`, `cinematic`)
- Color gradients — compress poorly at small sizes
- Too many details — they disappear at 32×32

## Output

Saves PNG to the `out` path relative to the manifest file. Creates directories if needed.
Images are base64-decoded from Ollama's `image` field in the response.

## Known limitations

- Ollama model (`x/flux2-klein`) outputs 1024×1024 RGB — no alpha channel. Always specify `w`/`h`
  in the manifest so sprite-gen resizes down immediately (uses `sips`, macOS only).
- Black backgrounds composite okay against dark game BGs but need masking for light backgrounds
- Single-frame output only — multi-frame animations require one sprite per frame
- Generation is slow (~10–30s per sprite depending on hardware)
