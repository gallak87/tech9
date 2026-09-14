# Overworld running — paused handoff

Date: 2026-09-13. Work was **canceled at the user's request**. Do not resume generation or integration until asked.

Pause instruction: “its fine can you cancel, leave things as they are right now - write a handoff doc, i'll spin up another agent for this later”. All agents stopped at that point.

Later checkpoint instruction: “im going to pause on this and just keep going on the game - we have uncommitted files - can you make sure everything is committed”. This authorizes preserving the paused code, rejected studies, handoff and loose reference exports in Git. Animation generation and integration remain paused. The final guided Kaida output was copied unchanged into the study folder for a durable record. Pure motion/render checks and the build passed for this checkpoint; no playtesting was performed.

## Goal and the failure

The user wanted the three heroes to actually alternate their legs while running in the overworld. They prefer an autonomous, bounded attempt without intermediate approvals. They explicitly do **not** want browser playtesting or a full playthrough; they will judge the animation themselves. Fanout was authorized earlier.

The original atlases repeat nearly the same leading-leg pose across their six walk/run frames. Higher playback speed cannot create the missing opposite stride. Kaida and Rune's original atlas rows visibly confirm this.

We generated one 18-frame run sheet per hero (six columns, three directions: right/up/down), using each current approved idle as identity reference. **All three failed the anatomical alternation requirement. None was wired into gameplay.**

User feedback on Kaida's sheet: “same issue i can see in this sheet btw - only back view had alternating legs lol”. Treat that as a rejection, not an approval. More knee bend or different boot positions is not sufficient if the same anatomical leg continues leading.

A final Kaida retry used an explicit four-frame, color-coded near/far-leg pose guide. It gave larger pose changes but still appears to repeat the leading leg between frames 1/3 and 2/4. The user canceled immediately after seeing it. It has no approval and was not integrated.

## Repository and live state

- Repository: `/Users/g/code/scratch/tech9`, branch `g/chronoforge-dusk`.
- Game: `games/chronoforge-remake`.
- HEAD before the run checkpoint: `d12cf04f` — direction studies comparing all three heroes against their approved idles.
- Previous commits: `f473f14e` fixed uneven Rune atlas row cuts; `40d564bd` shared approved side-facing idles across scenes.
- Existing server was at `127.0.0.1:4179` (previously PID 83019); no server was started, stopped or otherwise changed here.
- Active comparison: `/art-lab/kaida-guided-idle/`. Still the existing **static direction comparison**, not a new run preview.
- Battle browser: `/?dev=1&preview=battles`.
- Root `output/imagegen/` contained two previously untracked character-reference PNGs and their prompts. The later request to commit everything includes these exports; they remain separate from the game's live assets.

**Gameplay art is unchanged.** `src/art.js`, existing sprite assets, idle registry and existing comparison UI were not edited in this attempt. No new `assets/*-run.png` remains. Temporary copies were moved into the rejected-study directories before cancellation. The ignored `dist/` directory was rebuilt only for checkpoint validation.

## Paused code preserved in the checkpoint

These changes were left in place at cancellation and are included in the later checkpoint without completing renderer integration:

1. `src/hero-motion.js` (new): exports `LOCOMOTION_STRIDE = {walk:84, run:104}`, `advanceLocomotionPhase(phase, actualTravel, running)` and `locomotionFrame(phase, frames=6)`.
2. `src/game.js`: imports the helper; stores `g.locomotionPhase`; advances it using actual positive displacement after collision handling; attaches phase to trail points. Transient reset also resets running/phase.
3. `src/render.js`: passes `options.locomotionPhase` for moving heroes, taking a follower's sampled trail phase when available.
4. `tests/hero-motion-systems.mjs` (new): pure Node tests for distance-based phase, varying refresh rates, stops, wall sliding and walk/run cadence.

**Renderer hookup is unfinished.** `drawHero()` currently ignores `options.locomotionPhase`; frame selection still uses elapsed time. Thus this work does not yet change the visible stride. `locomotionFrame()` has not been imported into `art.js`.

The motion agent reported its pure test, game/render syntax checks and diff check passing before cancellation. The later checkpoint also passed `node tests/hero-motion-systems.mjs`, `node tests/hero-render-systems.mjs` and `npm run build`. No browser tests ran. Numerical frame-selection tests do not prove that the source drawings alternate legs; the test assertion now says so explicitly.

A run-comparison agent was interrupted before writing any preview files. There is **no** `art-lab/hero-run/` directory. Proposed `runCandidate` and `legacyLocomotion` draw options were discussed but **never implemented**; do not assume those APIs exist.

## Rejected generated assets and provenance

All used the built-in imagegen tool, whose schema offers no backing-model selector. Do not claim these were generated with a verified specific GPT Image version.

### Kaida: original run attempt

- `art-lab/kaida-run/candidate.png`: raw 1536×1024, six columns × three rows.
- `art-lab/kaida-run/prompt.txt`: exact prompt.
- Reference: `assets/kaida-idle-fresh.png`.
- Original output: `/Users/g/.codex/generated_images/01a08f34-d722-7aa0-8a6d-f49cc059ef87/exec-7de7c25a-64a0-4541-b5f9-b1f5106a550c.png`.
- Alpha inspection: entirely opaque (255). Background is near-uniform charcoal, not real transparency. Common RGBA value: `(46,47,54,255)` with small variations.
- Side frames repeatedly lead with the same leg. User found only the back view convincing for alternation. Do not promote the whole atlas.
- Dimensions are not evenly divisible into three rows; future sampling would need documented integer cuts rather than a strict equal-cell helper.

### Kaida: final guided retry

- `art-lab/kaida-run/prepare-stride-guide.mjs`: code-native pose-diagram generator; does not edit any character pixels.
- `art-lab/kaida-run/stride-guide.png`: four skeletal poses, 2×2, 1536×1024. Cyan = near leg, orange = far leg; lower row explicitly swaps them.
- `art-lab/kaida-run/guided-prompt.txt`: exact retry prompt.
- References: the guide first, `assets/kaida-idle-fresh.png` second.
- Original output: `/Users/g/.codex/generated_images/01a08f34-d722-7aa0-8a6d-f49cc059ef87/exec-b9ae0196-bf1f-4f33-9c8d-95311d1c7135.png`. The checkpoint preserves a byte-for-byte copy at `art-lab/kaida-run/guided-candidate.png`.
- The user canceled before alpha/crop boundaries were inspected. Do not assume it is usable. Visually it still does not convincingly exchange the leading leg. Archiving it is not approval for gameplay.
- The guide is a visual suggestion to the tool, **not** actual ControlNet or enforced joint conditioning. Increasing prompt specificity did not establish reliable limb control.

### Vex

- `art-lab/vex-run/{candidate.png,prompt.txt,generation.json,README.md}`.
- Raw 1448×1086, requested six columns × three rows. Alpha 255 everywhere; painted checkerboard.
- Side contact frames 1/4 keep the same bright near shin leading. Front/back have more distinct boot poses but do not rescue the side cycle.
- Nominal x cuts 241/724/1207 intersect foreground pixels; width is not divisible by six.
- Agent did one generation and no cleanup/retry. Exact output/reference paths are in `generation.json`.

### Rune

- `art-lab/rune-run/{candidate.png,prompt.txt,generation.json,README.md}`.
- Raw 1536×1024, requested six columns × three rows. Alpha 255 everywhere; painted checkerboard.
- Second half repeats the leading leg from the first half. Front/back keep substantially the same raised boot.
- First side sprite reaches x266 across the nominal x256 boundary. Suggested cuts and approximate bounds are recorded in `generation.json`; these do not make the animation acceptable.
- Agent did one generation and no cleanup/retry. Exact output/reference paths are in `generation.json`.

Do not horizontally mirror complete front/back sprites to invent the opposite stride: that swaps asymmetric swords/staffs/costume features and does nothing to solve the side-view leg exchange.

## Existing renderer details worth retaining

- `src/art.js` loads the original 6×8 hero atlases plus approved idle sheets from `src/hero-idle.js`.
- Legacy rows: idle 0, walk 1, run 2, attack 3, cast 4, hurt 5, back/up movement 6, front/down movement 7.
- Run timing currently `floor(time*13)%6`; walk `floor(time*8)%6`. Both walk and run use the same direction rows for up/down.
- Leftward movement mirrors rightward movement. Front/back idles hold frame 0 of their old directional row.
- Approved side idles are already shared across world/battle; do not reintroduce scene-specific idle sources.
- World sprite scale is `.75`; battle commonly `1.25`; base size is 82 logical pixels. Existing high-DPI backing and high-quality sprite smoothing should remain intact.
- Legacy frames anchor their **individual bottommost opaque pixel** to y. This can erase natural airborne lift; consider a shared row baseline when there is a valid stride sheet.
- Rune's original atlas uses measured row cuts `[0,195,375,549,723,904,1076,1248,1448]`. Keep this prior clipping fix.
- Rune's approved idle offsets are shared in `HERO_IDLE_SHEETS`: `[[0,0],[26,0],[43,2]]`. Keep those independent of any new run registration.
- Existing `createHeroIdleFrames()` can preserve native alpha or mask an edge-connected near-uniform matte. It requires exactly divisible cells. It does not remove painted checkerboards or solve malformed poses.

## Suggested restart scope, only when the user resumes

Start with **Kaida side-view opposite-foot key poses**, not another three-hero × three-direction batch. Establish visibly correct near/far leg exchange before adding in-betweens. Keep the successful idle identity and fast battle attacks untouched.

The remaining challenge is artwork control, not frame timing. Both the detailed text prompt and the color-coded guide failed to enforce the opposite leg. A successor should explicitly reconsider the method before spending more image calls; do not present stronger knee movement as a completed run cycle.

Once usable art exists, finish one shared renderer route and a small game-scale comparison using that same route. Register a common scale/origin without resizing each body independently. Preserve rejected attempts and original assets. Use source inspections and meaningful pure checks; leave visual playtesting to the user unless they change that preference.
