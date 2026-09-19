# Roadmap

- [ ] Revisit and extend each vendor’s story arc and completion milestones.
- [ ] Review overlapping smith, archivist, and artificer stock and roles; decide whether to consolidate vendors before a dedicated shop redesign.
- [ ] Add more town centers along the campaign routes, with progressively stronger local stock and useful recovery stops. Choose locations and level bands during world planning; give vendors distinct roles within each town, with selective overlap between towns. Coordinate with the vendor redesign and traversal pacing pass.
- [ ] Fix Kaida’s clipped victory pose; likely regenerate her full sprite set for consistent appearance and framing rather than replacing only the victory pose.
- [ ] Add bounded enemy patrols as the next separate encounter pass, keeping danger cues aligned with movement and routes readable.
- [ ] Revisit whether encounters should forbid retreat; undecided, keep current retreat rules until reviewed separately.
- [ ] Animate Crater Ember’s lava with a natural sense of flow and heat.
- [ ] Revisit Forest Veil’s semicircular tree groves and traversal; explore dense woodland with connected clearings and readable paths.
- [x] Complete the weapon-family pass: swords for Kaida, staves for Vex, gauntlets for Rune; four-tier progression, optional hero filtering, required vendor/loot adjustments, automatic legacy-save conversion, and replacement art for mismatched weapons. User playtest accepted on 2026-09-19 after importing an existing save, checking inventory filters and equipment, and confirming ATB works. Character artwork remains fixed.
- [ ] Retire the temporary weapon-family save migration after the compatibility window (review in early October 2026). Keep current equipment validation; remove the conversion module and legacy-load writeback once existing players' saves have upgraded.

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
