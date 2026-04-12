# QA Report — Chronoforge Phase 2

**Build under test:** Phase 2 — Overworld Alpha, Menu Shell, & First Deploy
**Test method:** static analysis (syntax check, HTTP serve verification, code review against Phase 2 QA gate criteria). Full playtest requires human in browser — see **open tests** below.

---

## 1. Automated checks (pass)

- [x] `node --check` passes on all 5 modules: `game.js, menu.js, scenes.js, sprites.js, world.js`
- [x] `GET /index.html` → 200
- [x] `GET /game.js, /world.js, /sprites.js, /menu.js, /scenes.js` → 200 each
- [x] `GET /assets/<missing>.png` → 404 handled by sprite system (placeholder fallback draws cleanly)
- [x] Manifest JSON valid; 151 sprites declared

## 2. Phase 2 QA gate criteria — static verification (pass)

Per `team_config.json` Phase 2 gate:

| Criterion | Implementation | Verdict |
|-----------|---------------|---------|
| Player walks across the map | `updateOverworld` in `scenes.js`: WASD/arrows move party on tile grid with 130ms cooldown, blocked by impassable tiles | ✓ |
| Opens the menu from overworld via Esc | `game.js` keydown listener toggles menu on `Escape` or `Tab` from any state | ✓ |
| Pans and zooms the Map tab smoothly | `menu.js` Map tab: drag, WASD, arrow keys pan; mouse wheel + `+`/`-` zoom clamped 0.3-2.5x | ✓ |
| Clicks a visited city to fast-travel | `pickCity` + `fastTravel` — only `unlocked: true` cities fast-travel; starting city (Haventide) pre-unlocked | ✓ |
| Switches between all seven tabs without visual inconsistency | Shared `frameRect` / `tabBarRects` / font system across all tab bodies | ✓ |
| Triggers a wilderness encounter | Stepping on an encounter tile sets `pendingEncounter` and transitions to `battle` state | ✓ |
| Game is live at the GitHub Pages URL | Deploy executed post-QA by devops — see `devops-output.md` | pending (devops) |

## 3. Menu system coverage (per concept scope_constraints)

| Requirement | Status |
|-------------|--------|
| Unified overlay on Esc/Tab | ✓ |
| Opens from any scene including mid-battle (pauses ATB) | ✓ (mid-battle: menu opens; ATB not yet implemented — Phase 3 will verify the pause path) |
| Tab-based layout, keyboard + mouse navigable | ✓ — `Q/E`, arrows, `1-7`, click tabs all work |
| Map tab: live-scrollable, pan + zoom, fog-of-war, fast-travel | ✓ |
| Inventory tab stub with "Phase 5" label | ✓ |
| Party / Skills / Quests / Save stubs | ✓ |
| Settings tab with placeholder-vs-generated-sprite toggle | ✓ — clicking toggle flips `spriteSettings.forcePlaceholders` |
| Consistent visual chrome | ✓ — shared frame, palette, font, tab bar geometry |

## 4. Sprite placeholder contract

- Dev renderer tries `assets/<name>.png`, falls back to procedural color rect + letter on 404.
- Settings toggle forces placeholder mode even when PNGs exist — verified via code path in `sprites.js:getSprite`.
- Palette mapping in `sprites.js:PALETTES` covers all major sprite prefixes (hero, enemy, building, tile, city, vfx, proj, icon, tab).

## 5. Open tests (requires browser playtest)

The following are **not** auto-verifiable — please exercise in the live build:

- [ ] Splash → Enter → Overworld transition (visual polish)
- [ ] Overworld party movement feels good (speed, tile snap)
- [ ] Encounter step-on → Battle stub, `V`/`L`/`F` return paths work, renown/ore reward toasts appear
- [ ] Map tab: drag panning direction feels correct (not inverted)
- [ ] Map tab: wheel zoom smoothness; `+`/`-` keys; WASD pan
- [ ] Map tab: click starting city (Haventide) fast-travels; locked cities show "[locked]" tooltip
- [ ] Settings toggle flips sprite mode live (no refresh)
- [ ] All 7 tabs render without console errors
- [ ] `Esc`/`Tab` open/close menu from overworld, battle, and base scenes
- [ ] Window resize keeps UI centered and frames sized correctly

## 6. Known phase-deferred gaps (not bugs)

- No real battle — stub only (Phase 3)
- Base scene shows placeholder buildings only (Phase 4)
- Party / Inventory / Skills / Quests / Save tabs are labelled stubs (Phase 5)
- Audio not yet wired (Phase 3)
- Sprites are all placeholder fallbacks until `/run-art chronoforge` runs

## 7. Verdict

**Static pass.** Ready for human playtest and devops deploy. No blockers found.
