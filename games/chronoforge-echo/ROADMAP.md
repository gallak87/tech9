# Roadmap

## Menu and HUD identity — implemented, awaiting hands-on review

The user approved the character-centered menu composition with parchment interiors and a separate folding battle interface. The full design is implemented in the playable game, including all seven menu tabs and real ATB state. Compact field dialogs, object-anchored prompts, relocated HUD information, faster reward notices and generated resource/item icons are integrated. See [the accepted UI direction](docs/UI_DIRECTION.md) and [verification evidence](docs/VERIFICATION.md).

Parchment belongs only inside the menu. Overworld and combat interfaces use compact, neutral near-black surfaces, with lava orange replacing gold interface outlines. The next review is a full in-game sweep by the user after implementation and verification.

## Time travel — unapproved

Time travel is a **secondary postgame arc: awaiting the user's review and explicit approval after completion of the base game**. It is unavailable in this delivery. No eras, story, locations, cast, antagonists, objectives, assets, or expansion gameplay have been designed or implemented.

Development authorization is exclusively a later explicit user approval. No test, level, completion flag, or critic review grants it.

The future player eligibility contract is `campaignComplete && Kaida.level >= 40`. Both conditions are required, in either order. Eligibility alone does not make content available; this build always reports expansion availability as false.

Stable IDs, a versioned save, declarative conditions, a default-era region registry, and namespaced content registration are the only reserved seams.
