# Level types, rewards and world expansion

Design notes, 2026-10-24. This captures the connected directions under discussion and a proposed implementation order. It is a planning reference; individual mechanics, reward assignments and production dates remain open.

## Direction

Grow VECTOR//NOVA through new event rules, meaningful equipment choices and new routes in familiar worlds. Preserve fast anti-gravity racing, colossal environments, committed movement and readable courses.

The current preference is **sidegrades and weapon expansion**, with **Eliminator, Carve and Escape as favored event candidates**. Assault comes later. Freestyle remains a developed candidate, with its slow tricks and demanding jump chains retained below. The next implementation task has not been chosen.

Use these distinctions when planning:

| Layer              | Meaning                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| World / biome      | A place with a shared material, structural, lighting and sound identity; it can contain several courses.                              |
| Course / route     | Authored geometry, checkpoints, collision, scenery placement and start/finish. Circuit and sprint describe its closed or open format. |
| Event / discipline | Rules applied to a suitable course: racing, Eliminator, Carve, Escape or another objective. Some require a dedicated route.           |
| Cup / series       | A finite, curated selection of compatible events with a clear identity and session length.                                            |
| Career reward      | Persistent equipment, enhancements or recognition earned through event outcomes and mastery.                                          |

An event type does not always require another course. A new course does not always require another biome. Worlds can support whichever disciplines suit their geometry; there is no required circuit/sprint/Freestyle trio.

## Event and content matrix

| Type           | Player challenge                                                                                                                          | Reuse opportunity                                                                                                           | Equipment / reward relationship                                                           | Current direction                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Circuit racing | Repeated corners, overtaking, combat and lap consistency.                                                                                 | Existing courses support new rules and loadout experiments.                                                                 | Main home for offensive, defensive and propulsion builds.                                 | Existing foundation.                                       |
| Sprint racing  | Sustained descent, speed management and committed transfers.                                                                              | Existing worlds can supply new descending routes and destination landmarks.                                                 | Propulsion, reserve and recovery choices matter.                                          | Existing foundation.                                       |
| Eliminator     | Stay ahead as the last racer is removed at successive cuts.                                                                               | First pilot on an existing circuit; environment production can stay small.                                                  | Immediate purpose for weapon and defensive sidegrades.                                    | Preferred early pilot.                                     |
| Carve          | Link deliberate slides through banks and sweeping bends, preserving speed and making clean exits.                                         | Prototype on an existing banked section; author a dedicated route only if the handling supports it.                         | Can award racing equipment; decide scored-build rules before upgrades affect records.     | Preferred early exploration.                               |
| Escape         | Maintain pace ahead of a visible environmental threat and reach a clear destination.                                                      | A suitable sprint biome supplies infrastructure, scenery and effects; pressure and failure rules still need implementation. | Sustained boost and defensive choices may become useful if the event permits career gear. | Preferred after a small rules prototype.                   |
| Freestyle      | Commit to slow aerial tricks, recover attitude and catch the receiving slope; five well-linked jumps should produce an outstanding score. | Shared biome art around purpose-built launch and receiving geometry.                                                        | Mastery can unlock weapons or modules useful in other races.                              | Retained candidate; currently behind the preferred pilots. |
| Assault        | Race alongside or through a colossal machine, attacking readable exposed systems during openings.                                         | Industrial assemblies and existing weapons help; moving targets, encounter states and route changes add scope.              | Strong destination for a broader weapon collection.                                       | Later, after weapon expansion.                             |

Interceptor (pursue and pressure an escaping target) and Redline (escalating speed with heat/boost management) remain parked ideas. They have no proposed production milestone yet.

### Mechanical notes to retain

- **Carve:** current airbrake already increases yaw authority, reduces lateral grip and adds drag. Release restores normal grip; heading and momentum require recovery/countersteering. It currently has no airborne effect. Establish whether sustained slides feel good before adding a scoring system or changing shared handling. Score useful forward travel, controlled slip and clean exits; reject stationary spins, oscillation and repeatable farming.
- **Freestyle:** launch speed establishes the ballistic arc. Tricks rotate the hull with real commitment and recovery time; normal limited air correction remains. Start with one substantial trick per ordinary jump and occasional combinations on larger flights, then tune through play. Keep the chase view stable during hull rotation. Bank points through a clean slope catch; successive good landings feed speed into the next launch and raise the chain value. Trick durations, penalties and multipliers remain undecided. Existing landing assistance must not automatically earn a skill bonus.
- **Escape:** the pursuing threat needs visible progress, understandable warning and a fair failure boundary. Existing distance-linked environmental spectacles are useful ingredients, but do not yet constitute a pursuing game rule. Define how missed jumps and automatic recovery interact with the threat.
- **Eliminator:** establish the first-cut grace period, cut timing/location, treatment of eliminated racers, result order and retry flow. Elimination initially means removal from the contest; destructive damage is separate scope.

## Sidegrades and reward structure

Build on the existing career, garage, equipment slots and unlock/save systems. Coordinate with the rewards work rather than creating a second economy or reassigning existing cup prizes casually. The current catalogue has six enhancement tracks, six equipped abilities and a limited equipped loadout.

The long-term appeal is a large collection of useful choices. A long-duration boost build could be exciting when it trades burst strength, recharge rate or an equipment slot for endurance. Keep permanent baseline enhancement tiers bounded and make equipped combinations deliberate. Exact durations and tradeoffs need playtesting.

Initial candidate families, **not approved item specifications**:

| Family                      | Example benefit and tradeoff                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Weapon variants             | A Burst Lance exchanges the existing heavy strike for several weaker shots.                                                               |
| Propulsion modules          | An Overdrive Capacitor extends sustained boost with slower recovery or weaker initial acceleration.                                       |
| Defensive / utility choices | A tightly timed Counterpulse could convert a blocked attack into a brief propulsion benefit; more complex than an initial weapon variant. |

Each item needs a clear benefit, a meaningful tradeoff, its slot/cooldown rules, unlock condition, counterplay and complete icon/VFX/audio presentation. Expand a small tested set before committing to a large catalogue. Unique per-ship trick animations and later emote-like flourishes can add expression while keeping comparable scoring potential.

Suggested reward roles:

- Valid completions contribute to shared career progress.
- Medals and improved best achievements supply meaningful one-time awards; reopening results or repeating an unchanged milestone must not duplicate them.
- Exceptional mastery, such as five clean Freestyle links, can justify a named equipment prize usable in ordinary racing.
- Curated championships retain recognizable trophies and selected milestone rewards. Define alternative access where essential racing equipment would otherwise require an unrelated specialist discipline.
- Cosmetics, titles, finishes and signature effects can recognize deeper mastery alongside functional gear.

One course can support records, medals, mastery and different racing builds. A new reward does not require a new environment. Repeat-event progression and exact award amounts remain open.

For scored Carve/Freestyle, a fixed build per ship is the starting proposal, following stock Time Trials. Speed upgrades change available airtime, and Magnetic Stabilizer can reduce landing difficulty. Decide the policy explicitly; any career-build records need compatible rules/loadout identities.

## Reuse within existing worlds

[Worldkit](../../../worldkit/README.md) supplies canonical assets, materials and geometry factories. VECTOR//NOVA retains course composition, hero landmarks, lighting, collision, hazards, event rules and performance budgets. Extract reusable pieces when real sibling courses need them; avoid an upfront universal biome engine.

| Existing world | Plausible extension                                                                 | Reusable foundation / new work                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Colossus Works | Eliminator on the circuit; later an industrial descent, transfer course or Assault. | Industrial kit, steel/enamel finishes and machinery; new routes need distinct silhouettes, clearances and composition.            |
| Nightweir      | Escape through hydroelectric districts.                                             | Civic infrastructure, water and gate vocabulary; threat behavior and route timing require a dedicated proof.                      |
| Shatterline    | Escape or Freestyle candidate.                                                      | Accelerator structures, mountain terrain and long-flight experience; each event needs appropriate pressure or receiving geometry. |
| Vesper Forest  | Carve through broad rooted banks, or a future canopy transfer course.               | Existing forest assets and surfaces; foliage and branches must leave fast lines and airborne receivers readable.                  |

These are matches to investigate, not a content assignment. Preserve approved courses as playable originals; give new variants distinct event identities and new routes their own course identities. Reuse saves art production, while route design, collision, camera readability and driving verification remain necessary.

When a new course is selected for production, develop three candidate course concepts, choose the direction, then imagegen the selected concepts before detailed environment work. No concept art or full sibling-world rollout is commissioned by this note.

## What cups mean as the game grows

**Cups are curated championships, not an exhaustive inventory of the game.** New tracks and event types can launch independently. Existing cups do not automatically gain another race whenever content ships.

The current full-game cups contain 3 / 3 / 3 / 5 events; Apex already includes Colossus. Keep their current lineups and saved progression stable during the initial pilots. For future series, choose a theme, difficulty arc and target session duration first. Three or four events is a useful starting size, with duration and pacing guiding exceptions.

Current cup classification assumes ten racers, valid finish times, placement points and wins/total-time tie-breaks. Circuit and sprint races already fit this. Eliminator needs an explicit classification policy before joining a cup. Solo Escape and scored Carve/Freestyle need separately designed series rules; raw times and trick scores cannot simply be summed. A medal-based challenge tour is one possibility, not a committed system.

Keep event access, world mastery and championship completion distinct. A player can explore new disciplines without every one becoming part of the original career cups. Existing rewards described as “win all cups,” including Quad Core, must retain an explicit original championship set or versioned requirement when new series arrive; catalogue growth must not silently extend an established unlock.

## Shared game identity and completion standard

Use the [art bible](ART_BIBLE.md), [sound expansion guide](sounds/expansion.md) and [cue inventory](audio/sounds.md) as the shared reference. Event and reward work includes its presentation from the first playable slice:

- Keep the fleet's manufactured ceramic/graphite/metal identity and the worlds' colossal scale. New events stay centered on fast anti-gravity movement.
- Distinguish course-format badges from event symbols. Keep names, readable silhouettes, result labels and record categories consistent across setup, gameplay and results.
- Extend the established reward-icon family and rarity language. Retain shared device colors and symbols, neutral/red menu treatment and recognizable hardware silhouettes.
- Design complete sound sequences for each device: acquisition/charge, use, attacker contact, incoming impact, shield block, expiry/cancellation and unavailable states as applicable. Reuse approved cues where their meaning matches; audition new cues over propulsion and Tunes.
- Communicate pressure, cuts, slide state and chain success through world cues, sound and restrained HUD feedback. Preserve road/ship readability and the existing restriction on mid-screen jump, landing and section callouts.
- Include keyboard/controller navigation, pause/retry, clear success/failure, deterministic rules, compatible records/saves, and High/Low/reduced-motion behavior in the playable event. Follow existing verification instructions for the assigned scope.
- Register generated assets and source prompts in [ASSET_MANIFEST.json](ASSET_MANIFEST.json). Refresh affected saved menu stills when course presentation changes.

## Proposed implementation order

Each step should yield a small playable result. This is a dependency order, with no dates or commitment to complete every branch.

1. **Small sidegrade batch and reward integration.** Build on the current career work. Start with one weapon variant and, if useful, one propulsion specialization on existing races. Establish tradeoffs, equipped limits, unlock behavior and complete presentation. Leave current cup rewards intact.
2. **Eliminator pilot on one existing circuit.** Give the sidegrades an immediate competitive use. Finish cuts, classification, retry/results and career awards before expanding to more tracks. Offer it as a standalone event first.
3. **Carve handling/scoring proof.** Use a short banked section with current airbrake behavior. Resolve build policy, clean-exit scoring and farming before authoring a full course. Keep this as a small exploration if it overlaps sidegrade work.
4. **Escape proof in one suitable existing biome.** Establish the visible threat, pressure curve, failure/recovery policy and supported finish. Expand into a complete route once those interactions work; commission only the environment additions that route needs.
5. **Expand the successful event/world combinations.** Add selected sibling routes and extract proven reusable art into Worldkit. Choose by gameplay value; there is no per-biome mode quota. Include mastery rewards, menu assets, icons and sound in each content slice.
6. **Curate championship additions.** Use actual event duration and difficulty to decide whether a new racing cup or specialist challenge series is worthwhile. Define compatible scoring, save identities and finite reward requirements before adding it. Keep standalone access useful.
7. **Revisit Freestyle and Assault as later candidates.** Freestyle keeps the slow-trick/five-transfer direction. Assault benefits from the weapon expansion and needs its own moving-target/encounter proof. Their final relative order remains open.

The suggested smallest next package is **one weapon sidegrade plus Eliminator on an existing circuit**. Carve can provide the next focused handling experiment; Escape is the next larger world-led event. This preserves the current preference while leaving the next assignment undecided.

## Decisions to make when a pilot is chosen

- First sidegrade, its tradeoff and unlock path; which parts of the existing reward work it extends.
- First course/biome and the short interaction that will prove the event is fun.
- Career loadouts versus fixed builds, record separation, and whether the event is solo or competitive.
- Success, failure, recovery, scoring and repeat-progress rules.
- Championship identity and duration if a new series is actually warranted.

These choices can be settled one pilot at a time; the matrix is intended to keep their relationships visible without turning every idea into an immediate task.
