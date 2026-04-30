# Agent: dev
**Responsibility:** Build and own all game code for Void Sentinel: Breach.

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
**Phase 0 — Engine Skeleton:** Three.js scene with behind-jet camera at low angle. Scrolling world: terrain plane + 2 cloud layers at different speeds + atmosphere haze, all procedural geometry. Player ship as BoxGeometry placeholder. WASD/arrows move player within screen bounds. Auto-fire shoots BoxGeometry bullet placeholders forward. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER (transitions work, states are stubs). DevOps confirms npm install + npx vite on localhost:5173.

## Hard Constraints
- IN: Third-person behind-the-fighter camera — low angle, locked behind player, world streams forward. Camera shake on hit and boss phase transitions.
- IN: Arrow keys and WASD move the fighter. Spacebar or Z cycles weapon tier. Auto-fire always on.
- IN: 7-tier weapon system — T1: single shot, T2: dual shot, T3: 3-way spread, T4: piercing shot, T5: 4-bullet barrage fan, T6: pierce + 3 homing seekers, T7: full spread + piercing + seekers (godtier).
- IN: 4 enemy types — Scout (1-hit, fast, 2-bullet burst), Bomber (3-hit, slow, spread bursts, drops bomb pickup), Drone (2-hit, sprays 3 bullets backward on death), Elite (every 3rd wave, gold pulse, 2x HP and score, guaranteed pickup drop).
- IN: 3 distinct boss types rotating per cycle — Sentinel (homing focus), Interceptor (fast sweeping), Colossus (screen-filling spread). Each has 3 attack phases at 66%/33% HP with charge-cone telegraph.
- IN: Bomb pickup from Bombers — clears all on-screen enemies and bullets instantly.
- IN: Phase 0 uses placeholder polygon geometry (BoxGeometry, ConeGeometry) for all entities. Art integration phase replaces with THREE.Sprite billboards using Ollama-generated PNG textures.
- IN: Scrolling 3D world — distant terrain plane, mid-layer cloud banks at multiple scroll speeds, near atmosphere haze. All procedural Three.js geometry.
- IN: UnrealBloomPass post-processing — bloom on bullet trails, engine glows, explosions, pickups.
- IN: Web Audio API synthesized SFX — shoot (7 variants per weapon tier), enemy hit, explosion, weapon tier-up fanfare, bomb blast, boss phase transition sting, boss death. No audio files.
- IN: HUD — score, weapon tier (1-7), lives, bomb count always visible. Boss health bar during boss phase only.
- IN: Start screen with controls. WIN and GAME_OVER screens with final score.
- OUT: No touchscreen or gamepad — keyboard only for v1.
- OUT: No persistent state — no localStorage, no high score board.
- OUT: No level select — single run from wave 1 to boss.
- OUT: No multiplayer.

## Rendering Tier — threejs3d

Vite + Three.js. WebGL 3D — meshes, lights, cameras, materials.

### Setup
```
npm init -y
npm install vite three
```

### Project structure
```
Void Sentinel: Breach/
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
<head><meta charset="UTF-8"><title>Void Sentinel: Breach</title></head>
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
