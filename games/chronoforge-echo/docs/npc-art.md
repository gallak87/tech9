# NPC art and identity atlas

All 36 local vendors, residents, and refuge hosts have separate generated appearances. Their world sprite and portrait use the same authored identity and the same source character. Story Mara, Tavi, and Keeper keep the original atlas frames 0, 2, and 4 respectively; these are reserved for those people and no longer reused for town services. Hero art is unchanged.

## Source and prompts

Generated using the built-in `image_gen` tool, in five cast sheets, with one initial generation per sheet. Sources are copied unchanged to `public/assets/npcs/`; the full prompt set and original generated file paths are in [npc-art-prompts.json](npc-art-prompts.json). The reference was the existing `haventide-civilians-source.png`, used for proportions and style only. Daro received one identity correction to remain an older white-haired mechanic.

The generator returned RGB PNGs with a painted checkerboard despite requests for alpha, including one correction attempt. A final background-only edit per sheet produced a neutral backdrop. The shipped originals remain RGB; the established `neutral-exterior` import creates runtime transparency, with measured seeds for enclosed gaps. We did not claim an alpha source file or silently alter source pixels. No recolored/shared body stands in for a distinct local.

## Crop and portrait rules

`src/npc-art.js` supplies exact source sizes and per-person body/portrait rectangles. Body feet stay anchored at the NPC position, at 72 logical pixels tall. Portrait crops are square to preserve proportions; faces are framed toward the upper body. A few sheets place adjacent rows close enough that their rectangular bounds touch. `isolateComponent:true` tells the importer to retain only the largest connected alpha silhouette from each crop, removing neighboring hair/feet fragments. Both world rendering and portrait rendering then use that same isolated frame, with portrait coordinates translated to the crop. Source PNGs remain untouched.

## Identity map

Frame indexes are zero based, in reading order (4 columns, 2 rows). Town sheets have seven people and one empty cell. The refuge sheet has eight people.

| Atlas source | Frame | Identity key |
| --- | ---: | --- |
| `assets/npcs/haventide-source.png` | 0 | `haventide_provisions` |
| `assets/npcs/haventide-source.png` | 1 | `haventide_smith` |
| `assets/npcs/haventide-source.png` | 2 | `haventide_inn` |
| `assets/npcs/haventide-source.png` | 3 | `haventide_archivist` |
| `assets/npcs/haventide-source.png` | 4 | `haventide_artificer` |
| `assets/npcs/haventide-source.png` | 5 | `haventide_trainer` |
| `assets/npcs/haventide-source.png` | 6 | `haventide_resident` |
| `assets/npcs/emberline-source.png` | 0 | `emberline_provisions` |
| `assets/npcs/emberline-source.png` | 1 | `emberline_smith` |
| `assets/npcs/emberline-source.png` | 2 | `emberline_inn` |
| `assets/npcs/emberline-source.png` | 3 | `emberline_archivist` |
| `assets/npcs/emberline-source.png` | 4 | `emberline_artificer` |
| `assets/npcs/emberline-source.png` | 5 | `emberline_trainer` |
| `assets/npcs/emberline-source.png` | 6 | `emberline_resident` |
| `assets/npcs/orbital_reach-source.png` | 0 | `orbital_reach_provisions` |
| `assets/npcs/orbital_reach-source.png` | 1 | `orbital_reach_smith` |
| `assets/npcs/orbital_reach-source.png` | 2 | `orbital_reach_inn` |
| `assets/npcs/orbital_reach-source.png` | 3 | `orbital_reach_archivist` |
| `assets/npcs/orbital_reach-source.png` | 4 | `orbital_reach_artificer` |
| `assets/npcs/orbital_reach-source.png` | 5 | `orbital_reach_trainer` |
| `assets/npcs/orbital_reach-source.png` | 6 | `orbital_reach_resident` |
| `assets/npcs/last_crown-source.png` | 0 | `last_crown_provisions` |
| `assets/npcs/last_crown-source.png` | 1 | `last_crown_smith` |
| `assets/npcs/last_crown-source.png` | 2 | `last_crown_inn` |
| `assets/npcs/last_crown-source.png` | 3 | `last_crown_archivist` |
| `assets/npcs/last_crown-source.png` | 4 | `last_crown_artificer` |
| `assets/npcs/last_crown-source.png` | 5 | `last_crown_trainer` |
| `assets/npcs/last_crown-source.png` | 6 | `last_crown_resident` |
| `assets/npcs/house_keepers-source.png` | 0 | `hav_house_keeper` |
| `assets/npcs/house_keepers-source.png` | 1 | `ember_house_keeper` |
| `assets/npcs/house_keepers-source.png` | 2 | `forest_house_keeper` |
| `assets/npcs/house_keepers-source.png` | 3 | `mire_house_keeper` |
| `assets/npcs/house_keepers-source.png` | 4 | `crater_house_keeper` |
| `assets/npcs/house_keepers-source.png` | 5 | `orbital_house_keeper` |
| `assets/npcs/house_keepers-source.png` | 6 | `frost_house_keeper` |
| `assets/npcs/house_keepers-source.png` | 7 | `crown_house_keeper` |

## Focused verification

`tests/npc-art.browser.mjs` is the local dev import fixture (run against Vite, default port 4335). It loads the actual manifest/importer and renders all 36 bodies through `drawWorld` and all portraits through `drawPortrait`. The single focused run passed; each keyed sheet was 68–78% transparent. All bodies/portraits were visually inspected for correct person, complete feet, proportional heads, clean backdrop, and adjacent-cell fragments.

Evidence: [cast.png](../evidence/npc-art/cast.png), [report.json](../evidence/npc-art/report.json). Actual town/service/dialogue checks belong to [npc-identity-audit.md](npc-identity-audit.md), not a duplicate playthrough here.
