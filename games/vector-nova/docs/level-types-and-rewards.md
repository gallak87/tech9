# Level types, rewards and world expansion

Design notes, reviewed **2026-10-31** against main and the event review branches. This keeps future mechanics and open decisions together; it does not approve a prototype for release or assign production dates. Use the [roadmap](../ROADMAP.md) for current priorities.

## Direction

Grow VECTOR//NOVA through new event rules, meaningful equipment choices and new routes in familiar worlds. Preserve fast anti-gravity racing, colossal environments, committed movement and readable courses.

The original preference was **sidegrades and weapon expansion**, with **Eliminator, Carve and Escape as favored event candidates** and Assault later. Eliminator, Interceptor and a Freestyle pilot have since been implemented in review branches. Carve, Escape and the sidegrade collection remain future work; release integration and human review of the existing pilots come first.

## Current implementation status

Main retains Quick Race, Championships, Time Trial and Practice over the original fourteen racing courses. The following browser work is consolidated in `codex/nova-freestyle`, which includes the Eliminator and Interceptor branches; **it is unmerged to main and not release-approved**:

- **Eliminator / Crucible Foundry:** a standalone ten-racer contest on a dedicated industrial circuit, with timed cuts, results/retry and ordinary placement-based career progress. Destructive ship damage is not part of elimination.
- **Interceptor:** three allied racers pursue Goliath / Crucible Dispatch, Wraith / Helion Breach or Bulwark / Nightweir Lockdown. The encounters use separate routes, stock mission hulls, an issued Lance/Injector kit and distinct boss interactions; ordinary owned garage builds remain separate.
- **Freestyle / Asterion Launchworks:** an experimental five-transfer course with committed directional tricks, recovery, slope catches, scoring, medals and separate stock-build records. Human feel/tuning review remains open; it adds no career rewards or cup requirements.

Decide the proposed Racing / Missions / Solo grouping, Freestyle's production visibility, boss-first Interceptor selection and clear stock-kit disclosure before release-menu integration. The packaged full-game course/asset policy needs an explicit rollout, with the demo boundary and original championship requirements preserved. These are integration choices, not reasons to rebuild completed prototypes.

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

| Type           | Player challenge                                                                                                                          | Reuse opportunity                                                                                                           | Equipment / reward relationship                                                           | Current direction                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Circuit racing | Repeated corners, overtaking, combat and lap consistency.                                                                                 | Existing courses support new rules and loadout experiments.                                                                 | Main home for offensive, defensive and propulsion builds.                                 | Existing foundation.                                                      |
| Sprint racing  | Sustained descent, speed management and committed transfers.                                                                              | Existing worlds can supply new descending routes and destination landmarks.                                                 | Propulsion, reserve and recovery choices matter.                                          | Existing foundation.                                                      |
| Eliminator     | Stay ahead as the last racer is removed at successive cuts.                                                                               | Dedicated Crucible Foundry circuit; further variants can reuse suitable courses.                                            | Placement-based career progress; offensive/defensive sidegrades remain useful.            | Implemented in the unmerged review worktree; human tuning remains.        |
| Interceptor    | Pursue a target, read its attack and expose a real weapon opening before it escapes.                                                      | Three biome-derived pursuit routes with distinct bosses.                                                                    | Stock mission hull and issued kit; career builds and original cup rewards stay separate.  | Implemented in the unmerged review worktree; release integration remains. |
| Carve          | Link deliberate slides through banks and sweeping bends, preserving speed and making clean exits.                                         | Prototype on an existing banked section; author a dedicated route only if the handling supports it.                         | Can award racing equipment; decide scored-build rules before upgrades affect records.     | Preferred early exploration.                                              |
| Escape         | Maintain pace ahead of a visible environmental threat and reach a clear destination.                                                      | A suitable sprint biome supplies infrastructure, scenery and effects; pressure and failure rules still need implementation. | Sustained boost and defensive choices may become useful if the event permits career gear. | Preferred after a small rules prototype.                                  |
| Freestyle      | Commit to slow aerial tricks, recover attitude and catch the receiving slope; five well-linked jumps should produce an outstanding score. | Asterion Launchworks pilot uses orbital art around dedicated launch/receiver geometry.                                      | No pilot career rewards; future mastery prizes remain a design choice.                    | Experimental browser pilot in the unmerged review worktree.               |
| Assault        | Race alongside or through a colossal machine, attacking readable exposed systems during openings.                                         | Industrial assemblies and existing weapons help; moving targets, encounter states and route changes add scope.              | Strong destination for a broader weapon collection.                                       | Later, after weapon expansion.                                            |

Redline (escalating speed with heat/boost management) remains a parked idea. Assault's moving-target and encounter scope is separate from the implemented Interceptor pilots.

### Mechanical notes to retain

- **Carve:** current airbrake already increases yaw authority, reduces lateral grip and adds drag. Release restores normal grip; heading and momentum require recovery/countersteering. It currently has no airborne effect. Establish whether sustained slides feel good before adding a scoring system or changing shared handling. Score useful forward travel, controlled slip and clean exits; reject stationary spins, oscillation and repeatable farming.
- **Freestyle:** launch speed establishes the ballistic arc. Tricks rotate the hull with real commitment and recovery time; normal limited air correction remains. Tune one substantial trick per ordinary jump and occasional combinations on larger flights through human play. Keep the chase view stable during hull rotation. Bank points through a clean slope catch; successive good landings feed speed into the next launch and raise the chain value. The pilot implements these systems, but torque/release feel, durations, penalties, multipliers and medal thresholds still need review. Existing landing assistance must not automatically earn a skill bonus.
- **Escape:** the pursuing threat needs visible progress, understandable warning and a fair failure boundary. Existing distance-linked environmental spectacles are useful ingredients, but do not yet constitute a pursuing game rule. Define how missed jumps and automatic recovery interact with the threat.
- **Eliminator:** the pilot's first cut is after 22 seconds, then every 10 seconds, using actual course progress and stable grid-order ties. Cut racers leave the contest and combat; results/retry exist. Human play should tune pressure and clarity before wider rollout. Destructive damage remains separate scope.

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

| Existing world | Plausible extension                                                                  | Reusable foundation / new work                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Colossus Works | Another Eliminator variant; later an industrial descent, transfer course or Assault. | Industrial kit, steel/enamel finishes and machinery; new routes need distinct silhouettes, clearances and composition.            |
| Nightweir      | Escape through hydroelectric districts.                                              | Civic infrastructure, water and gate vocabulary; threat behavior and route timing require a dedicated proof.                      |
| Shatterline    | Escape or Freestyle candidate.                                                       | Accelerator structures, mountain terrain and long-flight experience; each event needs appropriate pressure or receiving geometry. |
| Vesper Forest  | Carve through broad rooted banks, or a future canopy transfer course.                | Existing forest assets and surfaces; foliage and branches must leave fast lines and airborne receivers readable.                  |

These are matches to investigate, not a content assignment. Preserve approved courses as playable originals; give new variants distinct event identities and new routes their own course identities. Reuse saves art production, while route design, collision, camera readability and driving verification remain necessary.

When a new course is selected for production, develop three candidate course concepts, choose the direction, then imagegen the selected concepts before detailed environment work. No concept art or full sibling-world rollout is commissioned by this note.

## What cups mean as the game grows

**Cups are curated championships, not an exhaustive inventory of the game.** New tracks and event types can launch independently. Existing cups do not automatically gain another race whenever content ships.

The current full-game cups contain 3 / 3 / 3 / 5 events; Apex already includes Colossus. Keep their current lineups and saved progression stable during the initial pilots. For future series, choose a theme, difficulty arc and target session duration first. Three or four events is a useful starting size, with duration and pacing guiding exceptions.

Current cup classification assumes ten racers, valid finish times, placement points and wins/total-time tie-breaks. Circuit and sprint races already fit this. Eliminator has standalone classification but needs an explicit compatible policy before joining a cup. Solo Escape and scored Carve/Freestyle need separately designed series rules; raw times and trick scores cannot simply be summed. A medal-based challenge tour is one possibility, not a committed system.

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

## Next design and integration choices

Each assignment should yield a small playable result. These are dependency choices, with no dates or commitment to complete every branch.

1. **Review and integrate the existing pilots.** Playtest Eliminator cuts, Interceptor pressure and Freestyle feel/medals; decide experimental visibility, navigation and packaged content. Preserve independent records, careers and original cups.
2. **Small sidegrade batch.** Start with one weapon variant and, if useful, one propulsion specialization on existing races. Establish tradeoffs, equipped limits, unlock behavior and complete presentation. Reassess Magnetic Stabilizer's distinct role; leave existing cup prizes intact.
3. **Carve and Escape proofs.** Prove clean-exit slide scoring/build policy/anti-farming on a short banked section; separately prove visible pursuit, failure/recovery and a supported destination in one existing biome. Neither requires commissioning a complete new world first.
4. **Expand successful combinations.** Add selected sibling routes and extract reusable art into Worldkit only when needed. Include mastery rewards, menu assets, icons and sound; there is no per-biome mode quota.
5. **Curate series only when justified.** Use actual duration/difficulty to choose a racing cup or specialist series, with compatible scoring, saves and finite reward requirements. Keep standalone access useful.
6. **Consider Assault later.** Weapon expansion can support its moving-target/encounter proof. Freestyle production expansion depends on the existing pilot's human review rather than another from-scratch pilot.

## Decisions to make when a pilot is chosen

- First sidegrade, its tradeoff and unlock path; which parts of the existing reward work it extends.
- First course/biome and the short interaction that will prove the event is fun.
- Career loadouts versus fixed builds, record separation, and whether the event is solo or competitive.
- Success, failure, recovery, scoring and repeat-progress rules.
- Championship identity and duration if a new series is actually warranted.

These choices can be settled one pilot at a time; the matrix is intended to keep their relationships visible without turning every idea into an immediate task.

## Optional feel and presentation experiments

- Observe external players before adding mechanics: can they understand braking/boost, finish without coaching and choose to replay? Separate control confusion, route readability, performance and difficulty. Check that hull choice, boost use, braking and jump approaches create useful tradeoffs.
- Prototype stronger perceived speed through camera framing/FOV, nearby geometry, audio and frame pacing before raising propulsion targets. Preserve approved handling and 0.3 steering assistance outside an assigned experiment; pace changes need ground, flight and landing checks.
- Prototype a forward/cockpit view and readable instruments on one ship before commissioning interiors. Check banks, inversions, flights, clipping and motion comfort; gauges must reflect real state.
- Consider playtested bronze/silver/gold mastery targets, clearer sector improvement and restrained cosmetics over existing records/results. Readable track-owned hazards, starting-grid presentation, rival identities and finish feedback are optional when they improve decisions or outcomes; measure rendering cost.
- Scope any feel/art experiment to one ship or short course section, with matched gameplay views and a concrete target. Prove the treatment before wider rollout, check a contrasting course for shared changes, and follow the existing [ship workflow](../assets/ships/README.md#visual-improvement-workflow) and [art direction](ART_BIBLE.md). A beauty render or critic score alone is insufficient.

Online multiplayer, story campaigns, manual weapon aiming, open-world conversion, consumable upgrade economies and large new map production remain deferred, separately scoped ideas. Existing automatic road devices/combat remain intact.

Reference leads retained for future review: [AGX GP](https://store.steampowered.com/app/4250680/AGX_GP/), [Race of the Nine Worlds](https://store.steampowered.com/app/3817560/Race_of_the_Nine_Worlds/), [Airframe Ultra](https://store.steampowered.com/app/2522120/Airframe_Ultra/) and [DEATHGRIP](https://store.steampowered.com/app/1721590/DEATHGRIP/). These are existing inspiration leads, not reviewed feature comparisons or a claim of hands-on play.
