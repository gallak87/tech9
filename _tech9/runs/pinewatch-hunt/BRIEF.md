# Pinewatch Hunt

A small first-person bow-hunting game in a quiet pine forest. Read signs of a nearby deer, spot it through the trees, approach carefully, take a clear shot, then walk to the animal to complete the hunt. Make the stalk and the readable response of the animal the interesting part. Aim for a three-to-five-minute session with an immediate retry.

This folder is a launch packet, not a runnable game. Follow [GENERATE.md](../../GENERATE.md) to move it into the run records before creating the owned starter fork.

## First playable

- An opening instruction that plainly says: track a deer, approach quietly, use the bow, retrieve the animal. Teach controls as actions become relevant.
- Grounded walking, looking and a slower quiet approach, with collision against substantial trees, rocks and game props.
- One deer species and one active animal in a bounded authored area. Its silhouette and simple idle/walk/alert/flee animation must be readable. A restrained procedural model is acceptable; a floating target is not the finished animal.
- A small set of visible tracks or disturbed vegetation that helps the player find the encounter. A compact hint may prevent aimless wandering.
- A simple, understandable detection rule based on distance and movement/noise, with visible alert feedback. Keep the implementation bounded; no simulated ecosystem.
- A visible bow, aim/draw/release interaction, and understandable hit/miss feedback. Keep the presentation non-graphic. A confirmed hit ends the shot phase; walking to retrieve completes the session.
- A clear recovery or retry if the deer escapes or arrows are exhausted. Start, pause/resume, result and restart states must work, including lost focus and pointer-lock exit.
- Enough authored placement and lighting to make the animal visible without removing the forest's atmosphere. Local sound and a mute control if sound is added.

## Limits and acceptance

No multiple species, inventory economy, survival meters, crafting, hunting simulation, gore, multiplayer, huge maps or framework-wide animal system. Prioritize a playable stalk over a realistic ballistics simulation. Use the registered `forest-exploration` starter; it provides neither a deer nor a walking controller.

A real-input playthrough must locate and approach the deer, aim and release, retrieve, see success and restart. Separately verify a miss, alert/flee and a recoverable failed hunt. Check aiming while paused, held inputs across focus loss, collision, and fresh state after restarting. Do not use a test hook to teleport to the deer or award a hit.

Target 60 observed FPS at 1600 × 1000 with Balanced settings, reporting the actual machine and measurements. After correctness checks, run the independent AAA art critic/fix cycle to 8/10 or a maximum of four rounds. At the cap, report an honest failed art gate if needed and hand the playable game to the user before adding depth.

## Workspace contract

- Slug: `pinewatch-hunt`.
- Game: `_tech9/games/pinewatch-hunt` from the repository root.
- Run: `_tech9/runs/pinewatch-hunt` from the repository root.
- Suggested worktree branch: `codex/pinewatch-hunt`.
- Preferred ports: dev `4430`, preview `4431`, browser checks `4432`. Check availability first; record any replacement.
- Keep animal models, behavior and authored encounter data inside this game. Preserve source/license records for any new assets. Record reusable seams and framework friction in the run's `CONSUMER_NOTES.md`.
