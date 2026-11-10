# Level types, rewards and world expansion

Current review-branch direction, **2026-11-10**. Preserve anti-gravity racing, colossal scale and the approved shared handling. Human playtests and release validation remain separate from implementation and completed art reviews.

## Current implementation status

Seventeen ordinary racing courses remain alongside **nine standalone mode courses**. Cups keep their existing lineups; new courses do not automatically become championship races.

| Mode        | Cup opens the first course | Easy → Medium → Hard                                                                | Build and advancement                                                                      |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Freestyle   | Founders                   | Zephyr Skywell → Oriel Sunvault → Ravel Sailbreak                                   | Stock ship, no equipment. A valid full course finish opens the next; no medal requirement. |
| Eliminator  | Frontier                   | Glasswake Fracture → Saffron Ossuary → Nomad Last Convoy                            | Owned build and road weapons. Win to open the next course.                                 |
| Interceptor | Horizon                    | Crucible Dispatch / Goliath → Helion Breach / Wraith → Nightweir Lockdown / Bulwark | Stock mission ship, issued Lance and Injector. Defeat the boss to open the next encounter. |

These are course challenge tiers; the opponent/encounter difficulty setting remains separate. Crucible Foundry is retired from the player picker. Its shared factory/route code remains a source for Dispatch, which has its own pursuit plunge and bank reversal. The three Interceptor encounters retain their established mechanics and art.

Last Convoy uses Nomad Procession's actual moving-carrier course: drive on the decks and transfer between trucks. Its Eliminator event ends with the last survivor or the first valid finish on the lead carrier; its separate mode identity keeps records and progression distinct.

## One career collection

The full game has **37 unlocks: 28 existing reward items + 9 course unlocks**, shown in one progression bar. The 28 items remain the six enhancement tracks, three ship unlocks, six abilities and Quad Core; courses are not fake equipment claims.

Course eligibility is computed from cup wins and the known course IDs in `profile.finishedCourses`. Cup victories open the starters; finishing or winning a course opens its successor according to the table. No separate saved unlock flags or migration layer is needed. An unlock counts when the course becomes available, so opening all nine requires the first two courses in each mode; completing the final courses is tracked separately.

**37/37** opens the original Oriel, Ravel and Nomad Procession racing courses, Encore Cup and the completion cinematic. The earlier mode variants have distinct IDs and do not require those bonus racing courses, avoiding a circular gate. Original cup lineups and item requirements, including Quad Core's four original cups, stay fixed. The demo retains its four-item collection and excludes these modes.

Valid results also earn ordinary race progress: Freestyle Gold/Silver/Bronze/completion gives 5/4/3/1; Eliminator uses placement; Interceptor success/failure gives 5/1. Invalid attempts and practice earn none. Losing a combat event can earn progress without advancing its course chain. Result reopening cannot duplicate claims or course finishes.

Locked modes and courses remain selectable as previews, with a visible cup or predecessor requirement and disabled Start. Previewing uses saved menu imagery, not a constructed world. Keyboard and controller use the same selection and launch guards. Course results name newly opened courses; Career lists their locked, available or completed states. Garage always displays the owned career build.

## Freestyle

All three courses have five authored transfers, distinct approaches and banked or tube arrivals. Skywell's approved driving, jumps and landing mechanics remain the reference. Sunvault recomposes them within Oriel's inhabited cylinder with three pipe catches; Sailbreak uses Ravel's folded-sail fleet and two pipe catches. Each has an independent route/record identity and course-local scenery.

WASD drives; arrows pitch/roll; Q/E flat-spin; Space damps rotation; Shift boosts. On controller, left stick drives, right stick pitches/rolls and X/Y flat-spin. These bindings apply only to Freestyle. Held airborne rotation earns continuous AIR SCORE; accepted catches bank it with landing quality and chain bonuses. Full route completion includes authored misses; manual recovery, incomplete routes and developer transfer practice cannot set records or advance the chain.

## Reuse and presentation

A biome supplies shared architecture, materials, lighting, sky and sound vocabulary; a course owns route, collision, placement and event pacing. Reuse public [Worldkit](../../../worldkit/README.md) kits where suitable and canonical local assets where already authored. There is no required circuit/sprint/Freestyle trio per biome. Preserve the original courses when composing siblings.

Mode variants need their own readable landmarks, physical clearances, menu stills and art review. Badges say Freestyle, Eliminator or Interceptor; boss names are secondary. Retain the [art direction](ART_BIBLE.md), [audio conventions](audio/sounds.md), restrained HUD and complete input/result/retry paths. Register new assets and borrowed sources in [ASSET_MANIFEST.json](ASSET_MANIFEST.json). Completed critic loops remain closed.

## Later gameplay and rewards

- **Sidegrades:** start with one weapon variant and possibly one propulsion specialization. Define benefit, tradeoff, slots, cooldown, counterplay and complete icon/VFX/audio presentation. Revisit or replace Magnetic Stabilizer if its air-control role remains too narrow.
- **Carve and Escape:** prove controlled slide/clean-exit scoring on one banked section and visible pursuit/fair recovery in one suitable sprint biome before authoring full courses.
- **Assault:** defer its moving targets and vulnerable systems until weapon expansion is established. Redline remains parked.
- Add specialist series only after measuring duration and compatible scoring; do not extend the original cups or their reward requirements automatically.

## Optional feel and presentation experiments

Future camera, sound, mastery cosmetics or hull-detail experiments need a bounded assignment and matched gameplay views. Story campaigns, open-world conversion, manual weapon aiming, online play and consumable economies remain separately scoped ideas. Current priorities live in the [roadmap](../ROADMAP.md).
