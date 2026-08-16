# Vulpine — perf

Two lanes, different problems, no shared causes:

- **Frame time.** Target is ship criterion 3, **16.6 ms at 1080p `--quality high`
  on an M1 Pro**. Currently **20.4 ms** (owner, real Chrome, 2026-08-15) after
  the render-scale fix. 3.8 ms over, and nothing is scheduled against it.
- **Boot and the hop.** Boot was 5549 ms headless, is now **~4100 ms cold and
  ~2140 ms warm** (the texture cache means a reload is the warm number). The hop
  still freezes: worst frames ~186 ms and ~165 ms across the transition.

Everything below is what is left. Finished work is one line each at the bottom.

## Instruments — run these before touching anything

- `node tools/bootprof.mjs boot|hop` — CPU sampler over navigation → `ready`, or
  over a forced hop. `--quality --level --top --interval`, and `--warm` to
  measure a reload against a filled texture cache. Cold by default, because every
  number recorded here was taken with the bakers actually running.
- `node tools/digest.mjs --out before.json` then `--against before.json` — hashes
  every baked texture, every static geometry array and a `groundAt` lattice, and
  exits 1 if a byte moved. **Any refactor of a generator is not done until this
  says identical.** Proved to catch a 6 → 6.0001 in the noise fade.
  Take the baseline on the unmodified tree; there is deliberately no committed
  one, because a stale baseline everybody ignores is worse than none.
- `node tools/shot.mjs` — fixed shots, and it exits 1 on any console error.

## Measuring rules

Four traps, all of which have already cost someone a wrong conclusion.

- **Alternate the arms; never compare batch to batch.** Boot times drift with
  whatever else the machine is doing. One flag measured as a 350 ms win taken as
  "six runs before, six runs after", and as ~30 ms taken as on/off/on/off/on/off.
  The second is the true one.
- **Fix the `shot` and the `t`.** A/B by flying is unreadable: frame time swings
  25–34 ms on scene content alone, more than most settings under test.
- **Never call `env.apply()` between arms.** It bakes a PMREM whose spike
  outlives the settle window, and `engine.avgFrameMs` is a 45-frame EMA that
  carries it. A pass that did this reported every *disabled* pass as costing time.
- **Never compare a headless number to a real-Chrome one.** Headless runs at
  `devicePixelRatio` 1. Splits transfer; milliseconds do not.

And one about this document. **Measure before you rank, not after.** Four items
in a row here were ranked from careful reasoning about how things ought to work,
and four premises turned out to be false — see Rejected. The cheap measurement
that would have caught each one took minutes.

## Open — boot

- [ ] **Run boot through the frame-budget scheduler. Best remaining lead.**
      On a *warm* boot the overlay still freezes for **1043 ms and 887 ms**.
      Neither is shader compilation. Both are synchronous work driven by
      `while (this.step(Infinity) < 1)` at `corneria.js:92` — and `step(budgetMs)`
      (`corneria.js:249`) is already a cooperative scheduler over a flat job list,
      used on every hop to build a world across frames while the player flies.
      Boot opts out of it and `main.js` is written as a straight line to match.
      Feeding boot through `step(8)` with the loader driving frames turns two dead
      seconds into an animating bar, and gives real progress (`done / total`)
      instead of the hand-guessed stage weights.
      **Watch for:** `main.js` expects a finished world when the constructor
      returns; that assumption is the actual work.
- [ ] **Cache the world fields too.** The texture cache only covers `cached()`,
      whose keys are all fixed seeds. The shore and horizon fields are per-DNA and
      still bake on every warm boot — `horizonSectorRows` 126 ms, `islandAt` 90 ms,
      plus ~270 ms still in the lattice sampler. Same store, key on the DNA id.
- [ ] **Try 512² instead of 1024². Owner's call, and the cheapest big lever.**
      Bake cost is quadratic in size; two 1024² sets dominate what is left. One
      number in `materials.js:19,21`. **Do this before any further boot work** —
      if 512 ships, some of the items here stop being worth doing.
- [ ] **Bake in Workers.** The old B6, and much less valuable than when it was
      written: the cache means most boots do no baking at all, so this only helps
      the cold one. Also note the plan's premise is wrong — the bakers are *not*
      pure `Uint8Array` producers, they construct `THREE.DataTexture`
      (`textures.js:159,183,345`), and half the generators live in
      `world-materials.js` reading module-global `DNA` in 17 places. Realistic
      ceiling ~800 ms off a cold boot, for a multi-hour restructure of both
      generator files.

## Open — the hop

- [ ] **Uniform-ise the atmosphere.** Per-preset values are baked as literals into
      a global `ShaderChunk` (`environment.js:296` explains why), so any hop that
      changes preset recompiles every fogged material: **+25 programs, measured.**
      This is the real remaining compile cost — not the centreline, which has
      already been dealt with. Hard for the reason that comment states: the chunk
      is shared by materials with no `onBeforeCompile` seam to receive uniforms
      through. `ShaderLib[id].uniforms` is the only seam worth investigating.
- [ ] **The hop's ~186 ms frames are the synchronous world rebuild**, not
      compilation — `compileAsync` was tried and changed nothing. Whatever is
      done here is the same scheduler problem as boot, plus the unbudgeted dispose
      recorded in `ROADMAP.md`.

## Open — frame time

- [ ] **A5. `preserveDrawingBuffer: true`** (`engine.js:56`) is on permanently for
      the capture harness and can force a full-framebuffer copy per frame. Gate
      behind a capture flag and measure. Cheap; do not assume a win. This is the
      only scheduled item against the 3.8 ms gap.
- [ ] **A4. Parked** — only if A5 misses budget. Two options, no third: cut
      per-pixel cost in the terrain/water shaders (triplanar is 3 samples where 1
      often does; the lithology blend and horizon lookup are both per fragment),
      or render the scene at reduced resolution and upscale. Post is death by a
      thousand cuts — six passes at 0.5–1.0 ms, none worth killing alone.

## Open — housekeeping

- [ ] **`bakeStarfield` (`textures.js:319`) has zero callers.** Delete it.

**Seams worth knowing.** `engine.resize()` is the only place DPR is computed and
`post.setSize(w, h, dpr)` (`postfx.js`) fans it out to every pass — neither
should need touching per-pass. `cached()` (`textures.js`) is the only door into
the bakery. `step(budgetMs)` (`corneria.js:249`) is the only scheduler.

## Done

- **A1–A3.** `QUALITY.pixelRatio` *multiplied* the device ratio instead of
  capping it, so `high` rendered at DPR 2.5 — 6.25× the pixels — on a frame
  already measured as fill-bound. Split into `renderScale`, added the panel
  slider, owner picked 0.95 at quality step 3: **26–40 fps → 49 fps / 20.4 ms.**
- **A3b–A3d.** Quality collapsed to one dial (pass swatches survive behind Fine
  knobs as an instrument); hull blur mask hardwired on, being a correctness
  feature of the motion pass; dev shortcut digits derive from `TOOLS` order.
- **B2.** `STAGE_FRAMES` 4 → 1, ~155 ms of idle. `stage()` also snaps and redraws
  after the loop, or the bar fades out at 97% having never shown a full one.
- **B3.** Inlined `latticeNoise`'s wrap and fade — it was 28% of all boot.
  **~1050 ms.** The general modulo stays: callers sample at world coordinates.
- **B4.** Fused five bakers that evaluated the same noise 2–3× per texel.
  **~545 ms.** Fused rather than cached — a `Float32Array` cache would have
  rounded the samples and moved the output.
- **B5 (half of it).** Centreline moved to uniforms and the atmosphere program
  cache key changed from a counter to a hash of the installed chunk text.
  Re-applying a preset went +25 programs → +0. **These two must stay together:**
  the key change makes cross-world program reuse possible, and reuse is only
  correct because the centreline no longer bakes this world's channel in as
  literals. Either one alone renders the wrong shoreline, silently.
- **Texture cache.** Baked textures persist in IndexedDB, so **warm boot ~2140 ms
  against ~4100 cold**. Guarded twice, and both guards matter: the generator
  module sources are hashed at startup, and `cached(key, fn)` stores
  `fn.toString()` (where the call-site params live) beside the bytes.
  `digest.mjs` always passes `texcache=0` — a tool that proves the generators
  unchanged must not read their output from a cache. `?texcache=0` disables,
  `__VULPINE__.clearTexCache()` empties.

## Rejected — do not re-open without new evidence

- **B1. Gating `renderer.debug.checkShaderErrors`.** Moves the driver wait rather
  than removing it: `getProgramInfoLog` out, `getProgramParameter` in, `(program)`
  unmoved at 349 ms, boot A/B'd at ~30 ms. three cannot build a uniform map
  without `getProgramParameter(program, ACTIVE_UNIFORMS)` and *that* is what
  blocks. Owner has also ruled on the trade: no production build, no players, a
  failed shader must be loud. With the check off, a broken shader renders wrong
  in total silence and `shot.mjs` still exits 0 — verified both ways.
- **B5's premise.** "three's program cache is keyed on shader source" is false.
  `getProgramCacheKey` (`three.module.js:7768`) pushes `shaderID`, defines,
  parameters and `customProgramCacheKey` — **not** the patched source. Programs
  across boot and three hops are **91 → 154 → 156 → 189, identical before and
  after** uniform-ising the centreline. The growth is new materials for new
  worlds and transit effects. The `89 → 282` in `ROADMAP.md` is the disposal bug
  and is *not* this defect; they were filed as one and are not.
- **`compileAsync`.** Tried and reverted. Estimated ~300 ms; delivered six extra
  painted frames and one paint gap shortened 388 → 323 ms. Wall time to `ready`
  unchanged alternated three times, hop's worst frame unchanged. It issues the
  same GL calls — only the *wait* moves off-thread — and a hop does not stall on
  linking. Worth redoing only alongside the boot scheduler item, which would give
  the freed thread something to do.
- **B7. GPU render-to-texture bakers.** A large rewrite of deterministic seeded
  code, for work the GPU is idle during anyway. (The other half of this item,
  caching to IndexedDB, was dismissed here for reasons that were wrong — decode
  cost does not apply to raw typed arrays — and has since shipped.)
