# Party direction comparison

Open `/art-lab/kaida-guided-idle/` on the remake server. The existing URL now compares the current approved idle with new **front, back and right standing poses**. The character selector supports Kaida, Vex and Rune; `?hero=vex` or `?hero=rune` opens either directly.

The old three-pose breathing preview is preserved unchanged at [`breathing-study.html`](breathing-study.html). Its local image, guide and prompt links still work. No historical generation assets were replaced by this page update.

## Controls

- **All directions:** current approved frame plus all three static candidates.
- **Close comparison:** current frame beside the selected direction; defaults to right.
- **Overlay:** opacity comparison for transparent candidates, or manual A / B for opaque candidates.
- **Size:** roughly 84px game scale, 240px inspection or 360px large inspection. All visible cards share the same scale and shrink together on narrow screens.
- **Backdrop:** slate, warm paper or a CSS transparency grid. The selectable grid is never copied into sprite pixels; a checkerboard already painted into a generated source remains visible on every backdrop.
- **Current idle:** optional play/pause and frame scrubbing. Candidate directions never animate.
- **Reload:** refetch metadata and images after a new local generation arrives. Missing studies show an error while any available current reference remains visible.

Rendering uses display size × device pixel ratio, with a 2048px maximum backing edge and high-quality smoothing. Resizing and DPR changes repaint the comparison. Playback starts paused, pauses when the page is hidden, and responds to reduced-motion preference changes.

## Sources and alignment

The reference is always selected through `HERO_IDLE_SHEETS[hero]` in `../../src/hero-idle.js`, and loaded with `createHeroIdleFrames`. Registered per-frame offsets are applied as in the game, without changing the sheet. No frozen copy of an older approved reference is substituted.

The selected study is fetched from `../<hero>-directions/study.json`. Candidate, prompt and generation record paths resolve relative to that metadata file. Expected structure:

```json
{
  "title": "Kaida direction study",
  "candidate": {
    "file": "candidate.png",
    "columns": 3,
    "rows": 1,
    "poses": [
      {"id": "front", "label": "Front"},
      {"id": "back", "label": "Back"},
      {"id": "right", "label": "Right · match current"}
    ]
  },
  "reference": {"hero": "kaida"},
  "promptFile": "prompt.txt",
  "generationFile": "generation.json"
}
```

Each pose may additionally provide:

- `crop: {x, y, width, height}` — integer source-sheet coordinates. Default: its equal column. This accommodates source artwork that crosses nominal cell edges without clipping the pose.
- `originX` — planned horizontal anchor **within that crop**. Default: nominal column center minus `crop.x`.
- `bounds: {x, y, width, height}` — documented silhouette bounds **within the crop**. Used for opaque sheets where alpha cannot identify the silhouette. Default: measured alpha greater than 32.

Candidate crops are copied at native resolution. No pixels, alpha, costume geometry or colors are edited. All candidate views share one scale derived from their combined bounds, retain their planned column origins, and use a common vertical baseline in source-sheet coordinates. Their bodies are never resized or automatically recentered independently. The current sheet is scaled separately to a comparable total silhouette height; this comparison is not a claim of identical game proportions.

Opaque candidate backgrounds remain visible. When the selected pose has no transparency, the overlay slider is disabled and A / B buttons show either original image. The page explicitly reports this limitation instead of applying a color key or background mask.

## Archived breathing study

`breathing-study.html` is the previous `index.html`, preserved byte for byte. Its three poses were generated together in `candidate-three.png`, with `three-prompt.txt`, `three-edit-target.png`, `three-pose-guides.png`, `three-landmarks.json` and `prepare-three.mjs` preserving the old guide experiment. Earlier checkerboard outputs and prompts remain in this directory. That page is a historical standalone preview; the active game reference is determined by the registry above.

This page writes no save state and does not switch any game assets. No browser or gameplay testing was run for this update.
