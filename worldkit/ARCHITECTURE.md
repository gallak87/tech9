# Worldkit package architecture

`src/` defines the supported package exports. `modules/` retains the canonical implementations and module-owned source art. There is one implementation of each exported capability; the entry files are deliberately thin.

The consumer owns its Three.js renderer, scene, camera, frame loop and lighting. Factories create disposable components with explicit initialization, update and teardown. The caller chooses which components participate; importing the package does not mutate a scene or start work.

Canonical runtime art travels with the package through static module-relative URLs. Vite bundles it into the consumer's deployment. Three.js is an exact peer dependency to avoid incompatible shader chunks, loaders or duplicate engine copies. Local consumers should deduplicate `three` in Vite.

Game-specific landmarks and recipes remain with the game. Promote a capability only after a concrete second use demonstrates a useful shared contract. The Vesper Forest pilot uses existing forest art and material helpers while retaining its unique tree, road, regional placement and lighting in Vector Nova.

The package does not replace root game orchestration, generate agents, or require copied modules. Existing `baselines/`, `games/`, `scaffolds/`, `schemas/` and legacy tools are preserved reference material, excluded from the npm payload. See [legacy architecture](docs/legacy-architecture.md) for their historical organization.
