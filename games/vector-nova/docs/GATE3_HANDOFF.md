# VECTOR//NOVA — fresh-agent continuation for Gate 3

Continue the existing game in `games/vector-nova/`; preserve the working first level and resume from its current state. This is an execution handoff, not a request to rebuild the prototype or produce another plan instead of working. Once the relevant human approval is recorded, carry the authorized phase through implementation, bounded independent critique, verification and the next human playtest.

## Read first and resolve scope

Read the [original prompt](../../../prompt-fzero.txt), [ownership rules](../AGENTS.md), [roadmap](../ROADMAP.md), [current status](STATUS.json), [architecture](../ARCHITECTURE.md), [art bible](ART_BIBLE.md) and [README](../README.md). Consult [performance findings](PERFORMANCE.md), [asset provenance](ASSET_MANIFEST.json), [sky provenance](SKY_ASSET.md) and [historical Gate 2 critique](GATE2_CRITIQUE.md) as needed.

The original prompt supplies the quality target and long-term destination. The user's later decisions below supersede its initial expansion sequence, ten-round limits, evidence-delivery requirements and broad final-game scope. The newest explicit user direction always takes precedence. Do not treat reading or receiving this document as approval of an unfinished human gate.

- Gate 1 is approved. Gate 2 is still **unapproved** at this handoff; its first-level build is ready for the user's playtest. Check the latest user message and `STATUS.json` before starting additional levels. If Gate 2 is still pending, resume that playtest/fix workflow and wait for approval before Gate 3 production.
- **Gate 3 combines level 2 and level 3.** Build both in the same phase, then stop at one combined human review. There is no separate Gate 4. Critic success never grants human approval.
- After Gate 3, discuss the next game-system phase with the user. Additional ships, enemies/AI, pickups/powerups, crash/bump/powerup effects, racing positions, lap/split/results/checkered-flag expansion, championship, garage/menu redesign and progression remain deferred. Existing practice features stay functional. Make only the access/selection changes needed to play and review the new circuits.
- All future critic gauntlets have a **six-round maximum**, retaining **at least 9/10 in every applicable category**. The initial critique counts as round 1. Stop at the first verified pass or round 6, whichever comes first; never reset counters or rename/split work to obtain more attempts. At the cap, report actual shortcomings and hand back the playable scope. Do not lower the bar or claim a pass to finish.

## What the user has taught us

Human playtesting is the most useful steering mechanism. Finish a coherent phase, bring back a playable build and wait for explicit feedback. Keep routine design and implementation decisions autonomous within the agreed scope; do not repeatedly ask permission for ordinary reversible work. Preserve completed work rather than restarting architecture, art or review counters.

The first level initially put its interesting geometry in a small late section while the rest felt flat, sparse and drawn out. The user liked the variety but asked to shorten the long stretches by roughly half and spread the excitement through the lap. Halcyon is now 5 km instead of 7.2 km. **Carry the pacing principle forward, not that exact length or layout.** Engage early, build a varied rhythm and use short recovery sections. Distribute appropriate banks, climbs, steep or roller-coaster drops, wall rides, loops/corkscrews and upside-down driving across each course. Avoid one isolated spectacle followed by long filler, and avoid an uninterrupted sequence that overwhelms the player. The original industrial and orbital themes are broad creative directions, not prescribed geometry or scenery recipes. Give each circuit its own identity.

The user approved the Kestrel direction and liked the game's presentation. Preserve that coherent material, lighting and scale language while allowing each new world to feel distinct. Premium finish concerns the whole playable environment: road engineering, track edges, foreground, skyline, atmosphere, lighting and readable sightlines. A beautiful isolated section does not compensate for unfinished surrounding districts.

Handling feedback is concrete: left/right and A/D must agree with the driver's visible direction, including inversion. Resting on a slope must not drift uphill. Automatic bend assistance felt too strong and is now 0.3, with manual turn authority and magnetic pitch/roll adhesion. Keep this baseline unless the user requests another tuning change; do not silently restore automatic full-road alignment.

The user reported flickering road light spots. Two causes were fixed: lamp fixtures swapped while still lit, and straight expansion seals intersected the curved road mesh. Keep continuous lamp handoffs and road-conforming detail; test new geometry and orientation changes rather than trusting an attractive still.

## How to execute

1. Read the status, inspect the working tree and confirm which human gate is authorized. Use the existing app and tooling. Do not import either tech9 framework or modify reference games. Selectively adapt self-contained techniques and record provenance when useful; tool choices are flexible. Package configuration owns ESLint, Prettier, Husky and lint-staged. Do not recreate `install-hooks.mjs` or `precommit.mjs` wrappers.
2. Use narrow builder agents with exclusive ownership and one integrator for core, shared contracts, configuration and cross-module changes. Respect the available concurrency. Separate route/world work only after agreeing ownership of shared files; no two builders edit the same module. Integrate in dependency order, keeping the game runnable. If independent agents are unavailable, report that limitation and work sequentially without inventing independent reviews.
3. Build complete circuits, not disconnected showcases. Preserve level 1, its handling and restart/replay behavior while enabling both new levels to be played. Choose maintainable multi-level contracts from the real code rather than copying an entire application per circuit. Keep modules and assets owned by this app, with cleanup and bounded resource use.
4. Use independent, critical reviewers who write no implementation and inspect the running local game themselves. They must exercise real controls and motion, inspect close and distant views, and report concrete defects with reproduction, player impact, owner and acceptance condition. Fix the highest-impact problems and rerun the affected checks. Maintain module/integrated counters in `STATUS.json`; the combined Gate 3 review covers both new circuits and first-level regressions. Do not multiply gauntlets to evade the six-round cap.
5. Keep the original rubric: art/assets; lighting/materials/depth; handling/camera; track/readability; race systems/AI; audio/VFX; UI/onboarding/accessibility; performance/stability. A high average cannot conceal a category below 9. Mark genuinely deferred/inapplicable items N/A with a reason; never score untested work as a pass. A verified pass also requires no critical gameplay failures, missing assets or uncaught errors, and the agreed performance target actually verified. Keep unavailable hardware/audio/foreground checks explicitly unverified.
6. Run appropriate tests, full lint, a production build and smoke checks against that build. Use short real-key browser runs for behavior and fast numerical traversals for whole-course geometry/physics. The user requested skipping normal-speed automated full-lap replays unless newly authorized. Record the actual environment and qualify headless measurements. Update the roadmap, current status and concise findings, then present both circuits for the mandatory Gate 3 human playtest. Stop before broader expansion.

## Review and repository hygiene

- Local hidden/headless browsers only unless the user changes this preference. **Do not open Wipeout/racing reference videos, external videos or unsolicited visible browser windows. Do not record or play new videos.** Sequential stills plus input/state snapshots are the permitted motion-verification workflow.
- Critics may capture and inspect their own temporary evidence. Keep it under git-ignored `.experiments/`; do not accumulate screenshots, videos, raw profiles or long reports in Git. No screenshot bundle is required in the human handoff after review. Deliver a playable URL, concise outcomes and unresolved issues.
- Maintain honest category scores, counters and gate state. Gate 2 stopped at the user's request after four critic rounds; it was not an all-category 9/10 pass. The subsequent signature/pacing/light fixes were explicitly requested without another critic. Do not resume that old gauntlet merely because the original prompt says to loop.
- Keep servers alive while reviewers are using them, but honor explicit shutdown requests. Both project servers were stopped for this handoff. Do not schedule overnight work or restart them until continuing the task. Commit when requested; never include ignored dependencies, build output or transient captures just because the user says “everything.”

## Current technical baseline and pitfalls

- Three.js/Vite ES modules, version `0.2.2-gate2-pacing`, track ID `halcyon-viaduct-4-compact`, replay physics version 3. Last verified build: `index-DIQH_RTe.js`. The earlier pre-signature checkpoint is `04a84460`; the new handoff commit contains all subsequent work. Inspect Git history for its exact hash rather than assuming `HEAD` stays fixed.
- First level: 5 km, 28 m wide, eight ordered checkpoints, distributed elevation/banking, a complete roll with roughly 145 m inverted hold and approximately 66° plunge. These numbers describe Halcyon, not requirements for the next circuits. One Kestrel and a minimal practice shell are implemented; the original full game's systems are not.
- `track.sample(s)` supplies one continuous frame for geometry, ship, physics and camera. Distances are actual 3D arc metres. Local ship axes are +Z forward/+Y up; legacy geometric `frame.right` points driver-left from the chase view. Positive steering input therefore produces negative geometric yaw/lateral motion. Preserve vertical/seam continuity and use track-local force projections rather than world-up shortcuts.
- Physics runs at 120 Hz. `STEERING_ASSIST = 0.3` removes the unassisted part of road yaw; persistent `heading` and responsive `steeringHeading` are separate. Reset both on recovery. Keep stationary magnetic hold, brake/boost behavior, swept rail bounds and replay compatibility. The vehicle is surface-constrained; free flight is not silently implemented by adding a loop.
- Camera position and orientation are transported with the road frame before damping, with local road clearance. Ground buildings and canals use a horizontal ground frame; they must never inherit the road's roll. Environment clearance includes the full rolled driving envelope and accepted support footprints, not just a top-down centreline.
- Named sections/feature zones position scenic districts, tunnels, signs and supports. Preserve this instead of scattering fixed old lap fractions through consumers. Three pooled practical lights now change fixture membership at zero fade weight. Expansion seals follow the rendered road triangles at an 8 mm offset.
- Renderer uses a single-sample HDR target with GTAO, restrained bloom and SMAA. Multisampled HDR plus GTAO previously produced opaque artifacts on ANGLE Metal; do not reintroduce that combination without reproducing and validating it. Asset ownership/disposal, shader warmup and the actual scene/sky reflection setup already exist.
- Last checks: build/lint, 55 automated tests and 43 browser checks passed; 12 additional lighting-motion still samples had no runtime errors. Fast numerical lap: 47.175 simulated seconds in about 261 ms, zero impacts. Sampled render peaks were 672 calls / 1,275,289 triangles / roughly 353.4 MiB estimated GPU assets. These are baseline observations, not new-level results or foreground certification. Original budgets remain about 1,000 visible calls, 2 million triangles, 512 MiB estimated GPU assets and 30 MB compressed initial transfer, targeting 60 fps on an identified configuration.

## Restart commands

Use Node 22.13 or newer; this machine was tested with Node 22.15.0. Its default shell may expose Node 20, so select the correct runtime first (here: `/Users/g/.nvm/versions/node/v22.15.0/bin`). From `games/vector-nova/`:

```sh
npm ci                 # when dependencies need installation; prepare installs Husky
npm run dev            # http://127.0.0.1:5179
npm test
npm run lint
npm run build
npm run preview        # http://127.0.0.1:5180
VN_URL=http://127.0.0.1:5180 npm run verify
```

Run a server in its own managed terminal session; do not block subsequent checks on a foreground server command. The plain URL enters the full first level through the title screen. `?review=signature` starts an untimed focused section after the real start action. `window.__VN` exposes seeded scenarios, snapshots, input logs and compatible replay checks; these are diagnostic helpers, not an autopilot. Temporary `.experiments/` scripts/captures may not exist in a fresh checkout and are not runtime dependencies.
