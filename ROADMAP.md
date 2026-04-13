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

### 5. Agent loop contract + slash commands as interrupt points

#### The problem with slash commands as primitives

`/run-art` was introduced as a human-invoked command. In practice it exposed a gap:
the art agent had no autonomous loop — it wrote a manifest, handed off, and waited for
a human to pull the trigger on generation. Every iteration (generate → eyeball → tweak
prompt → regenerate) required explicit human invocation. That is not a scalable pattern
across agents or games.

Slash commands should not be the primary flow. They are **interrupt points** — ways for
a human to override, resume, or inspect an agent's loop. The agent owns the loop.

#### The agent loop contract

Every agent that produces iterative output (art, dev, audio, qa) must define:

1. **Loop** — what it repeats autonomously until done or blocked
2. **Completion signal** — what "done" looks like (all sprites pass review, all phases
   green, etc.)
3. **Block conditions** — what causes it to pause and surface a decision to the human
   (ambiguous concept, approval required, tool unavailable)
4. **Interrupt points** — named moments in the loop where a human *can* intervene via
   slash command, but does not have to

For the art agent specifically:

```
loop:
  for each sprite category in manifest:
    generate one proof sprite
    self-review: does it match the style spec? (read the image, check palette/silhouette)
    if yes: generate remaining sprites in category, continue
    if no: revise prompt, retry (max 2 attempts)
    if still failing: BLOCK — surface to human with both attempts shown

completion: all categories generated and self-reviewed
block conditions: tool unavailable (Ollama down), ambiguous style direction,
                  >2 failed attempts on a category
interrupt points: /proof-art (show current category proof and pause),
                  /run-art (skip self-review, generate full batch immediately)
```

The art agent does not wait for `/run-art` to be invoked. It runs, self-reviews using
image reads, and only surfaces to the human when it is genuinely blocked.

#### Slash commands as the interrupt surface

Slash commands are how the human reaches into a running agent loop. They are consistent
across all games and all agents. Convention:

| Pattern | Meaning |
|---------|---------|
| `/run-<agent>` | Start or resume the agent's full loop from current state |
| `/proof-<agent>` | Pause after the next proof unit, show it, wait for input |
| `/status-<agent>` | Report current loop position without interrupting |
| `/reset-<agent>` | Restart the agent's loop from scratch |

These are not game-specific. They are framework-level conventions the Director uses
when declaring a game's agent roster. Any agent the Director spins up gets this interrupt
surface for free — the slash command stubs are scaffolded by default.

Game-specific commands (`/run-art:terrain`, `/run-art:portraits`) are sub-scoped
variants of the same pattern, derived by the Director from the manifest structure (§6).

#### Where to patch

- ~~`vocab/roles/*.json` — every role definition gains a `loop`, `completion`, `block_conditions`, and `interrupt_points` field~~ — stale. Loop contract lives in the agent skill file (`run-art.md`), not in role JSON the Director consumes. Adding fields nobody reads is noise.
- `meta/02_director.md` — Director validates that every agent in the team config has a
  defined loop contract before the game plan is written
- ~~`tools/scaffold.js` — scaffolds `/run-<agent>`, `/proof-<agent>`, `/status-<agent>` skill stubs for every agent in the team config~~ — stale. Agents own their loops; a heavy scaffolded command surface contradicts that. Slash commands are rare human interrupts, not boilerplate.
- `skills/run-art.md` — rewritten as an interrupt point spec, not a primary invocation doc;
  documents that the art agent runs autonomously and this command is an override

---

### 6. Director emits game-specific CLI

The current primitive set (`/generate`, `/run-art`) is concept-agnostic — every game gets
the same handles regardless of what iteration loops it actually needs. As a game matures
past scaffolding, the relevant iteration surface diverges: a tilemap RPG needs
`/run-art:terrain`, a physics platformer needs `/qa:collision`. Forcing authors to derive
these manually re-discovers work the Director already has enough context to declare.

**The Director's output should include a `scripts` block — a set of game-specific slash
command stubs derived from the concept and team config.**

- Director inspects the concept's genre, scene count, asset categories, and phase plan
- Emits a `scripts:` section in the team config listing named commands, their responsible
  agent, and their invocation (e.g. `run-art:terrain → art agent, manifest filter: terrain/`)
- Scaffolder writes these as skill stubs into the game's local `.claude/` or documents
  them in `agents/dev.md` as npm-style script targets
- Commands are *derived*, not generic — a Snake-scale game gets no art scripts; a
  60×40 tilemap RPG gets `/run-art:terrain`, `/run-art:buildings`, `/run-art:portraits`

**Contract:**
- Game-specific scripts are scoped to the game directory, not added to the global skill set
- Naming convention: `<primitive>:<category>` (e.g. `run-art:terrain`, `proof-art:heroes`)
- Director re-emits the scripts block if the concept or phase plan changes materially

**Where to patch:**
- `meta/02_director.md` — add scripts derivation step to the Director's output spec
- `vocab/roles/director.json` — `outputs` field includes `scripts[]`
- `tools/scaffold.js` — reads `scripts[]` from team config, writes stub skill files

---

### 7. Historian agent — cross-game learning loop

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
