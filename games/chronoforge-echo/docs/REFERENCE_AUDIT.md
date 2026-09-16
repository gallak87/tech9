# Reference audit

Read the original `src/game.js`, `world.js`, `scenes.js`, `travel.js`, `city.js`, `base.js`, `battle.js`, `progression.js`, `menu.js`, `audio.js`, `sprites.js`, CONCEPT.md, REVAMP.md, and relevant historical QA/design notes. Reference was run without source changes on local port4310 using bundled Node24.19.0. Echo has independent dependencies and save keys.

## Observed play
- Enter starts with three heroes mechanically present; only Kaida walks onscreen. Captured `evidence/reference-world.png` and `reference-party.png`.
- WASD moves across a backdrop with broad passability. Main map and minimap show encounter/loot markers outside immediate explored terrain. Echo explicitly removes these leaks.
- A vacant Haventide construction plot at (8,16) opens the picker with C (`reference-building-picker.png`). Town-center interactions at (12,20) do not expose functional vendors in this revision.
- Walking east to the patrol starts ATB (`reference-combat-audited.png`). Readiness, basic attack and tech structures exist. The arena is sparse, and character/enemy art do not share a consistent scale/material treatment.
- Escape opens the exact seven tabs. Keyboard routing for inventory/skills/settings is incomplete in the reference.

## Traceable retained coverage
| System | Source | Echo requirement / evidence |
|---|---|---|
| Kaida/Vex/Rune stats, equipment, XP | progression.js HERO_DEFS/ITEM_DEFS | Separate levels and ownership; solo start, earned recruitment; progression tests |
| 17 reference equipment IDs | progression.js ITEM_DEFS | All retained in content.js, consumables and new gear families added |
| 18 enemies / five threat tiers | battle.js ENEMY_TEMPLATES | All retained plus actual Void Architect; combat/content tests |
| Eight regions and branch backbone | world.js MAPS | Same physical graph; 5760×2520 outdoors; world/path validation |
| Attack, tech, support, ATB | battle.js | Stable ready queue, wait mode, ally targeting, pair/triple eligibility, authoritative timeline |
| Food/ore/energy/renown and tier ladder | base.js BUILDINGS/TIER_UP_REQS | Shared resources, productive structures, functional training/research/defenses; no circular tier gate |
| Equipment swaps and loot | progression.js / scenes.js | Inventory counts, sale exclusion for equipped gear, unique ledgers |
| Map/Party/Inventory/Skills/Quests/Save/Settings | menu.js | Exact tab order; all operations support keyboard and mouse |
| Persistence | progression.js saveGame/loadGame | Independent versioned namespace, three slots plus checkpoint, corruption recovery |

## Deliberate corrections
Original XP multiplies by1.55 each level; replaced by linear per-level cost for a reasonable level40. Original town arrival grants access; Echo guards must be defeated. Original collision is disabled for backdrops; Echo terrain and object footprints govern movement. Original Walls are explicitly cosmetic and research creates circular prerequisites; Echo defenses affect combat and civic gates are acyclic. Original final quest targets the Herald; Echo resolves only after the separate Architect encounter and ending. Original travel calls ordinary gateways chrono-rifts; Echo has physical roads and restrained threshold fades. Time travel is not implemented.

Historical claims of working features were treated as leads, not proof. Original `agents/qa-output.md` includes source-only checks and stale phase stubs; those do not establish playability in this delivery.

## Acceptance evidence still owned by this build
Actual keyboard/mouse browser flow, full campaign integration, all side branches, world traversal/door footage, collision coverage, screenshots and animated action sequences, measured performance, and independent critique. The first rendered art pass was rejected as too sparse; user correction raised native resolution from768×432 to960×540 and the character target from22×32 to roughly48×72+. Asset quality remains subject to in-engine evidence.
