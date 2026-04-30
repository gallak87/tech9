# Dev Agent — Phase 0 Output

## How to run

```
cd games/orb-vacuum
npm install
npx vite
```

Vite root is `src/`, so the dev server serves `src/index.html` directly at http://localhost:5173.

## Decisions

- **Arena**: 60×60 flat (ARENA_HALF = 30). Floor uses a GridHelper for spatial reference; four wireframe wall outlines (4 units tall) mark the boundary. Player is clamped to the arena.
- **Camera**: 22 units back, ~33° elevation. Orbits around the player's current position — so it feels like a 3rd-person follow cam, not a static world orbit. No OrbitControls; raw mousedown/mousemove delta drives azimuth.
- **Movement**: camera-relative WASD (input vector is rotated by camAzimuth), so forward is always "away from camera." Drag coefficient = 8 — feels snappy but not instant.
- **Player orb**: `MeshStandardMaterial` with cyan emissive + a PointLight parented to the orb for a subtle glow halo. No bloom yet (deferred).
- **Vite config**: `root: 'src'` so both dev and build resolve `index.html` correctly.

## Code structure for Phase 2+

- `src/game.js` exports: `createPlayer`, `initInput`, `updatePlayer`, `ARENA_HALF`
  - `velocity` is module-level state inside game.js — fine for now, extract to a player object if multiple entity types land
  - `updatePlayer(player, delta, cameraAzimuth)` — the azimuth arg keeps camera logic in main.js decoupled
- `src/main.js`: renderer, scene, camera, lights, orbit input, resize, loop
  - `applyCameraOrbit()` reads `camAzimuth` and `player.position` — call after `updatePlayer` each frame
  - `playerLight` is a PointLight added to scene and repositioned in the loop — easy to reparent to the mesh later

Phase 2 will likely need: enemy orb spawning (add to `game.js` or a new `entities.js`), absorption/collision radius checks, a scoring overlay (HTML or drei-style canvas text).
