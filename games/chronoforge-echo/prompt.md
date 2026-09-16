# Goal

Build **Chronforge Echo** in `games/chronoforge-echo/`: a complete, beautiful, high-fidelity pixel-art RPG that reimagines `games/chronoforge/` while preserving and fully developing its exploration, three-hero party, ATB battles, settlement economy, equipment, skills, rewards, and seven-tab menu structure. Deliver a finished adventure from Kaida's solitary opening through a real final boss, ending, and playable aftermath. A vertical slice is a production milestone, not the finished deliverable.

Work as a creative game director, pixel-art director, narrative designer, and engineer. Own the creative decisions within the requirements below. Invent a compelling original story, memorable places, expressive enemies, distinctive combat techniques, and a coherent artistic identity. Draw inspiration from Chrono Trigger's sense of discovery, growing companionship, readable ATB battles, and coordinated party techniques; create original characters' stories, dialogue, compositions, music, and assets.

Use Vite, plain JavaScript ES modules, and a rendering approach suited to richly animated pixel art. The reference uses PixiJS; prefer a coherent PixiJS rendering pipeline unless another approach clearly better serves this game. Choose compatible supported versions at kickoff. Target a locally playable desktop browser game with a static production build, keyboard-first controls, mouse support, and persistent local saves.

## 1. Reference fidelity and creative freedom

Read and run the original before designing the remake. Start with `../chronoforge/src/{game,world,scenes,travel,city,base,battle,progression,menu,audio,sprites}.js`, its assets, `../chronoforge/CONCEPT.md`, and relevant design notes. Paths beginning with `games/` are repository-relative; other paths in this prompt are relative to `games/chronoforge-echo/`. Use the original as a systems reference; this brief governs the remake where the two differ. Preserve reference projects unchanged.

Carry forward these pillars:

- Kaida, Vex, and Rune; individual stats, XP, levels, equipment, and skill development.
- A connected world of eight substantial regions, visible wilderness encounters, enterable settlements and other interiors, discovery, fog of war, and unlocked travel hubs.
- ATB combat with attacks, techs, defense, support/healing, single-target and area effects, and coordinated dual/triple techniques.
- Food, ore, energy, and renown; productive buildings, construction and upgrades; the civilization ladder **Survivor → Reclaimer → Ascendant → Transcendent**.
- Weapon, armor, and accessory slots; inventory and equipment comparisons; enemy drops, authored world pickups, quest rewards, and skill points.
- The menu's exact top-level order: **Map, Party, Inventory, Skills, Quests, Save, Settings**.

Preserve the complete functional coverage of the reference's item catalog, enemy hierarchy, buildings, and progression. You may rebalance numbers, expand content, and redesign implementation and presentation. Keep recognizable names and roles where specified; exact old coordinates, formulas, sprite dimensions, attack names, and unfinished layouts are not requirements.

Distinguish implemented behavior from aspirations in the old documents. Complete missing gameplay: functional vendors and interiors, meaningful building benefits, a complete story, recruitment, side stories, and the actual final boss. Do not reproduce placeholders, empty rooms, passive-only companions, incomplete settings, decorative-only defenses, or a quest that substitutes the Architect Herald for the final confrontation. Do not copy the reference's automatic all-heroes start, town unlock on simple arrival, loot-revealing map markers, or ordinary travel presented as time travel.

Keep three distinct progression concepts: **hero level**, **civilization tier**, and **enemy threat tier**. Region progression must connect these through understandable requirements without circular unlocks.

## 2. Story, characters, and quests

Retain the hopeful post-collapse foundation: ruined human civilization, surviving settlements, recovered technology, and unfamiliar transformed landscapes. Develop your own central mystery, factions, conflicts, emotional themes, and explanation of the collapse. Rebuilding the world and assembling the crew should matter to the story and to one another.

Kaida begins **alone**. Let the player inhabit that solitude through exploration, an early achievable battle, and personal motivation before companions join. Introduce Vex and Rune through playable story arcs at different points. Earn their recruitment through events and relationships. Once recruited, they visibly travel with her, navigate doors and terrain reliably, take part in dialogue, and fight as controllable party members. Write changing relationships, disagreements, banter, and payoffs as the journey progresses. The complete core party is Kaida, Vex, and Rune; optional supporting NPCs are yours to invent.

**Kaida:** Inspect `../chronoforge-remake/sprite-gen/kaida-reference.png`. Preserve her determined, self-possessed young-adult warrior persona and agile silhouette: short, tousled crimson/magenta hair, expressive matching eyes, a cropped dark-teal jacket with an upright collar, charcoal travel/combat clothing, practical straps, selectively armored shoulders and limbs, sturdy boots, and a slender sword with a magenta energy accent. Her trailing cloth and hair should contribute to movement. Translate these identity anchors into excellent pixel art; simplify details intelligently at gameplay scale rather than tracing every buckle. Keep her recognizable across portraits, overworld movement, combat poses, and equipment upgrades.

**Rune:** A strong, protective sentinel with a substantial physical presence. Own the appearance, personality, history, and fighting expression.

**Vex:** A mage/wizard figure with a distinct presence and relationship to the world's mysteries. Own the appearance, personality, history, and magical language.

Build three connected layers of authored narrative:

- **Main campaign:** A clear opening, escalating acts, recruitment arcs, regional conflicts, reversals, several minibosses, and a climactic confrontation with the **Void Architect**. Develop the antagonist's motives and final encounter yourself. Resolve the central conflict and provide an ending with consequences for the crew and settlements. Reaching Transcendent remains meaningful to the final stretch.
- **Substantial side stories:** At least three multi-stage arcs, including personal arcs for the recruited companions. Carry them across regions and changing story states, with returning characters, discoveries, setbacks or choices, and later consequences. Reward them with meaningful equipment, techniques, services, access, relationships, or settlement benefits. Optional branches must have proper conclusions; mutually exclusive outcomes must be represented honestly.
- **General quests:** Discoverable through vendors, conversations, locations, objects, and exploration. Include a thoughtful variety of tasks with actual objectives, progress, completion, and rewards. Preserve the reference's road-clearing, distress-signal, regional-threat, and final-approach functions where useful, but write the new quest content yourself. Do not reduce every quest to the same kill-and-return loop.

Write actual scenes and dialogue, not summaries in place of gameplay. Quest states, prerequisites, branches, and reward claims must persist. Explain the next meaningful objective without spoiling unexplored places. Make each side story independently rewarding while letting some intersect with the main story. Award completion rewards exactly once.

## 3. A large, connected, explorable world

Preserve these eight regional identities and the recognizable travel backbone, expanding their internal geography and adding sensible loops and shortcuts:

| Region | Foundation to preserve |
| --- | --- |
| Haventide | Coastal grassland ruins; home settlement and early survival/rebuilding. |
| Emberline | Desert/neon wastes; trade hub and branching exploration. |
| Orbital Reach | Frozen ruins around a ruined orbital-elevator settlement. |
| Last Crown | Alien-transformed landscape and late-game city tied to the Architect. |
| Forest Veil | Extensive woodland and overgrown discoveries. |
| Mire Bog | Wetlands connected to Forest Veil. |
| Crater Ember | Volcanic/crater territory and an advanced threat. |
| Frost Canyon | Icebound canyon territory and an advanced threat. |

The reference backbone is **Haventide ↔ Emberline ↔ Orbital Reach ↔ Last Crown**, with **Emberline ↔ Forest Veil ↔ Mire Bog**, **Emberline ↔ Crater Ember**, and **Orbital Reach ↔ Frost Canyon**. Preserve its progression functions while improving spatial logic and exploration. Region gates may involve story, settlement technology, or earned traversal capabilities; communicate their requirements in the world.

Each region must be an explorable world in its own right. The player walks through its geography at a consistent character scale while the camera follows. Use an ambitious working target of at least **six gameplay viewport widths by four viewport heights per major outdoor region**, measured at the intended gameplay zoom, and enlarge where the design benefits. An ordinary route from an arrival gateway to a different regional exit must cross several screens with substantial camera panning. Turning back through the doorway just entered is the natural exception. Prove scale through traversal footage and map measurements, not a large empty image, tiny character, or slow movement.

Fill that scale with authored composition: landmarks, alternate paths, secluded clearings, forest patches, ruins, changes in elevation, inhabitants, encounters, discoveries, and places worth revisiting. Create density variation and quiet space between memorable discoveries. Avoid uniform prop scatter, repeated filler rooms, maze padding, or vast featureless ground.

Include enterable locations outside town centers: huts, houses, caves, and other places that fit your story. Interiors need comfortable movement space and meaningful contents—people to speak with, items to discover, small events, branching rooms, or environmental clues. Caves and larger buildings should reward exploration beyond a single room. Exterior architecture, doorway placement, interior layout, and exit direction must agree. Use credible collision, depth ordering, foreground occlusion, and navigable passages; the party must not walk through walls, water, or painted cliffs.

Make transitions feel spatially continuous. A road, cave mouth, pass, bridge, or gateway should preview and visually match the destination's terrain, width, orientation, light, and threshold details. Preserve movement direction and place the whole party safely on the other side. Stream/preload adjacent content where appropriate; hide necessary scene changes behind tasteful transitions without a visible jump in scale or geography. Ordinary region connections are physical travel in the current world, not the deferred time-travel system. Visited, liberated hubs may offer convenient fast travel without replacing first-time exploration.

The art must evoke awe: monumental silhouettes, foreground layers, distant vistas, richly shaped vegetation, distinctive regional architecture, considered light, and environmental motion. Let the player feel inside a place. Establish a consistent pixel grid, sprite scale, perspective, palette discipline, and lighting language. Use sharp, intentionally placed pixel clusters and expressive animation; maintain clarity when scaled. Modern atmosphere and lighting are welcome when they complement the pixel work. Avoid blurry paintings with a pixel filter, mismatched asset packs, noisy microdetail, giant flat floors, and exaggerated bloom that hides the artwork.

## 4. Settlements, leveling, equipment, and rewards

Settlements have **two complementary layers**, both fully playable:

1. **Liberation and social interiors.** A town center begins guarded. Defeating its guard—normally one meaningful encounter, with variation where the story earns it—permanently unlocks entry and local services. Make the first liberation achievable by solo Kaida. Each liberated main town center contains **3–6 distinct, functional vendors**, with space to walk, residents, dialogue, and local quests. Buying, selling, prices, quantities, equipment comparisons, affordability, and inventory changes must work. Give vendors a place in the community and different purposes.
2. **Construction and civilization growth.** Preserve buildable settlement space, spending resources, ongoing production, construction choices, and visible upgrades. Include **Town Center, Farm, Mine, Energy Extractor, Barracks, Forge, Research Lab, and Walls/defenses**. Progress them through the four civilization tiers. Food, ore, energy, and renown must have understandable uses and sources. Farms, mines, and extractors produce resources; training, forging, research, and defenses must deliver real benefits. Decide sensible shared-versus-local resource rules and communicate them clearly.

Give settlement upgrades strong visible transformations and lived-in activity. Construction interfaces must work with the keyboard as well as the mouse. Make wall/defense advancement affect gameplay through a suitable authored system, such as settlement protection or story defense encounters; preserve ATB as the combat model. Build practical recovery paths so losses cannot destroy a save or make a required upgrade permanently impossible.

As Kaida levels and the campaign/civilization progresses, unlock **new kinds** of vendors and services, weapon families, technology, and defenses—not merely a higher price or larger damage number. Document the unlock schedule and implement it in data. Starting towns can begin with three services and gain specialists up to six; later hubs should offer materially different possibilities. Design the specialties and weapon concepts yourself.

Keep per-hero levels, XP, HP/MP, meaningful combat stats, skill points and prerequisite-based skill trees. Gear has weapon/armor/accessory slots and understandable tradeoffs. Preserve the reference item's functional coverage and tiered loot progression, while expanding the catalog to support this full campaign. Inventory must support keyboard equip/unequip and mouse selection, immediate stat-difference previews, and coherent selling rules. Party growth, equipment, civilization research, and learned techniques should complement one another.

Rebalance the XP curve for a full campaign and the later level-40 prerequisite. Kaida must be able to reach level 40 through reasonable play in the completed base game or its ordinary aftermath. Avoid inheriting an exponential curve that makes this practically unreachable. Do not require grind as a substitute for missing story or region content. Recruiting a companion must leave them useful immediately while preserving individual growth.

Award battle XP, renown, resources, and tier-appropriate item drops; include authored pickups and hidden finds in the world. Preserve the distinction between first-clear rewards and replayable encounter rewards, and prevent duplicate claims on unique rewards. Persist pickup state, inventory ownership, and encounter completion. Discoverable world loot must never be revealed by the world map or minimap.

Present rewards with a small, beautifully drawn item icon, quantity, concise label, and restrained rarity/material treatment in a consistent place. Use a brief arrival/settle/fade animation and modest sound. Make wins and discoveries satisfying and easy to read at a glance without explosions, confetti, huge center-screen interruptions, or a pile of plain text badges. Queue or combine simultaneous rewards so nothing gets lost or covers the next interaction. Give level-ups appropriate emphasis while retaining the same visual identity.

## 5. Enemy hierarchy and encounters

Preserve all eighteen reference enemy identities and their five-level threat hierarchy. The names below are continuity labels; the short notes express relative gameplay roles, **not prescriptions for anatomy, costume, palette, materials, animations, or attack concepts**. Invent those yourself and give each enemy a distinctive readable presence.

| Threat tier | Reference enemy | Bare role |
| --- | --- | --- |
| 1 | Rust Scrapper | Basic early opponent. |
| 1 | Drone Sentinel | Fast, relatively fragile early threat. |
| 1 | Bog Stalker | Early pressure/ambush role. |
| 1 | Slag Rat | Quick, low-durability nuisance. |
| 2 | Mutant Hound | Mobile midgame attacker. |
| 2 | Gravbot | Slow, defense-heavy obstacle. |
| 2 | Mire Hulk | Durable midgame heavy hitter. |
| 2 | Glacier Wolf | Fast midgame attacker. |
| 3 | Neon Cultist | More advanced specialist. |
| 3 | Sandworm / Sandworm Hatchling | Durable regional threat. |
| 3 | Ember Golem | Slow, heavily defended threat. |
| 3 | Frost Revenant | Balanced advanced threat. |
| 4 | Wraith Core | Fast, dangerous late-game opponent. |
| 4 | Mire Warden | Regional elite/guardian. |
| 4 | Magma Behemoth | Very durable late-game heavy. |
| 5 | Architect Herald | Climactic elite before the final boss. |
| 5 | Frost Colossus | Regional boss/miniboss. |
| 5 | Ember Lord | Regional boss/miniboss. |

Add a distinct, fully realized **Void Architect final boss** beyond the Herald. Build several memorable miniboss encounters, including regional and story confrontations. Invent their mechanics and phase changes, telegraph danger fairly, and reward understanding over inflated HP. Town guards need not all be bosses. Higher-tier foes in earlier branches can signal optional danger if the player has a fair warning and a way to retreat.

Use visible world encounters and thoughtfully composed groups of **one to four enemies maximum**, including summons or adds. Mix enemy roles, tune placement and recovery, and provide encounters that make individual skills and party combinations useful. Preserve reward escalation across the hierarchy. Avoid recolors as the primary source of variety.

## 6. Rich ATB scenes and effortless control

Battles are showcase scenes with strong composition and the same artistic finish as the world. Connect each arena to the location of the encounter through its terrain, lighting, props, depth, and atmosphere. Ensure actors, targets, command choices, HP/MP, status effects, and filling action gauges remain immediately legible.

Provide complete animation coverage: idle/readiness, movement and lunges, attack anticipation, contact, recovery, hurt reactions, defense, healing, casting/technical actions, defeat, and victory. Choreograph dual and triple techniques so their participants visibly act together in a single coherent sequence; do not simply play three unrelated attacks. Have at least one meaningful dual technique for each hero pair and a full-party technique, with real eligibility, readiness, resource costs, and progression unlocks. You own the attacks' names, mechanics, visual motifs, effects, and staging.

Contact must feel convincing. Coordinate poses, travel, hit reactions, effects, damage application, audio, and return to formation. Ensure attacks work against all target positions and sizes. Avoid sliding still sprites, disconnected effects, overlapping actors, lingering dead targets, clipped animations, and damage numbers that obscure the target. Prioritize beautiful readable choreography over constant screen shake or fullscreen flashes.

Implement this keyboard-first battle flow:

1. As gauges fill, **automatically preselect the first living hero who becomes ready**. Make readiness and the currently selected hero obvious. Keep a stable ready queue and let the player deliberately choose another ready hero when useful; a later-ready hero must not steal focus.
2. **Space or Enter** opens/confirms that hero's command choice. **Arrow keys** navigate **Attack / Tech / Defend**. Tech opens a navigable list with costs and clear explanations for unavailable choices. Support/healing and coordinated techniques must be easy to locate within this structure.
3. **Space or Enter** confirms the command and, where a target is needed, enters target selection. Arrow keys move predictably between valid targets. Distinctively highlight the selected enemy in the scene; also show affected targets/areas for group actions. Healing selects appropriate allies. Defend and other targetless actions should not ask for an enemy.
4. The target picker must display a clear, visible **[Space / Enter] Execute** hint at the point of commitment. Pressing either executes the selected action. Provide a consistent back/cancel input and show it. Keep **Esc reserved for the global pause/menu**, including during combat; use Backspace or another clearly taught key for battle back navigation.
5. Mouse users can select the same heroes, commands, techniques, and targets without a different ruleset. Keyboard focus must remain predictable when switching input methods.

Use wait-mode ATB while choosing commands and targets so the flow is welcoming and tactical. Opening the global menu freezes gauges, action execution, animation timelines, and timing windows; closing it resumes the exact prior state. Do not advance queued enemy actions behind the menu. Ensure one held/repeated key cannot skip several decision states or accidentally execute an action.

**Timed critical opportunity:** During an attack's actual animation, introduce a short, learnable timing window in which a fresh **Space or Enter** press significantly increases that attack's critical-hit probability. This is a probability boost, not an automatic guaranteed critical. Missing the window still completes the normal attack; basic combat remains viable without perfect timing. Make the successful-input cue distinct from the eventual critical result.

Design the cue and feedback creatively within the game's visual and audio identity. A minute animated cue, a momentary emphasis in the motion, a restrained light response, or an audio accent are possibilities, not a mandatory recipe. The player must be able to recognize the opportunity and understand success through readable visual feedback even with audio muted. Teach it naturally. Tie the window and resolution to the attack timeline, not frame rate. Consume the original execute press before arming this window; require a new press, prevent hold/repeat/mash exploits, and tune duration and crit increase through playtesting. Define consistent behavior for multi-hit and coordinated attacks without turning every strike into a cumbersome rhythm exercise. Offer a modest timing-assist setting and restrained-motion/flash options without weakening the standard presentation.

## 7. One distinctive visual identity across the entire UI

Art-direct the interface as **a beautifully crafted field atlas and compact expedition instrument assembled by this crew from a broken civilization**. It should feel authored for Chronforge Echo: fine pixel-drawn metal edges, map-registration details, selective etched marks, tactile tabs, and an original recurring insignia. This identity describes the crew's present-day equipment; it does not introduce a time-travel device.

Use a controlled foundation of ink-dark surfaces, warm ivory text, oxidized teal, and sparing amber; reserve Kaida's raspberry/magenta accent for meaningful emphasis. Refine exact shades, motif, cursor, icon set, lettering, spacing, and motion yourself. Favor slim framing, deliberate negative space, and clear hierarchy. The result should be elegant, expressive, and readable at gameplay size. Avoid heavy ornamental borders that waste space.

Do not produce the familiar generic AI dashboard: stacks of identical rounded cards, glass panels, pill chips everywhere, blue/purple gradient chrome, oversized headings, emoji icons, or default neon rectangles. Avoid an equally generic parchment/tavern skin. Build the UI artwork and its interaction states intentionally; a palette swap over standard boxes is insufficient.

Create shared visual tokens and components for the **title screen, exploration HUD, pause/menu, vendor interfaces, construction, dialogue portraits and boxes, interaction prompts, reward badges, quest notices, ATB commands, target indicators, hit numbers, HP/MP bars, and action gauges**. Adapt density to the context while keeping the identity recognizable. Use custom pixel icons plus concise text where it helps understanding, crisp typography, clear focus/selection states, and short purposeful transitions. Meaning must not depend on color alone.

Keep the reference menu's functional skeleton:

| Key | Tab | Required behavior |
| --- | --- | --- |
| 1 | Map | Pan/zoom, player position, fog, discovered landmarks, region connections, and unlocked hub travel. |
| 2 | Party | Recruited heroes, portraits, roles, levels, HP/MP/XP, effective stats, and equipment summary. |
| 3 | Inventory | Owned items, details, sorting/filtering as useful, equip/unequip, and stat-difference previews. |
| 4 | Skills | Per-hero development, costs, prerequisites, unlocked techs, and understandable locked states. |
| 5 | Quests | Main story, side stories, and general quests within this tab; active/completed states, stages, useful objectives, and rewards. |
| 6 | Save | Functional save/load, readable metadata, safe restart/delete confirmation, and reliable recovery. |
| 7 | Settings | Working audio controls, key bindings/control help, and presentation/accessibility options. |

**Esc** opens/closes the menu from gameplay scenes, including battles and interiors. Support **1–7**, **Q/E** for tab changes, arrow navigation, and Space/Enter confirmation; mouse is a complete fallback. Show context-appropriate key hints and restore focus on return. No tab may be a stub or require a mouse to finish its essential tasks. Destructive save actions need deliberate confirmation.

**World map:** Treat explored terrain, fogged terrain within a discovered region, and undiscovered regions as separate states. Unvisited regions appear as subdued silhouettes without their internal details; disclose connectivity gradually as the player discovers it. Revealed portions may show small symbols/dots for discovered town centers, caves, houses, and gateways, plus useful regional connections. Preserve the reference's overview and pan/zoom usefulness without turning it into a task dashboard. **Never mark world drops, hidden treasure, or individual pickups**, including on hover or through fog. Landmarks must not leak out of unexplored portions just because another part of their region has been visited.

**HUD minimap:** A tiny, gently translucent preview of only the immediate surroundings. Represent nearby ground, water, foliage, walls, and paths as restrained color swatches that match the outdoor area, town, house, or cave currently occupied. At most use a tiny position/orientation cue. No whole-region thumbnail, label clutter, loot indicators, enemy radar, or undiscovered geography. Update it naturally with movement and interior transitions, and allow hiding it.

## 8. Time travel: future roadmap only, subject to my later approval

The base game must be fully developed, playable, polished, and beatable before I review it. **Do not develop or enable the time-travel expansion during this assignment.** Record it in `ROADMAP.md` as a **secondary postgame arc: awaiting the user's review and explicit approval after completion of the base game**. I will review the finished game and provide a later prompt; do not solicit that approval early or treat your own completion assessment as permission.

Leave the future arc's story, eras, places, cast, antagonists, objectives, and mechanics unprescribed. Do not write that campaign, create its levels/assets, implement a hidden playable version, or end the main campaign on a cliffhanger that depends on it. Broad unresolved mysteries may exist without committing its plot.

Design only modest forward-compatibility seams now: stable entity/content IDs, versioned saves with migrations, extensible quest and world-state conditions, a region/portal registry that can later distinguish world variants or eras, expansion-owned content namespaces, and explicit campaign-completion/level prerequisites. The current world can use one default era. Reserve a clean content-registration boundary rather than building a speculative temporal simulation or branching-timeline engine.

Keep the two gates distinct:

- **Development authorization:** Only my explicit later approval, after reviewing the completed base game, authorizes designing and building the expansion. A player level, save flag, development toggle, or successful test is never that approval.
- **Future player eligibility, once approved content actually exists:** The main campaign—including the Void Architect and ending—has been completed **AND Kaida is level 40 or higher**. Both conditions are required, regardless of which happens first. Only then may the future time-travel arc become available.

In this delivery, time travel remains unavailable even on a level-40 completed save. Record and test the prerequisite contract without shipping expansion gameplay. Distinguish combat hit-stop, speed effects, and ordinary gateway transitions from actual travel between eras.

# How to work

1. **Audit the reference and commit to a direction.** Play representative exploration, menu, settlement, and battle flows; inspect Kaida's reference and the underlying data. Write a concise `docs/REFERENCE_AUDIT.md` with a traceable checklist of retained systems, deliberate changes required by this prompt, incomplete reference features to finish, and acceptance evidence needed. Develop a few genuinely different UI/art compositions internally, choose the strongest, and document the chosen identity in `ART_DIRECTION.md`. Write a story bible and campaign/side-story progression outline in `NARRATIVE.md`, including the complete base-game ending. Make these concrete creative decisions yourself and proceed; do not turn them into an approval questionnaire.

2. **Architecture before feature implementation.** Write `ARCHITECTURE.md` with folders and ownership for core/state, rendering/assets, input/camera, world/regions/interiors, party/followers, encounters/combat/animation, settlements/economy/vendors, progression/inventory/loot, narrative/quests/dialogue, UI, audio, persistence, and verification. Define shared data schemas, public APIs, events, scene/input ownership, coordinate units, pixel scale, stable IDs, simulation clocks, seeded gameplay RNG, asset manifests, and save migrations. Keep renderer/animation separate from combat outcomes; express attack timing through one authoritative action timeline. Make quests, unlocks, vendors, and content declarative. Include only the future-expansion seams described above. Set measurable performance budgets for a named test environment: aim for 60 fps at 1080p with frame-time, texture-memory, scene-load, and representative four-enemy combat measurements. Missing optional effects/audio should degrade gracefully; missing required content and invalid state must fail visibly in development.

3. **Build the verification loop early.** Provide a browser automation harness with deterministic saves/seeds, named scene presets, a reliable readiness signal after required assets load, screenshots, and machine-readable logs for console errors, missing assets, frame times, and relevant gameplay state. Capture short videos or timed frame sequences for traversal, followers, gateway continuity, ATB choreography, and the critical timing window; still screenshots cannot establish animation quality. Give each subsystem a focused showcase using real production assets and code. Review the actual images and sequences at intended display scale. No claim of visual completion may rely only on source inspection, a passing test, or an asset contact sheet.

4. **Prove one complete loop, then expand in finished chapters.** First finish solo Kaida exploring a substantial section of Haventide, fighting a polished battle, receiving rewards, liberating and entering the town, using real vendors, building/upgrading, accepting and completing a quest, saving/loading, and crossing one convincing gateway. Include the real menu/HUD identity and timed-critical interaction. Use this to resolve rendering, asset consistency, controls, and pacing. Then expand region by region with recruitment, side arcs, interiors, enemy variety, technology progression, and bosses. Bring each chapter to the same quality before moving on. Continue through all eight regions and the ending; do not stop after the first loop.

5. **Delegate bounded work when collaboration tools are available.** Use builder agents for independent tasks with explicit folder ownership and agreed contracts: for example environment assets, character animation, combat, settlement content, narrative/quests, UI, and audio. Respect dependencies and the available concurrency limit. One integrator owns shared core, schemas, and integration; builders submit changes to those contracts through the integrator. Share the chosen art bible and story canon before producing assets or scenes. Integrate in waves and keep the playable branch loadable. If delegation is unavailable, follow the same ownership and review discipline sequentially; do not invent agent results.

6. **Maintain a consistent asset pipeline.** Declare the complete asset inventory for heroes, enemy families, buildings at all four tiers, regional environments, substantial interiors, portraits, items, UI, combat effects, and audio. Establish canonical character references, palettes, scale, anchors, perspective, and animation sheets before multiplying assets. Use available image-generation/art tools where they improve the result and inspect outputs in-engine. Choose lawful assets with recorded provenance and compatible licenses. Any generated or prerendered elements must be finished into the same pixel-art language and maintain identity across poses. Temporary blockout art is acceptable during construction but never counts as finished. Validate atlas frames, alpha, pivots, seams, collision alignment, and missing asset handling.

7. **Review each chapter with independent artistic and gameplay criticism.** Use a separate critic agent when available; it should inspect the running game and capture its own evidence. Have it evaluate environmental composition and scale, sprite/animation consistency, UI identity and legibility, ATB readability and feel, keyboard usability, narrative coherence, and settlement/progression depth. Use an anchored 0–10 rubric: 5 = recognizable prototype, 7 = good but uneven indie work, 8.5 = cohesive polished premium pixel-art RPG, 10 = exceptional craft. Aim for at least 8.5 in every category with zero blocking defects; treat scores as documented qualitative judgments, never objective proof. Require examples and ranked fixes, then revise the weakest areas. Use selected real pixel-art references to calibrate craft, not to claim indistinguishability. A critic's approval never authorizes the time-travel roadmap item.

8. **Verify the whole campaign and its fragile transitions.** Play from a clean save through solo opening, both recruitments, all regions, civilization advancement, minibosses, the Void Architect, ending, and continued exploration. Exercise every side-story branch with separate saves where needed. Use targeted deterministic tests for quest/reward idempotency, economy and unlock dependencies, item ownership/equipping, recruitment persistence, portal spawn/collision, save round-trips/migrations, and the future level-40 plus campaign-completion contract. Test battles against one through four enemies, ready-hero queueing, ally and enemy targeting, coordinated attacks, successful/missed timing inputs, held-key protection, death during queued actions, and exact pause/resume. Test all seven menu tabs and vendors/building actions with the keyboard alone, then mouse fallback. Verify fog and both maps never expose world drops. Report actual results and remaining issues; do not repeat broad checks once they pass unless changes warrant it.

9. **Persist progress and deliver the completed base game for review.** Maintain `docs/STATUS.json` with requirements, chapter/subsystem state, evidence paths, measured results, critic findings, known defects, and the next concrete task. Keep `ROADMAP.md` separate and clearly label the unapproved time-travel expansion. Resume from the weakest unfinished requirement after interruptions. Continue until the full base-game acceptance criteria are met, then provide launch/build instructions, the playable result, a brief review guide, representative evidence, and an honest account of limitations. Hand over the finished base game and stop at the expansion boundary; wait for my later prompt about time travel.

# Rules

- Ignore the repository's tech9 framework and its workflows, scaffolding, and orchestration conventions; build Chronforge Echo as a standalone game following this prompt.
- Deliver the game described here, not just plans, screenshots, a menu mockup, or a single attractive encounter. Complete the authored campaign and implemented systems.
- Own the unspecified creative choices. Develop distinctive stories, enemy designs, techniques, environments, and details instead of asking me to supply them. Keep requirement coverage separate from creative decisions so freedom does not erase constraints.
- Make routine implementation decisions autonomously, record meaningful assumptions, and keep working. Keep progress updates brief and concrete. If a real external blocker remains after reasonable alternatives, identify exactly what is blocked and continue independent work.
- Follow this brief over conflicting historical design notes. Preserve all work outside `games/chronoforge-echo/`; do not modify the reference projects or reuse their save namespace.
- Keep the dev server running and the game loadable during development and review. Keep development tools and test-only scene shortcuts out of the normal player experience.
- Respect module ownership. Route shared schema/core changes through the integrator and validate integration with real gameplay.
- Never invent test results, screenshots, agent reviews, performance numbers, art quality scores, or completed features. Do not silently lower the quality bar, hide missing assets with placeholders, or call a build finished because a checklist exists.
- Time travel is **roadmap-only and unapproved** in this assignment. Finish the complete base game first. Neither level 40, beating the final boss, nor an automated quality gate grants permission to build it.
