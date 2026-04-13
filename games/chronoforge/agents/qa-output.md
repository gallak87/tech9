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

---

# QA Report — Chronoforge Phase 4 (Playtest findings)

Phase 4 (Base Management) is live and playable end-to-end: build, upgrade, tick,
tier-up, demolish. Findings below are all non-blocking polish / iteration notes
captured from live play, not automated static analysis.

## Findings

### F-4.1 — Flux creative-liberty tile overrides (P1 grassland tiles)

Several P1 tiles generated on non-literal interpretations of their prompts.
Caught only now because Phase 4 is the first time the game is deeply-playable
enough to stop staring at UI and actually look at the world tiles in situ:

| tile | intended | flux delivered |
|------|----------|----------------|
| `tile_stream` | flowing water creek, blue reflective | neon cyan lightning bolt, electric "data stream" |
| `tile_dirt` | plain brown earth | brown with red/orange specks (mushrooms? debris?) |
| `tile_dead_tree` | dark bare tree silhouette | ~60% mostly-black frame, contributes to overworld dim/see-through feel |
| `tile_ruin_rubble` | grey stone rubble | dense geometric pattern, reads busier than surroundings |

**Not shipping-blocking** — the game is playable and the aesthetic still reads
as "neon post-apocalyptic", which is on-brand. But the overworld visual
coherence takes a hit because neighboring tiles read from different visual
dialects (neon-electric vs. organic vs. black-void).

**Fix option (cheap):** regen the 6 P1 grassland tiles with tighter prompts
that constrain flux's "neon everywhere" default:
- `tile_stream` — explicit "shallow blue water creek, gravel edges, NO electricity, NO lightning, NO neon"
- `tile_dirt` — "plain tilled brown earth, uniform texture, no debris, no growth"
- `tile_dead_tree` — "bare grey-brown tree on grass base, fills frame edge-to-edge"

### F-4.2 — Timing: visual coherence bugs only surface at deep-playability

This is a **process finding, not a game finding.** Worth surfacing to the
Historian agent (ROADMAP §5) when it lands:

> Art-direction coherence issues (flux taking creative liberties, tile frame
> coverage, neighboring-tile dissonance) **only become visible once the game
> is playable enough that the player stops looking at the UI and starts
> looking at the world.** Running an art-regen pass before that point is
> premature — you'll regen things that only look broken in context you
> haven't built yet. Corollary: a "visual QA pass" should be explicitly
> scheduled at the *end* of each playable-gate phase, not at the start of
> the next one.

This observation is a graduation candidate for `meta/LESSONS.md` once the
Historian agent is implemented. It's already general enough to apply to every
game in the pipeline.

## Verdict

**Phase 4 pass, with F-4.1 queued as optional art-regen task.** F-4.2
captured for Historian handoff.
