# Echo character on a Worldkit coast

Build a small, hands-on Three.js experiment in a clean folder in the main tech9 checkout. Choose its location with the current assignment; this handoff folder is not an implemented game. The old full-game Godot port is superseded. This brief is for the next assigned experiment, not an instruction to start it during documentation cleanup.

Load one existing animated Echo character, preferably Kaida, with a correctly equipped weapon into a small Worldkit coastal scene. Provide simple camera controls, a useful character preview and working unload/reload. Make it attractive enough for the owner to judge the character, animation, scale and overall direction in person.

Explore the existing code before choosing the implementation:

- `../chronoforge-echo/`: current character identity, artwork, palette and game reference.
- `../../worldkit/`: reusable environment components.
- `../vector-nova/`: existing Three.js loading, previews, resource management and performance tooling.
- `/Users/g/code/scratch/chronoforge-dusk-creative/games/chronoforge-dusk`: read-only donor of models, rigs, equipment, motion and asset tools. Reuse needed dependencies and licences. Its old campaign, Godot plans and acceptance gates do not govern this experiment. Optional pointers: [DONOR_ASSETS.md](DONOR_ASSETS.md).

Make reasonable implementation choices. Build the visible experiment first. Extract a small shared utility only where it demonstrably benefits both this experiment and Vector Nova; no extraction quota or framework rebuild. Keep Vector Nova's gameplay unchanged.

Inspect the actual idle, weapon grip, materials and animation transitions. Verify repeated unload/reload releases owned resources without accumulating canvases or listeners. If a utility is shared, check it in both consumers. Report measured performance and remaining visual problems honestly.

Keep this milestone to character, coast, preview and resource lifecycle. Bring the owner the first working version before extensive polishing. Story, combat, progression, full maps and new model generation are outside this experiment. Commit a coherent checkpoint and leave concise run instructions.
