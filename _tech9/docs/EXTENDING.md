# Plug in and extend

## Start from the forest

Create a source fork through [GENERATE.md](../GENERATE.md). Work in its package directory and run `npm ci`, `npm test`, `npm run lint`, `npm run build`, and `npm run verify`. Browser checks start and stop their own Vite server; set `SCENE_PORT` to a free port, or `SCENE_URL` to use an existing server. Install Playwright Chromium with `npx playwright install chromium` if needed. Use a committed build for acceptance captures.

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

One controller owns the camera. A replacement provides synchronous `update(dt)` and `dispose()`; optional `lock()` and `resetMotion()` integrate with presets/UI. `app.setController` disposes the previous controller. Grounded walking provides explicit enable/pause ownership and drag/keyboard input. Forest collision descriptors include placement-derived deadfall chains and exclude small foliage. See [capabilities](./CAPABILITIES.md) for source-copy integration.

## Introduce another starter flavor

Build one small runnable platformer, overhead or racing example first. Place its source under `scenes/<name>` only when it is useful as a scene foundation, or extend the catalog model deliberately if a different source type is needed. Add a manifest, assets/license index, run/build/test commands, honest limitations and a starter catalog entry. Update validators/schema/tests together if the model changes.

Only mark it available after a real source fork independently builds and passes its core playthrough. Do not make forest core accommodate unrelated renderers prematurely.

## Bring back a capability

Follow [FRAMEWORK_DEV.md](../FRAMEWORK_DEV.md) to extract reusable behavior, define its interface and tests, preserve licenses and provide one usage aid. The capability index records its integration guide and current limits.
