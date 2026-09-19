# Chronforge Echo

A standalone RPG about rebuilding a world that learned to stop listening. Kaida begins alone on the salt road; Vex and Rune join through the story. Eight regions connect settlements, caves, personal stories, civilization growth and ATB battles through the Void Architect and a playable homecoming.

## Working agreement

Follow [AGENTS.md](AGENTS.md): run the game only when explicitly asked, and leave linting/formatting to the automatic pre-commit hook. The user handles playtesting; commands below are reference only.

## Run and check

Use Node **22.13+ (22.x) or 24+**.

```sh
cd games/chronoforge-echo
npm install
npm run dev
```

Open **http://127.0.0.1:4321/**. The title screen offers a new journey or your latest save. The desktop game uses a 960×540 logical view, a 1920×1080 artwork surface and letterboxing. World and character sizes are independent of display resolution.

```sh
npm test
npm run build
npm run verify:build
```

`npm install` enables the pre-commit hook. Prettier uses its defaults with single quotes.

The static build is in `dist/`. `npm run preview` serves it at **http://127.0.0.1:4322/**. No server-side service or API key is required. Serve the build over HTTP.

The repository's Pages workflow publishes Echo at **https://gallak87.github.io/tech9/chronoforge-echo/**. Vite's relative base supports both the site root and nested deployment paths. Keep the trailing slash in links. `verify:build` checks compiled URLs, bundled fonts, live art and exclusion of development controls.

## Controls

| Context         | Controls                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Explore         | WASD or arrows; Shift to run; click a reachable destination to walk                                                   |
| Interact        | F, Space or Enter near a person, doorway, object or encounter                                                         |
| World view      | R or the button below the area label; R/Esc returns to play                                                           |
| Read            | Enter/Space continues; Esc/Backspace dismisses without choosing a story branch                                        |
| Menu            | Esc opens; 1–7 select tabs; Q/E change tabs                                                                           |
| Inventory       | Arrows browse the grid; Space/Enter equip or use; [/] switch crew; PageUp/PageDown and Home/End move through the pack |
| Menus and shops | Arrows navigate; PageUp/PageDown scroll; Space/Enter confirm; Esc closes the top layer                                |
| Map             | Hover/arrows select a region; click or Space/Enter activates its travel prompt; mouse drag pans, wheel zooms          |
| Battle          | Space/Enter/Right confirms; Up/Down chooses; Left/Backspace backs up; Tab selects another ready hero                  |
| Timing          | A fresh Space/Enter in the orange window improves Attack or Defend; incoming attacks offer a timed guard              |

Timed Defend reduces damage by 75% until the next action; normal Defend reduces it by 65%. An incoming timed guard applies to that attack only. Esc pauses the entire battle timeline. Movement bindings, audio, timing assistance, restrained motion and the minimap are adjustable in Settings.

Inventory groups items by type, with the highest tiers first. Each card shows its stat changes against the selected crew member’s equipment, plus an inline Equip/Use button. Space/Enter acts on the focused card. Equipped slots and type buttons toggle a filter with a click or Space/Enter; activating the same filter again clears it and releases focus. Filters stay active while browsing, comparing, equipping, or switching crew, and clear on click-away or when leaving Inventory. The small × beside equipped gear returns it to the pack.

Every valid consumable use in Inventory asks for confirmation, including revives and uses with no waste. The dialog names the ally and restoration amount, and shows waste when present. Canceling spends nothing; stock and the target’s condition are checked again before applying the item.

World view pauses play and flies out to the current map, with an amber ring marking the party. Unexplored terrain stays under soft fog; the map outline remains visible. It reads the existing survey without changing the normal camera, exploration or saves. Restrained motion skips the flyout. If R is assigned to movement or interaction in Settings, that binding takes priority; the World view button remains available.

Enemy badges show the strongest visible fighter as **LVL · Name** and compare their level with Kaida: muted at least two levels below, neutral within one, amber two–three above, red four–six above, and deep red with a skull seven or more above. A faint red ground oval has roughly 15 native pixels of contact padding; approaching it starts battle, including sentries. Only cleared repeat fights offer an interaction prompt. Cleared enemies and story-locked encounters have no contact oval. Post-battle protection hides the ring until contact becomes active again.

Town Center upgrades at **Settlement works** play an exterior reveal and an interior restoration in all four towns. The outside camera pushes in slightly; the inside comparison keeps the crew and camera fixed. Space, Esc or **Skip reveal** finishes immediately. Payment and checkpointing happen once, before playback. Restrained motion omits zoom and sparkles.

## Saves

The Save tab contains an automatic checkpoint and three manual slots. Each shows location, objective, party condition, play time and exploration progress. Suspended battles and ending progress survive saving/loading. Browser profiles and origins have separate storage, including development and preview ports.

**Export** downloads a saved JSON record. **Import** validates a record before replacing the selected slot; **After import, load immediately** can resume it in the same action. Invalid or newer-format files leave existing records untouched; imports are limited to 5 MB. Saves remain separate from the original game's storage.

## Local dev tools

Backquote (the backtick key) toggles the panel. `?dev=1` opens it automatically when a started or loaded game reaches exploration. It works only in development on localhost, 127.0.0.1 or [::1], and is excluded from production builds. Once open, the panel stays visible over menus and reveals; conflicting actions disable temporarily.

- **Eight world buttons:** click to jump directly, bypassing story gates. A temporary copy of the expedition isolates all progress and saves. **Return to expedition** restores the original location and state. Refreshing, loading or starting a game ends the preview.
- **Map explored:** reveals all menu maps and enables temporary map jumps. It does not change fog/survey data or gate the eight dev buttons. Switching it off changes the map display without ending a trip.
- **World view:** opens the overview with all terrain visible for inspection; the normal field button and R retain exploration fog.
- **Town art:** choose a town and level 1–4 to inspect exterior or interior restoration in place. **Preview upgrade** starts from the indoor desk and rehearses the transition without costs or saved changes; level 4 replays 3 → 4.

Preview state and render buffers stay in memory and are released on close/reset.

## Maintenance

[Architecture](ARCHITECTURE.md) describes state, rendering and simulation boundaries. [Art direction](ART_DIRECTION.md) covers current presentation and asset maintenance. [Narrative](NARRATIVE.md) describes campaign rules; [Roadmap](ROADMAP.md) contains outstanding work.

Use **`.experiments/`** for all disposable scripts, candidate assets, captures, reports and scratch files. It is local and Git-ignored; the entire folder can be deleted without affecting the game, build or required tests. Do not write project scratch files outside this checkout. Keep required tooling and regression tests tracked in `scripts/` and `tests/`.

When an experiment graduates, promote only its selected live assets and required code. Retain a shared atlas while any frames are live, and preserve font licenses. Clean unused experiments periodically; cleanup is manual.

`node scripts/asset-inventory.mjs` prints the live inventory without writing files. Review tools use **`.experiments/output/`**, recreated on demand by `scripts/review-output.mjs`. **`npm run clean:review`** removes that output only; disposable inspection scripts live in `.experiments/scripts/`.

For user-requested browser checks, `npm run verify` uses the dev server with isolated storage and `?test=1` hooks; `npm run verify:pages` checks root/subpath deployment. Campaign-dependent checks first need `node tests/campaign-browser.mjs` to generate disposable snapshots in `.experiments/output/`.
