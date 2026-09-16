# Chronforge Echo

A standalone pixel-art RPG about rebuilding a world that learned to stop listening. Kaida begins alone on the salt road; Vex and Rune join through the story. Eight large regions connect settlements, caves, personal stories, civilization growth and ATB battles through the Void Architect and a playable homecoming.

## Play locally

Use Node **22.12 or newer** (development and verification use Node 24.19).

```sh
cd games/chronoforge-echo
npm install
npm run dev
```

Open **http://127.0.0.1:4321/**. The normal title screen offers a new journey or your latest save. Chrome or another current Chromium desktop browser is the verified target. The game draws a 1920×1080 artwork surface over a fixed 960×540 logical view, with filtered scaling and letterboxing for other proportions. World and character sizes are independent of display resolution.

```sh
npm test
npm run build
npm run preview
```

The static build is in `dist/`; the local production preview uses **http://127.0.0.1:4322/**. No server-side service or API key is required. Serve the build over HTTP rather than opening its HTML as a local file.

## Controls

| Context | Controls |
| --- | --- |
| Explore | WASD or arrows; Shift to run; click a reachable destination to walk |
| Interact | F, Space or Enter near a person, doorway, object or encounter |
| Field atlas | Esc from the world, an interior or battle; 1–7 jump to a tab; Q/E change tabs |
| Menus and shops | Arrows move focus or read Party/Quests; PageUp/PageDown scroll; Space/Enter confirm; Esc closes the top dismissible layer; mouse is supported |
| Battle | Enter opens the ready hero's command; arrows choose action and target; Enter executes; Backspace backs up; Tab selects another ready hero |
| Attack timing | A fresh Space/Enter press during the small timing cue raises critical chance; it does not guarantee a critical |

Movement bindings, music, effects, timing assistance, restrained motion and the minimap are adjustable in Settings. Esc pauses the entire battle timeline, including attacks already in motion. Battle commands remain separate from the atlas tabs.

## A useful first visit

Follow the salt road east. Fight the early visible patrol, read its timing cue, and liberate Haventide's gate. Enter the settlement, talk with residents and try Bran's forge request. Open the settlement works to see costs, benefits and civilization requirements. The atlas explains your next story objective without marking hidden loot.

The world is designed to be walked: each outdoor region is 5760×2520 world units. Liberated, visited town hubs later offer fast travel. Ordinary gateways connect the present-day world. Time travel is unavailable and remains an unapproved future item in `ROADMAP.md`.

There are three manual save slots and a checkpoint in browser local storage, separate from the original game's saves. Save metadata shows location, crew level and play time. Ending progress and suspended battles survive saving/loading. Saves belong to the browser origin and profile; the development and preview ports have separate storage.

## Review and evidence

`docs/VERIFICATION.md` gives a short playable review and the scope of each check. `docs/STATUS.json` records implementation, defects and verified evidence. `docs/SHOWCASE_CRITIQUE.md` contains actual visual reviews and corrections. `ART_DIRECTION.md`, `ARCHITECTURE.md` and `NARRATIVE.md` explain the art, systems and complete story. Original art sources, provenance and exact generation prompts are retained under `public/assets/` and `docs/`.

The browser harnesses in `tests/` exercise actual production modules and controls. Test-only scene presets require both a development server and `?test=1`; they are absent from the production build. Fixture-based visual checks, accelerated full-campaign simulation and real-time interaction checks are identified separately in their JSON reports. The evidence directory also retains failed iterations so later passing results are traceable.

The revised art uses heroes roughly 72–84 world units tall, reviewed in actual overworld and battle scenes before expanding the asset set. The hands-on feedback pass adds finer rendering, corrected sprite transparency, generated interaction props, a three-frame rest lantern, world-anchored birds and layered Esc dismissal. See [the corrections and evidence](docs/USER_REVIEW_POLISH.md), [rest lantern](evidence/polish-rest-lantern-0.png), and [chest](evidence/polish-treasure-chest.png). The menu identity redesign is recorded in the roadmap and deliberately deferred.

The user's hands-on review exposed visual and input defects missed by the earlier internal review; those earlier scores are historical, not acceptance of this revision. Caves remain angular and relatively sparse, some textures repeat visibly, and late progression is generous. All 49 art sources preload (about 121 MiB compressed); this version targets local desktop play. Saves use browser local storage and do not sync across profiles or ports.
