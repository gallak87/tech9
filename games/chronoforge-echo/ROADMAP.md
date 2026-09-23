# Roadmap

- [x] Implement mobile play: joystick/run controls, portrait and landscape world/battle layouts, touch menus/maps, interruption recovery, and optional regional asset loading. Desktop keeps full upfront loading. Automated touch, all-region travel, recovery and production-path checks pass.
- [x] Follow up mobile startup on 2026-09-23: restrict the loading picker to phones/small windows, start full loading immediately on larger desktops, show asset-count progress with short category/location names, and paint a dark indeterminate loader before application modules arrive.
- [x] Fix manual engagement of arrival-protected enemies: loading beside an uncleared patrol no longer leaves both automatic contact and Interact unavailable. Explicit Engage/Confront remains opt-in; cleared-fight replays also pass mobile browser checks. Player confirmation on the originally reported save is still pending.
- [ ] Player-review mobile controls, portrait/landscape battle readability and cold/warm map transitions on a real phone. On first phone boot choose Full atlas or Mobile on demand (pilot); keep on-demand loading optional until its transition feel and sustained memory/heat are accepted.
- [ ] Finish the requested loading refinements: prepare the minimum mobile startup bundle while the picker is open, and show consistent destination/category progress during map preparation. Current startup waits for Continue; cold travel shows a text-only hold after a short delay, with no progress bar. Preserve desktop eager loading and fast warm transitions; see the mobile handoff below.
- [x] Losslessly recompress all 177 live PNGs with OxiPNG 10.2.1 default settings (2026-09-23). Total PNG size fell from 356.63 MiB to 337.50 MiB, saving 19.13 MiB (5.36%); the Haventide mobile bundle fell from 158.59 MiB to 149.93 MiB. All decoded RGBA pixels and dimensions are unchanged; 365 Node tests and production packaging checks pass. Optimized files remain at their existing paths in `public/assets/`, so local development and Pages use the same assets without an extra build dependency. Recorded provenance retains the original hashes and sizes alongside refreshed current values. No format conversion, runtime loading change or Git-history rewrite.
- [ ] Player-review cold loading with the optimized PNGs under local network throttling, using the same loading mode and disabled browser cache. This pass uses default OxiPNG only; lossless WebP and background extraction at build time remain separate future options.
- [x] Run five bounded asset-delivery experiments independently against the post-OxiPNG baseline; save each result on its own branch. See the size audit below.
- [ ] Choose which experiment branches to adopt and in what order. Inventory icons remain the likely first win; none of the candidate branches is merged here.
- [ ] Revisit story and dialogue after the current town/Kaida playtest: develop three sample scenes and distinct character voices before choosing the scope of a campaign rewrite. See the deferred story plan below; no narrative rewrite is part of this town update.
- [x] Separate regional Community Restoration from Haventide’s economic settlement: three local projects each, independent art/progression, optional quest records, and one unique community weapon per hero with hometown reforges at levels 10/20/30/40. Preserve the caravan arc, ordinary Transcendent gear, and existing saves.
- [x] Graduate Community Restoration after the initial player pass (2026-09-19): restoration and the current-level reward are accepted; completed rewards now show a persistent receipt and a direct inventory shortcut.
- [ ] Continue Community Restoration playtesting during iteration: compare towns at different levels; skip/watch project reveals; reforge while equipped and from the pack; reload autosave and export/import. Check outdoor workstation placement, icon readability, small-window layout, and temporary world-preview feedback.
- [x] Apply the four ordinary rarity colors to badges across Inventory, Party, shops, rewards, and quests: Survivor white, Reclaimer green, Ascendant purple and Transcendent blue. Revised after 2026-09-23 feedback: ordinary cards retain neutral surfaces/borders; only Exotic items have persistent rarity outlines and tint.
- [x] Give the three community weapons a persistent lava-orange outline/tint and a single Exotic badge immediately on award. Corrected after the 2026-09-22 player pass: forge strength no longer changes their displayed rarity, including existing saves, reward text and inventory sorting.
- [x] Add an explicit level-40 power improvement for Exotic community weapons only; cap initial gifts at forge rank 4 and retain four civilization tiers. The currently final reforge is a separate action, costs 40 ore / 20 energy, and preserves equipped or packed ownership through saves/imports. These weapons are already Exotic before this upgrade.
- [x] Player-review immediate Exotic labeling and orange treatment; accepted on 2026-09-22 after the label correction.
- [ ] Decide whether level 40 stays the final reforge or only these three weapons continue improving at levels 50/60; no additional reforge ranks are implemented yet.
- [ ] Tune regional project costs and Exotic stat tradeoffs after playtesting; keep all three arcs optional and Haventide the sole passive-income settlement.
- [ ] Revisit broader quest completion and unlock feedback after the community pass; community progress/gifts now have explicit panel and journal records, but other story arcs retain their current presentation.
- [ ] Revisit and extend each vendor’s story arc and completion milestones.
- [x] Consolidate each town's retail into smiths (weapons/armor) and provisions (accessories/consumables), with regional equipment tiers and automatic weapon comparisons. Archivists retain research; artificer counters remain closed with their stations preserved.
- [ ] Finish regional shop playtesting: most Buy/Sell flows accepted on 2026-09-19; verify transaction autosaves after reloading, per-card Sell All confirmation, and tier-scaled resale values. Check remaining regional stock, armor/accessory comparisons, and research/closed-workshop dialogs.
- [ ] Playtest shared dialog feedback: rest, training, research, construction/advancement, Skills, Save and key rebinding; verify stable scroll/focus, success expiration, persistent dismissible errors, and disabled actions with visible requirements.
- [ ] Decide a future role for the preserved artificer stations before reopening their counters.
- [x] Complete the four new road towns in Forest Veil, Mire Bog, Crater Ember, and Frost Canyon: distinct exterior/staff art, smith/provisions/inn services, clear approaches and discovery-based return travel. Keep the existing four equipment bands across pairs of towns, capped by civilization progression rather than discovery order or hero level.
- [ ] Player-review the new town placements, indoor staff/door access, paired shop bands and return travel on an existing save, including reaching a later town before its strongest stock unlocks.
- [ ] Design optional local improvements for the new road towns after the service/placement pass. Basic shops and rest remain available without rebuilding; preserve the main campaign, the three existing community weapon arcs, Haventide's economy and Mara's trade/rest rewards.
- [x] Replace only Kaida’s clipped victory pose, following the revised single-pose choice: regenerate from her canonical identity reference and current showcase style, preserve the complete raised sword, and keep every other pose on its existing source.
- [ ] Player-review Kaida’s replacement victory pose for identity, stature, framing and transitions in battle. Static source/crop/alpha checks and render comparison are complete; no game playtest was performed for this replacement.
- [x] Implement bounded enemy patrols: four town guards pace within 64 world units and caves use 100. Ordinary outdoor enemies, including the opening Scrapper, follow authored roads up to 650 units in either direction, reversing at safe endpoints. Bosses and defeated encounters remain stationary; sprites, badges, and swept contact share live positions.
- [x] Add one regional supply-chamber encounter to each of the eight caves, with safe arrivals and accessible field records / companion stories.
- [ ] Playtest patrol cadence, guard restraint, ordinary route readability, and cave combat pacing; review walk/battle identity at gameplay scale.
- [ ] Revisit whether encounters should forbid retreat; undecided, keep current retreat rules until reviewed separately.
- [ ] Animate Crater Ember’s lava with a natural sense of flow and heat.
- [ ] Revisit Forest Veil’s semicircular tree groves and traversal; explore dense woodland with connected clearings and readable paths.
- [x] Complete the weapon-family pass: swords for Kaida, staves for Vex, gauntlets for Rune; four-tier progression, optional hero filtering, required vendor/loot adjustments, automatic legacy-save conversion, and replacement art for mismatched weapons. User playtest accepted on 2026-09-19 after importing an existing save, checking inventory filters and equipment, and confirming ATB works. Character artwork remains fixed.
- [ ] Retire the temporary weapon-family save migration after the compatibility window (review in early October 2026). Keep current equipment validation; remove the conversion module and legacy-load writeback once existing players' saves have upgraded.

## Asset delivery — proposed work, order to be decided

Captured 2026-09-23 after the default OxiPNG pass. The objective is to reduce download size and time until play while retaining the approved artwork. The user will choose adoption scope and order later. Candidate implementations are saved on the independent branches below; inventory icons remain the likely first slice. Loading-picker/progress UI work remains separate.

### Independent experiment results

All five branches start directly from **`d88e4c67`**, the post-OxiPNG baseline on `g/asset-compress`. Baseline PNG size is **337.50 MiB**; desktop initially loads all of it, while Haventide mobile on-demand initially loads **149.93 MiB**. Values below are PNG payload sizes (1 MiB = 1,048,576 bytes), not repository size or JavaScript/font totals. Every row is compared independently with that same baseline.

| Candidate                                 | Saved branch / commit                            | All PNGs (MiB) | PNG saving (MiB) | Initial desktop PNGs (MiB) | Initial mobile PNGs (MiB) |
| ----------------------------------------- | ------------------------------------------------ | -------------: | ---------------: | -------------------------: | ------------------------: |
| 38 inventory icons at 256px               | `codex/echo-exp-inventory-256` / `cddbac5a`      |         294.72 |            42.78 |                     294.72 |                    107.15 |
| 20 resource/combat icons at 256px         | `codex/echo-exp-resource-icons-256` / `ec848b87` |         316.36 |            21.14 |                     316.36 |                    128.79 |
| 52 sources with existing extraction baked | `codex/echo-exp-baked-alpha` / `a2b307c8`        |         299.33 |            38.17 |                     299.33 |                    134.01 |
| 8 ground atlases at runtime resolution    | `codex/echo-exp-ground-tiles` / `5d5b3ba9`       |         321.24 |            16.26 |                     321.24 |                    147.69 |
| Desktop regional loading by default       | `codex/echo-exp-regional-desktop` / `220f6839`   |         337.50 |             0.00 |                     149.93 |                    149.93 |

The desktop-loading branch defers **187.57 MiB** from first boot; it does not shrink the complete game. It exposes Full atlas in desktop Settings and preserves explicit saved choices. Its tradeoffs include cold regional transitions and the existing on-demand cache/eviction limits. Phone loading choices remain unchanged.

The four image experiments retain their selected originals under tracked `art/sources/` outside the public build and include reproducible preparation scripts. In Chrome, all 38 inventory icons, 20 resource icons, 52 extracted sources and 48 finished ground tiles exactly match their respective original renderer outputs. Each image branch passes 365 Node tests, production packaging, fresh-context full/on-demand startup and opening Inventory. The loading-policy branch passes 366 Node tests, all eight regions plus town/cave crossings, full-atlas opt-in, and root/subpath production browser checks.

Size totals were also checked directly against each committed branch's PNG blobs. Fresh-context, unthrottled local Chrome readiness timings are retained as diagnostics, not reliable network-speed comparisons; no physical-phone or throttled performance claim is made. Detailed measurements, per-file byte audits, screenshots and pixel comparisons are disposable files in `.experiments/asset-lab/`.

The four image categories are disjoint: their arithmetic savings sum to **118.35 MiB**, but the implementations have not been merged or tested together. Do not add the desktop deferral to those file-size savings. Each experiment stopped after a concrete win and validation. WebP was omitted as requested; no regeneration was needed. Broader sprite resizing and atlas repacking remain future choices. To try a candidate, switch to its branch and rebuild before previewing; ignored `dist/` does not change when switching branches.

### Adoption review — inventory icons likely first

Use the saved experiment branches as starting points. The unchecked items below describe adoption, integration and player review; they do not require repeating the completed experiments.

The current 38 inventory PNGs occupy 45.06 MiB after OxiPNG. Most are 1254×1254 sources, but `src/inventory-icons.js` immediately crops and resamples them into 256×256 textures after downloading. The 20 resource/combat icons use the same approach in `src/raster-icons.js` and add 22.57 MiB. Together they account for about 45% of the current Haventide mobile bundle. These are baseline measurements, not predicted savings; query `scripts/asset-inventory.mjs` for the current inventory.

- [ ] Review and adopt the prepared inventory candidate, which preserves the measured crops, 94% fit, centering and real alpha at the current 256×256 runtime texture. Check the largest actual UI use and high-density displays before changing that target. Decide whether the 20 resource/combat icons join this slice or follow separately.
- [ ] Adopt the selected branch's retained authoring inputs and reproducible preparation tooling; ship only its derived runtime icons. Required inputs/tooling must remain tracked and independent of `.experiments/`; temporary comparisons and reports belong there.
- [ ] Integrate the selected branch's metadata, loading and packaging changes so prepared icons load directly without a second crop/resample. Preserve item IDs, shared Exotic icon aliases, displayed proportions and all Inventory/Party/vendor/reward uses. Document the resulting authoring/runtime split in Architecture and Art direction when implemented.
- [ ] Compare prepared icons against the existing rendered result at gameplay size, including transparent edges and small details. Measure total and starting-bundle bytes, preparation cost and throttled cold loading before deciding whether to expand this approach.

### Other candidates — intentionally unordered

- [ ] **Size other assets for their actual display use.** Audit characters, enemies, scenery and interiors against their largest rendering scale, portraits, world view and supported backing resolution. Generate suitable runtime variants from retained originals. Avoid a blanket resize that changes frame bounds, foot anchors or visible detail.
- [ ] **Prepare sprite crops and transparency offline.** Reuse the existing extraction thresholds, seeds, frame exclusions and anchors to export finished cutouts and remove unused margins. Preserve pale highlights, real alpha and opaque floor materials. Measure download savings and reduced client preparation work; packing related small sprites into padded atlases is an option to evaluate, not a requirement or one global atlas.
- [ ] **Compare image formats by asset category.** Benchmark PNG against lossless WebP for transparent sprites/icons and controlled lossy WebP for painted scenery. Review quality at actual gameplay size and measure decode time as well as bytes. If using lossy encoding on keyed sources, prepare their transparency first so changed background colors cannot alter extraction. No lossy conversion is selected yet.
- [ ] **Reduce what must download before play.** Review the common and regional dependency groups for assets unnecessary in the initial scene; consider loading later-region or optional-menu art when needed and prefetching likely next destinations. Measure cold crossings and warm returns as well as boot. Desktop currently loads everything and mobile on-demand loading is optional; changing either policy is a separate decision within this candidate.

For each selected slice, compare the same save/scene, loading mode, viewport and throttling profile with browser cache disabled for cold runs. Record transferred bytes and time until control returns; assess decode/preparation time and memory separately from file size. Keep ordinary build checks and targeted asset regressions, with visual/throttled playtesting handled by the user. Vite copies `public/` assets as-is, so preparation must explicitly produce the smaller files. Choose further scope from measured savings and visible quality, without assuming compression ratios or adding a shipping size gate.

## Mobile — implemented, player review pending

Handoff updated 2026-09-23. Current implementation boundaries live in [Architecture](ARCHITECTURE.md#mobile-input-layout-and-asset-lifetime); durable presentation rules live in [Art direction](ART_DIRECTION.md#mobile-interface). Changes are committed locally; do not push unless the user asks.

The user traced the GitHub Pages loading stall to throttled Hawaii Wi-Fi; switching networks allowed loading to complete, and cached requests worked. No speculative timeout/header/retry changes were made. The default OxiPNG asset pass is complete; local throttled-load review is pending. See the compression entries above for measured savings.

The requested preload while the picker is visible and destination progress bars remain unfinished. `main.js` awaits `chooseBootLoading()` before creating/preparing the loader. Startup has named asset-count progress; cold destination preparation only shows text after 0.35 seconds waiting at the fade midpoint. Warm transitions retain the existing 0.55-second fade without an added loading hold. Keep desktop eager loading while completing these refinements.

The reported encounter issue was reproduced specifically by loading beside an uncleared, arrival-protected enemy: contact stayed inactive and Interact was unavailable. Explicit Engage/Confront now works while protection remains. Cleared-fight replays passed before and after this change; confirm the original player's save rather than assuming every replay report shares that cause.

Validation on 2026-09-23: 22 targeted Node tests and `tests/mobile.browser.mjs` pass, including protected engagement, cleared replays, touch controls/menus/combat, all-region travel and desktop eager loading. Initial 2026-09-22 checks additionally covered recovery, cold saved battles, and production boot/Inventory at root and GitHub Pages mounts. These are desktop Chromium/emulation results, not physical-phone acceptance.

Remaining device review:

- Check iPhone/Safari and Android/Chrome in portrait/landscape, browser bars and safe areas, two-thumb use, cancellation, rotation, control reach, and joystick/run feel.
- Check the single battle card with three heroes, four enemies, tall bosses, long technique/item lists, incoming Guard, pause/resume and deliberate fresh timing presses.
- Check shops, restoration, inventory confirmations, actual save file import/export, and returning to an existing expedition.
- Compare cold startup, first/warm/evicted crossings, backtracking, fast travel and interrupted loads on the same device/network. Record time until control returns, missing-art frames, sustained memory/frame pacing and heat.
- Keep mobile loading optional until accepted. Decide whether the common bundle/cache budget, previous-region retention, smaller runtime art or a lower-power option needs adjustment from those measurements. Directional camera look-ahead is also deferred. Native packaging, offline installation, cloud saves, new combat mechanics and a second joystick remain outside this pass.

## Story and dialogue — deferred writing plan

The current script explains its themes too directly, gives several characters the same polished voice, and resolves disagreements and emotional revelations too quickly. Preserve the useful foundations while exploring more specific wants, friction, ordinary details and consequences that develop across multiple scenes.

Three scopes remain available: a dialogue-only pass that preserves every story beat; a character-and-scene rewrite within the existing campaign and assets; or a new campaign built around the existing world. The recommended starting direction is the middle option, retaining the missing keeper, preservation mystery, four relays, regional locations and final confrontation. A full story reboot is an alternative to discuss, not a selected implementation.

- [ ] Write a short voice guide for Kaida, Vex, Rune and recurring residents: what each wants, avoids saying, notices, and does under pressure. Explore Kaida's urgency to find the keeper causing friction, Vex using expertise to avoid personal vulnerability, and Rune showing care through practical habits while slowly learning to trust other people's judgment. These are proposed character directions, not new canon.
- [ ] Draft three sample scenes for player review: the Haventide opening, meeting Vex, and recruiting Rune. Aim for warm adventure, specific character behavior and occasional dry humor; reduce repeated door/road metaphors, speeches that announce the lesson, and instant emotional agreement. Keep objectives understandable without turning every conversation into directions.
- [ ] Review those samples and choose the tone and rewrite scope before applying a campaign-wide pass. Judge whether the crew sounds distinct, has believable reasons to disagree, and makes the player want to keep traveling with them; additional text alone is not the goal.
- [ ] If that direction is selected, revise the main and companion scenes so revelations and relationship changes build over time. Give Kaida meaningful personal stakes and let Vex and Rune's difficulties persist beyond recruitment; retain useful existing story material rather than replacing it automatically.
- [ ] Connect optional town stories to residents with concrete needs, differing interests and later callbacks. Reuse the local-improvement proposals below; make return visits reflect what the player actually helped with. Basic shops/rest stay available, and optional regional rebuilding must not become a requirement for relays, recruitment or the ending.
- [ ] Update journal text, repeat conversations, ending/aftermath variants and `NARRATIVE.md` together with any eventual rewrite. Preserve existing saves, completed-quest/reward ledgers, companion prerequisites, community weapon rewards and Mara's mutually exclusive trade/rest benefits. Dialogue must not assume the player rebuilt settlements they skipped.
- [ ] Validate the eventual rewrite against both the minimal campaign and optional story branches, including out-of-order discoveries, returning after a quest and loading an existing save. Leave visual pacing and dialogue presentation for the user's playtest.

This entry schedules future writing work only. The current town expansion and Kaida victory-pose replacement remain ready for their separate player review.

## Road towns — implemented, player review pending

Four new towns fill the regions that currently have refuges but no shopping centers. Rootrest Hall serves Forest Veil, Reedhaven Exchange serves Mire Bog, Cinderwatch Lodge serves Crater Ember, and Whitepass Refuge serves Frost Canyon. Each adds a smith, provisions merchant, and innkeeper with a distinct identity. Existing houses, camps, quests and regional route gates remain in place. The new towns require no liberation encounter; entering one records discovery for return travel. Original town liberation requirements remain in effect.

Stock ceilings are authored by region, never assigned by the order the player finds towns:

| Equipment band      | Towns                      |
| ------------------- | -------------------------- |
| Survivor / white    | Haventide, Emberline       |
| Reclaimer / green   | Orbital Reach, Forest Veil |
| Ascendant / purple  | Mire Bog, Crater Ember     |
| Transcendent / blue | Frost Canyon, Last Crown   |

The available equipment band is the lower of the town's ceiling and the crew's civilization tier. Consumables include lower unlocked bands. Finding a later town early unlocks its services, not a higher gear band. Character levels, XP, enemy strength and the four ordinary equipment colors remain unchanged. Future stock redistribution is a catalog edit; additional equipment bands would also require item stats, presentation and unlock rules, independently of town geography.

The new towns' four exterior stages can follow civilization tier for this first pass. Haventide's Town Center level and the existing three communities' local restoration levels retain their separate progression. Interior kits reuse established regional artwork; new exterior and twelve staff sprites have referenced generation records in `art/town-center-prompts.json`.

Future optional story hooks are proposals, not implemented quest chains: seed distribution in Forest Veil, remembrance and refuge in Mire Bog, shared tools/heat in Crater Ember, and rescue support in Frost Canyon. These must not gate the relays, companion discoveries or ending. Benefits should complement Mara's global discount/free-rest choice and the existing three communities' signature weapons.

Validation passed: 320 pure Node tests, production compilation, and 189 required files at both the root and GitHub Pages deployment mounts. All sixteen town stages and twelve staff sprites were visually inspected after runtime extraction. Static production-renderer views checked Rootrest Hall's outdoor approach and three-service interior. Geometry and save probes covered incoming routes, service approaches, new-town discovery, old positions beneath new footprints, existing cave/story access, and all 28 longer road patrols. An independent review caught and verified the fix for a developer-map setting blocking the scripted ending homecoming. No game/browser playtest was run for this pass; player review remains open. Temporary captures, generated duplicates and build output were removed after inspection.

## Patrol movement — implemented, player review pending

Current behavior and cave allocation live in [Architecture](ARCHITECTURE.md); regeneration guidance lives in [Art direction](ART_DIRECTION.md#asset-maintenance). On 2026-09-21, the user authorized autonomous generation and headless playtesting while away.

The Drone Sentinel / Mutant Hound / Gravbot pilot led to ten referenced directional walk sheets, with hover reuse for Drone Sentinel, Neon Cultist, Frost Revenant, and Wraith Core. All 19 enemy identities now have durable authoring records in `art/enemy-prompts.json`; exact historical prompts were recovered for 18. Rust Scrapper's original wording is explicitly unavailable. The read-only prompt helper resolves current canonical art for regeneration.

Forty encounters patrol: 32 outdoors and eight in caves. Routes are validated against final collision and keep cave story access clear. Bosses, one-off story encounters, and defeated encounters stay still. Patrol state is transient and isolated between the real expedition and developer trips. Existing pause and protection rules apply, including relative swept contact and safe loading near a patrol.

The first player pass requested longer travel along paths instead of diagonal local roaming. All 28 ordinary outdoor encounters now follow authored road bends; available spans are approximately 450–1,300 units, with the opening Scrapper covering about 506. Patrols start on the road, reverse at endpoints, and walk continuously through intermediate waypoints. Town guards and cave pacing retain their short ranges. Road-following regression checks and a targeted headless opening-patrol check pass; temporary review captures are removed after inspection.

The initial implementation passed 304 Node tests, 48 headless integration assertions, production build, and both deployment mounts. The road-following revision passes 306 Node tests and a targeted headless check of opening-route distance, road adherence, pauses, and the cleared marker, with zero page or asset errors. All ten sheets were compared with battle art at gameplay scale. Continue player review of gait, identity details, and pacing. Pursuit, changes to retreat rules, moving bosses, and additional cave groups remain deferred.

## TODO — Revisit Party and Inventory overlap

Inventory now has a compact crew/loadout column, a wider grid grouped by item type and sorted by descending tier, with stat deltas and Equip/Use actions inside every outlined card. Cards have bounded widths and compact icon/name headers. The crew swapper shows full portraits with names and levels on one line, beside Equipped. Selecting a hero filters their weapons while shared armor, accessories, and consumables remain visible; deselecting shows all crew equipment and the full pack. Space/Enter act on items or toggle filters; [/] cycle the crew filter and its unselected state. Filters persist during browsing and clear on click-away. Every valid consumable use in Inventory requires confirmation.

Party remains the character record, with full stats and equipment shortcuts into Inventory. Defer the longer-term tab merger/separation decision until after using the new inventory flow; no tab removal or merger is selected.

## TODO — World traversal and exploration pacing

Revisit the time spent crossing the large regions, especially quests that send the crew from one end to the other and back. Preserve the sense of a large world while reducing empty travel. This is a future design pass, not an instruction to resize maps in the current update.

- Consider modestly compacting layouts or shortening repeated cross-region routes.
- Place useful consumable pickups and optional discoveries along quieter stretches.
- Give routes more distinctive terrain, scenery, and landmarks so each area feels different.
- Explore small optional non-combat activities or minigames that make travel more interesting without adding chores.

Judge these options by traversal time and meaningful things to discover, rather than adding filler solely to occupy space.

## Time travel — unapproved

Time travel is a **secondary postgame arc: awaiting the user's review and explicit approval after completion of the base game**. It is unavailable in this delivery. No eras, story, locations, cast, antagonists, objectives, assets, or expansion gameplay have been designed or implemented.

Development authorization is exclusively a later explicit user approval. No test, level, completion flag, or critic review grants it.

The future player eligibility contract is `campaignComplete && Kaida.level >= 40`. Both conditions are required, in either order. Eligibility alone does not make content available; this build always reports expansion availability as false.

Stable IDs, a versioned save, declarative conditions, a default-era region registry, and namespaced content registration are the only reserved seams.
