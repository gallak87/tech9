# Working in Worldkit

Read README.md and the relevant module guide. Worldkit is the consumable `@worldkit/environment` package; old game-generation, agent orchestration, promotion-to-root and copied-module workflows are historical references, not requirements for package development.

- Preserve one canonical module implementation and its art provenance. Public imports are defined in `src/` and package.json exports.
- Consumers own renderer, frame loop, lighting, authored landmarks and placement recipes. Avoid a universal biome engine without concrete consumers.
- Preserve legacy pilots and immutable fork receipts. Do not synchronize their owned source copies for an unrelated package change.
- Keep Three.js 0.186.1 a peer dependency. Assets must resolve in a built Vite consumer without a manual public-folder copy.
- Use Node 22 (`nvm use 22`). Run `npm run check` and relevant tests; use `npm run lint` for package entry changes. Visual integrations need a small real-browser check in the consuming game.
- Keep audit artifacts small and temporary. No default critic gauntlet, agent fanout or approval gate applies; follow the user's actual task and authorization.
