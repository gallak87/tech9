# Agent: dev
**Responsibility:** Build and own all game code for Trash Day.

## Inputs
- `CONCEPT.md` — Core loop, controls, scope constraints, known unknowns
- `GAME_PLAN.md` — Phase order, what's decided vs deferred
- `agents/art.md output` — Sprite/grid dimensions needed before rendering code is written

## Outputs
- `src/index.html` — Entry point. Game must run on localhost from this file with no build step.
- `src/game.js` — All game logic — engine loop, state machine, entities, physics, input, rendering, HUD.
- `agents/dev.md output` — Data format contracts consumed by level (platform/enemy schema) and asset (sprite dimensions, file format).

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Three.js scene initialized with a perspective camera, directional light, and a flat road plane. Truck represented as a placeholder box. DevOps confirms the game loads and renders on localhost with no errors.

## Hard Constraints
- IN: Endless procedurally scrolling street with low-poly houses and trash cans at the curb.
- IN: Tank-style keyboard controls — A/D to turn, W/S to drive.
- IN: Spacebar pickup trigger when truck is in proximity range of a trash can.
- IN: Truck arm pivot animation on every successful pickup.
- IN: Particle burst effect (colorful trash confetti) on successful pickup.
- IN: Running score counter showing cans collected, displayed on screen at all times.
- OUT: No fail state — the player cannot lose or get a game over.
- OUT: No timer or time pressure of any kind.
- OUT: No audio — sound is out of scope for v1.
- OUT: No mobile or touch controls in v1.
- OUT: No high score persistence — score resets on page reload.
- OUT: No level select, checkpoints, or distinct level structure.
## Rendering Tier
This game uses **Three.js** via **Vite + npm**. No CDN imports.

### Stack
- `npm init` → `npm install three vite`
- Entry point: `src/main.js` (imported by `src/index.html`)
- Import Three.js as: `import * as THREE from 'three'`
- Dev server: `npx vite` (serves on localhost:5173 by default)
- Build: `npx vite build`

### Project structure
```
trash-day/
  package.json
  vite.config.js      (minimal — just set root to src/ or leave default)
  src/
    index.html
    main.js           (Three.js entry — scene, camera, renderer, game loop)
    game.js           (game logic — entities, controls, road gen, etc.)
```

### Three.js boot pattern
```js
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
```
