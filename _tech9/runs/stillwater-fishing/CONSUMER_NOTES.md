# Framework consumer notes

The registered forest starter forked correctly after moving the exact two-file launch packet into this run. The CLI's existing-destination guard was respected. Starter source checkpoint: f5c3be1dc7f214add757a3c6553a77adfba40311. Shared checkout remained on its original branch; this game lives on codex/stillwater-fishing in a managed worktree.

The starter supplied a fly controller, forest renderer/assets, lifecycle seams and approximate colliders. Walking, pond terrain, plant exclusion, reflective water, tackle, fish and rules were all built game-locally. No shared source or hunting paths changed. The default shell Node was 20; the bundled Node 24.19 runtime was used for the required supported toolchain. No hooks were installed.

Useful seams: `setController` cleanly replaced the fly camera; the layer lifecycle supported world/water/game ownership; copied source allowed terrain and vegetation edits together. Friction: starter browser assertions and documentation assumed flight/named views, so the game has its own input-driven suite and updated docs. Forest-specific exact hero-tree assertions also needed replacement with shore exclusion checks.

The Three.js Water helper hides its reflection render target and has no cleanup API. A local MIT-attributed derivative exposes that target, with explicit quality sizing and disposal. No framework patch was made. Rendering quality controls bound reflection size/cadence and pixel budget; ordinary gameplay uses only the existing renderer loop.

Potential reuse candidate: a small shoreline definition plus coupled terrain carving, vegetation exclusion and disposable water layer. That contract needs evidence from another real consumer before promotion. It remains in the game; promotion is intentionally deferred.

The original asset/license records and immutable fork receipts remain preserved. New fish/tackle/shore assets are procedural source, with local attribution records.

Final review lesson: adding visible authored world props requires extending collision data at the same time. The separate critic found reachable bank rocks missing from the starter-derived proxies. Shared game-local `BANK_ROCKS` tuples now drive both mesh placement and collision, with CPU and actual walking-input regression checks. No generic framework collision module was added.

The final reflection target budget is 1024 / 1536 / 2048; the measured Balanced pass remained above 60 observed FPS on this host. Reflection fidelity and procedural focal assets still prevented the 8/10 AAA gate after four rounds. Preserve that failed result rather than treating a playable consumer trial as a finished AAA art pack.
