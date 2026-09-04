# Agent: dev
**Responsibility:** Build and own all game code for Chronoforge Dawn.

## Inputs
- `CONCEPT.md` — Core loop, controls, scope constraints, rendering_tier
- `GAME_PLAN.md` — Phase order, what's decided vs deferred
- `agents/art.md output` — Sprite/grid dimensions needed before rendering code is written
- `src/level.js` — Level data format — dev defines the schema, level populates it

## Outputs
- `package.json` — npm manifest with vite + renderer dep.
- `vite.config.js` — Minimal Vite config (usually empty or just root/port).
- `src/index.html` — Entry point — imports src/main.js as a module.
- `src/main.js` — Boot file — renderer init, scene/stage setup, game loop start.
- `src/game.js` — All game logic — state machine, entities, physics, input, rendering, HUD.
- `agents/dev.md output` — Data format contracts consumed by level (platform/enemy schema) and asset (sprite dimensions, file format).

## Current Phase Goal
**Phase 0 — Engine Skeleton, Contract & First Light:** COMPLETE. Engine, shared ctx, __DAWN__ debug API, render stack (camera rig, environment, materials, textures, postfx, probe), twelve module stubs behind live install seams, ARCHITECTURE.md, CONTRACT.md, docs/STATUS.json, and tools/shot.mjs + probe.mjs + lintrng.mjs. Dawn at hour 6.4 signed off.

## Hard Constraints
- IN scope — Three.js (latest) + Vite, plain ES modules, twelve-folder subsystem layout under src/, one shared ctx object per module, per the existing ARCHITECTURE.md and CONTRACT.md. Those two files and docs/STATUS.json are extended, never clobbered.
- IN scope — Every character is a low-poly 3D rig built in code, posed by an animation system, rendered through a pixel-snap and palette-quantise pass so it reads as a sprite. Weapons, armour and accessories are separate meshes attached to named sockets.
- OUT of scope — Sprite generation, image-gen pipelines and binary art assets of every kind. No PNG, no model file, no audio file in the repo except what the harness writes into shots/. Terrain, buildings, foliage, VFX, UI and audio are generated in code. No fetch, no network, no downloads.
- OUT of scope — Math.random(). Seeded RNG streams only, via ctx.rng('lane.stream'). Non-determinism is a defect and tools/lintrng.mjs enforces it.
- IN scope — The verification harness ships before the game it verifies, and dev owns tools/ and its exit codes. Sixteen tools: shot, probe and lintrng exist; sheet, blind, walk, door, duel, stage, fog, econ, save, digest, census, region, rig and play are deliverables. Nothing may be claimed that has not been screenshotted and opened, or measured by the probe that answers that question — and any agent reporting done must hand the orchestrator the artifact itself: the probe stdout, the tool exit code, or the path of a PNG that was opened.
- IN scope — Every module ships a showcase mode staging a representative scene of just that module, and window.__DAWN__ exposes post(), probe(), stats(), seek(), step(), setShot(), setTime(), battle() and teleport().
- IN scope — Inventory is a first-class system, not a menu tab. The seventeen-item catalog, three slots per hero, eight stats and both acquisition paths (enemy drop tables and eight hidden world drops, one per outdoor region) are ported from the prototype ITEM_DEFS and drop tables. Equipping is visible on the rig: every weapon is its own mesh on the named weapon socket, so a sword swap changes the hero in the overworld, in battle and in the portrait. Loot drops are diegetic events in the world with a drop animation, not a silent inventory increment.
- IN scope — The eight named prototype defects are the acceptance bar, each checkable in a screenshot: soft continuous fog with no quantisation; no tile grid anywhere; real contact shadowing and grounding for every actor and prop; battles staged on the terrain that triggered them; terrain with elevation and varied lighting; binary diegetic concealment with no grey-ghost enemies; menu chrome with depth, glow bleed and type hierarchy; a designed HUD.
- IN scope — Tiers ship in a fixed order, each playable and verified before the next starts: 1 World & Light, 2 Traversal, 3 Places, 4 Encounters & Battle, 5 Progression, 6 Settlement. No jumping ahead.
- IN scope — The world is a graph of twelve discrete 45x30 maps ported from the prototype's MAPS table: eight outdoor regions across eight biomes plus four city interiors, 36 placed encounters, 18 doorway edges, and exactly one hidden world drop per outdoor region. Build plots exist in Haventide only. Not one contiguous landmass.
- IN scope — Tier 1 finishes two regions at full fidelity, Haventide (grassland_ruins) and Emberline (neon_wastes); the other six block in and reach fidelity in the region buildout phase. Correctness is never deferred: region.mjs, walk.mjs and door.mjs pass on all twelve maps from Tier 1 onward.
- IN scope — Improving on the prototype, systems included. chronoforge is a donor and a floor, not a specification; Dawn exists to beat it. Its tuned numbers — ATB math, five enemy tiers, the tech table, drop tables, the twelve-map data, economy curves, the seven-tab menu and keyboard model — are the DEFAULT starting point because they are already tuned and cheap to keep. Adopt them unless there is a stated reason not to, and record the reason when deviating. Net-new systems and outright remakes are welcome and every idea is open to discussion. What is NOT in scope is silently losing content: no hero, enemy, item, quest, region, building or menu capability disappears without it being called out.
- IN scope — The prototype's dev overlay (battle speed, fog toggle, minimap toggle, reset, replay) is kept and extended.
- IN scope — Battle starts in place with a lateral camera swing and push-in at locked pitch. There is no separate battle scene, no gradient backdrop, and no scene swap.
- IN scope — Graphics restraint is a stated goal, not an afterthought. Prior experience on a Three.js build (vulpine) was tuned so far up that several whole sessions went into tuning it back down. Effects are added because they earn a frame, not because they are available. The dev panel carries a live FPS/frame-ms/draws readout and a five-notch quality lever from cheapest to most expensive, so the cost of every look decision is visible at the moment it is made rather than discovered later. The engine already defines four tiers in src/core/engine.js (low, medium, high, ultra) and needs a fifth notch; ultra must keep its name because tools/shot.mjs defaults to it.
- IN scope — Quality tier is chosen by what the instrument is asking. Still captures and critic scoring run at ultra — a look review should judge the best frame the build can produce, so tools/shot.mjs keeps its ultra default. Gameplay probes driven through Playwright/CDP (walk, door, play, stage, and any probe reporting fps or frame time) instead read the quality the human last set in the dev panel, because a performance number measured at a tier the player never runs is a meaningless number. The lever therefore persists to localStorage so the probes and the human are looking at the same build. A mismatch is not dangerous and is worth a quick word before a probe run rather than a hard gate.
- IN scope — A hard performance budget: 60 fps at 1080p, 16.6 ms frame, 900 draw calls, 2.6M triangles. Blowing it is a defect, not a trade-off. Disabling a post pass to make a feature look better is forbidden.
- IN scope — Dawn at hour 6.4 is signed off at wide median 0.212, p90 0.51, 0% blown white, and must not regress. Exposure ramps over sun elevation via EXPOSURE_RAMP in src/render/environment.js, fixed per hour. No metering, no auto-exposure.
- IN scope — Scoring is absolute, not comparative. The critic scores 0-10 against a named visual reference and the eight named defects; games/chronoforge is inspiration and the content source, never the benchmark. Pass is >=8.5 with zero console errors and a green probe, up to four rounds per tier. Scores are reported honestly, including failed rounds. Until the human supplies the visual reference, the signed-off dawn frame in shots/exposure-ramp/h6.4 is the internal anchor.
- IN scope — The final gate is a blind A/B on shuffled, label-stripped pairs, judged against the human-supplied visual reference. The reference and the pairing rule arrive from the human before that gate is run; the gate is not designed or executed until they do.
- IN scope — docs/STATUS.json carries scores, probe results, frame budget and open issues so an interrupted run resumes from the weakest module.
- OUT of scope — Multiplayer, networked play, cloud save, accounts, analytics, microtransactions.
- OUT of scope — Procedural map, dungeon or quest generation. The twelve maps are authored data ported from the prototype.
- OUT of scope — Voice acting and animated cutscenes. Text boxes with portrait flashes and scripted actor choreography only.
- OUT of scope — Mobile and touch input. Desktop keyboard and mouse only.
- IN scope but DEFERRED — Audio does not start until the first ATB battle effort. Web Audio synthesis only (per-biome ambient beds, battle stingers, resource-tick chimes, surface-matched footfalls) and no audio files in the repo, but the audio lane is not scheduled before the battle tier. Every earlier phase ships silent.
- IN scope — The in-game dev panel (src/core/devpanel.js, a DOM overlay the HUMAN clicks, distinct from the headless tools/ probes) is preserved and never clobbered. Lanes add controls through ctx.dev.register({group,label,type,get,set}) from their own file; editing devpanel.js to add a control is a contract violation. It must be extended on human request rather than pre-emptively, and any lane shipping a system the human will want to poke registers a control for it.
- IN scope — Never more than two agents running concurrently. A phase needing more work is split into sequential waves, not widened. The orchestrator may also execute a lane itself rather than spawning for it.
- IN scope — Frequent human feedback. Every agent that finishes a unit of work decides, and states, whether a human manual QA pass on localhost is worth it before the next phase starts — naming what to look at and what would count as wrong. Automated gates do not replace this; they decide when to ask for it.
- IN scope — Agents are expected to PROPOSE, not just execute. Every lane may put forward changes to inherited design — topology, systems, content, pacing — and should say so in its report rather than silently conforming to what the prototype happened to do. The world graph is the standing example: it is currently a tree of 8 regions and 7 edges with zero cycles, and it is explicitly open to redesign. A proposal names what changes, why the inherited version falls short, and what it costs. The orchestrator decides; the agent is not required to ask permission before proposing.
- IN scope — Doorway topology is a design surface, not inherited data. The twelve-map connection graph may gain edges, lose them, become one-way, or be gated on traversal capability or settlement tech tier. Named candidates already on the table: add lateral cycles so the world stops being out-and-back; gate the Emberline T2 to Crater Ember T4 two-tier jump on a settlement unlock rather than a wall, which is the only mechanism that makes the base economy matter to exploration; one-way drops that unlock their return from the inside; and time-of-day chrono-rifts that relocate on a seeded schedule, which world.js already names in a comment and never implements. Whatever ships, region.mjs proves it offline.

## Rendering Tier — threejs3d

Vite + Three.js. WebGL 3D — meshes, lights, cameras, materials.

### Setup
```
npm init -y
npm install vite three
```

### Project structure
```
Chronoforge Dawn/
  package.json
  vite.config.js
  src/
    index.html
    main.js       (Three.js scene, camera, renderer, game loop)
    game.js       (game logic — entities, controls, world gen)
```

### vite.config.js
```js
export default {};
```

### Boot pattern (src/main.js)
```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  // update game state here
  renderer.render(scene, camera);
}
animate();
```

### src/index.html
```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Chronoforge Dawn</title></head>
<body style="margin:0;overflow:hidden;background:#000">
  <script type="module" src="main.js"></script>
</body>
</html>
```

### Dev server
```
npx vite        # serves on http://localhost:5173
npx vite build  # production build → dist/
```

### Notes
- Import Three.js as `import * as THREE from 'three'` — never use a CDN script tag
- Put static assets (textures, models) in `public/` — served at root, not processed by Vite
- Load textures with `new THREE.TextureLoader().load('/texture.png')`
- **Camera distance must scale with subject size** if the player/subject scale changes at runtime. A fixed camera distance works only when scale is fixed. For games where the player grows or shrinks (Agar-style, physics sandboxes, scale-shifting platformers), compute distance dynamically each frame — e.g. `const CAM_DISTANCE = Math.max(minDist, subject.radius * k + offset)`. The specific multiplier `k` and `offset` need playtesting, but the pattern is always: distance is a linear function of radius, clamped to a minimum so tiny subjects stay in frame.


## Dev tools
Mount domain-scoped dev tools when the art agent requests one. Follow `tools/dev-tool-contract.md`.
Check `window.__DEV_TOOLS__` before mounting. Strip before ship.
