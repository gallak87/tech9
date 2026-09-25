# Alder Signal architecture

This game owns a copy of the forest starter. Three.js uses +Y up and one unit per metre. The finite forest is deterministic; it does not grow or stream with player travel. There are no runtime imports from `_tech9`.

## Boot and ownership

`src/main.js` composes the forest definition, `SceneApp`, a grounded controller and the game layer. It registers the forest, replaces the inherited fly controller through `app.setController`, registers gameplay and starts the app's single render loop. The app owns renderer/camera/lighting/settings and layer lifecycle; gameplay owns its own rules, UI, equipment, audio and input state.

The inherited `src/core/SceneApp.js`, atmosphere/shadow code, terrain and forest world keep their original concrete boundaries. `src/world/forestDefinition.js` describes source forest content. The game's boot chooses its own identity/settings namespace and presentation. Layer registration receives the scene, camera, renderer, ground-height query, bounds, events and HUD mount. Controllers and layers must dispose their listeners/resources; no second camera owner or animation loop is allowed.

## Game modules

| File in `src/game/`    | Responsibility                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `mission.js`           | Authored relay/radio route and pure mission state. Start, active clock, repair progress, ordered restoration, pause, timeout, win and reset. |
| `WalkingController.js` | Keyboard/mouse ownership, grounded movement, bounded circle collision resolution, pointer capture/drag fallback and input cleanup.           |
| `FieldEquipment.js`    | Authored relay/radio meshes and labels, route markers and visible restored state; owns GPU resources.                                        |
| `FieldAudio.js`        | Local audio synthesis, gesture activation, mute and lifecycle cleanup.                                                                       |
| `GameUI.js`            | State-driven mission HUD, route map, menus and five graphics controls.                                                                       |
| `AlderGame.js`         | Game layer integrating those modules with the scene lifecycle and narrow callbacks.                                                          |

The mission clock uses monotonic active time. Camera movement uses the app's capped simulation delta; a slow frame must not grant extra mission time. Pausing accounts for time already spent, clears repair/held input and freezes player movement. Resume starts a fresh active interval. Restart resets the timer, restored relays, equipment feedback, controller motion and spawn.

Movement samples the same `terrainHeight(x,z)` as the forest. Conservative circle proxies cover mature trees and rocks; substeps and projection prevent crossing their solid radius and permit sliding. This is not exact mesh physics. Saplings, ground cover and deadfall remain non-solid. The route is authored beside the trail with clearance from those proxies.

Equipment and navigation communicate the current station; hold E within interaction range to restore it. The return target appears after the third relay. Holding E at the trailhead radio then wins; expiry first loses. Menus/results disable walking and interaction. Focus/visibility loss and releasing captured mouse pause play.

## Tests, source and limits

Pure rules and collision behavior belong in `tests/game.test.js`; inherited tests still check terrain/settings and runtime lifecycle. `tests/game-browser.mjs` verifies actual input through the complete loop and state transitions against production preview. See [tests/README.md](tests/README.md) for the test-only observation API, rare-state clock setup and evidence locations. Ordinary URLs expose no test hooks. Capture source is frozen, then the implementation is committed before independent critique.

`tech9.json` is the immutable source-fork receipt, not a completion certificate. `GAME_PLAN.json` retains the exact initial plan bytes referenced by its hash. Current validation and subsequent decisions live in README/run evidence. The original forest's art score is historical provenance; it is not transferred as the game's score.

Assets stay local. Forest model/textures and editable Blender source retain their attribution/license records; authored equipment and procedural audio are documented in `public/game/ASSETS.md`. Only Blender asset rebuilding needs Blender/Pillow. Normal gameplay/builds use the local package.

To extend the game, first change one complete player interaction and update its real-input test. Avoid introducing shared-engine abstractions or promoting a module until another real game establishes the reusable seam. This POC stops at the first playtest handoff; later work follows user feedback.
