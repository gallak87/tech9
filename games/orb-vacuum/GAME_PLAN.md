# ORB VACUUM — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns the numbers doc: size comparison threshold, growth/shrink deltas per absorb/hit, spawn rate curve, difficulty escalation schedule every 30s, starting player radius. |
| `art` | Owns the visual spec: neon color palette for orb tiers, bloom/glow approach recommendation for dev, player vs enemy visual distinction, HUD typography and layout. |
| `dev` | Owns all code: Three.js scene, arena boundaries, player orb, WASD + camera controls, size comparison logic, absorb/shrink mechanics, orb spawning system, difficulty escalation, score HUD, bloom materials, pulse/flash feedback. |
| `qa` | Playtest sign-off required after Phase 2. Verifies all scope constraints, absorb/shrink feel, difficulty curve, visual feedback, and no regressions. |
| `devops` | Phase 0: npm install + npx vite running on localhost:5173. Phase 3: build + deploy (GitHub Pages or itch.io). |
| `historian` | Runs post-hoc after ship. Documents what was built, what decisions were made, and what changed from concept to shipped game. |

**Skipped / Merged:**
- `asset` → merged into `art` — No discrete asset files — all geometry is procedural Three.js SphereGeometry. Art agent covers the full visual spec.
- `level` → skipped — No levels. The arena is a fixed bounded space with procedural orb spawning. Level design has no scope here.
- `audio` → skipped — Explicit scope constraint: OUT — no audio in v1.
- `release` → merged into `devops` — Simple static deploy — no store page, no changelog, no launch checklist beyond tagging and pushing. DevOps handles it.
- `postlaunch` → skipped — Nothing shipped yet. Activate after v1 is live if needed.

---

## Phase Plan

### Phase 0 — Engine Skeleton
Agents: `dev`, `devops`

Three.js scene with dark background, arena boundary box (wireframe or subtle walls), player orb as a placeholder sphere, WASD horizontal movement, camera orbit via mouse drag. DevOps confirms npm install + npx vite loads clean on localhost:5173.
QA gate: Game loads on localhost:5173 with no console errors. Player orb is visible and moves with WASD. Camera orbits. Arena boundary is visible.

### Phase 1 — Design & Art Spec *(parallel)*
Agents: `gamedesign`, `art`

gamedesign writes the mechanics doc: starting radius, size comparison threshold, growth/shrink deltas, spawn rate curve, difficulty escalation schedule. art writes the visual spec: neon color palette, bloom recipe for dev, player vs NPC orb visual distinction, HUD layout. These two agents have no dependencies on each other.

### Phase 2 — Full Implementation
Agents: `dev`

dev implements everything from Phase 1 outputs: orb spawning system at arena boundary, inward drift, size comparison and collision, absorb logic (grow + score + pulse), shrink logic (size penalty + screen flash), difficulty escalation every 30s, bloom/glow materials per art spec, neon color palette, score HUD.
QA gate: Full playable build: absorb and shrink both work correctly, score increments, orbs spawn and escalate over time, bloom visible on all orbs, pulse and flash feedback present, all scope constraints met.

### Phase 3 — QA & Deploy *(parallel)*
Agents: `qa`, `devops`

qa runs a full playtest against every scope constraint and files any bugs. devops runs the Vite build and deploys to the chosen target (GitHub Pages or itch.io).
QA gate: QA sign-off on all scope constraints. Deployed URL is live and loads clean.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Exact movement speed, drag, and orb drift velocity — needs playtesting to feel right. | dev |
| Bloom implementation approach — post-processing pass vs additive material trick. | dev |
| Arena size and boundary behavior — hard wall vs soft repulsion field. | dev |
| Deploy target — GitHub Pages vs itch.io. | devops |
