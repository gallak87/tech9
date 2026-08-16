# Vulpine — perf

**Lane status: A1–A3 done and unvalidated in live play. A5 next.** The one thing
outstanding on A3 is the owner picking a render scale by eye. Target is ship
criterion 3 — 16.6 ms at 1080p `--quality high` on an M1 Pro.

**Phase B opened 2026-08-16. B2 and B3 landed the same day: boot 5549 → ~4375 ms
headless, −21%, output proved byte-identical. B1 was built, measured and
rejected** — it moved the driver wait rather than removing it, and the owner
wants a failed shader loud regardless. Boot time and the freeze at a transition
are a different problem from frame time and share none of its causes. B3 carried
the whole win. The hop is untouched: its ~0.5 s of synchronous link is real, B1
was not the way to it, and it now falls to B5.

## The finding

`core/engine.js:99` **multiplies** the device pixel ratio by the quality tier's
instead of replacing or capping it:

```js
const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.q.pixelRatio;
```

On an M1 (`devicePixelRatio` 2, `maxPixelRatio` 2), `QUALITY.high.pixelRatio`
1.25 gives an **effective DPR of 2.5** — 12.96 MP at a 1920×1080 window against
2.07 MP at DPR 1.0. **6.25× the pixels**, on a frame already measured as
fill-bound (draw count is 7% of a 38.6 ms frame; the bare scene pass is 65%).

| tier | `q.pixelRatio` | effective DPR on M1 | MP at 1080p |
|---|---|---|---|
| low / medium | 1.0 | 2.0 | 8.29 |
| **high** | **1.25** | **2.5** | **12.96** |
| ultra | 1.5 | 3.0 | 18.66 |

**Measured 2026-08-15, owner, real Chrome.** `setPixelRatio(0.5)` → DPR 1.0 →
fps into the **70s**, against the shipped 26–40 at DPR 2.5. Owner's verdict on
the DPR-1.0 image: *"pretty bad quality"*. The two arms were taken in different
sessions, so the ratio is directional, not exact.

Three consequences:

1. The perf problem is this bug, not the shaders. **A4 is parked, not scheduled.**
2. DPR 1.0 is not the shipping value either — the owner has seen it and rejected
   it on looks. The answer is between 1.0 and 2.5, and finding it is A3's job.
3. A ~14.3 ms floor survives at DPR 1.0, so a fixed cost is now the larger term.
   Unquantified; A5 is the first suspect.

## Tasks

- [x] **A1.** Measure the DPR hypothesis in real Chrome. Confirmed, above.
- [x] **A2. Separated.** `QUALITY.pixelRatio` → `QUALITY.renderScale`, meaning a
      fraction of the *clamped device* ratio; `engine.resize()` now derives
      `deviceDpr` and `renderScale` as two quantities. `setRenderScale()` is the
      entry point and `setPixelRatio()` an alias that stays truthful, because the
      argument always was a scale. Tiers retuned against the new meaning —
      low 0.50, medium 0.65, **high 0.80**, ultra 1.00 (native; nothing ships
      above it). On a 2× panel `high` is now DPR 1.6 / 5.3 MP against the old
      DPR 2.5 / 12.96 MP.
- [x] **A3. Slider landed, and the owner has picked.** `render scale` sits in the
      panel's `quality` section, 0.40–1.50, reading out scale, resulting DPR and
      megapixels — megapixels being what frame time actually tracks.
      **Owner's pick, live, 2026-08-15: render scale 0.95 with quality step 3**,
      i.e. DPR 1.90 and 5.3 MP on their 2× panel, AO / god rays / TAA off and
      SMAA carrying the antialiasing. Measured **49 fps / 20.4 ms** at 1080p,
      against 26–40 before. Baked into `QUALITY.high`, so it survives a reload.

      Two notes on it:
      - **Still 3.8 ms over ship criterion 3** (20.4 vs 16.6 ms). Closer, not
        closed. A5 is the next lever.
      - **Their dial position also pulled reflections 0.72 → 0.40**, and that was
        *not* baked. 0.72 is an owner-tuned look value from an earlier session
        ("the reflections are WAY too good"), and inferring a new one from a perf
        drag is the wrong way to change it. The `reflections` fine knob is there
        if 0.40 was deliberate.
- [x] **A3b. Quality is one dial** (owner, 2026-08-15: the eight pass swatches
      were confusing and the game looks fine with most of them off). The
      `detail / cost` macro became `quality` and owns every pass enable as well
      as `ao`/`motion`/`refl`; step 3 reproduces the shipped `high` tier exactly.
      The swatches survive behind **Fine knobs** because isolating one pass is
      how per-pass cost gets measured — an instrument, not a setting.
      **Rule: the quality dial decides whether a pass runs, the look dials decide
      how strong it looks.** Passes early-out at zero intensity so an
      enabled-but-zero pass is free — except `BloomPass`, which runs its whole
      pyramid at any strength and so still needs its flag.
- [x] **A3c. Hull-blur-mask button removed, mask hardwired on.** It is a
      correctness feature of the motion-blur pass, not a quality option: the pass
      treats every pixel as static world geometry, so without the mask the ship,
      the wingmen and a station-keeping boss take a full camera-sweep smear at a
      true screen velocity of ~0. It costs anything only when the motion pass
      runs, i.e. quality step 5.
- [x] **A3d. Dev shortcut digits derive from `TOOLS` order**, so the panel reads
      1,2,3… top to bottom instead of 1,6,7,2,3,4,5. Adding a tool renumbers the
      rest, and the hint line is built from the same array so it cannot drift.
- [ ] **A5.** `preserveDrawingBuffer: true` (`engine.js:44`) is on permanently
      for the capture harness and can force a full-framebuffer copy per frame.
      Gate behind a capture flag and measure. Cheap; do not assume a win.
- [ ] **A4. Parked** — only if the above misses budget. Two options, no third:
      cut per-pixel cost in the terrain/water shaders (triplanar is 3 samples
      where 1 often does; the lithology blend and the horizon lookup are both per
      fragment), or render the scene at reduced resolution and upscale. Post is
      death by a thousand cuts — six passes at 0.5–1.0 ms, none worth killing
      alone.

**Seams.** `engine.resize()` (`engine.js:96`) is the only place DPR is computed;
`post.setSize(w, h, dpr)` (`postfx.js:1968`) fans it out to every pass, deriving
`pw/ph` once. Both are already single points of truth — this should not need to
touch individual passes.

## Phase B — boot, and the freeze at a transition

Owner, 2026-08-16: boot is ~10 s in real Chrome, and the hop freezes for ~1 s
where the rebuild starts. Profiled with the CPU sampler over navigation → `ready`
and over `forceHop`, from a clean worktree at HEAD, `quality=high`.

**There is no I/O in either number.** The game ships no binary assets, so every
"load" is compute. The GPU is close to idle at boot; the whole cost is
single-threaded JS plus one synchronous driver wait.

Boot, 5.5 s headless — proportions transfer to real Chrome, absolutes do not.
**This is the pre-B1–B3 baseline, kept as the record of where the time was**;
re-take it with `bootprof` rather than reading it as current:

| where | ms | % |
|---|---|---|
| `render/textures.js` — the procedural bakery | ~3200 | **58** |
| `src/world` — profile, terrain and horizon fields | 520 | 9 |
| `(idle)` — the loader's own staged rAF turns | 458 | 8 |
| three lazy init (`onFirstUse`) | 400 | 7 |
| **GL program compile** | **76** | **1.4** |

Inside the bakery it is one call chain: `wrap` (`textures.js:19`) **1549 ms,
28% of boot on its own**, the lattice sampler at `:21` 750 ms, the fbm
accumulator at `:52` 357 ms. B3 collapsed the first two into one 1318 ms
sampler; the accumulator, now `textures.js:79`, is untouched and is B4's target.

The hop is a different mix — ~1 s of re-baking the new world's textures
(`textures.js:52`, 975 ms) plus **~0.5 s of synchronous shader link**
(`(program)` 347 ms, `getProgramInfoLog` 150 ms), on top of the unbudgeted
dispose already recorded in `ROADMAP.md`. Programs went 89 → 151 across the one
hop.

**The instruments, both landed 2026-08-16 and both run before any of this is
touched.** `tools/bootprof.mjs boot|hop` re-takes every number above —
`--quality`, `--level`, `--top`, and a `hop` arm that force-hops from the level
it booted. `tools/digest.mjs --out before.json` then `--against before.json`
hashes every baked texture, every static geometry array and a `groundAt` lattice,
and exits 1 if any byte moved; it is proved to catch a change (a 6 → 6.0001 in
the noise fade moved the terrain digests) and to be stable across identical runs.
**B3 and B4 are refactors that must not change output — neither is done until
`digest --against` says identical.**

Take a `digest --out` baseline on the *unmodified* tree first. There is no
committed baseline, deliberately: it would go stale the first time a generator
legitimately changes, and a stale baseline that everyone ignores is worse than
none.

Ranked by return over effort as first written. What survived contact: B1 was the
cheapest item and returned nothing, B3 was the real one.

- [~] **B1. Built, measured, rejected. `checkShaderErrors` stays on, always, for
      everyone.** Do not re-open this — the cost is real but it is not where the
      item claimed, and the owner has ruled on the trade regardless.

      *Measured.* Gating the check moved the driver wait instead of removing it:
      `getProgramInfoLog` (129 ms) left the hop table and `getProgramParameter`
      (154 ms) took its place, with `(program)` **unmoved at 349 → 349 → 351 ms**
      across three runs. Boot was A/B'd alternating on/off three times to keep
      machine drift out of it — 4396/4366/4363 against 4377/4339/4309, i.e.
      **~30 ms, under 1%.** (Taken as two batches instead, the same flag looks
      worth 350 ms. It isn't. Alternate the arms.) The block is not the error
      check — three
      cannot build a uniform map without `getProgramParameter(program,
      ACTIVE_UNIFORMS)` (`three.module.js:6141`, unconditional), and that is the
      call that waits. The advice three's own docs give is sound for programs you
      compile speculatively; every program this game compiles, it immediately
      draws with. **The ~0.5 s is not recoverable by gating a query** — it goes
      to B5 (compile fewer programs) or B6 (`compileAsync`, don't block).

      *Ruled.* Owner, 2026-08-16: there is no production build and no players to
      ship to, and a failed shader must be loud — *"if a shader fails to load, i
      dont want silence/missing textures, i want it to error."* So the trade B1
      offered is one this project would decline even if it saved the half second.
      A conditional was the wrong shape too: any condition that speeds up the
      number the owner actually feels has to be live on the dev server, which is
      exactly where losing the check hurts most.

      *Verified, and worth knowing.* A deliberately broken `EXPOSE_FRAG` reports
      `VALIDATE_STATUS false` with the check on and **produces no console output
      at all** with it off — the boot completes, `shot.mjs` exits 0, and the frame
      is wrong in silence. That is what the flag is worth.
- [x] **B2. `STAGE_FRAMES` 4 → 1. `(idle)` 463 → 308 ms, so ~155 ms**, not the
      ~340 estimated: three quarters of the frames went, but under half the idle,
      because a chunk of that 458 ms was rAF waiting on vsync rather than the
      easing. Loader verified by capture, not by number — it paints every stage,
      advances (`COMPILING SHADERS` at 75%), and cross-fades at 100%.
      **One correction was needed.** At one frame per stage the `APPROACH` 0.55
      ease never converges, so every stage drew 45% short and the bar faded out
      reading **97%**, having never once shown a full one. `stage()` now snaps to
      target and draws again after the loop; that redraw lands in the frame the
      next stage yields, so it costs a canvas draw and not a frame.
- [x] **B3. `wrap()` is gone, and boot went 5549 → ~4375 ms wall (−21%),**
      that being the median of six runs in the shipped configuration.
      The old `wrap` 1573 ms + sampler 738 ms + `fade` 57 ms = 2368 ms became one
      inlined sampler at **1318 ms — ~1050 ms off boot**, and the noise path went
      from 28.4% of boot to nothing named.
      Four `wrap()` calls per sample became two inline reductions (the upper
      lattice corner is the lower plus one, wrapping to 0 at the edge), the
      doubled `((v % n) + n) % n` became one `%` plus a conditional add, and
      power-of-two lattices take `& mask`. The general modulo **stays** — the
      plan's premise that it was redundant against the caller domain was wrong,
      `profile.js:271` samples these at world coordinates and needs the wrap.
      **Proved identical** two ways: 3M random samples across 15 lattice sizes
      match the old path bit for bit (`Object.is`, so signed zero and NaN count),
      and `digest --against` reports 0 changed on both `corneria` (276edbb3) and
      `highlands` (dc1533a8).
- [x] **B4. Done — boot ~4375 → ~3830 ms.** Five bakers fused, not one: the
      measured `bakeRockMaterial` (`textures.js`, 3× per texel) plus `rockSet`,
      `iceWallSet`, `iceSet` and `concreteSet` in `world-materials.js`, each of
      which ran two full 512² loops evaluating the same fbm at the same
      coordinate. The sampler is 1308 → 967 ms and the fbm accumulator 373 → 298.
      `digest --against` identical on both levels.
      **Fused rather than cached**, against the plan's own suggestion: caching
      the samples needs three 8 MB scratch arrays at 1024², and they would have
      to be `Float64Array` — rounding a cached sample to `Float32` moves the
      output, which is the one thing this may not do. Computing all outputs in
      one pass stores nothing. `bakeHeightAndMap()` (`world-materials.js:66`) is
      the shape: `fn` fills the RGBA texel and *returns* the height. Interleaving
      is safe because the samplers are pure — their RNG is consumed at
      construction, not at sample.
- [ ] **B5. The generated GLSL bakes DNA in as literals.** `GLSL_CENTRELINE()`
      (`world-materials.js:419`) emits the wave and bend terms as inline numbers,
      so every world has different shader source and three's program cache — keyed
      on source — can never hit across a hop. This is simultaneously the per-hop
      compile cost *and* the 89 → 282 program leak in `ROADMAP.md`; they are one
      defect. Move the terms to a uniform array and every world shares one
      program.
      **The invariant this must not break**, and it is the reason the literals
      are there in the first place: the shader has to reproduce
      `profile.js:centrelineX` *exactly*, or every shore and horizon lookup lands
      on the wrong column and the waterline slides off the beach wherever the
      channel bends (`world-materials.js:411`). `GLSL_CENTRELINE_DX` has the same
      shape and the same requirement — fix one and miss the other and the
      shadowing goes subtly wrong instead of obviously wrong. See also the
      `expandZones`-before-`DNA = dna` ordering note in `ROADMAP.md`'s Settled
      section: the GLSL twin is generated from the *expanded* DNA.
      **Done when:** `bootprof hop` shows the post-hop program count at or near
      the boot count instead of +64, `digest --against` is identical for every
      level, and a `shot` of the shoreline is unchanged.
- [ ] **B6. Bake in Workers.** The bakery is pure functions over a seeded RNG
      returning `Uint8Array` — no DOM, no GL, transferable, embarrassingly
      parallel. This is the structural answer if boot has to be under 2 s, and it
      composes with B3/B4. Pair with `renderer.compileAsync()` for `_warm`, which
      has ~11 s of cover during a hop and nothing to lose by going async.
- [ ] **B7. Parked, and probably never.** Rewriting the bakers as GPU
      render-to-texture passes: a large rewrite of deterministic seeded code, for
      work the GPU is idle during anyway. Caching baked textures to IndexedDB
      trades CPU for decode plus invalidation and does nothing on a first visit.

## Measuring rules

- **Fix the `shot` and the `t`.** A/B by flying is unreadable: frame time swings
  25–34 ms on scene content alone, more than most settings under test.
- **Never call `env.apply()` between arms.** It bakes a PMREM whose spike
  outlives the settle window, and `engine.avgFrameMs` is a 45-frame EMA that
  carries it. A pass that did this reported every *disabled* pass as costing time.
- **Alternate the arms; never compare batch to batch.** Boot times drift with
  whatever else the machine is doing — B1 measured as a 350 ms win taken as
  "six runs before, six runs after", and as ~30 ms taken as on/off/on/off/on/off.
  The second is the true one. This is the same failure as timing two arms in
  different sessions, which is why A1's DPR ratio is directional only.
- **Never compare a headless number to a real-Chrome one.** Headless runs at
  `devicePixelRatio` 1, so every absolute in `ROADMAP.md`'s per-pass table is
  3.24 MP against the owner's 12.96 MP. The splits are valid; the milliseconds
  are not comparable.
