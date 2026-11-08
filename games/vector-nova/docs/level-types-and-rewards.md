# Level types, rewards and world expansion

Design notes, reviewed **2026-11-07** against main and the event review branches. This keeps future mechanics and open decisions together; it does not approve a prototype for release or assign production dates. Use the [roadmap](../ROADMAP.md) for current priorities.

## Direction

Grow VECTOR//NOVA through new event rules, meaningful equipment choices and new routes in familiar worlds. Preserve fast anti-gravity racing, colossal environments, committed movement and readable courses.

The original preference was **sidegrades and weapon expansion**, with **Eliminator, Carve and Escape as favored event candidates** and Assault later. Eliminator, Interceptor and a Freestyle pilot have since been implemented in review branches. Carve, Escape and the sidegrade collection remain future work; release integration and human review of the existing pilots come first.

## Current implementation status

Main retains Quick Race, Championships, Time Trial and Practice over seventeen racing courses (the original fourteen plus Oriel, Ravel and Nomad Procession). The following browser work is consolidated in `codex/nova-freestyle`, which includes the Eliminator and Interceptor branches; **it is unmerged to main and not release-approved**:

- **Eliminator / Crucible Foundry:** a standalone ten-racer contest on a dedicated industrial circuit, with timed cuts, results/retry and ordinary placement-based career progress. Destructive ship damage is not part of elimination.
- **Interceptor:** three allied racers pursue Goliath / Crucible Dispatch, Wraith / Helion Breach or Bulwark / Nightweir Lockdown. The encounters use separate routes, stock mission hulls, an issued Lance/Injector kit and distinct boss interactions; ordinary owned garage builds remain separate.
- **Freestyle / Zephyr Skywell:** an experimental five-transfer course with different banked/tube arrivals, committed aerial control, practice, chaining, medals and separate stock-build records. Human feel/tuning review remains open; it adds no career rewards or cup requirements.

The new disciplines are endgame content: reveal Freestyle **Pilot**, Eliminator and Interceptor only after collecting all 28 original rewards and closing the completion credits. The existing acknowledgment also covers Skip-to-credits and the load-failure credits fallback; merely reaching 28/28 does not reveal the modes. The gate applies to direct links, remembered selections and launches as well as the mode controls, with the existing explicit browser developer bypass. Further grouping, boss-first selection and stock-kit presentation remain subject to human review. The packaged full-game course/asset policy needs an explicit rollout, with the demo boundary and original championship requirements preserved. These are integration choices, not reasons to rebuild completed prototypes.

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

| Type           | Player challenge                                                                                                          | Reuse opportunity                                                                                                           | Equipment / reward relationship                                                           | Current direction                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Circuit racing | Repeated corners, overtaking, combat and lap consistency.                                                                 | Existing courses support new rules and loadout experiments.                                                                 | Main home for offensive, defensive and propulsion builds.                                 | Existing foundation.                                                      |
| Sprint racing  | Sustained descent, speed management and committed transfers.                                                              | Existing worlds can supply new descending routes and destination landmarks.                                                 | Propulsion, reserve and recovery choices matter.                                          | Existing foundation.                                                      |
| Eliminator     | Stay ahead as the last racer is removed at successive cuts.                                                               | Dedicated Crucible Foundry circuit; further variants can reuse suitable courses.                                            | Placement-based career progress; offensive/defensive sidegrades remain useful.            | Implemented in the unmerged review worktree; human tuning remains.        |
| Interceptor    | Pursue a target, read its attack and expose a real weapon opening before it escapes.                                      | Three biome-derived pursuit routes with distinct bosses.                                                                    | Stock mission hull and issued kit; career builds and original cup rewards stay separate.  | Implemented in the unmerged review worktree; release integration remains. |
| Carve          | Link deliberate slides through banks and sweeping bends, preserving speed and making clean exits.                         | Prototype on an existing banked section; author a dedicated route only if the handling supports it.                         | Can award racing equipment; decide scored-build rules before upgrades affect records.     | Preferred early exploration.                                              |
| Escape         | Maintain pace ahead of a visible environmental threat and reach a clear destination.                                      | A suitable sprint biome supplies infrastructure, scenery and effects; pressure and failure rules still need implementation. | Sustained boost and defensive choices may become useful if the event permits career gear. | Preferred after a small rules prototype.                                  |
| Freestyle      | Drive the launch angle and speed, match distinct banked/tube receivers and chain five catches; optional tricks add style. | Zephyr Skywell reuses Zephyr art and Shatterline tube mechanics around a dedicated transfer route.                          | No pilot career rewards; future mastery prizes remain a design choice.                    | Experimental browser pilot in the unmerged review worktree.               |
| Assault        | Race alongside or through a colossal machine, attacking readable exposed systems during openings.                         | Industrial assemblies and existing weapons help; moving targets, encounter states and route changes add scope.              | Strong destination for a broader weapon collection.                                       | Later, after weapon expansion.                                            |

Redline (escalating speed with heat/boost management) remains a parked idea. Assault's moving-target and encounter scope is separate from the implemented Interceptor pilots.

### Mechanical notes to retain

- **Carve:** current airbrake already increases yaw authority, reduces lateral grip and adds drag. Release restores normal grip; heading and momentum require recovery/countersteering. Its ordinary racing behavior does not provide Freestyle’s opt-in airborne rotation brake. Establish whether sustained slides feel good before adding a scoring system or changing shared handling. Score useful forward travel, controlled slip and clean exits; reject stationary spins, oscillation and repeatable farming.
- **Freestyle:** launch speed and the road’s departure angle establish the ballistic arc. Each receiver asks for a different bank, approach and recovery; tricks are optional style, while clean physical catches carry the chain. Direct axes combine freely, consume recovery time and retain limited air correction with a stable chase view. Airbrake provides fine attitude trim; a late squeeze adds precision but is not a clean-landing requirement. Practice uses actual approach/flight/contact physics and cannot set records. Human review still decides feel and difficulty; the intended difficulty is learnable execution, never random rejection or a machine-only timing gate.
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

The Freestyle pilot uses a fixed stock build per ship and disables equipment. Scored Carve still needs an explicit build policy. Speed upgrades change available airtime, and Magnetic Stabilizer can reduce landing difficulty; any future career-build records need compatible rules/loadout identities.

## Reuse within existing worlds

Later, evaluate the three new endgame maps—**Oriel, Ravel and Nomad Procession**—for the three new disciplines, **Freestyle Pilot, Eliminator and Interceptor**. Route suitability and pacing should determine reuse; no map-to-mode assignment, trio quota or replacement of the current event courses is committed. See the [roadmap](../ROADMAP.md#optional-systems-and-content).

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

The four original full-game cups contain 3 / 3 / 3 / 5 events; Apex already includes Colossus. Encore separately groups the three bonus courses unlocked by the original reward collection. Keep their current lineups and saved progression stable during the initial pilots. For future series, choose a theme, difficulty arc and target session duration first. Three or four events is a useful starting size, with duration and pacing guiding exceptions.

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

## Freestyle browser pilot

**Zephyr Skywell** is a dedicated five-transfer descent through Zephyr’s suspended water gardens, retaining the `launchworks` level ID. Canonical Zephyr islands, masonry, water, road finishes and sky support a new route; the short receiving tube uses Shatterline’s shared surface and tessellation. Approved circuit routes remain separate. Three powered approaches and two gravity dives supply different launch conditions rather than repeating one straight jump. Longer open-air gaps, lighter course gravity and extended receiving runouts leave room to align at speed; the next connector waits until after the landing.

| Transfer    | Approach and receiving challenge                                                     |
| ----------- | ------------------------------------------------------------------------------------ |
| Crown Hook  | Unwind a corkscrew into a hard right, then catch a right bank.                       |
| Bell Dive   | Brake a gravity plunge before release and climb into a left shelf.                   |
| Veil Bore   | Sight the receiver lanterns before a waterfall veil, then enter the open tube floor. |
| Counterbank | Release from a wall and reverse roll into the opposing bank.                         |
| Last Light  | Choose a downhill line before the split and settle into a falling curve.             |

**Q/E controls roll, Z/X pitch and C/V flat spin.** Directions combine directly. Optional **Ctrl + W/S or ↑/↓** pitches, **Ctrl + A/D or ←/→** rolls, and **Ctrl + Q/E** yaws. Shift remains manual boost; Space remains airbrake. Controllers use **right stick pitch/yaw and X/Y roll**, leaving the left stick for steering and retaining the configured driving/boost/airbrake bindings. Right stick up lifts the nose; right turns it right. R3 remains camera. All equipment is disabled for this mode, including touch/programmatic activation; reused buttons never spend an item.

Rotation carries momentum and accepts countersteering. Hold airbrake to damp it, or combine airbrake with direction for fine trim. Supported contact in the marked receiver gets a short settling window. Recovering successfully earns landing credit and keeps the chain; arriving already settled earns the clean bonus, with precision earning perfect. A visible landing no longer scores zero solely for rotation at first contact. A fresh timed brake squeeze can earn a perfect bonus; an otherwise sound landing remains clean without it. There is no homing force or mandatory catch timer. The HUD shows the next transfer’s approach, a calibrated launch-speed band, rotation and signed receiver-angle guidance. The angle cue compares the real hull with the authored receiver reference; it does not predict or guarantee contact.

Settled landings bank points with an increasing multiplier; a crash, missed receiver or lost support breaks the chain while earlier banks remain. Base points are 1,000 for a recovered landing, 2,000 for a clean arrival and 2,500 for perfect. Five clean catches without tricks reach Gold. Rolls, flips, flat spins and compound corkscrews add optional style, with repeat tricks diminishing within one flight. The pilot uses stock builds, no opponents/equipment, rules-and-hull records and bronze/silver/gold targets. It adds no career rewards or cup requirements.

**Pause → Transfer practice** starts an individual authored approach using the same physical simulation. Actual landing/miss feedback pauses the attempt; **R / Retry transfer** repeats it. Practice is explicitly unranked and cannot overwrite a personal best. **Start full chain** returns to a fresh ranked route. Incomplete routes and manual recovery also invalidate records. The [rules](../src/freestyle/rules.js) remain the tuning source. Freestyle stays labeled **Pilot** until human review accepts the course variety, approach readability, aerial control, catching and medal difficulty.

## Eliminator / Crucible Foundry

Crucible is a new 4.30 km industrial circuit, independent of Colossus Works. Wide banked racing lanes pass colossal heat exchangers, grounded factory halls and dispatch gantries using existing Worldkit industrial assets. Four broad Vector strips and alternating offensive/defensive lanes make position recoverable through driving and combat. There are no required jumps. The selected [concept and exact prompt](levels/crucible/provenance.json) guide the authored environment.

Ten racers use ordinary shared physics and difficulty settings. After 22 seconds, the last active racer is removed; cuts then repeat every 10 seconds until the player is cut or becomes the sole survivor. The comparison uses actual unwrapped course progress, with stable grid-order ties. A cut removes the hull and combat participation, leaves a brief extraction trace and updates the edge countdown. It does not add destructive ship health. The player can pause, retry, use earned equipment and earn the normal placement-based career progress once per valid attempt. Existing cups keep their lineups and reward requirements. Manual recovery or invalid route credit cannot produce a ranked result.

## Interceptor / Crucible Dispatch

Interceptor adapts Crucible's course with a raised exchanger crown, a long supported plunge and a banking reversal. You and three allied racers—Rook, Kite and Manta—pursue **Goliath**, a 40-metre armored racing courier. It uses real shared magnetic motion and a matching large compound hull. The [courier concept and exact prompt](levels/interceptor/provenance.json) remain beside the source. Goliath cruises around **300 km/h**, starts ahead of the squad and resists weapon disruption. Allies match its speed while retaining firing distance. The player's closing speed eases into a minimum **30-metre road-distance gap**, settling around 32 metres so close-range Repulsor gates remain useful; passing the boss is prevented without stopping its escape.

Hold **Q / controller X** for an issued Lance shot every **0.8 seconds**; **E / Y** injects reserve. Sixteen offensive gates, spaced roughly 250 metres apart, add automatic Arc bursts and close-range Repulsor pulses. Pursuit courses have no Vector boost strips; manual boost and the Reserve Injector remain available. The mission hull remains stock and weapons are loaned; the garage always displays the complete owned career build. Normal equipment cooldowns and permanent unlocks remain separate. Allies fire real Lance projectiles on staggered cooldowns; Goliath leaves Ion countermeasure wakes. Friendly fire is disabled, and hull damage requires actual unblocked contacts.

Goliath has **450 / 700 / 950 hull** on Easy / Medium / Hard. At **15%, 43% and 88% of each lap**, it locks firing lanes, physically turns toward the pursuers and fires one pressure shot on Easy or two on Medium/Hard. Avoiding that volley opens its rear pressure vent for stronger real weapon hits. Its collider, rendered hull and weapon direction share the same orientation. The mission ends when its hull reaches zero or it physically completes two circuits. Pause/retry, contribution results, deterministic replay and five/one progress for valid success/failure use the existing shared flows. No new cups or reward requirements are added.

### Interceptor encounter selection

Interceptor offers three independent boss encounters through the normal course picker. Course cards have boss names and no course challenge tiers; Easy / Medium / Hard controls the shared 450 / 700 / 950 hull profiles for every boss. Existing race courses and cups keep their own routes and lineups.

| Encounter          | Boss    | Driving interaction                                                                                                      |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Crucible Dispatch  | Goliath | Dodge its locked pressure volley, then hit the open rear vent. Three attacks per lap.                                    |
| Helion Breach      | Wraith  | Release and freshly ignite boost after lock to split the ion shots, then hit its exposed capacitor. Two attacks per lap. |
| Nightweir Lockdown | Bulwark | Shoot the alternating lit shoulder from outside its central wake to stop future deposits, then dodge its pressure slabs. |

The missions reuse the newer biome families: Colossus machinery for Crucible, Helion's thermal observatory and active fiery floors for Breach, and Nightweir's wet municipal/hydroelectric kit for a new closed basin circuit. Lockdown's elevated generating reach rolls through a complete corkscrew before plunging toward the tailrace; the city and water stay grounded beneath it. Breach retains Helion's substantial elevation changes, 103-degree wall ride and optional vaults. Smooth mission-local banking replaces abrupt road-edge kicks on Dispatch and Lockdown. Original race courses and the Nightweir sprint remain independent. Goliath, Wraith and Bulwark use separate concept-guided, source-authored models and distinct palettes. Retired Orbital/Halcyon mission links redirect to the new encounters. The selected encounter is remembered when leaving and returning to the mode.

## Main menu integration proposal

Keep the current top-level navigation and one shared race setup screen. Group the directly selectable modes under quiet headings, without adding another navigation page:

| Racing        | Missions    | Solo       |
| ------------- | ----------- | ---------- |
| Quick Race    | Interceptor | Time Trial |
| Championships |             | Practice   |
| Eliminator    |             |            |

This grouping is a proposal, not the current layout. Future Escape and Assault fit Missions; scored Carve fits Solo. Keep future modes out of the visible menu until playable. Freestyle remains explicitly labeled **Pilot**. All three new disciplines are shown only after the original reward collection and completion-credits acknowledgment; developer entries retain their existing bypass. Preserve the moving background, cached world imagery, compact unlock notches above the trophy cabinet, existing icon language and restrained menu sounds.

Selecting **Interceptor** should restore the last encounter and show three boss-first cards: **Goliath / Crucible Dispatch**, **Wraith / Helion Breach**, and **Bulwark / Nightweir Lockdown**. Use the boss as the choice label and the course as its setting; omit circuit difficulty bands. Retain the shared encounter difficulty and hull selectors, show **Stock ship · issued Lance + Injector**, and give one mechanic sentence from the table above. **Start pursuit** launches explicitly. Arrow/D-pad movement previews choices, Enter/A selects, and Escape/B returns focus to the encounter control. Continue using cached artwork; hover must never construct a world.

Keep **Resume Interceptor · [encounter]** for a paused attempt. Results should offer **Retry pursuit** and **Choose encounter**, preserving encounter, hull and difficulty. Retry starts a new reward attempt; returning to setup must preserve the original suspended session. The current shared lifecycle already supports the underlying retention and once-only awards; per-mode encounter choices currently last for the page session. Durable mode-specific choices, the labels and grouped layout remain integration work.

Career stays shared: a valid success earns **5 progress**, a valid failed pursuit **1**. Existing unlock notches continue counting actual collected rewards. Issued mission weapons do not become permanent equipment. Keep the original four cups and their reward requirements stable; missions and Eliminator launch independently. Consider boss completion marks or a separately curated mission tour after balance and reward decisions. Per-boss completion history and mastery rewards are not implemented.

The review worktree retains the event mode navigation and stock-kit disclosure. Review grouping, boss-first selection and clear return labels, then validate retained sessions and focus before deliberately adding approved new events to the packaged full-game allowlist and asset policy. The browser currently discovers these events, while the full desktop policy still lists only the ordinary courses. Keep the demo's two-course boundary. A release-policy change needs its own packaged-content validation when desktop builds resume.

## Optional feel and presentation experiments

- Observe external players before adding mechanics: can they understand braking/boost, finish without coaching and choose to replay? Separate control confusion, route readability, performance and difficulty. Check that hull choice, boost use, braking and jump approaches create useful tradeoffs.
- Prototype stronger perceived speed through camera framing/FOV, nearby geometry, audio and frame pacing before raising propulsion targets. Preserve approved handling and 0.3 steering assistance outside an assigned experiment; pace changes need ground, flight and landing checks.
- Prototype a forward/cockpit view and readable instruments on one ship before commissioning interiors. Check banks, inversions, flights, clipping and motion comfort; gauges must reflect real state.
- Consider playtested bronze/silver/gold mastery targets, clearer sector improvement and restrained cosmetics over existing records/results. Readable track-owned hazards, starting-grid presentation, rival identities and finish feedback are optional when they improve decisions or outcomes; measure rendering cost.
- Scope any feel/art experiment to one ship or short course section, with matched gameplay views and a concrete target. Prove the treatment before wider rollout, check a contrasting course for shared changes, and follow the existing [ship workflow](../assets/ships/README.md#visual-improvement-workflow) and [art direction](ART_BIBLE.md). A beauty render or critic score alone is insufficient.

Online multiplayer, story campaigns, manual weapon aiming, open-world conversion, consumable upgrade economies and large new map production remain deferred, separately scoped ideas. Existing automatic road devices/combat remain intact.

Reference leads retained for future review: [AGX GP](https://store.steampowered.com/app/4250680/AGX_GP/), [Race of the Nine Worlds](https://store.steampowered.com/app/3817560/Race_of_the_Nine_Worlds/), [Airframe Ultra](https://store.steampowered.com/app/2522120/Airframe_Ultra/) and [DEATHGRIP](https://store.steampowered.com/app/1721590/DEATHGRIP/). These are existing inspiration leads, not reviewed feature comparisons or a claim of hands-on play.
