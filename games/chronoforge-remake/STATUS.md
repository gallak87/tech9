# Status · 2026-09-12

Run with `npm start` at **http://127.0.0.1:4179/**. Static release built in `dist/`. The latest environment pass is awaiting the user's visual/play review; earlier gameplay checks below describe the previous passes.

## Environment benchmark · September 12

Rebuilt the code-drawn artwork for three scenes around the existing generated sprites: Haventide's harbor/service buildings and local scenery, its Wayfarer Smithy interior, and the opening Rusted Road Patrol battlefield. The new `scene-haventide.js`, `scene-smithy.js`, and `scene-road.js` modules are integrated into the live renderer at their corresponding locations. They use finer material shading, directional highlights, recessed architectural details, layered foliage and warm/cool lighting. Static detail is cached; ambient effects honor reduced motion.

This is an artwork pass. World coordinates, collision, doors, interaction targets, combat choreography and progression remain in their existing modules. Settlement plots, the Commons Hall and settlement characters retain their prior artwork. Other towns, rooms and battle biomes retain their previous rendering.

**Validation scope: syntax/import/asset build only.** `npm run build` passed for 16 source files, three hero atlases and 26 sprite sheets, and rebuilt `dist/`; `git diff --check` passed. The user explicitly requested no playtesting this time. No browser, Playwright, game simulation, visual screenshot review or gameplay test was run for this pass, and no server was started. Previous evidence files have not been refreshed and do not validate the new environments. The user will assess the result in play.

## ATB contact movement · September 12

Committed the completed game/sprite pass as `a364a45f`, then replaced the fixed 45-pixel attack hop with target-aware battle choreography. Kaida dashes or leaps into sword range, Rune jumps into a punch, and Vex glides into a close spell strike. Physical enemies charge their selected ally. Attacks arrive at the existing damage timestamp, hold the impact pose for 0.22 seconds, and return exactly to formation. Double/triple attacks use separate landing positions and connect effects to all affected targets. Support remains in formation; reduced motion uses stationary projected strikes.

Movement uses authored run/walk/attack/cast frames, ground shadows, directional retreat and depth sorting. Health/ATB panels remain anchored. The three-enemy formation now leaves room for linked attackers against the top surviving enemy. Presentation is pure: HP, MP, ATB costs, rewards and action durations retain their existing combat logic.

| ATB check | Actual result | Evidence |
|---|---|---|
| Movement and impact invariants | **31 passing checks**: selected boss/second-target contact, every offensive technique, separate pair/triple positions, top-survivor spacing, support in formation, physical enemy approach, continuous return, lethal-target stability, pure rendering, reduced motion and one real damage application | `evidence/battle-motion-systems-report.json` |
| Focused Playwright | **11 passing scenarios**, 33 captured screenshot phases, zero page/network errors. Traced actual main-canvas sprite positions and atlas frames through approach/contact/return. Verified HP does not change before contact, one impact occurs, MP/ATB are charged once, and actors return to their exact formation | `evidence/battle-motion-report.json` |
| Existing combat regressions | 16 system checks, five campaign balance scenarios and six restored-enemy scenarios still pass | `tests/systems-report.json` |
| Build | 13 source modules plus all 29 image atlases/sheets pass syntax, import and asset checks; release rebuilt | `npm run build` |
| Visual review | Inspected Kaida/Rune/Vex contact, linked attack, enemy charge and the approach/contact/return contact sheet | `evidence/battle-motion-contact-sheet.png` |

The top-survivor edge case was independently reviewed and added to the numeric regression suite; the browser scenarios cover one- and two-enemy encounters. `__dev.pause()`, `resume()`, `battleAction()` and `poses()` support exact action checkpoints without replaying a fight. The browser and temporary HTTP server were closed after verification.

## Sprite remake · September 12

Replaced the remaining procedural enemy, item and non-settlement character sprites with new built-in imagegen art. **26 new PNG sheets contain 618 used source cells**: 19 enemy identities with 24 frames each, 23 NPC/story identities with six frames each, 22 distinct equipment/supply icons, and two salvage-cache states. Kaida, Vex and Rune retain their existing generated atlases. Settlement buildings, plots, mechanics, Nera and Tess remain unchanged.

All 19 original enemy identities are explicitly mapped in `assets/sprites/manifest.json`. The six omitted enemies now have optional encounters. Swamp Coil, Slag Tooth and Mire Charm now have dedicated art plus purchase, equip, save and first-clear drop paths. NPC aliases preserve Dara and Mina across their two placements; Iona has a generated dialogue portrait. Item sprites appear in inventory, shops, smithing, battle supplies and victory loot. Boss artwork follows all three phases; authored hurt/collapse frames follow real hits and deaths.

Exact prompts and unmodified generated PNGs are saved under `assets/sprites/enemies/`, `assets/sprites/items/`, and `assets/sprites/npcs/`. The loader uses alpha bounds and explicit atlas coordinates; two NPC sheets have corrected row boundaries to preserve complete figures. Missing sheets or blank mapped frames fail explicitly instead of falling back to generic shapes.

| Sprite pass check | Actual result | Evidence |
|---|---|---|
| Build | 12 source files, three existing hero atlases and all 26 new sheets pass syntax, import, mapping and asset checks; `dist/` rebuilt | `npm run build` |
| Targeted Playwright sprite validation | **182 render/state checks**, 26 sheet/alpha checks and **618 source cells** pass. Every draw is traced to its declared PNG/cell. All 22 inventory items, 24 NPC placements plus Iona, 19 battle enemy types, three Architect phases, actual lethal-hit collapse frames, three battle supplies, victory loot and both cache states verified. Zero page or network errors | `evidence/sprite-remake-report.json` |
| World and atlas boundaries | **121 interactions** pass collision/A* checks, including six added encounters; five NPC/cache sheets pass alpha and slicing-boundary checks | `evidence/sprite-world-report.json` |
| Combat, equipment and rewards | **16 system checks**, five campaign balance scenarios and six restored-enemy scenarios pass. Added accessories verified through buying, equipment, saves and deterministic drops; lethal-hit animation timing verified | `tests/systems-report.json` |
| Visual review | Inspected all enemy, NPC, item and cache galleries, inventory, NPC scene, Iona portrait, battle supplies/loot, and Architect battle phases | `evidence/sprite-remake-*.png` |

This pass used isolated development checkpoints and real production render/combat paths, not a repeated campaign playthrough. The temporary Chromium browser and HTTP server were closed after validation. No generated image pixels were recolored, keyed, traced or manually resampled.

## Built

- Complete ferry-crew story: Kaida’s missing sister, Vex’s responsibility, Rune’s broken command, three recovered anchor memories, Iona’s rescue, final Architect encounter, a future-setting choice, and a playable homecoming. Four optional rescues and rebuilding alter the epilogue.
- Eight connected biomes, four town centers, 17 walkable interiors, nine broad shared edges, collision-aware click paths, keyboard walk/run, NPCs, shops, smiths, free recovery at home, eight caches and visible encounters.
- Kaida, Vex and Rune have three original 48-frame transparent imagegen atlases. New creature/NPC/environment/equipment/UI artwork and synthesized audio. Original assets and generation mechanisms are not reused. Exact imagegen prompts are in `assets/prompts.json`.
- ATB formation, three-row status panel, lower-right commands, target selection, timed attacks, 12 individual skills, three double techniques and one triple technique. Readiness, MP, targeting, guard, slow, shields, immunity, drain, healing and revival affect real combat. Action poses, damage and audio share one impact schedule.
- Individual level/stat/skill progression, owned equipment instances, compatibility and item-level requirements, three upgrade ranks, loot, purchases/sales, first-clear and reduced repeat rewards.
- Seven settlement building types plus a hall: farms, mines, extractors, forge, barracks, archive and walls. Three ranks, visible construction, bounded production, collection, milestone gates, actual combat/stat benefits and smithing discounts.
- Original seven-tab journal structure/navigation with new brass/plum/paper treatment. Map pan/zoom and visited-town travel, gear comparisons, skills, quest records, four independent saves, settings, and a safe battle pause/review mode.
- Explicit `?dev=1` checkpoint and custom-state helpers, with read-only inspection on ordinary URLs.

## Initial campaign verification · September 11

| Check | Actual result | Evidence |
|---|---|---|
| Release build | Module syntax/imports and all three atlases verified; static bundle generated | `npm run build` |
| Targeted Playwright gameplay | **22 passing scenarios**, zero page/console errors: fresh opening and road battle, shops/doors, construction/production, gear, manual save/load, each guardian-to-anchor chain, all four links, unavailable links, rescue choice, defeat/retry, final battle, ending choice/save/homecoming and reload | `evidence/playwright-report.json` |
| World Playwright | **30 passing checks**, zero errors: 64 exterior and 51 interior interactions reachable, built-plot collision, all nine shared edges walked both directions, all 17 door round trips, archive click path around furniture | `evidence/world-report.json` |
| UI Playwright | Seven tabs, construction, keyboard battle controls, selectable ready heroes, stable focus, and ending layout checked at 960×600, 1280×800 and 768×480 | `evidence/ui-report.json` |
| Battle journal | Five checks: pause freezes ATB, review/settings work, mid-battle save/party mutations disabled, resume works | `evidence/pause-report.json` |
| Art in runtime | **18 hero/state combinations** render distinct frames; **26 item icons** painted in inventory. Inspected final character, equipment, settlement and coordinated-attack screenshots | `evidence/art-report.json` |
| Production system logic | **13 grouped checks** plus **five milestone balance simulations** pass, including all building types/ranks, transaction rejection, ownership, skills/status effects, save validation/errors, exact one-impact resolution and atomic link costs | `tests/systems-report.json` |

Inspected all eight biome views and five room types. Fixed unreachable water-side objects, room/title overlaps, NPC/party occlusion, menu clipping, ending overflow, duplicate battle headings, pose/impact timing and a casting-heading overlap before delivery. Final review images: `evidence/settlement-final.png`, `equipment-final.png`, `triple-impact.png`, and `ending.png`.

## Validation limits

Per the updated request, browser validation used explicit progression/state checkpoints and simulated-clock advancement instead of a continuous fresh-start-to-ending run. The fresh prologue and opening fight used normal starting stats; later reports identify their synthetic milestones. The dedicated ending-layout probe used a 1-HP boss only to inspect layout; the separate gameplay scenario defeated the full-health final boss. Balance simulations report simulated combat seconds, not a measured human playtime. Browser checks used Chromium; Safari/Firefox and touch-only controls were not tested.
