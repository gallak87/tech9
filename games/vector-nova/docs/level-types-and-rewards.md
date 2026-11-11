# Level types, rewards and world expansion

Keep anti-gravity racing, colossal scale and approved handling. Mode courses are standalone; original championship lineups and item requirements stay fixed.

## Modes and course chains

| Mode        | Starter cup gate | Easy → Medium → Hard                                                                | Build and next-course requirement                                                         |
| ----------- | ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Freestyle   | Win Founders Cup | Zephyr Skywell → Oriel Sunvault → Ravel Sailbreak                                   | Stock ship, no equipment; complete the full course to advance, with no medal requirement. |
| Eliminator  | Win Frontier Cup | Glasswake Fracture → Saffron Ossuary → Nomad Last Convoy                            | Owned build and road weapons; win to advance.                                             |
| Interceptor | Win Horizon Cup  | Crucible Dispatch / Goliath → Helion Breach / Wraith → Nightweir Lockdown / Bulwark | Stock mission ship with issued Lance and Reserve Injector; defeat the boss to advance.    |

Course challenge groups are separate from opponent/encounter difficulty. Locked modes and courses remain selectable previews, showing the cup or predecessor requirement beside disabled Start. Previews use saved menu stills. Keyboard and controller share the launch guard.

Eliminator cuts the last racer after 22 seconds, then every 10 seconds. Last Convoy retains Nomad’s actual moving trucks, deck transfers and recovery; its event can also end at the first valid finish on the lead carrier. Interceptor gives three allied racers and the player two circuits to stop the boss.

## Career collection

The full-game progression bar counts **37 unlocks: 28 reward items + 9 mode courses**. The items cover permanent enhancements, ship unlocks, equipment and Quad Core. A course counts when it becomes available, rather than becoming another equipment claim.

Eligibility derives from cup wins and `profile.finishedCourses`, without separate saved unlock flags. Each starter opens with its cup; each successor requires the preceding courses to be completed under that mode’s rule. Opening all nine therefore requires the first two courses in each chain. Final-course completion is recorded separately.

**37/37** opens the original Oriel, Ravel and Nomad Procession racing courses, Encore Cup and the career completion cinematic. Mode variants have distinct identities and earlier cup access, avoiding circular gates. Quad Core still requires the four original cups. The demo retains its four-item collection and excludes these modes.

Valid events also earn ordinary race progress: Freestyle Gold/Silver/Bronze/completion gives 5/4/3/1; Eliminator uses placement; Interceptor success/failure gives 5/1. Invalid attempts and practice earn none. A loss can earn progress without advancing a course chain. Reopening results cannot duplicate rewards. Career shows course availability and completion.

## Freestyle

Each course has five transfers with generous flight space and distinct banked or tube catches. Sunvault has three pipe arrivals; Sailbreak has two. Keep the approved takeoff, flight and landing envelopes.

**Keyboard:** WASD drives; arrows pitch/roll; Q/E flat-spin; Space damps rotation; Shift boosts. **Controller:** left stick drives, right stick pitches/rolls, X/Y flat-spin. These aerial bindings apply only to Freestyle; equipment is disabled.

Held airborne rotation grows AIR SCORE continuously. Accepted catches bank rotation/trick points, landing quality and chain bonuses. Rough catches that reattach natively can bank **Good** after stable support. Solid receiver surroundings use the shared physical bounce/recovery system. Authored misses still allow a valid full-course finish; manual recovery, incomplete routes and developer transfer practice cannot set records or advance the chain.

## Reuse and direction

Reuse public [Worldkit](../../../worldkit/README.md) kits and canonical biome assets where suitable. Each sibling course owns its route, placement, collision and event pacing; there is no required circuit/sprint/Freestyle trio. Preserve original courses, readable paths and complete keyboard/controller result/retry flows. Keep mode badges, icons, VFX and sounds consistent with [art direction](ART_BIBLE.md) and [audio conventions](audio/sounds.md); register current assets in [ASSET_MANIFEST.json](ASSET_MANIFEST.json).

## Later

- Weapon/propulsion sidegrades with clear tradeoffs and complete presentation; revisit or replace Magnetic Stabilizer’s narrow role.
- Carve and Escape remain candidates for suitable banked sections and sprint biomes.
- Assault follows weapon expansion.
