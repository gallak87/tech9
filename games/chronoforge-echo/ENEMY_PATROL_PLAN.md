# Enemy art, patrols, and cave encounters

Implemented on 2026-09-21. Ready for the user's playtest; deployment remains separate.

## Completed

- [x] Restore a durable prompt registry for all 19 enemies, with exact historical prompts for 18. Rust Scrapper's original wording remains unavailable and is explicitly marked.
- [x] Pilot Drone Sentinel with existing hover art and Mutant Hound / Gravbot with referenced movement sheets.
- [x] Generate and install ten coherent movement sheets using the built-in image generator and canonical battle references.
- [x] Inspect all sheets, measure 120 frame crops, and compare battle idle, four lateral phases, front/back views, and Kaida at gameplay scale.
- [x] Add bounded patrols to 32 outdoor encounters and eight new cave encounters.
- [x] Keep bosses and defeated encounters stationary, with replay markers at authored homes.
- [x] Validate movement, contact, pauses, save/load, suspended battles, and developer-preview isolation.
- [x] Apply player feedback: ordinary outdoor enemies follow longer road routes, including the opening Scrapper; preserve every bend and pause only at endpoints.
- [ ] User playtest: tune gait cadence, route feel, and cave difficulty.

## Shipped behavior

| Encounter role                                        | Maximum distance from home                               | Speed              |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------ |
| Four town guards                                      | 64 logical world units, horizontal pacing                | 36 units/second    |
| Ordinary outdoor enemies, including the introduction  | Up to 650 units in either direction along a road         | 52–68 units/second |
| Cave enemies                                          | 100 units, horizontal pacing in the lower supply chamber | 42 units/second    |
| Bosses, defeated encounters, one-off story encounters | Stationary                                               | 0                  |

Routes are generated deterministically after final scenery collision. All 28 ordinary outdoor enemies start on the nearest usable authored road and follow its bends; the opening Scrapper covers about 506 units, and other available stretches span roughly 450–1,300 units. Road patrols reverse and pause only at endpoints, consuming remaining frame time through intermediate waypoints without stopping or cutting corners. If no usable road exists, the encounter stays stationary. Every leg is sampled against walkability, ground-footprint clearance, nearby encounter homes, doors, camps, interactions, and arrivals. Routes shorten at obstacles or protected approaches. Guards and caves retain short local pacing. Cave pacing was moved deeper after a browser probe found the initial placement too close to the default story route.

Sprites, badges, and contact ovals use the same resolved position. Relative swept contact detects a walking player or an enemy crossing a stationary player. Existing prerequisites and contact protection apply. Patrols stop during menus, dialogue, world view, travel, recruitment, reveals, battles, and post-battle grace.

Live positions and gait clocks stay outside the shared world catalog and saved state. Off-region patrols freeze. Loading reconstructs valid route starts; a nearby loaded enemy stays inactive until the player moves 125 units clear. Cleared replay markers use their original authored homes. Developer trips have separate patrol state, and returning resumes the real expedition. Suspended battles exclude patrol configuration and clocks.

## Art and regeneration

Authoring records: [art/enemy-prompts.json](art/enemy-prompts.json). Live sources: [src/assets.js](src/assets.js). Measured movement crops: [src/enemy-walk-frames.js](src/enemy-walk-frames.js).

Selected PNGs live under `public/assets/enemies/walk/`. Each record contains the exact generation prompt, reference, generator, revision, selected output, and review note. All ten used the built-in image tool. Battle sheets remain the canonical identity reference.

Run from this game directory:

```sh
node scripts/enemy-art-prompt.mjs --check
node scripts/enemy-art-prompt.mjs mutant_hound
```

The read-only helper validates coverage and resolves the current reference before emitting a complete generation brief. Generate a whole four-phase, three-direction sheet with that reference, then compare it with the battle idle before promotion. Similar wording alone does not guarantee identity.

Grounded sheets: Rust Scrapper, Slag Rat, Bog Stalker, Mutant Hound, Gravbot, Glacier Wolf, Mire Hulk, Sandworm, Ember Golem, and Mire Warden. Hover reuse: Drone Sentinel, Neon Cultist, Frost Revenant, and Wraith Core. Boss status belongs to the encounter, so ordinary Mire Warden and Neon Cultist encounters can move.

The generator returned 1448×1086 RGB sheets with painted checkerboards despite requesting alpha. Original selected PNGs stay unchanged; existing connected-neutral runtime extraction removes backgrounds using measured thresholds and seeds. Measured crops use shared row baselines and a fixed scale per direction. Slight palette/detail differences remain subjective review items; no battle-sheet replacement was needed.

Historical prompts came from revision `b5990e47a516fa1d585368237c82dd942245fbcf`, before cleanup commit `1e1b5a9e1990c4cd276b768cc464b14cef425ef8`. The registry retains exact historical filenames and record keys, including the selected obsidian Gravbot rather than its superseded stone design. Routine regeneration no longer needs historical checkouts.

## Cave allocation

Each cave has one optional lower-chamber encounter using existing stats and reward rules. Stable IDs are `<cave-id>_supply_patrol`; previously saved cleared records remain valid.

| Cave                   | Group                      |
| ---------------------- | -------------------------- |
| Tideglass grotto       | Rust Scrapper + Slag Rat   |
| The blue cistern       | Mutant Hound               |
| The root archive       | Bog Stalker + Mutant Hound |
| The submerged annex    | Bog Stalker pair           |
| Obsidian gallery       | Ember Golem                |
| Buried station         | Neon Cultist               |
| The names in the ice   | Glacier Wolf pair          |
| The unfinished gallery | Wraith Core                |

Entry chambers remain safe. Pathfinding probes reach all eight field records, Vex's countervoice, and Rune's names outside patrol routes. Extra groups and rewards remain deferred until pacing is playtested.

## Validation

- 306 pure Node regression tests passed after the road-following revision, including nine patrol/art/access checks.
- The initial implementation passed 48 headless integration assertions on local Chromium despite the locked desktop. The road-following revision passed a targeted headless check of opening-route distance, road adherence, menu pauses, and the cleared marker; zero page or required-asset errors.
- Production build passed. Deployment verification resolved 183 compiled entry, font, and art files at root and GitHub Pages mounts. Vite reports its non-blocking large-bundle warning.
- Compared all ten movement sheets against battle identities at gameplay scale and captured a live cave patrol.
- Development checks excluded standalone linting/formatting; the authorized commit uses the repository's pre-commit checks.

Temporary generation copies, inspection captures, probe scripts, logs, and build output were deleted after validation. Selected live art, prompt provenance, maintained tooling, and regression tests remain.

Next playtest priorities: the three pilot enemies, town-guard restraint, ordinary route readability, and cave combat pacing. Pursuit, retreat-rule changes, boss movement, and extra cave groups remain separate decisions.
