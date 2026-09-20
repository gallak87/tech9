# Art and interface direction

## World and characters

Use detailed three-quarter orthographic artwork, consistent top-left light, grounded feet and readable silhouettes. Quiet walkable surfaces contrast with denser scenery. Large objects need enough source detail for their displayed size; stretching an existing prop does not make a new landmark. Leave clear approaches to doors, encounters and points of interest. Solid footprints follow trunks, foundations and gate pillars rather than the entire painted silhouette.

Regional materials and dominant hues carry through outdoor scenery, caves, furnishings and town upgrades:

| Region        | Materials and accents                                               |
| ------------- | ------------------------------------------------------------------- |
| Haventide     | Coastal limestone, jade water, weathered wood, teal cloth and brass |
| Emberline     | Ochre sandstone, copper, rust cloth and caravan furnishings         |
| Forest Veil   | Deep foliage, mossy stone, roots and living signal growth           |
| Mire Bog      | Dark wet wood, reeds, copper and submerged ruins                    |
| Crater Ember  | Basalt, ash, iron and molten orange                                 |
| Orbital Reach | Snow, pale masonry, cobalt cloth and silver machinery               |
| Frost Canyon  | Blue-white ice, glacial stone and warm rescue lights                |
| Last Crown    | Pale garden architecture, plum cloth and platinum                   |

Town restoration changes contents and capability as well as the finish: scarce supplies and improvised tools become repaired services, powered equipment, then advanced food production and civic systems. Keep service positions and walkable routes consistent across levels. NPCs remain independent live actors.

Kaida's magenta hair and slender sword, Vex's faceless violet hood and staff, and Rune's broad ivory armor and shield remain distinct at gameplay size. Preserve each character's proportions across poses. Enemy identities need distinct silhouettes, not just different colors.

Animation is purposeful: gait, anticipation/contact/recovery, cloth, water and environmental glints. Overworld running does not blur character sprites. Upgrade reveals zoom slightly only outside; the interior before/after comparison holds the same camera and crew. Restrained motion preserves readable feedback without zoom or particles.

## Interface

The seven expedition tabs are Map, Party, Inventory, Skills, Quests, Save and Settings. Parchment belongs inside the menu. Use Barlow for controls, names and numbers, and EB Garamond for parchment prose and headings; fonts are bundled locally.

World HUD, shops, conversations and combat use compact neutral near-black surfaces. Lava orange (`#df702e`) identifies focus and active actions. Maintain readable text, modest spacing and keyboard access. Place vendor-specific actions beside the vendor introduction with a concise explanation and actual completion progress. Show benefits and exact costs before a purchase.

Retail item cards own their quantity controls, total price, and inline Buy/Sell confirmation. Keep the action area stable when switching to Confirm/Cancel. Unaffordable purchases are greyed out and skipped by keyboard navigation; reducing an excessive quantity remains possible. Keep the current ore balance visible in the shop header above the dimmed world. Transaction results use a toast that does not move the shop contents or steal focus.

In Sell mode, place Sell All beside Sell on each card. It selects that item's full unequipped stack and replaces the same buttons with Confirm/Cancel; show the exact quantity, total proceeds, and per-item resale value before payment.

Use the same floating result toast for services, construction, civilization advancement, Skills, Save, and Settings. Successes fade; failures remain until dismissed or the panel is left. Replace repeated results instead of stacking them, and combine XP and level-ups into one training result. Keep requirements beside disabled actions and resource balances visible within service panels. Key capture replaces its binding label; no notification belongs above the scrolling page. Rest leaves its panel open. Inventory retains its existing reserved status area.

Interaction prompts follow their world object and stay within the viewport. Signs use a text reader without inventing a speaker portrait. Esc/Backspace dismiss the top reading layer without firing a choice or continuation callback; a suspended ending retains its place.

Battle commands fold through character, action, target and timing. Completed choices remain recoverable with Left. Use the authoritative combat state for readiness, costs and targets. Timing cues turn orange only during the input window; reduced motion uses a steady cue. Reward notices share one compact queue with clear icons and quantities.

Enemy badges show the visible fighter’s level and name on one line, using relative-danger colors against Kaida. A severe encounter also has a skull so color is not the only signal. Ground ovals follow the scene perspective, with a small forgiving contact margin, and disappear when contact is inactive.

## Asset maintenance

`src/assets.js` is the authoritative live source manifest. Measured crops, foot anchors, scales and extraction settings live in the corresponding `*-art.js`, `*-frames.js` and manifest modules. Query `node scripts/asset-inventory.mjs` when dimensions, byte counts or hashes are needed; do not commit duplicate inventories.

Keep original selected PNGs in `public/assets/`. Crop and interpret transparency at runtime: preserve real alpha, use connected neutral-background extraction only where required, and protect pale interior highlights with measured thresholds/seeds. Apply neighboring-frame exclusions to the affected crop, not the shared sheet. Floor materials remain opaque. Retain a shared atlas while any of its frames are live.

Inventory item artwork lives in `public/assets/inventory/`, with measured source bounds in `src/inventory-icon-manifest.js`. It covers weapons, armor, accessories, and consumables. Preserve each item's identity and silhouette, top-left lighting, and real transparency; omit labels, frames, and backgrounds from the source art. Weapons must read as swords for Kaida, full-length staves for Vex, and armored gauntlets for Rune. Party, vendors, and rewards share the Inventory weapon icons; combat and resource icons retain their existing rendering. Weapon equipment does not swap artwork on the character sprites.

Cave interior exits use independent transparent sources in `public/assets/world/cave-exits/`, with measured crops and front-step anchors in `src/cave-exit-art.js`. Match each region's entrance materials and accents, with an open passage toward the exterior. Mount exits on the entry chamber's north wall, with the threshold just inside the walkable floor. Arrivals face south below the doorway, clear of its trigger; walking north into the doorway returns outside. Keep exit artwork separate from the entrance, field-station, and floor atlases.

Use the logical world scale independently of image/backing resolution. Raw extraction stays at source resolution; filtered rendering uses the higher-resolution backing surface. Town interior layouts, renderers and crop metadata are separate so an art change does not silently change collision geometry or service access.

Generated project art and code-drawn effects are self-contained at runtime. Fonts retain their bundled licenses. Only selected live sources are tracked. Keep candidate/rejected variants, generation scripts and review copies inside the local Git-ignored `.experiments/` folder. On graduation, promote only the live assets and required code; periodically delete the remaining scratch material.
