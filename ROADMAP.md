# tech9 — Roadmap

## Where we are

The pipeline works as a manual simulation. `/generate` proves the design:
a concept doc feeds a director, a director selects and scopes agents, agents build the game.

Snake shipped. The proof of concept is done.

What we have is Claude-as-the-generator — the pipeline runs inside inference, not in code.
It works, but it's not repeatable or autonomous. Every run is whatever Claude decides that day.

---

## What "productionalizing" means

**Now:**
```
/generate "snake" → Claude reads skill prompt → Claude writes files by hand
```

**Goal:**
```
/generate "snake" → Concept Generator agent runs → structured CONCEPT.md output
                  → Director agent runs → structured team config output
                  → scaffolder code reads config → generates file structure
                  → agents are spawned with generated prompts → they do the work
```

The difference is repeatability and autonomy. Logic in code, not in inference.

---

## Phase 1 — Formalize the Vocabulary

Right now role definitions are prose markdown. They need to become structured definitions
that code can read and act on.

- [ ] Define a role schema (JSON or YAML): name, responsibility, inputs, outputs, dependencies, merge rules
- [ ] Convert all 10 vocabulary roles to that schema
- [ ] Define the `CONCEPT.md` schema — what fields are required, what's optional
- [ ] Define the `GAME_PLAN.md` schema — team config, phase plan, deferred decisions
- [ ] Define the agent stub schema — what every generated agent file must contain

Output: a `vocab/` directory with structured role definitions and schemas the Director can consume.

---

## Phase 2 — Build the Meta Agents as Code

Replace the manual simulation with actual logic.

### Concept Generator
- [ ] Structured prompt that outputs a valid `CONCEPT.md` (enforced schema)
- [ ] Validation step — reject/retry if required fields are missing or vague

### Director
- [ ] Reads `CONCEPT.md`, outputs a team config (structured, not prose)
- [ ] Team config drives scaffolding — deterministic file generation from config
- [ ] Merge/split logic is explicit rules, not implicit inference
- [ ] Vocabulary expansion flow: propose → human approval → write back to vocab

### Scaffolder
- [ ] Code (not Claude) that reads the Director's team config and generates:
  - `GAME_PLAN.md`
  - `agents/[role].md` stubs (from vocab templates + concept context)
  - `src/` skeleton (from devops agent)
- [ ] Idempotent — safe to re-run if the concept or team config changes

---

## Phase 3 — Prove it Scales

Run the full automated pipeline on a second game. Harder than snake.
The goal is to find where the structured output breaks down and fix the schemas.

- [ ] Pick a game with more complexity (needs level designer, asset artist, etc.)
- [ ] Run pipeline end-to-end with minimal human intervention
- [ ] Identify which agents produced bad output and why
- [ ] Iterate on role definitions and Director logic
- [ ] Ship the second game

---

## What doesn't change

- The vocabulary (roles, responsibilities, merge rules) — already solid
- The localhost-first devops pattern — baked in
- The clean separation between tech9 (factory) and game repos (products)

---

## Pipeline notes

### QA role → /code-review

The `qa` role in the generator ran too eagerly — spawning before art/dev agents had
produced anything meaningful, though it did catch minor issues. Replacing it with a
manual `/code-review` command so review happens at the author's discretion, not on
a fixed phase timer. The qa role stays in `vocab/roles/` as a reference but will be
excluded from generated team configs by default.

### Sprite black background

Flux always generates on solid black — no native transparency. Three options to pick from:
- **ImageMagick** (`convert -fuzz 15% -transparent black`) — simplest if available
- **One-time pixel scrub at load** — `getImageData` in JS, zero alpha on near-black pixels
- **Pipeline step** — `tools/sprite-postprocess.js` runs after gen, bakes clean PNGs to disk

Chroma key (magenta bg) is also an option to make scrubbing more precise.

---

## Recurring per-game patch-outs (patch the framework, not the game)

These are items we re-discover on every game (skyrift, void-sentinel, chronoforge all hit them).
When the Concept Generator / Director / Scaffolder move from Claude-in-inference to real code,
bake these in as defaults so games don't have to re-derive them.

### 1. Screen-blend sprite compositing

Because flux outputs solid black backgrounds, every game's `drawSprite` helper needs
`ctx.globalCompositeOperation = 'screen'` for non-tile sprites. Otherwise you get visible
black rectangles around every sprite against dark scenes.

- **Where to patch:** the `dev` role's scaffolded sprite-loader template (or whatever
  reusable sprite module the devops/dev agent ships).
- **Default contract:** `drawSprite(ctx, name, x, y, w, h, { blend })`. Auto-apply `'screen'`
  for non-`tile_` prefixed sprites unless caller overrides. Also set
  `ctx.imageSmoothingEnabled = false` inside the blend block to keep pixel crunch.
- Reference impls: `games/skyrift/src/game.js` drawSprite, now
  `games/chronoforge/src/sprites.js` drawSprite.

### 2. Sprite fidelity prompt contract

The art agent's default prompt scaffolding on the first two games was too terse and produced
low-detail sprites — lots of flat silhouettes, no shading, no glow. The fix is to bake richer
language into the art role's default `style_prefix` and per-sprite prompt template.

- **Style prefix must include:** `pure black background (#000000)`, `detailed shading with
  rim light`, `soft glow halo around neon elements`, `chunky pixel highlights`, `gradient
  dithering on volumes`, `crisp readable silhouette centered in frame`, `no text, no
  watermark, no border frame`.
- **Per-sprite prompt must describe:** silhouette + pose, **lighting direction / rim-light
  source**, **material reads** (matte/metallic/fabric), **accent glow colors**, and framing
  ("centered on black").
- **Minimum useful dimensions:** battle sprites ≥ 96px, portraits ≥ 144px, city/landmark
  illustrations ≥ 192×144. Icons/tiles can stay 24–40px. Below those sizes, sips downscale
  destroys the detail flux produces.
- **Where to patch:** the `art` role's stub template + `sprites-manifest.json` scaffolder in
  `tools/scaffold.js`. Also extend `capabilities/image-gen.md` with the fidelity checklist.

### 3. Scrollable-map overlays need a reset-view control

Any menu/map with pan + zoom needs a "reset view" affordance from day one — pan/zoom gets
stuck off-screen and users can't recover without a hotkey + visible button. Trivial to add,
easy to forget.

- **Where to patch:** the `gamedesign` role's UX checklist for any overlay that supports
  pan/zoom. The dev role's menu template should ship with a `resetView()` helper and a
  keybound visible button.
- **Default keybind:** `R` or `0`. Button label: `RESET VIEW [R]`.

### 4. Rendering tier selection (stop defaulting to Canvas 2D)

Every game so far (snake, skyrift, void-sentinel, chronoforge) shipped on raw Canvas 2D
because it was zero-dependency and fast to prototype. Chronoforge hit the ceiling: a
60×40 tilemap + per-tile fog + placeholder text = 50% CPU on a single Chrome tab before
any optimization passes. Canvas 2D is CPU-bound immediate-mode rendering with no batching
— every `fillRect` is a driver draw call. Any game past ~2k state-changing draws per
frame needs a different tier.

**The Director should pick a rendering tier from the concept, not default to Canvas 2D.**

Decision rubric (bake into `vocab/roles/dev.json` as a selector):

| Tier | When to use | What you get |
|------|-------------|--------------|
| **Canvas 2D** | ≤ a few hundred draws/frame. Snake-scale. Menus. Splash screens. | Zero deps. Immediate mode. Dies past ~2k state-changing draws. |
| **PixiJS** | Tilemaps, particle effects, >500 sprites, any 2D game with scrolling world. | Sprite-batched WebGL under a 2D API. 10k+ sprites at 60fps. Same mental model as Canvas 2D, ~10× headroom. This is the right default for most of our catalog. |
| **Phaser** | Full games with scenes, physics, input management, tilemap loaders, tweens, audio buses. | Batteries-included 2D framework on top of Pixi. Heavier dep + more opinions, but cuts a lot of bespoke infra. |
| **Three.js** | Actual 3D (iso meshes, dynamic lighting, voxel worlds). | Skip for 2D pixel-art — the runtime is fine, but the *asset pipeline* is the real cost: one sprite is a 30kb PNG from flux in ~20s; a 3D asset is mesh + rig + animations + albedo/normal/roughness/emissive maps, and open 3D generators (Trellis, Hunyuan3D-2, Meshy) take minutes per asset and still need DCC-tool cleanup. Pick this when the *concept* is designed for 3D, don't bolt it onto a 2D game. |
| **WebGPU** | Not yet — Safari support still patchy in 2026. Revisit end of year. | The future, but not the default today. |

**Rust/WASM is a separate axis:** it solves *compute* bottlenecks (physics sims, voxel
gen, raytracing), not rendering. Don't reach for it unless a game's logic layer is CPU-
bound, which none of ours have been. Our bottleneck is always GPU batching.

**Where to patch:**
- `meta/02_director.md` — add a "rendering tier" question to the decision pass, based on
  entity count / world size / animation density estimated from the concept.
- `vocab/roles/dev.json` — enumerate the supported tiers and what scaffolding each one
  ships (index.html skeleton, boot module, asset loader).
- `tools/scaffold.js` — tier-specific `src/` templates, so Canvas 2D games don't carry
  Pixi deps and Pixi games don't reinvent sprite batching.
- Retrofit existing games in a later pass if we want to bump them (chronoforge → Pixi
  would be a real win).

### 5. Historian agent — cross-game learning loop

Every game gen produces learnings: perf pitfalls, prompt-fidelity patterns, UX failures we
repeat, audio cues that landed or didn't. Today those learnings live only in this ROADMAP
(the patch-out entries above are literally post-hoc lessons) and in commit history. That's
fragile — the next game re-hits the same walls because no agent reads them on spin-up.

**The Historian is a post-hoc agent that runs after each game's final phase.** It ingests
the finished game's artifacts and writes durable lessons into a structured log the
Director reads at the *start* of every future gen.

**Inputs:**
- The game's `GAME_PLAN.md`, `CONCEPT.md`, and all `agents/*-output.md`
- Git log + diffs since scaffold (what was actually built vs. planned)
- Roadmap patch-out entries added during the build
- User feedback captured during play (optional — stays in chat unless flagged)

**Outputs:**
- `games/<game>/LESSONS.md` — per-game observations (what worked, what didn't, numbers
  that felt right: "ATB full gauge at 1.2s, not 2s")
- `meta/LESSONS.md` — aggregated, tagged by domain (`perf`, `art`, `scaffold`, `audio`,
  `ux`). Director reads this on every run and filters by relevance to the concept.

**Graduation model (critical — prevents context bloat):**

Lessons are a *staging ground*, not a permanent log. When a lesson proves durable across
2+ games, it **graduates** — the Historian (or a manual pass) patches it into the
framework and deletes it from LESSONS.md:

- Per-role rules → `vocab/roles/*.json` (enforced by default in every team config)
- Director decision rubrics → `meta/02_director.md` (picked up in every concept pass)
- Scaffolder defaults → `tools/scaffold.js` (shipped in every new game's `src/`)
- Cross-cutting framework patterns → new entry in this ROADMAP's patch-outs section

What *stays* in LESSONS.md is genuinely per-game or still-unproven observations. If
`meta/LESSONS.md` grows past ~200 lines after a few games, that's the signal to run a
graduation pass — don't let it become a novel.

**Where to patch:**
- `vocab/roles/historian.json` — new role definition
- `meta/02_director.md` — Historian runs after QA gate on final phase (like devops owns
  deploys, historian owns learnings)
- `meta/03_scaffolder.md` (or `tools/scaffold.js`) — scaffold `agents/historian.md` stub
  by default on every new game
- `meta/00_concept_generator.md` + `02_director.md` — both read `meta/LESSONS.md` filtered
  by concept tags on spin-up
- `tools/scaffold.js` — create `meta/LESSONS.md` if it doesn't exist, leave untouched if
  it does (append-only from Historian, human-editable for manual graduation)

**Open questions (defer to first implementation):**
- Does Historian run fully autonomous or require a human "graduate this?" approval step?
  Lean toward approval for graduations; autonomous for per-game log writes.
- Staleness: a lesson from chronoforge-Canvas-2D becomes misleading after the Pixi
  conversion. Need a "still true?" review flag with a timestamp on each entry.
- How does it interact with user memory? Memory is Claude-session-scoped; LESSONS is
  repo-scoped and survives across Claude instances. They're complementary, not redundant.
