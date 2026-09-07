# Validation notes

Validation was performed locally with Node 22.15.0 and Playwright's managed Chromium. The game has a static production build with relative asset paths. No remote deployment was performed.

## Systems and complete chapter

`npm test` passes 11 tests covering ATB and Wait timing, action resolution, real positional area damage, pair/triple costs, support effects, items and revival, enemy intent and boss phases, progression and settlement costs, save validation, defeat/retry, and a complete chapter won through legal actions without resource grants.

`npm run test:browser` serves the production build at `/chronoforge-dusk/`. The complete chapter browser run performed 55 combat commands through DOM controls and reached the ending, with no page, console, network, or assertion errors. It exercised:

- Keyboard movement and mobile joystick input.
- All eight journal tabs, equipment, skills, discovery rewards, and both beacon upgrades.
- All four encounters, all three pair techniques, and Aeon Sunder.
- Save, title, Continue, defeat, retry, and post-ending exploration.
- Desktop and portrait mobile layouts, target selection, and Execute.

Travel between landmarks used deterministic test positioning; the browser run was not a continuous manual walk through every route. Mobile validation used a simulated viewport and pointer input, not a physical phone. The complete chapter run preceded the isolated battle-stage visual overhaul; focused checks below cover that presentation change.

## Battle presentation and rehearsal

After building, run `HEADED=1 npm run test:battle` for hardware-rendered visual checks on this Mac. Headless Chromium uses SwiftShader here and is substantially slower. It serves the production build beneath a project prefix, verifies GLB loading, samples actual rendered actor positions during a DOM-issued attack, checks the return to formation, executes techniques and combinations, captures desktop/mobile screenshots, and records frame timing. `VIDEO=1` records the run. Quality defaults to Medium and can be changed with `QUALITY=high`.

The focused lifecycle test suppresses WebGL drawing while continuing world updates, game clocks, presentation callbacks, and DOM controls. `npm run test:transitions` checks help/pause return, rehearsal save isolation, immediate exits during attacks, victory/defeat exits, restored settings, fallen portraits, revival, and returning to the story save. `GAME_DIST=/absolute/path/to/dist` tests a static build rather than the development server.

For the player, start `npm run preview`, then run `npm run rehearsal`. This opens a visible Playwright browser and leaves the all-techniques rehearsal ready for input. The rehearsal does not overwrite story saves.

Generated reports and screenshots are saved under `tests/artifacts/` and are excluded from Git. The full-chapter browser harness also supports `QA_ARTIFACTS`, `GAME_DIST`, and `GAME_URL` overrides.

The final portrait camera padding was adjusted after screenshot inspection and production-build checked. That last portrait-only adjustment was not rerun in the browser before the requested stopping point.

## Audio and performance limits

The original WebAudio score and effects were checked for initialization, mode changes, nonzero output, volume/mute handling, and disposal. Those measurements do not constitute subjective listening evaluation. Browser audio requires an initial user gesture.

The headed Medium battle-stage run at 1440×900 measured about 120 fps (8.3 ms median, 9.3 ms p95), with 330 draw calls and about 538k rendered triangles. All stage commands completed without browser errors. Frame timing is measured on this computer and browser; it is not a cross-device performance guarantee. High quality adds ambient occlusion and bloom; Medium reduces rendering cost, and Low also disables shadows. No Safari, Firefox, or physical mobile device run has been performed.
