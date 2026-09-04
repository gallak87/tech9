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
**Phase 0 — Engine Skeleton, Contract & First Light:** Vite + Three.js boot, the shared ctx object, the window.__DAWN__ debug API, ARCHITECTURE.md and CONTRACT.md with the binding file-ownership table, and the first two probes (shot.mjs, probe). DevOps confirms localhost serves and configures the GitHub Pages target without deploying yet.

## Hard Constraints
- IN — Three.js under a fixed overhead camera is the renderer. The world is real 3D geometry with elevation, a moving sun, soft shadows, depth-of-field falloff and weather; characters are rendered through a pixel-snap and palette-quantise pass so they read as sprites.
- IN — Every character is a low-poly 3D rig built in code and posed by an animation system, with weapons, armor and accessories as separate meshes attached to named sockets. This is the fix for the prototype's art failure: an image-generation pipeline cannot draw the same hero twice in a new stance or holding a different weapon, and each hero needs roughly forty poses across overworld, battle, portrait and cutscene.
- OUT — No sprite-generation pipeline, no binary art assets, no network fetches. Every mesh, texture, VFX and sound is generated in code from noise, SDFs and in-code baking. No PNGs in the repo.
- OUT — No Math.random(). Seeded RNG streams only, so every capture and every headless probe run is reproducible.
- IN — A verification harness in tools/ ships before the game and gates every claim: deterministic GPU screenshots at named camera presets and times of day, contact sheets, blind A/B pairs, a frame histogram probe, a real-keyboard traversal probe, a door probe that enters and exits every door, a seeded headless battle probe, a battle-camera framing probe, a fog-continuity probe, an economy simulator, a save round-trip differ, a generated-asset digest, and a content census. No agent may claim anything it has not screenshotted or measured.
- IN — Every module ships a showcase mode staging a representative scene of just that module, and the page exposes a window.__DAWN__ debug API with post, probe, stats, seek, step, setShot, setTime, battle and teleport.
- IN — Build order is strictly stack-ranked and each tier ships playable and verified before the next starts: (1) world and light, (2) traversal, (3) places and interiors, (4) encounters and battle, (5) progression and menus, (6) settlement economy.
- IN — Eight named prototype defects must be fixed and each is checkable in a screenshot: square hard-edged fog of war, the visible tile grid, missing shadows and ground contact, the placeless gradient battle background, the flat single-elevation world, grey ghost enemies under fog, 1px neon menu chrome, and the unstyled debug-readout HUD.
- IN — The prototype's game design is an input, not a subject for redesign: ATB math, enemy tiers, tech tables, drop tables, economy curves, menu tab structure and keyboard model port forward. The remake replaces presentation, not mechanics.
- IN — Performance budget is a hard gate, not a trade-off: 60 fps at 1080p, 16.6 ms frame, no more than 900 draw calls. Disabling a post pass to make one module look better is a defect.
- IN — One folder per subsystem with a file-ownership table in CONTRACT.md; no agent edits outside its lane, and all shared-core changes go through a single integrator.
- IN — Critics score 0-10 against the prototype itself as the reference: matched shots from games/chronoforge are the 5, the fixed defect list is the 8.5, and pass is 8.5 or above with zero console errors and a green probe. Final gate is a blind A/B where judges see Dawn and the prototype at matched location, time and framing with the order shuffled.
- IN — Save/load via browser localStorage, single slot, round-tripping the full game state byte-identical.
- IN — Deployable to GitHub Pages as a static build.
- OUT — No multiplayer, PvP, or networked play of any kind.
- OUT — No procedural map, dungeon, or quest generation. The world is handcrafted.
- OUT — No voice acting, animated cutscenes, or CG cinematics. Scripted sprite choreography and portrait-flash text frames only.
- OUT — No mobile or touch input for v1. Desktop mouse and keyboard only.
- OUT — No real-time strategy combat. All combat is turn-based ATB, and base raids are scripted story beats rather than live attacks.

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
