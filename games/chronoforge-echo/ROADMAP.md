# Roadmap

- [ ] Revisit and extend each vendor’s story arc and completion milestones.
- [ ] Fix Kaida’s clipped victory pose; likely regenerate her full sprite set for consistent appearance and framing rather than replacing only the victory pose.

## Menu and HUD identity — implemented, awaiting hands-on review

The user approved the character-centered menu composition with parchment interiors and a separate folding battle interface. The full design is implemented in the playable game, including all seven menu tabs and real ATB state. Compact field dialogs, object-anchored prompts, relocated HUD information, faster reward notices and generated resource/item icons are integrated. See [the accepted UI direction](docs/UI_DIRECTION.md) and [verification evidence](docs/VERIFICATION.md).

Parchment belongs only inside the menu. Overworld and combat interfaces use compact, neutral near-black surfaces, with lava orange replacing gold interface outlines. The next review is a full in-game sweep by the user after implementation and verification.

## TODO — Revisit Party and Inventory overlap

Party and Inventory repeat the hero selector, centered character art, equipped slots, and vitals; their main distinction is the stats summary versus the pack and item actions. Revisit whether these should be combined or given clearer, complementary purposes. Keep the character-centered presentation in mind when exploring options.

The direction is undecided and needs a later user review. This item records the overlap only; no tab removal, merger, or redesign is selected yet.

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
