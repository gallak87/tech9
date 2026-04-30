# Agent: dev
**Responsibility:** Build and own all game code for Orb Vacuum.

## Inputs
- `CONCEPT.md` — Core loop, controls, scope constraints, rendering_tier
- `GAME_PLAN.md` — Phase order, what's decided vs deferred
- `agents/art.md output` — Sprite/grid dimensions needed before rendering code is written

## Outputs
- `package.json` — npm manifest with vite + renderer dep.
- `vite.config.js` — Minimal Vite config (usually empty or just root/port).
- `src/index.html` — Entry point — imports src/main.js as a module.
- `src/main.js` — Boot file — renderer init, scene/stage setup, game loop start.
- `src/game.js` — All game logic — state machine, entities, physics, input, rendering, HUD.
- `agents/dev.md output` — Data format contracts consumed by level (platform/enemy schema) and asset (sprite dimensions, file format).

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Three.js scene with dark background, arena boundary box (wireframe or subtle walls), player orb as a placeholder sphere, WASD horizontal movement, camera orbit via mouse drag. DevOps confirms npm install + npx vite loads clean on localhost:5173.

## Hard Constraints
- IN: WASD movement in the horizontal plane, camera orbits with mouse drag or Q/E keys.
- IN: Size-based absorption — player absorbs any orb smaller than themselves on contact.
- IN: Size penalty on contact with a larger orb — player shrinks, never dies.
- IN: Running score counter (orbs absorbed) displayed on-screen at all times.
- IN: Procedural orb spawning at arena boundary, increasing in rate and difficulty over time.
- IN: Bloom-style glowing appearance for all orbs — neon colors on dark background.
- IN: Brief visual feedback on absorb (scale pulse) and on hit (screen flash).
- OUT: No audio — sound effects and music are out of scope for v1.
- OUT: No high score persistence — score resets on page reload.
- OUT: No mobile or touch controls in v1.
- OUT: No powerups, special orbs, or abilities beyond grow/shrink.
- OUT: No vertical movement — the player moves only in the horizontal plane.

{{rendering_tier_section}}
## Rendering Tier — threejs3d

Vite + Three.js. WebGL 3D — meshes, lights, cameras, materials.

### Setup
```
npm init -y
npm install vite three
```

### Project structure
```
Orb Vacuum/
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
<head><meta charset="UTF-8"><title>Orb Vacuum</title></head>
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

## Dev tools
Mount domain-scoped dev tools when the art agent requests one. Follow `tools/dev-tool-contract.md`.
Check `window.__DEV_TOOLS__` before mounting. Strip before ship.
