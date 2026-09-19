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

## GitHub Pages

The repository's Pages workflow builds Echo with Node 24 and publishes `dist/` at **https://gallak87.github.io/tech9/chronoforge-echo/** after a matching push to `main` (or a manual workflow run). Local development remains **http://127.0.0.1:4321/**. Vite's relative `base: './'` lets the same production files work at either the site root or a nested path, including the bundled fonts and dynamically loaded art. Keep the trailing slash when linking to the game directory.

`npm run verify:build` checks compiled entry/CSS URLs and all required art before the Pages artifact is uploaded. For a local browser smoke check, run `npm run verify:pages`; it builds once, serves the output at both `/` and `/tech9/chronoforge-echo/`, checks startup, fonts and the opening menu, then closes its temporary server/browser. It uses installed Chrome by default; set `CHROME_CHANNEL=chromium` to use Playwright's installed Chromium. The check uses isolated browser storage.

## Controls

| Context | Controls |
| --- | --- |
| Explore | WASD or arrows; Shift to run; click a reachable destination to walk |
| Interact | F, Space or Enter near a person, doorway, object or encounter |
| Read signs / conversations | Enter or Space continues; Esc or Backspace dismisses without selecting a story choice |
| Field atlas | Esc from the world, an interior or battle; 1–7 jump to a tab; Q/E change tabs |
| Menus and shops | Arrows move focus or read Party/Quests; PageUp/PageDown scroll; Space/Enter confirm; Esc closes the top dismissible layer; mouse is supported |
| Battle | Space/Enter/Right opens or confirms; Up/Down chooses; Left/Backspace backs up; Tab selects another ready hero; clickable nodes recover previous choices |
| Attack / Defend timing | Fresh Space/Enter inside the orange window boosts attack critical chance, or raises critical guard (85% damage reduction instead of 65%, until the next action) |

Movement bindings, music, effects, timing assistance, restrained motion and the minimap are adjustable in Settings. Esc pauses the entire battle timeline, including attacks already in motion. Battle commands remain separate from the atlas tabs.

Upgrading a Town Center from **Settlement works** now plays the exterior reveal in normal gameplay, in all four towns. It starts from your indoor view, fades outside, briefly pushes in, reveals the larger building with rising sparkles, then returns to Settlement works. **Space**, **Esc**, or **Skip reveal** finishes immediately. The upgrade is paid and checkpointed before playback; every town’s interior restores alongside its exterior, with a fixed-camera comparison and a short furnishing shimmer. See [the upgrade cinematic](docs/upgrade-cinematic.md).

In the local development build, **Backquote** (the backtick key) opens a temporary art-preview panel at bottom left. Select any of the four towns, then use **1–4** or **← / →** to cycle its exterior at Haventide's existing entrance. The party stays at Haventide; no travel, exploration or progression changes occur. Closing with backtick or Esc restores the actual artwork, level and camera. Preview changes never enter saved game state. See [regional exterior art and controls](docs/regional-town-centers.md).

While inside Haventide, the town selector and level controls cycle all four towns’ [interior restoration kits](docs/regional-town-centers.md#interior-restoration) in place. Floors, architecture, supplies and equipment progress together, while service positions and gameplay unlocks remain stable.

The panel is restricted to **localhost**, **127.0.0.1**, and **[::1]**. Backtick works without a query flag. Add **`?dev=1`** to open it automatically once a started/loaded game reaches unobstructed exploration; it waits through the title screen, dialogue, battles, and transitions. Closing leaves it closed until you reopen it or load/start another session. It is unavailable on remote hosts and excluded from production builds. Temporary art buffers and art overrides are cleared on close/reset; no preview data is written to browser storage.

All **eight world buttons** stay visible in the dev panel. Click one to jump immediately, regardless of story gates or the map toggle. The first jump starts a temporary copy of your expedition. Close the panel to explore, then use **Return to expedition** in the panel or the **World preview** return button to restore your original location and progress. All gameplay during world preview is temporary. Autosaves and manual saves retain the real expedition, including when previewing a battle. Loading, starting a new expedition, or refreshing ends the preview. Story flags and normal travel requirements remain unchanged.

**Map explored** reveals all eight regions in **Menu → Map** and offers temporary jumps from that map. It only changes the menu map display; your fog and survey data are untouched. Turning it off restores the ordinary map display without moving the party or ending a temporary trip. Dev-panel world buttons work with this toggle on or off.

**World view** quickly flies out to show the entire current map, including interiors. Play is paused and an amber ring marks the party. **Esc**, backtick, or **Back to dev tools** restores the normal view. This also works during a temporary world trip. It never changes the camera, position, fog, or saves; its in-memory view is released on close. Restrained motion skips the flyout animation.

The dev panel stays visible until explicitly closed, including over menus, world view and upgrade reveals; conflicting controls disable temporarily. Compact town controls provide a town selector, levels **1–4**, and one **Preview upgrade** button (level 4 replays **3 → 4**). World jumps leave the panel open and resume its pause after arrival.

The menu’s **Map** fills its content area. Hover or arrow keys select a region; **Space/Enter** or a click activates its travel prompt. Mouse dragging pans and the wheel zooms. Normal play still permits travel only to liberated settlements; **Map explored** offers temporary jumps to all eight regions.

The same panel offers **Upgrade from inside the selected hall**. Select **1 → 2**, **2 → 3**, or **3 → 4**, then press **Upgrade Town Center** at the preview's indoor desk. Watch the exterior reveal and return inside, with skip and replay controls. This preview shows the selected town’s four interior restoration stages and never spends resources or changes the expedition. See [upgrade rehearsal controls and scope](docs/upgrade-cinematic.md).

## A useful first visit

Follow the salt road east. Fight the early visible patrol, read its timing cue, and liberate Haventide's gate. Enter the settlement, talk with residents and try Bran's forge request. Open the settlement works to see costs, benefits and civilization requirements. The atlas explains your next story objective without marking hidden loot.

The world is designed to be walked: each outdoor region is 5760×2520 world units. Liberated, visited town hubs later offer fast travel. Ordinary gateways connect the present-day world. Time travel is unavailable and remains an unapproved future item in `ROADMAP.md`.

The Save page shows the automatic checkpoint above three manual slots, with each record’s location, objective, party levels and HP/MP, play time, and percentage of the outdoor world explored. Ending progress and suspended battles survive saving/loading. Saves belong to the browser origin and profile; the development and preview ports have separate storage.

Use **Export** on any saved row to download its JSON record, then **Import** on a destination row in your other browser, local game, or GitHub Pages game. The import confirmation includes **After import, load immediately** to resume the imported expedition in one step. Leave it unchecked to update only that saved row and keep playing; you can choose **Load** later. Autosave continues updating at future checkpoints. Invalid or newer-format files leave existing records untouched; imports are limited to 5 MB. Saves remain separate from the original game's storage.

## Review and evidence

`docs/VERIFICATION.md` gives a short playable review and the scope of each check. `docs/STATUS.json` records implementation, defects and verified evidence. `docs/SHOWCASE_CRITIQUE.md` contains actual visual reviews and corrections. `ART_DIRECTION.md`, `ARCHITECTURE.md` and `NARRATIVE.md` explain the art, systems and complete story. Active art sources, provenance and exact generation prompts are retained under `public/assets/` and `docs/`. [Experiments and design history](experiments/README.md) preserve the interactive UI concepts and retired art outside the production build.

The browser harnesses in `tests/` exercise actual production modules and controls. Test-only scene presets require both a development server and `?test=1`; they are absent from the production build. Fixture-based visual checks, accelerated full-campaign simulation and real-time interaction checks are identified separately in their JSON reports. The evidence directory also retains failed iterations so later passing results are traceable.

The revised art uses heroes roughly 72–84 world units tall, reviewed in actual overworld and battle scenes before expanding the asset set. The hands-on feedback pass adds finer rendering, corrected sprite transparency, generated interaction props, a three-frame rest lantern, world-anchored birds and layered Esc dismissal. See [the corrections and evidence](docs/USER_REVIEW_POLISH.md), [rest lantern](evidence/polish-rest-lantern-0.png), and [chest](evidence/polish-treasure-chest.png).

The approved [UI direction](docs/UI_DIRECTION.md) brings parchment into the seven-tab expedition menu, with Barlow controls and EB Garamond page typography. World interactions and the folding battle interface use compact neutral-dark surfaces and lava-orange accents. Battle commands follow character → action → target → timing, then return automatically to character selection as the real ATB gauges recharge.

The new resource, consumable and accessory icons use 20 individually generated transparent PNGs. Exact prompts and selected revisions are recorded in [icon-prompts.json](docs/icon-prompts.json); immutable originals remain in `public/assets/icons/`. Runtime icons use compact 256×256 textures with filtered scaling.

Road signs use a generated timber waymarker and a compact text-only reader. Escape dismisses the reader or conversation before opening the atlas. Cancelling the final conversation preserves its place and exposes an explicit resume action; completion still requires the ending's return action. The sign's [source and exact prompt](docs/sign-art-prompts.json) are retained locally.

The user's hands-on review exposed visual and input defects missed by the earlier internal review; those earlier scores are historical, not acceptance of this revision. Some scenery textures repeat visibly, cave interiors are relatively sparse, and late progression is generous. All 98 selected art sources preload (about 207 MiB compressed); this version targets local desktop play. Saves use browser local storage and do not sync across profiles or ports.
