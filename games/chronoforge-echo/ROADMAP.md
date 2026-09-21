# Roadmap

- [x] Separate regional Community Restoration from Haventide’s economic settlement: three local projects each, independent art/progression, optional quest records, and one unique community weapon per hero with hometown reforges at levels 10/20/30/40. Preserve the caravan arc, ordinary Transcendent gear, and existing saves.
- [x] Graduate Community Restoration after the initial player pass (2026-09-19): restoration and the current-level reward are accepted; completed rewards now show a persistent receipt and a direct inventory shortcut.
- [ ] Continue Community Restoration playtesting during iteration: compare towns at different levels; skip/watch project reveals; reforge while equipped and from the pack; reload autosave and export/import. Check outdoor workstation placement, icon readability, small-window layout, and temporary world-preview feedback.
- [x] Apply the four existing equipment colors consistently across Inventory, Party, shops, rewards, and quests: Survivor uses a 30%-opacity white tint with fully opaque text; Reclaimer green; Ascendant purple; Transcendent blue.
- [x] Give the three community weapons a persistent lava-orange outline/tint and a single power-band badge.
- [x] Add an explicit level-40 reforge to Exotic for community weapons only; cap initial gifts at Transcendent and retain four civilization tiers. The final reforge is a separate action, costs 40 ore / 20 energy, and preserves equipped or packed ownership through saves/imports.
- [ ] Tune regional project costs and Exotic stat tradeoffs after playtesting; keep all three arcs optional and Haventide the sole passive-income settlement.
- [ ] Revisit broader quest completion and unlock feedback after the community pass; community progress/gifts now have explicit panel and journal records, but other story arcs retain their current presentation.
- [ ] Revisit and extend each vendor’s story arc and completion milestones.
- [x] Consolidate each town's retail into smiths (weapons/armor) and provisions (accessories/consumables), with regional equipment tiers and automatic weapon comparisons. Archivists retain research; artificer counters remain closed with their stations preserved.
- [ ] Finish regional shop playtesting: most Buy/Sell flows accepted on 2026-09-19; verify transaction autosaves after reloading, per-card Sell All confirmation, and tier-scaled resale values. Check remaining regional stock, armor/accessory comparisons, and research/closed-workshop dialogs.
- [ ] Playtest shared dialog feedback: rest, training, research, construction/advancement, Skills, Save and key rebinding; verify stable scroll/focus, success expiration, persistent dismissible errors, and disabled actions with visible requirements.
- [ ] Decide a future role for the preserved artificer stations before reopening their counters.
- [ ] Add more town centers along the campaign routes, with progressively stronger local stock and useful recovery stops. Choose locations and level bands during world planning; give vendors distinct roles within each town, with selective overlap between towns. Coordinate with the vendor redesign and traversal pacing pass.
- [ ] Fix Kaida’s clipped victory pose; likely regenerate her full sprite set for consistent appearance and framing rather than replacing only the victory pose.
- [x] Implement bounded enemy patrols: four town guards pace within 64 world units, ordinary enemies range up to 240, and the introduction/caves use 100. Bosses and defeated encounters remain stationary; sprites, badges, and swept contact share live positions.
- [x] Add one regional supply-chamber encounter to each of the eight caves, with safe arrivals and accessible field records / companion stories.
- [ ] Playtest patrol cadence, guard restraint, ordinary route readability, and cave combat pacing; review walk/battle identity at gameplay scale.
- [ ] Revisit whether encounters should forbid retreat; undecided, keep current retreat rules until reviewed separately.
- [ ] Animate Crater Ember’s lava with a natural sense of flow and heat.
- [ ] Revisit Forest Veil’s semicircular tree groves and traversal; explore dense woodland with connected clearings and readable paths.
- [x] Complete the weapon-family pass: swords for Kaida, staves for Vex, gauntlets for Rune; four-tier progression, optional hero filtering, required vendor/loot adjustments, automatic legacy-save conversion, and replacement art for mismatched weapons. User playtest accepted on 2026-09-19 after importing an existing save, checking inventory filters and equipment, and confirming ATB works. Character artwork remains fixed.
- [ ] Retire the temporary weapon-family save migration after the compatibility window (review in early October 2026). Keep current equipment validation; remove the conversion module and legacy-load writeback once existing players' saves have upgraded.

## Patrol movement — implemented, player review pending

The [implementation plan and checklist](ENEMY_PATROL_PLAN.md) records behavior, cave groups, art provenance, and validation. On 2026-09-21, the user authorized autonomous generation and headless playtesting while away.

The Drone Sentinel / Mutant Hound / Gravbot pilot led to ten referenced directional walk sheets, with hover reuse for Drone Sentinel, Neon Cultist, Frost Revenant, and Wraith Core. All 19 enemy identities now have durable authoring records in `art/enemy-prompts.json`; exact historical prompts were recovered for 18. Rust Scrapper's original wording is explicitly unavailable. The read-only prompt helper resolves current canonical art for regeneration.

Forty encounters patrol: 32 outdoors and eight in caves. Routes are validated against final collision and keep cave story access clear. Bosses, one-off story encounters, and defeated encounters stay still. Patrol state is transient and isolated between the real expedition and developer trips. Existing pause and protection rules apply, including relative swept contact and safe loading near a patrol.

Validation passed: 304 Node tests, 48 headless integration assertions, production build, and both deployment mounts. All ten sheets were compared with battle art at gameplay scale. The remaining gate is the user's subjective review of gait, identity details, and pacing. Pursuit, changes to retreat rules, moving bosses, and additional cave groups remain deferred.

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
