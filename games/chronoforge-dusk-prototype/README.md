# Chronoforge Dusk

**The Last Light of Bellwether** is a standalone, complete 2.5D adventure built with Three.js 0.185.1 and Vite 8.2.2. It runs entirely in the browser. It does not use tech9's framework.

Lead Kaida, Vex, and Rune through Meridian Valley, restore two sun relays, rebuild Bellwether's hearth beacon, and face the Pale Warden. The chapter has four authored encounters, optional caches and a memory recording, equipment, branching skills, three pair techniques, and the Aeon Sunder finisher.

## Run

Use Node **22.12+** (or Node 20.19+):

```sh
cd games/chronoforge-dusk-prototype
npm ci
npm run dev
```

Open the local URL printed by Vite (default port **5199**).

```sh
npm run build
npm run preview
```

The static game is in `dist/`. Open it through an HTTP server; loading `index.html` through `file://` cannot load ES modules and model assets correctly.

## Play

- **WASD / arrow keys:** move in screen directions. **Shift:** run.
- **Click / tap ground:** travel to that point. The map also offers landmark routes.
- **E / Space:** interact with a nearby landmark or advance dialogue.
- **Esc:** journal / back. **M / I / J:** map / inventory / quests.
- **1 / 2 / 3:** select a hero in battle. **Tab:** cycle heroes.
- Touch devices have a movement stick, an Interact button, and touch-friendly commands.

Choose **Try ATB combat** on the title screen, or open `?battle=1`, to rehearse against the Pale Warden with all techniques unlocked. The rehearsal does not overwrite your story save. With the preview server running, `npm run rehearsal` opens a visible Playwright browser and leaves it ready for you.

Battles use a separate close-up arena dressed for their encounter location. Melee attackers cross the stage, make contact, and retreat; Vex casts projectiles and paired techniques coordinate their participants.

In battle, a ready hero pauses enemy time while the other heroes continue charging. Every committed action advances enemy time during its choreography. Select a hero, choose an action, then select a target and Execute. Area techniques show their actual radius on the ground. Read enemy intent, and use shields or defense before a large strike.

Pair techniques require both participants' full gauges and energy. **Aeon Sunder** unlocks when both relays are restored, requires all three heroes, and can be used once per battle. Attacking recovers a little energy; defending recovers more. Items can restore energy or revive allies.

The crew begins with one skill point each. Spend points in Skills and equip new salvage in Inventory. A two-stage hearth beacon consumes food, ore, energy, and renown, changes the settlement visually, and grants permanent battle benefits. Resting in Bellwether costs one food.

Save in the journal. Victories, completed discovery conversations, and construction save automatically. Progress is stored in this browser's local storage. A different device, browser profile, site origin, private session, or clearing site data will not retain that save. Defeat offers an encounter retry with the pre-battle inventory and equipment restored.

## Publish to GitHub Pages

The Vite configuration uses `base: './'`. Scripts, styles, portraits, and models resolve relative to the deployed game folder; there is no backend, CDN, font service, or external asset dependency at runtime.

1. Run `npm ci && npm run build` from this folder.
2. Publish **the contents of `dist/`** to your Pages publishing directory (or upload `dist/` as a Pages artifact).
3. Open `https://<account>.github.io/<repository>/` or the game subfolder under that URL.

If publishing the full tech9 repository, copy the build into `games/chronoforge-dusk-prototype/` in your Pages artifact. The source-folder path is independent from the deployment path. Do not publish `node_modules/` or point Pages at the unbuilt source HTML.

An example GitHub Actions workflow is provided in `docs/github-pages.yml`. To publish this game as the repository's root Pages site, copy it to `.github/workflows/dusk-pages.yml` in the repository root and enable **Settings → Pages → GitHub Actions**. No remote publishing or repository configuration has been performed by this build.

## Source and assets

- `src/main.js`: game flow, controls, responsive DOM interface, journal, dialogue, targeting and navigation.
- `src/game.js`: renderer-independent combat, crew progression, economy, chapter content, and save validation.
- `src/world.js`: authored Three.js valley, model integration, animation, cinematic cameras and effects, scalable rendering.
- `src/audio.js`: original generative WebAudio score, ambience, and effects. Audio starts after a user gesture.
- `public/art/`: original editable SVG crew portraits and emblem.
- `public/models/`: browser-ready GLB assets.
- `assets/source/`: editable Blender scenes and deterministic asset-authoring scripts.
- `tests/`: systems tests and Playwright production-browser validation.
- `prompt-dusk.txt`: original brief.

The models, portraits, score, and effects were created for this chapter. There are no third-party artwork or music downloads. Three.js, Vite, and Playwright retain their respective open-source licenses.

## Validation

```sh
npm test
npm run build
npm run test:browser
```

The browser test uses Playwright and serves the production build under a project subdirectory. Run `npx playwright install chromium` once if Playwright's browser is not already installed. See `TESTING.md` for the exact checks and observations from this delivery.

`?test=1` exposes an explicit test-only inspection surface at `window.__dusk`. Normal play does not expose it. Test setup is used for edge cases such as defeat; the full-chapter systems test wins through legal actions and earned resources.
