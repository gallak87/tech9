# Agent: devops
**Responsibility:** Own the delivery pipeline for Orb Vacuum — localhost first, then build, then deploy.

## Inputs
- `CONCEPT.md` — Scope and rendering_tier — informs deploy target (GitHub Pages, itch.io, Netlify, etc.)
- `package.json + src/index.html` — Must confirm npm install + npx vite serve correctly on localhost

## Outputs
- `agents/devops.md output` — How to run the local dev server (command, URL, any setup steps). Build pipeline config. Deploy target and URL once live.

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Three.js scene with dark background, arena boundary box (wireframe or subtle walls), player orb as a placeholder sphere, WASD horizontal movement, camera orbit via mouse drag. DevOps confirms npm install + npx vite loads clean on localhost:5173.

## Hard Constraints
Localhost always comes first. The sequence is always: local dev server → QA signs off → build → deploy. Never deploy before QA has passed on localhost.

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