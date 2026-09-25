# Plug in and extend

## Start from the forest

Validate a plan and run the fork command in the framework README. Work in the output directory. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, and `npm run verify`. Browser checks start and stop their own Vite server; set `SCENE_PORT=4499` for an unused port, or `SCENE_URL` to explicitly reuse a server. Install Playwright Chromium with `npx playwright install chromium` if needed. Do not use another agent's live build for acceptance captures.

Read `src/main.js`, `src/world/forestDefinition.js`, and ARCHITECTURE.md before editing. Follow these seams:

| Experiment             | Primary change                                                            | Verification                                                                           |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Different season       | New definition/preset plus material/vegetation changes in the world layer | Same camera views; foliage/ground continuity, shadows and frame timing                 |
| New authored layout    | New world factory, terrain query, bounds, views and collider descriptors  | Camera clearance, traversable route, boundaries and placement                          |
| Walking/vehicle camera | `app.setController(factory)`                                              | Real input, collision, pause, reset and disposal                                       |
| Pickups/objectives     | Register a game layer; use shared scene/events/HUD mount                  | Complete interaction/result/restart loop                                               |
| HUD                    | Game-owned mount and state-driven UI                                      | Keyboard focus, narrow viewport, start/pause/result states                             |
| Live scene selection   | Add explicit unload/load orchestration                                    | Dispose old world/controller, reset state, namespace settings, no leaked GPU resources |

A season is more than tint: snow needs believable coverage and vegetation changes; rain needs wet material response, sky/light changes, sound and a bounded particle budget. Start with one concrete variant; extract a season system only when comparing two implementations shows what is shared.

## Layer contract

A layer has a unique `id`, `init(context)`, optional `update(dt, elapsed)`, optional `configure(settings)`, and `dispose()`. Register through `await app.register(layer)`; release through the app lifecycle. Context contains scene, camera, renderer, assets, events, UI mount, bounds, ground height and definition. The app owns the animation loop. A layer owns and releases its geometries, materials, textures, listeners and UI.

One controller owns the camera. A replacement provides synchronous `update(dt)` and `dispose()`; optional `lock()` and `resetMotion()` integrate with presets/UI. Never keep the fly controller listening underneath a walking controller. The promoted grounded controller also has explicit enable/pause ownership and drag/keyboard fallbacks. Forest collision descriptors now include placement-derived deadfall chains but still exclude small foliage; choose better collision when the game needs it. See [capabilities](./CAPABILITIES.md) for walking, placement helpers and the pond example.

## Introduce another starter flavor

Build one small runnable platformer, overhead or racing example first. Place its source under `scenes/<name>` only when it is useful as a scene foundation, or extend the catalog model deliberately if a different source type is needed. Add a manifest, assets/license index, run/build/test commands, honest limitations and a starter catalog entry. Update validators/schema/tests together if the model changes.

Only mark it available after a real source fork independently builds and passes its core playthrough. Do not make forest core accommodate unrelated renderers prematurely.

## Promote learning

Games stay independent. Port a fix intentionally, compare against `tech9.json` source hashes, test both projects, then bump the source version if its contract changes. Existing receipts keep their original versions. Prefer two uses before promotion; explicitly authorized earlier extraction records its smaller evidence base. A registered module needs a small interface, cleanup rules, tests, provenance and a working integration example. Canonical source is copied into framework examples with `sync:modules`; that command never upgrades an existing game.
