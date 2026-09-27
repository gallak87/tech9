# Web 2.5D world

A standalone coastal exploration starting application using PixiJS and Canvas2D. An animated actor walks between limestone ruins, a keeper's cottage and the shoreline. Foot-anchored scenery sorts around the actor and fades where it obscures them. This is an authored foundation; it has no combat, campaign, save system or game outcome.

## Run

With Node `^22.13.0 || >=24.0.0`, from this package:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4403**. `npm run build` produces `dist/`; `npm run preview` serves it on port 4404. All fonts and artwork are local, and the build works under a deployment subpath.

## Controls

Choose **Explore the coast**. Use WASD/arrows to walk, hold Shift to run, or click a clear destination. Use F/E/Enter beside a landmark to read its note. Escape or Pause pauses; resume through the button or Escape. **Return to start** releases the current world and recreates it at the entrance. Focus loss pauses and clears held movement.

Touch devices have a movement stick, Walk/Run toggle and contextual interaction button. Portrait reserves a separate thumb zone; landscape uses the lower edge. CSS controls keep their size independently of world zoom and rendering resolution. Browser/device emulation covers these layouts; physical-device acceptance remains future work.

## Development

The package owns `src/coast.js` (layout, grounded footprints, roads, water and notes), `src/main.js` (UI/lifecycle) and `src/style.css`. The canonical `sprite-world` capability is copied into `src/modules/`, with exact versions/hashes in `PROVENANCE.json`. Its [guide](src/modules/sprite-world/README.md) describes assets, callbacks, configuration and disposal. See [ARCHITECTURE.md](ARCHITECTURE.md) for integration.

Art comes from the maintained Chronoforge Echo game but is owned here as a copy; there are no live imports from that game. Prepared pixels, measured crops, calibrated directional scales, originals and provenance travel with the module. See the module's asset notice. The bundled Barlow and EB Garamond fonts retain their OFL licenses under `public/fonts/`.

## Checks and limits

```sh
npm test
npm run lint
npm run build
npm run verify
```

Browser checks use installed Playwright Chromium or an already installed compatible Chromium (`CHROMIUM_PATH` overrides it). `COAST_PORT` selects a free strict development port. Checks cover desktop input, camera, collisions, pause, reading, restart/disposal, touch, orientation and rendering; output goes to ignored `.artifacts/verification/`.

Click movement is direct and stops/slides at obstacles; it does not route around buildings. Terrain is a bounded 2D composition with sprite depth, not a 3D surface. Shadows and shoreline lighting are painted approximations. Asset byte counts estimate retained decoded pixels and exclude browser/GPU overhead. This package's notes demonstrate callbacks without committing a future game's rules or story.
