# Stillwater Fishing

A small first-person fishing game at a sheltered forest pond. Walk to the bank, aim a cast, watch a float settle on the water, react to a bite, then reel carefully against the fish's pull. Landing a fish should feel like a complete little event, followed by a catch card, release and another cast. Aim for a two-to-four-minute first catch.

This folder is a launch packet, not a runnable game. Follow [GENERATE.md](../../GENERATE.md) to move it into the run records before creating the owned starter fork.

## First playable

- An opening instruction that plainly says: cast into the pond, react to a bite, manage tension and land a fish. Show the current action and its input clearly.
- Grounded walking and looking along a small authored bank, with a reachable fishing position and a clear shore boundary. No swimming is needed.
- One convincing pond with a deliberate basin, visible shoreline, readable water surface and subtle motion/ripples. Adjust terrain and vegetation placement so the water does not slice through dry ground, trees or grass. A flat plane laid over the untouched forest is not a completed pond.
- A visible rod, line and float. A cast uses player aim and a simple power/timing input; casting onto land produces clear recoverable feedback.
- One fish species and one catch attempt at a time. Bites happen within a short bounded wait, with visual feedback sufficient to play without sound. No hidden multi-minute wait for the first catch.
- A hook window followed by a small tension/reeling interaction: reel to gain progress, ease off when the fish pulls. Show tension and progress clearly; inputs must affect the outcome.
- A visible fish during landing, a catch result and a release/retry action. A missed bite, escaped fish or broken line resets cleanly without reloading.
- Start, pause/resume and restart states, including lost focus and pointer-lock exit. Local splash/reel sounds and mute if audio is added.

## Limits and acceptance

No boats, rivers, swimming, fluid simulation, species catalog, tackle shop, inventory economy, quests, multiplayer or generic water framework. A convincing pond and satisfying catch beat a large fishing simulator. Use the registered `forest-exploration` starter; it does not include water, fish, a rod or a walking controller.

A real-input playthrough must approach the bank, cast, observe a bite, hook, reel with tension changes, land, release and cast again. Separately verify an invalid cast, missed hook, line break or escape, pause mid-fight and clean restart. Test hooks may observe state or arrange a rare condition, but must not award a catch or skip the cast/hook/reel playthrough.

Target 60 observed FPS at 1600 × 1000 with Balanced settings, reporting the actual machine and measurements. Keep water settings bounded by the game's quality controls. After correctness checks, run the independent AAA art critic/fix cycle to 8/10 or a maximum of four rounds. At the cap, report an honest failed art gate if needed and hand the playable game to the user before adding depth.

## Water ownership

Build water inside this game, using a disposable layer and a small local pond definition where useful. Keep water rendering, shore/terrain data, fishing rules and player control at concrete seams. Own and dispose water geometry, materials, textures and listeners; do not start a second renderer or animation loop.

Document the pond authoring steps, input data, quality/performance costs and cleanup contract in the game's architecture. Record a possible reusable water/shore asset or layer in `CONSUMER_NOTES.md`. Promotion back into the framework is a later, deliberate change after playtesting and evidence from reuse; do not copy it back now.

## Workspace contract

- Slug: `stillwater-fishing`.
- Game: `_tech9/games/stillwater-fishing` from the repository root.
- Run: `_tech9/runs/stillwater-fishing` from the repository root.
- Suggested worktree branch: `codex/stillwater-fishing`.
- Preferred ports: dev `4440`, preview `4441`, browser checks `4442`. Check availability first; record any replacement.
- Preserve source/license records for new fish, tackle, water textures and sounds. Keep the other pilot and shared framework source unchanged.
