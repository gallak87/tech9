# Chronoforge · The Unwritten Hour

A complete, compact 2D RPG adventure about a ferry crew, a world caught in its last safe hour, and a harbor worth rebuilding. Built independently from the original `games/chronoforge/src/` reference.

## Play

```sh
cd games/chronoforge-remake
npm start
```

Open **http://127.0.0.1:4179/**. No runtime packages or external services are required. Use a modern desktop browser with a keyboard and mouse. The stage scales to fit the window; 960×600 or larger is recommended.

- **WASD / arrows:** walk. **Shift:** run. **Click:** find a walkable route.
- **C / Space / Enter:** interact nearby or advance dialogue.
- **Esc / Tab:** open or close the seven-tab journal. **Q/E / left/right:** change tabs. **1–7:** jump to a tab.
- **Map:** drag or WASD to pan; wheel or +/− to zoom; R to reset. Visit a town center to unlock its fast travel.
- **Battle:** mouse or W/S/up/down selects; Enter confirms; A/D cycles targets; B returns. Select a ready hero by name. **Wait for allies** advances time until the living party is ready; **Act now** cancels the wait.

Wait mode pauses ATB during decisions. Settings include active mode, four battle speeds, sound, and reduced motion. The three manual saves and separate autosave live in this browser’s local storage. A normal URL contains no state-changing developer helpers.

## The adventure

Clear the east road and speak with Sera at Emberline’s archive. Explore the connected Mire, Crater, and Frost regions, defeat their guardians, and **touch each nearby anchor** to recover its memory and learn a coordinated technique. Three anchors reveal Iona’s voice at Last Crown’s archive. Break the Herald’s blockade and enter the spire. The final encounter leads to a choice, an epilogue, and a playable homecoming.

Kaida, Vex, and Rune have individual levels, stat growth, skill points, equipment and MP. Four skills per hero implement damage, slow, drain, recovery, shielding, taunt, revival and immunity. Three pair techniques and one triple technique require all participants alive, ready, and able to pay their MP cost. Every participant spends a full ATB gauge.

Four town centers contain 17 walkable interiors in total, including the final spire. Shops sell tiered gear and supplies; smiths improve individual equipment instances to +3. Visible first-clear encounters, lower repeat rewards, eight caches, and four optional rescue quests support progression.

## Rebuild Haventide

Visit the **Commons Hall** or one of seven southern plots. Build farms, mines, energy extractors, a community forge, rescue barracks, a memory archive, and shelter walls. Production accumulates during active exploration and battles, with capacity limits; collect it at the hall. No offline production is inferred.

Farms supply food for rest; mines and extractors supply construction and smithing materials. A forge reduces upgrade costs; barracks increase maximum HP, archives improve magic, and walls increase defense. Restore one anchor for hall rank II, and all three for rank III. Buildings can then advance to the hall’s rank. Rebuilding and rescued travelers appear in the epilogue. Haventide’s inn always offers free recovery.

## Build and verify

```sh
npm run build       # syntax, import and asset checks; creates static dist/
npm test            # deterministic production-logic scenarios and balance checks
npm run test:play   # targeted Playwright browser scenarios; local server required
npm run test:sprites # generated sprite coverage and runtime probes; temporary server
npm run test:motion # contact/return invariants and targeted battle-animation browser checks
```

For browser tests, `npm install` installs Playwright. Install Chromium with `npx playwright install chromium` if it is not already available. The test loader also supports the workspace’s bundled Playwright runtime through `PLAYWRIGHT_PACKAGE`.

See **STATUS.md** for actual validation and **evidence/** for screenshots and reports. Browser validation uses individual scenario checkpoints, as requested; it does not claim a continuous start-to-finish playthrough.

## Development checkpoints

### Battle scene browser

Open **http://127.0.0.1:4179/?dev=1&preview=battles** (the existing `preview=party-idle` link also works). The picker and **← / →** controls cycle all 17 encounters, including the spire's Architect, covering all 19 enemy types and 8 regional backdrops. The controls sit below the stage. Each selection starts a fresh paused encounter, with full HP/MP, supplies and party level/equipment suited to its region. **Reset battle** reloads the current encounter. Architect's **Start phase** selector previews phases 1–3 by setting his starting HP; normal phase transitions still apply once fighting.

**Animated / Static** controls both party and enemy idles during inspection. Click **Start battle** to fight using normal ATB, attacks and enemy turns; **Pause battle / Resume battle** stops and continues the same encounter. **Exit review**, victory's Continue, or defeat's Return to town restores the session from before the entire review, even after cycling through encounters. Preview progress and rewards are not saved. The existing `?dev=1&preview=kaida-idle` link still animates Kaida alone while paused.

Direct entry is supported, for example **http://127.0.0.1:4179/?dev=1&preview=battles&encounter=architect&phase=3**. Invalid encounter/phase query values fall back to a valid scene. The catalog comes directly from world and interior encounter definitions. Fixture levels are 1 for the opening road patrol, 2 for Forest Veil, 4 for tier-two regions, 5 for tier-three regions, and 7 for Last Crown. Eligible skills/equipment are supplied; pair links unlock at level 4 and the triple link at level 7. These are inspection setups, not a replay of saved progression or a balance claim.

Each hero uses a new `assets/<hero>-idle.png` sheet generated in one call with three poses together. Playback is **1 → 2 → 3 → 2**, holding each beat for 300 ms. At load, canvas compositing removes the edge-connected dark matte once and caches the three frames. Sprite RGB is preserved. One shared scale and baseline per hero keeps body height consistent with the original battle atlas; no frames are warped. Rune uses fixed whole-cell offsets of [0,0], [26,0] and [43,2] source pixels to correct generated padding drift at his boots. Reduced motion selects the resting pose. Attacks, other actions and overworld animations still use the original atlases. Generation inputs and prompts are kept in each hero's `art-lab/<hero>-guided-idle/` directory.

```js
__dev.partyIdle()                   // review all three party idles together
__dev.previewEncounters             // complete battle catalog
__dev.previewBattle('frost_guardian') // switch scenes, keeping the original return session
__dev.cyclePreviewBattle(1)         // next encounter; -1 for previous, wraps at the ends
__dev.previewBattle('architect', {phase: 3})
__dev.playIdleBattle()              // enable normal combat in the same preview
__dev.playIdleBattle(false)         // pause combat without resetting the encounter
__dev.kaidaIdle()                   // animate only Kaida in the paused review
__dev.kaidaIdleMode('static')       // comparison without resetting the loop's phase
__dev.kaidaIdleMode('animated')
__dev.exitKaidaIdle()               // restore the previous session
```

Open **http://127.0.0.1:4179/?dev=1**. The explicit development harness exposes:

```js
__dev.checkpoints                    // fresh, settlement, midgame, links, anchors, finale, defeat
__dev.checkpoint('links')            // synthetic milestone state; does not overwrite manual saves
__dev.near('anchor_mire')            // position close to a named interaction
__dev.startBattle('architect', {ready: true})
__dev.ready()                       // isolated ATB-readiness fixture
__dev.hero('vex', {mp: 0})           // isolate a cost/status case
__dev.advance(1)                    // advance real combat/production logic by simulated seconds
__dev.snapshot()                    // current state and transient battle details
__dev.loadState(serializedState)    // validated custom scenario
__dev.objects()                     // world/room interaction catalog
__dev.pause()                       // freeze the automatic clock; UI still works
__dev.poses()                       // current sprite positions, contact points and motion phases
__dev.resume()                      // continue the automatic clock
```

Normal and development builds expose the read-only `__chronoforge.snapshot()` and `render_game_to_text()` for inspection. Development fixtures intentionally grant levels, equipment, resources and narrative flags; reports identify these scenarios separately from fresh-start checks.

To inspect a strike directly, initialize a ready battle, pause, choose an action, and advance its real clock to contact:

```js
__dev.checkpoint('links');
__dev.startBattle('architect', {ready: true});
__dev.pause();
__dev.battleAction('command', {id: 'attack'});
__dev.battleAction('target', {id: 'architect-0'});
const snap = __dev.snapshot();
__dev.advance((snap.battle.action.impactAt - snap.battle.action.elapsed) / snap.state.settings.speed);
__dev.poses();                      // exact impact poses; resume() plays the return
```

## Art and implementation

All visual assets are new. `assets/kaida.png`, `vex.png`, and `rune.png` are original transparent 6×8 animation atlases created with the built-in imagegen tool from textual identity descriptions. **assets/prompts.json** preserves the exact prompts and grid metadata. The atlases supply idle, walk, run, attack, cast, hurt, north and south frames. Facing left mirrors directional frames; no static rotation replaces animation. Attacks use discrete windup/impact/recovery frame scheduling.

Offensive battle actions now travel to the chosen opponent: Kaida dashes or leaps into a slash, Rune jumps into a punch, and Vex glides into a close spell strike. Attacks arrive when damage lands, hold contact, then return to formation. Double/triple attacks use separate landing positions. Healing, protection and supplies stay in formation; reduced motion uses stationary casts and projected strikes.

The September 12 sprite pass adds **19 enemy atlases, 23 non-settlement character identities, 22 unique item icons, and closed/open salvage caches**, all created with the built-in imagegen tool. `assets/sprites/manifest.json` records every runtime mapping and original enemy identity. Exact prompts are saved in `assets/sprites/enemies/prompts.json`, `assets/sprites/npcs/prompts.json`, and `assets/sprites/items/prompts.json`. Each enemy has real idle, overworld walk, attack and hurt/collapse frames; the Architect has three distinct visual phases. NPCs have six idle/gesture frames. Iona’s generated portrait appears in her dialogue. The six original enemies and three named item sprites omitted in the first pass now have encounter, reward or shop paths.

`src/art.js` loads these generated images, measures their alpha bounds and draws their mapped cells; missing frames fail explicitly. Haventide's exterior, Wayfarer Smithy and opening battle now use dedicated code-drawn environment modules (`scene-haventide.js`, `scene-smithy.js`, `scene-road.js`) with finer material shading, dimensional architecture, layered foliage and warm/cool lighting. These are Canvas artwork, with no new generated image assets. `src/render.js` composes the scenes and retains the other biomes, rooms and settlement artwork. Static detail is cached, actors sort by depth, and broad walkable seams render adjacent biomes without a black transition. The score and effects are newly synthesized Web Audio. No original assets or sprite-generation mechanisms are reused.

The environment pass was checked with the build only; at the user's request, it has **not been playtested or visually verified in the browser**. To jump to its scenes yourself at `?dev=1`, use `__dev.checkpoint('fresh')` followed by `__dev.teleport(400, 960)`, `__dev.teleport(360, 390, 'haventide_smith')`, or `__dev.startBattle('road_scrappers', {ready: true})`.

Architecture and ownership details are in **ARCHITECTURE.md**. The original request and accepted additions are preserved in **prompt-ref.md**, the conversation, and the architecture’s settlement section.
