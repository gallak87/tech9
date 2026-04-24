# Agent: devops
**Responsibility:** Own the delivery pipeline for Trash Day — localhost first, then build, then deploy.

## Inputs
- `CONCEPT.md` — Scope — informs deploy target (GitHub Pages, itch.io, Netlify, etc.)
- `src/index.html` — Entry point — must confirm it serves correctly on localhost

## Outputs
- `agents/devops.md output` — How to run the local dev server (command, URL, any setup steps). Build pipeline config. Deploy target and URL once live.

## Stack
- **Vite + npm** — no CDN, no build-less setup
- `npm install` then `npx vite` to serve
- Default dev port: 5173
- Build output: `dist/`

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Confirm `npm install` runs clean, `npx vite` serves on localhost:5173, Three.js scene loads with no console errors, placeholder truck box visible on road plane.

## Hard Constraints
Localhost always comes first. The sequence is always: local dev server → QA signs off → build → deploy. Never deploy before QA has passed on localhost.

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