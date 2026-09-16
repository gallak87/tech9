# Independent live showcase critique

This review inspected the running game at `http://127.0.0.1:4321/?test=1` after its readiness signal. It covers the revised Haventide opening and one solo battle, with the generated Kaida sheet and eight coast props loaded. It does **not** establish full-campaign visual completion, later-region consistency, party animation quality, or final performance acceptance.

The richer Kaida is a clear improvement: her hair, face, teal jacket, blade, boots, and trailing cloth read at ordinary playing scale. The ornate ring and wind-shaped coastal trees offer a convincing direction for memorable scenery. The next work should make these assets belong to the same world as the ground, enemy, architecture, and motion. The current showcase is still visibly uneven; multiplying the current mixture across seven more regions would multiply that problem.

## Method and captured evidence

- Fresh headless Google Chrome 153.0.8010.37, viewport 1920×1080, device scale factor 1, native game 960×540 displayed at 2×.
- Actual production renderer and asset loader; no replacement screenshot, synthetic composition, or image editing.
- Used test presets only to establish the requested world and solo battle. Walked with actual `ArrowDown`, opened and closed the atlas with `Escape`, then used actual `Space`, `Enter`, and `Enter` for ready-hero commands, target selection, and attack execution.
- Captured 19 independent full-resolution screenshots. The eleven attack frames have measured timestamps about 199–243 ms apart; screenshot capture itself contributes to this interval. These are a timed action sequence, not a 60-fps video or frame-time benchmark.
- Inspected the rendered images with `view_image` at normal display size. Browser console/page errors: **0**. Asset errors: **0**. Required loaded atlases reported as `kaida_showcase` (2172×724) and `coast_props` (1774×887).
- The first unassisted strike changed the Rust Scrapper from 76 HP to 30 HP at contact, with a visible 46-damage number and recovery back to formation. This review did not attempt the timing bonus; its visible prompt and moving marker were inspected.

Primary files:

- [Opening world](../evidence/critic-world-initial.png)
- [Walking / facing change](../evidence/critic-world-walk-02.png)
- [Atlas map](../evidence/critic-atlas-map.png)
- [Battle commands](../evidence/critic-battle-command.png)
- [Windup: visible detached sprite fragments](../evidence/critic-battle-action-00.png)
- [Approach](../evidence/critic-battle-action-02.png)
- [Timing window / blade at target](../evidence/critic-battle-action-03.png)
- [Contact and damage](../evidence/critic-battle-action-04.png)
- [Recovery](../evidence/critic-battle-action-06.png)
- [Capture state, timestamps, asset diagnostics, and errors](../evidence/critic-capture-log.json)
- [Reproducible capture script](../evidence/critic_capture.mjs)

## Anchored judgment

Scores are qualitative editorial judgments, not objective measurements or permission gates. Anchors: **5** recognizable prototype, **7** good but uneven indie work, **8.5** cohesive polished premium pixel-art RPG, **10** exceptional craft. A score only applies to the captured showcase.

| Category | Score | Visible evidence |
| --- | ---: | --- |
| Environmental composition and sense of place | 6.5 | The mossy listening ring and mature coastal trees establish age, scale, and a strong coastal identity. The open center is readable. However, the foreground ring fills much of the right half and the ground between landmarks still looks like sparse blockout terrain. |
| Material, palette, and pixel coherence | 5.5 | Detailed, highly textured generated leaves and carved stone sit against broad flat green squares, simple pale path rectangles, an untextured stepped shoreline, flat distant silhouettes, and very simple old pillars. The material language changes abruptly within one screen. |
| Kaida identity, silhouette, and readable scale | 8.0 | Her face and determined posture are visible, the short magenta hair and dark teal cropped jacket remain recognizable, and the sword accent carries through idle, facing change, windup, and strike. She now feels like the focal character rather than a tiny marker. |
| Character animation and asset cleanliness | 6.0 | The windup and extended strike are distinct and useful. But the windup frame includes a detached boot-like fragment and small cloth-like pixels to her right. The sequence returns briefly to an ordinary standing/walking silhouette while she translates into range, which weakens anticipation and reads as a short glide. |
| Battle staging and contact | 7.0 | The blade reaches the enemy silhouette; a diagonal hit effect, HP change, and modest number coincide. Targeting and the combat lane are understandable. The huge ring sits directly behind the Rust Scrapper, merging its outline into carved stone, and the enemy’s simple broad polygons do not match Kaida’s detail. |
| UI identity and text legibility | 8.0 | The slim expedition atlas, dark ink panels, amber rules, ivory serif headings and monospaced controls are cohesive. Seven tabs have the required order. Objective, readiness, command, HP, MP and target are readable. Some canvas text is rougher than DOM text because of its internal scale, but it remains usable. |
| Keyboard flow observed | 8.0 | World movement, atlas toggle, ready-hero command opening, target confirmation and execution worked through actual keyboard events, with no accidental extra confirmation. This is a focused sample, not a complete keyboard audit. |

The showcase overall is around **6.8–7.0** today: a substantially stronger hero and several attractive props within an environment that has not yet reached a single consistent finish. No category should be reported as globally accepted based on these samples.

## Ranked fixes for the next pass

1. **Remove atlas contamination and stabilize action frames.** In `critic-battle-action-00.png`, isolated boot/cloth fragments appear to the right of the windup pose. Inspect frame rectangles, trim transparent padding, and ensure no neighboring figure enters the sampled cell. Compare the windup → approach → strike anchors: preserve the attack’s body intention during approach instead of switching to the ordinary standing silhouette. This is a visible correctness problem, not an artistic preference.
2. **Finish a small coherent patch of ground and shoreline underneath the new assets.** Match the trees’ and ring’s palette with shaped grass clusters, worn earth, broken masonry joins, ground shadows, stepped but irregular sand/water edges, and a restrained shared detail density. Replace the conspicuously plain pillars in this same patch. Do not solve this by uniformly adding grass noise across the whole map; author the route edges, clearings and contact points beneath the props.
3. **Give the battle actors a clean silhouette lane.** Shift or scale the arena ring so its bright stone does not sit in the Rust Scrapper’s outline. Keep its monumentality in the wider world. Put the enemy on a clear mid-value patch with a deliberate contact shadow, and bring its material/edge treatment up to the hero’s chosen visual language. The contact frame already proves the choreography can work.
4. **Reconcile projection and physical contact.** The ring’s stone steps, roots and large tree bases need convincing contact with the ground and water; currently parts read as cutout illustrations laid over a flat plane. Build shoreline shelves and shadow shapes around the bases. Keep foreground occlusion intentional and avoid placing important interaction silhouettes behind the ring’s solid visual mass.
5. **Polish the readable UI without widening it.** Preserve its current identity. Normalize the canvas text raster scale where possible, and keep the timing indicator modest. The current menus do not need a wholesale redesign; art coherence and frame cleanliness will improve this showcase more.

## What is promising enough to retain

Keep the larger Kaida scale, expressive magenta/teal identity, restrained interface, old coastal machinery, and the strike’s physical extension into the enemy. These already work together conceptually. The next iteration should demonstrate that one small walkable coast composition and one battle are visually unified, then carry that established standard into the remaining content.

This critique supplies fixes and evidence. It does not impose an approval step or authorize any expansion work.

## Independent second pass — revised ground, shore, vista, actor crops and Rust Scrapper

A fresh run of the same capture procedure produced **19 additional screenshots** under the `critic-refined-` prefix. The first pass above and its images remain intact. This run used the same 1920×1080 Chrome viewport, real keyboard command flow and production renderer, and again recorded **zero console, page, application or asset errors**. The test browser held an open development socket that suppressed hot-update messages, solely to prevent concurrent development from replacing code halfway through the sequence.

The improvement is visible without comparing source code. The plain floor is now mossy grass, broken pale earth and patterned coastal water. The simple pillars have been replaced with material-compatible ruins. The ring is smaller and farther right in the battle, leaving the enemy readable. The new Rust Scrapper has a strong asymmetrical magnet claw, weathered metal, a luminous eye, distinct windup/hurt poses and a much closer match to Kaida’s finish. The detached boot/cloth fragments visible in the original windup are gone in this capture.

The new contact frame remains convincing: Kaida extends into the enemy’s space, her blade and impact streak cross its body, the Scrapper recoils, and its HP changes with the 46-damage number. The first fight now makes a plausible visual promise for the rest of the adventure.

Fresh evidence:

- [Refined opening](../evidence/critic-refined-world-initial.png)
- [Refined battle command scene](../evidence/critic-refined-battle-command.png)
- [Cleaned windup](../evidence/critic-refined-battle-action-00.png)
- [Blade contact and Scrapper hurt reaction](../evidence/critic-refined-battle-action-03.png)
- [Recovery](../evidence/critic-refined-battle-action-04.png)
- [Second-pass diagnostics and timed states](../evidence/critic-refined-capture-log.json)

| Category | First pass | Second pass | Reason for change |
| --- | ---: | ---: | --- |
| Environment composition | 6.5 | 7.5 | The ground is now a deliberate material and the arena’s silhouette lane is clearer. The opening monument still dominates a large part of the camera. |
| Material / pixel coherence | 5.5 | 7.3 | Ground, props, hero and the first enemy now share a detailed visual language. Uniform grass texture and repeating road marks create a busy carpet; flat geometric water cutouts still contrast with the finished crags. |
| Kaida identity / scale | 8.0 | 8.1 | The crop is cleaner and the character remains readable within the richer environment. |
| Animation / asset cleanliness | 6.0 | 7.4 | Detached fragments are fixed and the Scrapper’s reactions add life. Approach and recovery still use a brief upright translation between stronger action poses. |
| Battle staging / contact | 7.0 | 7.9 | The enemy has breathing room, both actors read at the same finish, and physical contact is clear. |
| UI / legibility | 8.0 | 8.0 | The previously strong interface remains intact; the richer scene does not make commands or gauges difficult to read. |
| Observed keyboard flow | 8.0 | 8.0 | Actual movement, atlas controls, command/target confirmation and execution continue to work. |

My current scoped judgment is **about 7.5–7.8 overall**, a good but still uneven indie showcase. This is a meaningful improvement, not yet an 8.5 premium-finish judgment. The scores are descriptions of what is visible, not a demand to wait for permission.

Next fixes, in order:

1. Reduce contrast and repetition in the grass’s broad middle areas; keep detailed clusters around roots, rocks and route edges. Give the road a few larger authored worn patches instead of equally legible cracks and pebbles everywhere. This should preserve the richness while making the world feel composed rather than wallpapered.
2. Finish the water/crag contact and the remaining flat geometric shapes in the arena background. A coherent distant shore with restrained atmospheric detail will make the new crags belong to a landscape rather than a stage set.
3. Keep Kaida’s approach body posture connected to her windup and follow-through. Her strong attack poses deserve a short intentional transition rather than an upright slide between them. Inspect this in motion, not only at the contact frame.
4. Retain the chosen hero, material palette and interface as the production direction. Apply that direction deliberately to other biomes, inhabitants and interiors; do not let the current globally shared coast trees/rings stand in for snow, volcanic or alien regional identity.

## Separate campaign integration evidence

The production browser route has now completed all eight regions, forty unique battles, both recruitments, all four civic tiers, one legitimate branch of all three personal arcs, the actual Void Architect ending and the Haventide homecoming. It used real `walkTo` movement and collision, actual nearby object interactions, production rest and construction UI actions, legal battle commands, and accelerated `game.update` steps. No XP, item, HP, flag, encounter-clear, or regional-position grants were used. Forty battles finished without a loss; the party reached level 42. The successful run recorded 2,288.38 simulated gameplay seconds in 27.24 wall seconds and zero application/browser errors.

That route found and helped resolve two real mouse-path defects: a floating-point collision boundary mismatch beside an Orbital Reach tree, and Frost Canyon path edges whose endpoints were walkable while the segment crossed water. Both fixed routes passed in the successful full run. Earlier failures and an explicitly identified dev-socket harness error are retained in the machine-readable history.

- [Campaign integration log](../evidence/campaign-browser.json)
- [Actual homecoming state](../evidence/campaign-browser-aftermath.png)
- [Actual Frost Canyon chapter state](../evidence/campaign-browser-frost.png)

This validates integrated campaign behavior, not a manual human playthrough or full-game art completion. The captured town and Frost Canyon still visibly contain much simpler companions/residents, unfinished floors, and globally reused coast props. The opening’s revised quality cannot honestly be assigned to those places yet.

## Branch UI, persistence and narrative review

Six isolated, deterministic prechoice save fixtures were derived from the earned complete-campaign snapshot. Only the target arc’s choice/completion/reward fields and exclusive keepsakes were rewound; they are explicitly test fixtures, not evidence of another clean campaign. Each alternative was then chosen through the actual dialogue UI, alternating focused keyboard Enter and a mouse click. The result was saved in a manual slot, loaded through the normal confirmation UI, and revisited through the actual interaction. All six passed: the appropriate branch flag/item/service and technique persisted, the opposite outcome was absent, the expected XP was received once, and the revisit duplicated neither XP nor inventory. There were no browser errors.

[Branch UI results, actual dialogue and fixture details](../evidence/branch-browser.json) record the two Vex outcomes, two Rune outcomes and two Mara convoy promises. This specifically verifies Mara’s branch service decision; the earlier full route separately verified her eventual reunion and compass reward.

The story’s main strength is thematic consistency. The relays, settlement development, Rune’s open gate, Vex’s listening, Mara’s larger home and the Architect’s failed shelter all answer the same practical question: what does protecting someone allow them to choose? The final exchange gives the antagonist a distinct resolution instead of substituting the Herald for the confrontation. The crew’s concise voices are different: Kaida acts, Vex questions certainty, Rune grounds both with protective pragmatism.

The review also found two genuine conditional-dialogue defects: Vex spoke in Mara’s convoy scene before recruitment, and Rune spoke at the Mire archive even on the legal route that explores the marsh before Orbital Reach. Those have been corrected and covered by a focused test. A larger ending-persistence gap was identified: victory formerly marked the ending seen before the player read it. The new narrative contract leaves the ending pending and campaign incomplete until the final return action calls `finishEnding`; the integrator is responsible for checkpointing/resuming the line index and final panel. Unit coverage now confirms that a level-40 Architect victory alone does not satisfy future eligibility.

Remaining story/presentation work should be treated honestly:

- The ending’s social consequences are mostly expressed through dialogue. The homecoming says the keeper teaches children and people return, but the town scene still contains generic residents and services. Place the keeper and at least a small, visible returnee interaction in the playable aftermath, and let existing resident lines change with the outcome. This would make the resolved story tangible without adding another campaign.
- Vex and Rune each have meaningful alternative conclusions and exclusive rewards, but their playable structures are compact and similar: find a record, find its missing context, make a choice. They meet the multistage/stateful requirement mechanically; one distinct intermediate problem or later callback for each would make them feel more substantial.
- The general quests currently work through discovered objects, travel and encounters. They are not meaningfully handed off by vendors despite vendors being part of the requested discovery mix. Give one existing specialist a contextual request or completion conversation instead of adding another anonymous objective.
- Dialogue portraits still reuse the limited hero portrait vocabulary for supporting speakers. The script’s returning people deserve individual visual identity as character production continues.

The measured **38-minute simulation** must not be described as a measured human campaign duration. It includes actual movement, backtracking, battles and production, but skips the real time a person spends reading dialogue, considering choices, choosing commands, learning the map and inspecting the menu. It does establish that normal authored content reaches level 42 without repeated fights, paid training, or waiting for production. A real first-time playthrough is still needed to judge whether the quieter geography and short narrative scenes feel spacious or thin. Do not add repetitive battles to make the clock longer; deepen the meaningful interactions already present.

## Independent third coast pass — direction established, polish still visible

The final opening pass used a fresh production browser at 1920×1080, the same actual walking/atlas/command keys, and the same scene-setup presets. It produced 19 new `critic-final-` captures with **zero console, page or asset errors**. Eleven action samples are 210–283 ms apart; this is an observed timed sequence, not a frame-rate benchmark. This pass does not rerun the campaign or establish quality outside the shown scenes.

The grass is quieter, the world ring gives Kaida more space, and the flat shapes that previously cut across the battle water are gone. These changes improve the composition without erasing the coast’s identity. Most visibly, Kaida now takes a distinct stride while approaching and turns left for the return, with changing foot positions. The direction of motion belongs to her body instead of being conveyed only by horizontal translation. Her windup, extension, the Scrapper’s hurt reaction, the 46-damage number and the HP reduction remain clean and readable. No detached neighboring body fragments appeared.

| Category | Second pass | Third pass | Scoped judgment |
| --- | ---: | ---: | --- |
| Environment composition | 7.5 | 7.8 | The landmark remains memorable without taking quite so much room. The view has a clear route, protagonist and destination. |
| Material / pixel coherence | 7.3 | 7.7 | Quieter ground and continuous water reduce the most obvious mismatches. Repetition and abrupt prop contacts remain. |
| Kaida identity / scale | 8.1 | 8.1 | Expressive, readable, and consistent through the sampled poses. |
| Animation / asset cleanliness | 7.4 | 8.0 | Actual approach and return gait improve the action’s continuity. The sequence is still a small set of poses, with a quick change from raised sword to lowered walking sword. |
| Battle staging / contact | 7.9 | 8.1 | Distinct actor silhouettes, convincing reach and reaction, softer contact shadows, and a less interrupted vista. |
| UI / observed keyboard flow | 8.0 | 8.0 | Commands and the timing signal remain legible; actual input flow completed without errors. |

The coast showcase is now **about 8.0 overall**. Its art direction is established enough to guide regional asset production: expressive characters, carved cream stone, weathered machinery, deep teal shadows, restrained magenta/amber accents, and the existing quiet interface. The remaining issues are scene-composition and integration work; they do not require another change of visual language before making regional assets. This is not a claim of 8.5 premium completion, and the score is not an approval barrier.

The highest-value remaining coast corrections are specific: the listening buoy is still a flat mint-colored pedestal beside highly worked stone; broad ground areas still reveal repeating diagonal grass and evenly distributed path cracks; and the two arena crags end in the water without much surrounding foam or a small shelf to seat them. The distant flat silhouettes work better as atmosphere now that the foreground cutouts are absent, but the stark horizontal horizon can eventually use more compositional variation. These are polish tasks. Extending coast trees and rings everywhere would still weaken the other regions, so production should use the established material discipline with each biome’s own forms.

Evidence inspected:

- [Final opening composition](../evidence/critic-final-world-initial.png)
- [World walking](../evidence/critic-final-world-walk-02.png)
- [Final battle](../evidence/critic-final-battle-initial.png)
- [Windup](../evidence/critic-final-battle-action-00.png), [approach stride](../evidence/critic-final-battle-action-02.png), [extended blade](../evidence/critic-final-battle-action-03.png), [hurt reaction](../evidence/critic-final-battle-action-04.png), and [left-facing return stride](../evidence/critic-final-battle-action-05.png)
- [Actual capture states, intervals and diagnostics](../evidence/critic-final-capture-log.json)

### New Haventide source sheets and their actual integration

Read-only Pillow inspection confirms that `haventide-interior-source.png` is **1774×887 RGB** and `haventide-civilians-source.png` is **2172×724 RGB**. Neither file has an alpha channel: their visible checker pattern is baked into the source pixels. They are source artwork, not final transparent atlases. The eight interior cells contain coherent stone, wood, teal fabric, brass and ivy; the six front/back civilian pairs have individual ages, clothing, work tools and expressions. They are useful art, but the civilians are front/back poses rather than authored walking cycles.

A conservative non-gray/dark-pixel foreground estimate found no obvious cell-crossing body or prop. It is not a true alpha-bound calculation. The interior sheet’s nominal 4×2 cells have narrow margins in several places: the artificer bench is about 6 source pixels from its right edge and the civic table about 7 from its left. The 6×2 civilian grid has particularly tight vertical gutters: front figures finish only 2–3 pixels above the row boundary, and several back figures begin about 2 pixels below it. Exact crop rectangles and post-extraction inspection matter more than assuming generous padding. The nonintegral 443.5×443.5 interior grid also deserves deliberate cell rounding.

The root integrated these sheets through connected exterior-background extraction before this scene review. A separate fresh `settlement` preset capture then used production `walkTo`, real ArrowUp steps into interaction range, and F to open Bran’s actual shop. The successful capture recorded zero browser errors. **The running town does not show opaque checker rectangles** around its stalls, residents or Bran’s portrait. The portrait preserves his face, hair, apron and hammer clearly at normal UI scale. This actual extraction result supersedes any suggestion that the RGB files must be rejected merely for lacking alpha.

Town composition still trails the coast. Rich stalls stand on a large, uniformly tiled pebble floor with visible grid lines, a huge flat green rug, and plain geometric columns. Counter layering leaves residents’ feet visible under the stalls while much of their torso is hidden, and Kaida can crowd Bran’s silhouette when speaking. The assets now belong to a shared material language, but the room needs authored floor zones, believable counter placement, and more deliberate spacing. Those scene-level corrections should accompany further interior production; the raw sheets alone do not establish a finished settlement.

- [Town entry](../evidence/critic-final-town-opening.png)
- [Actual approach to Bran](../evidence/critic-final-town-smith-field.png)
- [Bran’s keyed portrait in the live shop](../evidence/critic-final-town-smith-ui.png)
- [Town capture state and diagnostics](../evidence/critic-final-town-log.json)

### Vendor story handoff added after the narrative review

The earlier lack of a vendor-originated objective now has a concrete resolution. Bran’s existing shop offers **A Gentler Hand**: accept his calibration request, bring one loose Data Chip, and choose to hand it over. The mandatory town-gate sentry already provides a usable chip, and previously found spares work; no repeat battle is required. Bran consumes one unequipped copy, grants 150 XP, 35 ore and two Ether Cells once, and explains the resulting repairs to hinges, shutters and carts. An equipped chip is left alone, with a clear reminder to return it to the pack if the player chooses.

Focused production tests cover acceptance, deferral, the actual gate drop, equipped-copy protection, inventory rechecking at handoff, single consumption and reward, and saved revisit. The existing campaign route remains optional and unchanged. A live UI check loaded the unmodified earned campaign snapshot, walked to Bran, chose acceptance and handoff with keyboard confirmation, read both result conversations before the shop returned, saved manually, loaded through the confirmation UI and revisited. It verified exactly one chip consumed, exact rewards, persistence and no duplicate reward, with zero errors. See [vendor UI evidence](../evidence/vendor-browser.json) and [completed quest in the actual atlas](../evidence/vendor-browser-complete.png). This is a focused check using an earned save, not another fresh campaign claim.

## Integrated crew, all coordinated techniques, and the Drone

A new independent run captured **62 production-rendered images** at 1920×1080: real-time world movement in four directions, the actual Party screen, ten timeline samples plus target selection for each of the three pairs and the full crew, and the Drone’s naturally scheduled strike. Built-in presets supplied the party and learned-tech fixture; this is not evidence of earning those skills. The battle timeline was stepped through the real `Game.update` while normal RAF drawing continued, so contact at 0.93 seconds and recovery could be inspected exactly. No damage, HP, MP, readiness, action pose or screenshot pixels were assigned by the capture script. An earlier script error expected nonexistent per-hero buttons on the combined Party screen; that harness failure is retained separately. The corrected run passed with **zero application/browser/asset errors**.

Vex and Rune now have distinct identities beside Kaida. Vex’s navy hat, silver hair, amber staff and light build read as one character; Rune’s dark face, warm scarf, broad ivory shield and heavier stance give the party a third silhouette. Their feet stay grounded through the sampled standing, casting, crouching, impact and recovery poses, without independently inflating shortened poses. Vex’s extended staff/glyph survives the expanded attack crop, and the nearby cast-coat sliver is correctly absent. The trio’s separation in battle is clear. The route-following crew turns corners and respects the foreground ring’s occlusion, although the single-file spacing crowds the large silhouettes near the buoy.

The first actual portrait view exposed a source-import defect that the source metadata alone could not establish: **an enclosed checkerboard patch survives beside Vex’s left shoulder/face**, with a smaller enclosed patch in Rune’s arm gap. These are visibly patterned white/gray areas, not intended costume highlights. Exterior-only flood extraction cannot enter enclosed holes. Confirmed component seeds and bounds were sent to the world artist: Vex front seed `(1565,471)` within `[1560,432,1604,517]` (1,802 pixels); Rune front seed `(1569,518)` within `[1560,493,1588,553]` (560 pixels). Selected additional hollow-background candidates are recorded in the handoff. Blanket removal of neutral islands would damage real silver hair and pale armor; use authored interior seeds with the existing bounded neutral flood. This is the first correction to make.

World motion has a separate limitation: Vex and Rune use side-facing stride illustrations while moving vertically. In the southbound view Kaida faces the camera while both companions visibly step sideways down the screen. Their static front/back poses are useful, but the two stride frames do not supply the equivalent directional movement. This is now conspicuous beside Kaida’s dedicated walk sheet. It is a motion-content gap, not an anchor or collision failure.

### Observed action semantics

All four techniques required every participant to be alive, learned and ready through the actual Tech selector. The selected participants alone paid MP and immediately spent their ready gauges; the uninvolved hero stayed ready with unchanged MP. MP in saved hero state matched battle state at every sampled frame. HP did not change in the pre-contact sample, then changed at contact. There was no successful timing bonus in these captures.

| Technique | Participants and cost each | Actual contact result | Ready hero after recovery |
| --- | --- | --- | --- |
| Prism Cut | Kaida + Vex, 10 MP | Four enemies took damage; three fell and Gravbot retained 54 HP. | Rune |
| Harbor Break | Kaida + Rune, 11 MP | Only the selected Drone was hit and defeated. | Vex |
| Shelterlight | Vex + Rune, 12 MP | Vex recovered from 212 to 263 HP after actual enemy damage; the two full-health heroes stayed capped. | Kaida |
| Concord Dawn | All three, 20 MP | All four targets took damage and fell. | None |

The preset is level 12 with explicit learned-skill fixtures, including Concord Dawn. Its large numbers against opening enemies are a choreography test, not a campaign balance measurement or proof that the tier-4 technique can normally be learned at that level. Existing progression tests own that gate.

The actions work, but their visual meanings need more differentiation. **Shelterlight uses the offensive staff thrust and shield-slam pose at healing contact**, including forward sparks, which reads like an attack despite correct healing numbers. Keep the supportive cast/guard intention through that moment. **Harbor Break never visibly launches Kaida from Rune’s shield**: Rune braces remotely while she leaps from her own position, briefly passing over the unrelated Scrapper on the way to the Drone. Add a short plant at his shield before the arc. **Prism Cut and Concord Dawn use almost the same stationary cast → thrust → generic diagonal enemy-hit staging**; a readable refracted blade fan and a joined sunrise would make the named techniques distinct without lengthening the battle. The central timing panel also overlaps the lower enemy lane and part of Rune’s forward effect in some four-enemy frames.

The Drone’s shell, luminous lens, vanes and worn metal now match the hero/environment finish, and its source alpha produces no visible rectangle. Its airborne anchor remains stable while changing pose and returning home. The actual strike reduces Rune from 440 to 430 HP at contact. However, its short cyan pulse ends roughly 25–30 native pixels shy of Rune’s shield; the overlaid slash supplies the hit while the source pulse does not quite reach. In the four-enemy layout the Drone also sits directly against the bright ring steps, reducing its clean outline. Its quality cannot be assigned to the unconverted Mutant Hound and Gravbot below it, which still use obvious placeholder shapes.

Scoped judgment: **crew identity and readable scale about 8.2**, **pose/ground consistency about 8.0**, **current combined choreography about 7.3**, with portrait/background extraction a visible correctness issue. The three characters reinforce the chosen art direction; the current integrated presentation remains uneven until the identified extraction, vertical-stride and technique-staging corrections land. These are specific observations, not a score gate or a finished-game claim.

Evidence:

- [Party portraits and enclosed-background defect](../evidence/critic-party-portraits.png)
- [Eastbound crew](../evidence/critic-party-world-right-02.png), [southbound orientation](../evidence/critic-party-world-down-02.png)
- [Prism Cut contact](../evidence/critic-party-prism_cut-05.png)
- [Harbor Break arc](../evidence/critic-party-harbor_break-03.png) and [Drone contact](../evidence/critic-party-harbor_break-05.png)
- [Shelterlight preparation](../evidence/critic-party-shelterlight-03.png) and [healing contact](../evidence/critic-party-shelterlight-05.png)
- [Concord Dawn contact](../evidence/critic-party-concord_dawn-05.png) and [recovery](../evidence/critic-party-concord_dawn-07.png)
- [Drone approach](../evidence/critic-party-drone-02.png), [strike](../evidence/critic-party-drone-04.png), [return](../evidence/critic-party-drone-07.png)
- [Every sample, state transition and assertion](../evidence/party-critic.json), [reproducible capture](../tests/party-critic.mjs)

### Follow-up: corrected portraits and the updated earned campaign

A fresh actual Party screen now shows clean transparent space beside Vex’s face and Rune’s arm, with silver hair and ivory armor intact. The two measured interior seeds resolve the identified checker islands without changing either original PNG. [Corrected live portraits](../evidence/critic-party-portraits-keyed.png) were captured at 1920×1080 with zero browser errors.

The complete browser campaign was rerun after the ending-persistence contract and Haventide counter relocation. It passed all ten chapter checks: 40 unique battles, zero losses, all three heroes level 42, civilization tier 4, the actual ending return action, all eight regions, all three side arcs and the homecoming. The harness simulated 2,275.23 seconds (37m55s) of production movement and combat in 28.01 wall-clock seconds, with zero browser errors. No XP, inventory, flags, health or location were granted; normal first-clear rewards, movement, encounters, rest, building and dialogue actions supplied progression. This is accelerated integration verification, not a claim of another manually played human campaign. [Updated route evidence](../evidence/campaign-browser.json).

## Boss and middle-enemy source integration

An independent production-rendered run inspected eleven new catalog enemies at normal 1920×1080. The five new late guardians completed real fixture battles; the six additional enemies performed two naturally scheduled actions each. This is a deterministic art/behavior fixture, not another earned campaign. The run passed with zero application, browser or asset errors; [all captured states](../evidence/boss-art-critic.json) and [repeatable harness](../tests/boss-art-critic.mjs) preserve its scope.

The five guardian silhouettes do meaningful work. The Warden is a tall narrow heron, Magma a low broad salamander, the Herald an airy ivory measuring instrument, the Colossus a literal bridge-bearing mass, and the final Architect a small human enclosed in enormous broken rings. Their shading, edges and restrained lights belong alongside the heroes. The final Architect reads as the campaign's distinct author of the threat, not a larger version of the Herald. No opaque background, obvious crop cut or neighboring-pose fragment appeared in the reviewed live idle, windup, attack, casting and hurt frames. Source/import details are documented in [boss-assets.md](boss-assets.md).

The six other integrated creatures are also materially coherent and individually recognizable: peat toad/tree, glass-antler wolf, furnace crab, masked burial-sail lancer, dark floating star, and blade-armed furnace mantis. Floating enemies retain a legible gap above the ground, and the wolf's white fur remains intact. The Mire Hulk loses some edge separation against the similarly colored foreground roots and moss; a quieter backdrop or small value separation would help. The other five were captured before their regional art arrived and cannot establish complete biome quality. Some earlier catalog flavor descriptions should be reconciled with these final silhouettes, especially the furnace crab, dark Wraith Core and insectile Ember Lord.

The remaining conspicuous failure is action staging. Charged all-party blows move the entire attacker into Kaida's lane: the Warden's long beak/pulse overshoots Vex while its body covers Kaida and Rune, the Colossus fist passes over Kaida's head, and Unwritten Sky puts the Architect's armillary directly behind her. The same physical shuffle affects the Ember Golem and Wraith Core. Actual HP changes are correctly timed, but generic diagonal slashes do not explain the party-wide hit. Keep those attacks anchored and direct a readable compact wave/pulse to the crew; use the attack-frame extent for individual melee stop positions. The combat owner received these exact captures. This prevents a blanket “finished premium battle” judgment despite strong creature art.

The victory screen quickly hides defeated enemies. A sampled data state saying `down` should not be confused with a visibly sustained collapse pose; the six-pose source promise and the game’s presentation of that pose are separate facts.

### Sustained directional walk and flavor-text follow-up

A second walk capture held each real arrow key for 1.2 seconds, long enough for both route-following companions to finish the corner. The logged states confirm left/up/right/down for all three actors. Vex and Rune now face front/back while moving vertically, retain their identities, and show clean gaps around staff/arms; the previous sideways vertical-stride defect is resolved. The northbound capture also shows correct tree occlusion. These movement crops preserve body scale and avoid conspicuous foot hopping. [Southbound crew](../evidence/critic-walk-trio-straight-down.png), [northbound crew](../evidence/critic-walk-trio-straight-up.png), [positions and facings](../evidence/critic-walk-trio-straight.json).

Three measured Vex guard/back/victory interior seeds were also added after the actual victory view exposed the same class of enclosed staff-gap checker defect. Enemy flavor descriptions have been reconciled with the final Mire Hulk, Ember Golem, Frost Revenant, Wraith Core and Ember Lord silhouettes; this changed no stats or rewards.

### Coordinated actions and boss staging revised

The combat owner supplied a fresh production-rendered sequence after the specific contact and pose feedback above; I independently inspected its windup, contact and return samples. These are the owner's deterministic battle captures, not a second earned campaign. The [combo log](../evidence/choreography-combos.json) and [boss log](../evidence/choreography-bosses.json) report passing contact/resource assertions and zero browser errors.

The earlier named choreography defects are resolved in these samples. Harbor Break visibly compresses Kaida onto Rune's shield before its high arc, clears the unrelated Scrapper, hits the selected Drone and returns facing the direction of motion. Shelterlight keeps Vex casting and Rune braced at healing contact; the new restrained petals reinforce care rather than an offensive thrust. Prism Cut has a refracted fan, while Concord Dawn joins the crew around a sunrise motif and reaches all targets. Broken pixel ribbons, pale cores and small shards give the revised effects more substance than the first thin guide-like lines. The compact timing instrument sits in the lower command area, clear of the combatants.

The giant party-wide spells now leave the attacker in its home lane and send an incoming pulse toward the crew. The Architect's rings and the Colossus no longer cover Kaida during the hit. The Warden's individual attack brings Vex forward into a clear defender lane; its beak/pulse meets her body instead of overshooting her while covering two bystanders. The contact labels have readable dark backing. The spell samples still use earlier biome fixtures, including unfinished scenery in the cold/final examples, so this establishes corrected action staging only. Final regional composition is reviewed separately against earned encounter saves.

- [Harbor shield plant](../evidence/choreography-harbor_break-04.png), [high arc](../evidence/choreography-harbor_break-06.png), [contact](../evidence/choreography-harbor_break-08.png), [return](../evidence/choreography-harbor_break-11.png)
- [Prism fan](../evidence/choreography-prism_cut-07.png), [Shelterlight preparation](../evidence/choreography-shelterlight-07.png), [joined sunrise](../evidence/choreography-concord_dawn-08.png)
- [Anchored Architect and incoming wave](../evidence/choreography-void_architect-group-04.png), [simultaneous party contact](../evidence/choreography-void_architect-group-06.png), [Warden's isolated contact](../evidence/choreography-mire_warden-vex-06.png)

## Final earned-save regional review

This review uses the actual progression earned by the clean browser campaign, rather than putting the opening objective and a fabricated full party in every region. The archive contains 58 unmodified arrival, encounter and chapter saves. The independent visual run loaded them through production persistence, walked through production paths and doors, and used actual keyboard battle actions. It captured 103 images across all eight regional worlds and battles, four settlements, four house/cave interiors and all seven atlas tabs. Focused follow-ups captured 21 affected views after fixes and 22 after the final room, court and foliage pass. All three runs reported zero application/browser errors. The logs distinguish saved state, simulated action time, travel, party level, civic tier and objective. Images were inspected at the intended 1920×1080 presentation; the count is coverage evidence, not a claim that every captured frame was individually judged.

The visual/UI review is independent of those subsystem implementations. I also authored the narrative/progression modules, so the story and economy judgments below are candid self-review informed by actual gameplay evidence, not an independent external acceptance decision. Scores retain the brief's anchors: **5 recognizable prototype; 7 good but uneven indie work; 8.5 cohesive polished premium pixel-art RPG; 10 exceptional craft**. They are qualitative judgments and do not authorize expansion development.

### Final judgment for the reviewed build

| Category | Score | Evidence and practical limit |
| --- | ---: | --- |
| Environmental composition and scale | 8.1 | Each region has a distinctive palette, architecture and ecology. Mire's bells, water and willows and the Crown's ivory/teal hanging lights are especially coherent. The last pass gives towns different floor zones and clears the crew's standing space around Frost/Crown landmarks. Repeated floor patterns remain conspicuous across large clearings; some enlarged landmarks look softer than the actors. Sparse caves still trail the strongest battle compositions. |
| Sprite identity and animation consistency | 8.4 | Kaida, Vex and Rune remain recognizable in portraits, four-phase directional walking and authored combat poses. Stable feet and fixed source scale preserve stature through crouch/hurt/down. Enemy families have distinct silhouettes and materials. Short pose libraries remain visible in some transitions; dense scenery can weaken otherwise clean silhouettes. |
| UI identity and legibility | 8.5 | The restrained ink, ivory, teal and amber atlas, serif headings and compact instrument labels form a consistent identity. The revised Party page fits all three complete records; vendor comparisons include lost stats; saved locations use human-readable names. The four-digit battle HP issue is fixed. |
| ATB readability and feel | 8.4 | Actual approach/contact/recovery reads clearly in the eight earned encounters. Revised pairs and Concord Dawn express different actions, and giant spells stay in their own lanes. Timing, resource use and target results agree. The system is forgiving on the tested prepared route; tests cannot establish subjective challenge for every player. |
| Keyboard usability | 8.5 | Movement, interactions, battle targeting, dialogue choices, services and seven-tab navigation work through production input. The previously inaccessible later quest records now scroll with arrows and paging keys. Remaining platform/rebinding combinations beyond the documented desktop checks are not claimed. |
| Narrative coherence | 8.2 | Solo motivation leads to two earned recruitments, four relay conflicts, a separate Herald and Architect, a resolved final answer and a playable homecoming. All three personal branches conclude and persist. The door/shelter metaphor is consistent but sometimes repeated too neatly; ordinary residents have less changing dialogue than the central crew. |
| Settlement and progression depth | 8.1 | Eight productive building types, four civic tiers, tiered services, equipment tradeoffs and the final housing prerequisite have actual consequences. The complete route needs no repeat-fight grind. The revised courts and domestic arrangements give settlements more local identity. Shared resources, repeated service furniture and generous late resources/unused skill points still limit how distinct their economic decisions feel. |

The game has a complete, functioning base-campaign loop in the measured route. **This is not a claim that every category has reached the brief's 8.5 target.** No reproducible crash, progression softlock, blocked ending or inaccessible required UI remains in the reviewed paths. The unresolved issues are principally visual composition, local variety and depth, rather than a missing final chapter.

### Concrete defects found and rechecked

The initial final pass exposed visible enclosed checker patches in Emberline cactus arms, arch openings and banner rigging; duplicate resident Vex/Rune after recruitment; Rune's four-digit HP overlapping its label; a clipped Party equipment row; and keyboard input that never scrolled the later quest records. Those were correctness problems, not matters of taste. Fresh production captures verify clean Emberline openings, one recruited companion per town, separated HP columns, the complete Rune row, and usable quest scrolling. The original evidence is retained, rather than silently overwritten by the fixes.

The focused UI run loaded the earned aftermath. Party content now fits its 748-pixel viewport. Quests PageDown moved to 636, End to 1,131, ArrowDown to 135, and Home/ArrowUp returned to zero. Each shop hero selector changed the actual comparison, including four Kaida rows whose replacements lose Strength; Glass Needle correctly reports −31. The save page displays Haventide. This run had zero browser errors. The combat owner's corrected earned Crown contact was independently inspected and Rune's `1132/1132` is legible at the unchanged font size.

The new domestic sheet replaces the former market-stall-in-a-house composition with a bed, stove, table, desk, pantry, chair, bookshelf and lantern in a coherent wood/brass/teal language. The cave's bright double outline has been removed. Orbital's battle floor now reads as compacted snow rather than a vertical wall. A quieter ashen Crater lane separates the Ember Lord's dark body more clearly. Frost's large listener base moved away from the road.

The last independent recapture confirms that the additional composition changes are visible: Haventide's stone court, Emberline's sand and woven runner, Anchor Nine's wood/winter stone court and the Crown's branching ivory paths now have different arrangements. Rich lanterns replace the plain beige posts. Haventide and Frost houses have different keepers and furniture placement, and pickup chests have wood, brass and a readable lid. Forest has a quieter approach clearing and more deliberate edge trees. Most decisively, the same Frost/Crown viewpoints now show the crew standing on clear ground instead of within a cluster of trunks or atop tall branches. All four actual smith approaches and the four reviewed interior entries still worked.

Ordinary follower spacing now visibly separates the crew better. The southbound production sequence measured Vex roughly 73–74 native pixels and Rune 145–146 pixels behind Kaida, with all three correctly facing south. The northbound sample collided with a small ruin before Rune finished the corner; it is retained in the log and **does not establish sustained northbound motion**. Door arrivals still compress the trail, as the cave entry captures show. Earlier unobstructed directional-walk evidence establishes front/back pose identity; this last run specifically supports the increased spacing and clear southbound silhouettes.

The later collapse captures also resolve the earlier down-pose presentation gap: the Scrapper visibly slumps and the Architect's armillary visibly folds before transition. The passing state log alone would not prove that; the rendered collapse frames do.

### Ranked remaining corrections

1. **Give caves stronger local composition.** Their wall materials now differ and the old bright floorplan-like rim is gone, but the reviewed entries remain broad, spare, right-angled repeated-floor corridors. The Crown gallery's reused mossy workshop looks inherited from the coast. Smaller purposeful activity zones, regional furnishings and more irregular edge structure would bring these weaker spaces toward the craft of the domestic rooms and battle arenas.
2. **Reduce broad texture repetition and oversized landmark dependence.** Forest's approach clearing is quieter now, but surrounding moss still has a visible repeated cadence; snow, sand, wood and stone repeat just as clearly across other large surfaces. Some enlarged props have softer edges than the crisp actors. Additional irregular floor patches and more deliberate landmark viewing distances would improve hierarchy. This is a regional composition limit, not an uncorrected missing texture or source-alpha defect.
3. **Make local communities matter beyond recognizable services.** The revised courts and house arrangements resolve the near-identical layouts. The same smith/inn/shop furniture remains common across distant communities, and the shared resource pool means their economies behave similarly. More local activity and consequences of rebuilding would strengthen their individuality without removing useful service recognition.
4. **Deepen optional decisions without adding mandatory grind.** The tested route finishes forty distinct encounters with three spell heals, one item use and no losses. It reaches level 42 and Transcendent without repeated clears or paid training. More optional tactical/economic tradeoffs could make defense, inventory and late civic investment matter more often; mandatory XP farming would weaken the existing pace. The straightforward final moral resolution could also benefit from more ordinary residents visibly living with its consequences.

The latest clean campaign measured **2,273.62 simulated seconds (37m54s), 29.77 wall-clock seconds, 40 distinct battles, zero losses/errors, all three heroes level 42, tier 4, completed ending and homecoming**. This accelerated harness follows efficient known routes, makes legal combat decisions quickly, and advances dialogue immediately. It does not measure human reading, exploration, deliberation or total completion time. It establishes that the authored progression is attainable without grant shortcuts or farming, not that the adventure is a 38-minute human playthrough. The ending is only complete after the actual return action; the future level-40 contract remains unavailable and unauthorized for expansion play.

Evidence for this pass:

- [All eight regions and sampled action timelines](../evidence/final-art-review.json), [earned campaign saves](../evidence/earned-campaign-saves.json), [clean route result](../evidence/campaign-browser.json)
- [Twenty-one focused recaptures](../evidence/final-art-review-revision.json), [repeatable review harness](../tests/final-art-review.mjs)
- [Final twenty-two-view recheck and follower positions](../evidence/final-art-review-polish.json), [clear Frost standing space](../evidence/critic-polished-frost_canyon-world.png), [clear Crown standing space](../evidence/critic-polished-last_crown-world.png), [quieter Forest approach](../evidence/critic-polished-forest_veil-world.png)
- [Haventide court](../evidence/critic-polished-haventide-market.png), [Emberline court](../evidence/critic-polished-emberline-market.png), [Anchor Nine court](../evidence/critic-polished-orbital_reach-market.png), [Crown court](../evidence/critic-polished-last_crown-market.png)
- [Coastal domestic room](../evidence/critic-polished-hav_house_door-interior.png), [Frost domestic room](../evidence/critic-polished-frost_house_door-interior.png), [remaining gallery composition limit](../evidence/critic-polished-crown_cave_door-interior.png), [separated southbound crew](../evidence/critic-polished-crew-down-0.png)
- [Mire atmosphere](../evidence/critic-final-mire_bog-world.png), [Forest approach limitation](../evidence/critic-final-forest_veil-world.png), [Forest battle composition](../evidence/critic-final-forest_veil-battle-contact.png)
- [Emberline clean openings](../evidence/critic-revised-emberline-world.png), [Orbital battle floor](../evidence/critic-revised-orbital_reach-battle-contact.png), [Crater separation](../evidence/critic-revised-crater_ember-battle-contact.png)
- [Domestic room revision](../evidence/critic-revised-hav_house_door-interior.png), [cave revision](../evidence/critic-revised-forest_cave_door-interior.png), [Frost overlap before final correction](../evidence/critic-revised-frost_canyon-world.png), [Crown overlap before final correction](../evidence/critic-revised-last_crown-world.png)
- [Keyboard regression evidence before correction](../evidence/ui-scroll-critic-before.json), [revised UI assertions](../evidence/ui-revision-critic.json), [complete Party page](../evidence/critic-revised-keyboard-tab-2.png), [equipment tradeoffs](../evidence/critic-ui-vendor-comparisons.png), [save names](../evidence/critic-ui-save-display.png)
- [Readable late-game HP](../evidence/hp-hud-earned-crown-contact.png), [Scrapper collapse](../evidence/defeat-rust_scrapper-02.png), [Architect collapse](../evidence/defeat-void_architect-02.png), [collapse timeline log](../evidence/defeat-art.json)

## User-reported alpha defects — targeted correction

The user's later screenshots revealed white/checker islands on Kaida and NPCs that this review had missed. The previous broad claims about clean extraction were too strong. The cause was RGB sources with enclosed background and glow-tinted checker pixels; the neutral exterior flood did not cover either case completely. The import now includes measured background seeds and narrowly bounded thresholds around affected effects, preserving costume/weapon highlights. Original source PNGs were not repainted or replaced.

The final targeted audit covers eleven atlases, 95 transparent-gap probes, 27 retained bright-detail probes, three unchanged true-alpha pixel arrays, 32 actual gameplay captures and a final actual town-canopy follow-up. All pass with zero browser errors. I inspected the actual Kaida thrust/cast/hurt/down/victory, Concord trio, party and six vendor portraits. The large white cape, hair, arm, blade and canopy islands are gone. The independent combat reviewer also checked the corrected gait sheets and retained face/weapon detail. See [alpha-extraction-audit.md](alpha-extraction-audit.md) for exact scope, commands, source hashes, failure disclosure and evidence. This focused fix does not by itself rerate unrelated composition or narrative categories.
