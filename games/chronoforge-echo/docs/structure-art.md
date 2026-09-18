# Structure sprite pass — 2026-09-17

Replaced the active polygon listening dish and cottage-with-drawn-wheels caravan with two individually generated sprites. These are separate transparent PNGs, not a sheet. Exact prompts, built-in generator source paths and project paths are in [structure-art-prompts.json](structure-art-prompts.json).

## Audit and disposition

The audit followed `drawProp` / `drawLandmark` branches into authored `world.js` placements across all eight regions, then inspected the four replacements and eight remaining named landmark candidates in the running game.

| Candidate | Actual previous rendering | Disposition |
| --- | --- | --- |
| Haventide `hav_dish` | Flat canvas polygons and lines | New listening dish sprite |
| Emberline `ember_lens` | Desert ring proxy for the same dish type | Same dish sprite at authored 1.5× size |
| Emberline `ember_caravan`, Frost Canyon `frost_rescue` | Regional cottage plus primitive drawn wheels | New expedition caravan sprite |
| Mire bell and masts | Detailed bell shrine and bell-post sprites from the mire atlas | Keep existing artwork |
| Crater furnace, Orbital elevator | Detailed furnace and tether machinery from their biome atlases | Keep existing artwork |
| Frost listeners | Detailed snowbound signal lantern tower | Keep existing artwork |
| Last Crown hand and palace | Detailed organic shrine and building artwork | Keep existing artwork |
| Emberline bones | Detailed desert ruin arch | Keep existing artwork; naming alone is outside this placeholder pass |
| Rings, arches, trees, caves, houses, civic buildings | Detailed regional/building atlases | Keep existing artwork |
| Consoles, camp lights, signs, loot, interior furnishings | Existing generated prop/sign/domestic atlases | Keep existing artwork |

No runtime SVG structures were found. Remaining primitive fallback functions require missing atlases; these atlases are required by boot, so they are not the normal in-game rendering path. Terrain, shadows, water, bird and particle effects are deliberately excluded.

## Integration

- `src/structure-art.js` registers both sprites in `ASSET_MANIFEST` through `src/assets.js`. They use the same base-relative asset loading as other art, including GitHub Pages subpaths.
- Source PNGs are copied unchanged with original RGBA alpha. Measured source-frame metadata trims only transparent margins at draw time. No white/checkerboard background, alpha keying or generated terrain rectangle is added.
- The listening dish is 178 logical pixels high at size 1; the observatory retains its 1.5× size. The caravan is 208 logical pixels high. Anchors meet the base of the pedestal and front wheel ground line, respectively. Existing world positions and event IDs remain unchanged.
- Foreground occlusion for these two sprite types uses their actual projected image bounds instead of the generic landmark rectangle. The existing translucent foreground pass preserves visibility when the player walks behind the dish or canvas.
- Solid footprints cover the ground-contact area only: dish 70×25 logical pixels, observatory dish 105×37.5, caravans 170×55. The overhanging artwork remains walkable. The existing `Game.load` safe-point recovery handles older saves placed inside these newly solid bases.
- Mara’s caravan resident moved to the right side of the wagon (140 logical pixels from its anchor), where the roof no longer conceals the NPC. The conversation and NPC ID are unchanged.

## Verification

The focused dev review used the existing `?test=1` camera/state fixture for direct scene access and the unmodified renderer/loader. It was not a full campaign playthrough.

- Inspected all four replacement placements at 1440×810; all 72 required assets loaded without errors.
- Held ArrowUp stopped Kaida at each visible base. Positions beneath the upper artwork remained walkable.
- Saved and loaded at each new footprint center; all four saves recovered to a walkable point 16 pixels south, instead of freezing the player in the prop.
- The observatory console's standing position and proximity interaction remained accessible.
- Inspected the remaining eight named candidates and confirmed they already use detailed generated art.
- Separately checked the caravan resident using normal F interaction after its placement adjustment.

The parent integration pass verified the production build at all four placements through normal saved-game loading, without development render hooks. All 61 automated tests passed. Strict static-server browser checks passed at both the root and GitHub Pages mounts, loading all 72 art assets and five font faces without HTTP or browser errors.
