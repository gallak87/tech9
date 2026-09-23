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

Haventide’s economic buildings and each regional community have independent visual progress. Regional projects reuse their biome’s interior furnishings at small outdoor worksites: prepared supplies become operating workstations, while the town exterior and hall progress through the existing four art stages. Keep fixed footprints and open road approaches; regional construction supplies local services and keepsakes rather than passive currency.

Kaida's magenta hair and slender sword, Vex's faceless violet hood and staff, and Rune's broad ivory armor and shield remain distinct at gameplay size. Preserve each character's proportions across poses. Enemy identities need distinct silhouettes, not just different colors.

Animation is purposeful: gait, anticipation/contact/recovery, cloth, water and environmental glints. Overworld running does not blur character sprites. Upgrade reveals zoom slightly only outside; the interior before/after comparison holds the same camera and crew. Restrained motion preserves readable feedback without zoom or particles.

## Interface

The seven expedition tabs are Map, Party, Inventory, Skills, Quests, Save and Settings. Parchment belongs inside the menu. Use Barlow for controls, names and numbers, and EB Garamond for parchment prose and headings; fonts are bundled locally.

World HUD, shops, conversations and combat use compact neutral near-black surfaces. Lava orange (`#df702e`) identifies focus and active actions. Maintain readable text, modest spacing and keyboard access. Place vendor-specific actions beside the vendor introduction with a concise explanation and actual completion progress. Show benefits and exact costs before a purchase.

The field currency bar keeps balances prominent with a muted source hint underneath: building level and combined production per second, including Town Center bonuses and salvage. Renown names its quest and battle sources. Keep hints short enough to share the existing row.

Retail item cards own their quantity controls, total price, and inline Buy/Sell confirmation. Keep the action area stable when switching to Confirm/Cancel. Unaffordable purchases are greyed out and skipped by keyboard navigation; reducing an excessive quantity remains possible. Keep the current ore balance visible in the shop header above the dimmed world. Transaction results use a toast that does not move the shop contents or steal focus.

In Sell mode, place Sell All beside Sell on each card. It selects that item's full unequipped stack and replaces the same buttons with Confirm/Cancel; show the exact quantity, total proceeds, and per-item resale value before payment.

Use the same floating result toast for services, construction, civilization advancement, Skills, Save, and Settings. Successes fade; failures remain until dismissed or the panel is left. Replace repeated results instead of stacking them, and combine XP and level-ups into one training result. Keep requirements beside disabled actions and resource balances visible within service panels. Key capture replaces its binding label; no notification belongs above the scrolling page. Rest leaves its panel open. Inventory retains its existing reserved status area.

Community restoration follows Haventide’s summary panel and compact upgrade rows: project names, costs, unmet requirements, and inline Confirm/Cancel. Omit repeated descriptions and local-level captions. Keep balances visible above the world scrim. The completion reward names the weapon, owner, and Exotic rarity from the first award. Show a disabled unchecked box with “Complete [final project] to receive”; after the automatic award, check it and label it “Received,” with a direct inventory link. Present future reforging separately, with stat improvements, cost and next hero-level requirement. The three community weapons keep a lava-orange outline, subtle orange surface tint and one orange Exotic badge in Inventory, Party, shops, reward notices, restoration panels, and their quest records. Never show an ordinary blue/purple/green/white badge on these weapons; one weapon illustration persists through all forge ranks.

Interaction prompts follow their world object and stay within the viewport. Signs use a text reader without inventing a speaker portrait. Esc/Backspace dismiss the top reading layer without firing a choice or continuation callback; a suspended ending retains its place.

Battle commands fold through character, action, target and timing. Completed choices remain recoverable with Left. Use the authoritative combat state for readiness, costs and targets. Timing cues turn orange only during the input window; reduced motion uses a steady cue. Reward notices share one compact queue with clear icons and quantities.

Tall battle enemies fit beneath their name and health meters at their existing formation anchors. Keep enemy panels inside the field and clear of neighboring silhouettes and meters; draw them after the actors so later sprites cannot cover them.

Enemy badges show the visible fighter’s level and name on one line, using relative-danger colors against Kaida. A severe encounter also has a skull so color is not the only signal. Ground ovals follow the scene perspective, with a small forgiving contact margin, and disappear when contact is inactive.

Item rarity badges share one palette across Inventory, equipped gear, vendors, quest rewards, and loot notices: Survivor white, Reclaimer green, Ascendant purple, Transcendent blue, and the three community weapons Exotic orange. Ordinary items use the menu's neutral card surfaces and borders; do not tint their whole cards or add rarity-colored edges. Reserve persistent lava-orange outlines and the subtle orange surface tint for Exotic items. Keep ordinary focus/selection styling independent of rarity and use darker badge text on parchment. Exotic rarity is immediate and permanent, independently of each weapon’s forge strength. Only those three weapons have the explicit level-40 reforge beyond ordinary gear’s power ceiling; that improvement retains their existing Exotic badge. Civilization and ordinary equipment retain four bands.

## Mobile interface

Use one movement stick with contextual Interact, Run/Walk, Map and Menu buttons. Portrait reserves a lower thumb zone with the player above it; landscape uses lower corners. Keep controls at comfortable CSS sizes across orientations instead of shrinking them with the world: the current stick zone is 118 pixels, primary buttons are at least 48 pixels high, and body text is around 16 pixels. Respect safe areas and changing browser bars. Optional sizing, handedness and portrait zoom must keep readable text and non-overlapping hit targets.

Mobile battle uses a compact readiness/HP crew strip and one active Crew → Action → Target → Timing card, with a short selection breadcrumb. Put it below the arena in portrait and beside it in landscape. Back revisits choices; Execute commits the selected target; Strike/Guard needs a fresh press on a stable timing surface. Incoming Guard temporarily takes priority without losing a valid pending command. Preserve the same flow on rotation. Menus fill the available screen, scroll normally and expose explicit Return/Leave controls; hide keyboard legends without disabling keyboard support.

## Asset maintenance

Retain selected authoring PNGs under tracked `art/sources/`, outside the public build. Inventory and resource/combat originals live in its `inventory/` and `icons/` directories; prepared 256×256 PNGs ship at the existing public paths. Authoring bounds remain in each manifest entry's `authoring` record. Preserve the original crop, padding, silhouette and alpha when preparing replacements.

For 52 selected keyed assets, the public PNG already contains the existing neutral-background extraction. These sprites retain their original dimensions. Preserve the measured extraction settings in the manifest's authoring record; frame-specific masks and exclusions still run normally. Provenance records identify retained originals separately from their prepared runtime counterparts.

Original regional ground PNGs live in `art/sources/ground/`; the eight public atlases contain their finished 256px runtime tiles. The original crop, regional water tint and Forest Veil/Crater Ember seam processing are baked once; prepared tiles remain opaque. Other ground/interior/cave materials keep their existing preparation.

`src/assets.js` is the authoritative live source manifest. Measured crops, foot anchors, scales and extraction settings live in the corresponding `*-art.js`, `*-frames.js` and manifest modules. Query `node scripts/asset-inventory.mjs` when dimensions, byte counts or hashes are needed; do not commit duplicate inventories.

Keep selected PNGs in `public/assets/`. Lossless OxiPNG recompression with default settings preserves their decoded pixels and dimensions while reducing download sizes; optimize selected assets before committing them so development and production serve the same files. When a provenance record includes a file hash and byte count, retain the original values in its optimization record and refresh the current values. Use the selected preparation tools for baked assets and the runtime path for unprepared sources: preserve real alpha, use connected neutral-background extraction only where required, and protect pale interior highlights with measured thresholds/seeds. Apply neighboring-frame exclusions to the affected crop, not the shared sheet. Floor materials remain opaque. Retain a shared atlas while any of its frames are live.

Enemy regeneration starts from `art/enemy-prompts.json` and the current canonical battle sheet, not prompt wording alone. From this game directory, `node scripts/enemy-art-prompt.mjs --check` validates coverage and `node scripts/enemy-art-prompt.mjs mutant_hound` emits a referenced generation brief. Regenerate a complete four-phase, three-direction grounded movement sheet and compare it against battle idle and Kaida at gameplay scale before promotion. Selected movement sources live in `public/assets/enemies/walk/`; `enemy-walk-frames.js` owns the 120 measured crops, shared row baselines and fixed scales per direction. Keep exact prompt/reference/generator provenance in the registry rather than a separate completed plan.

The ten current grounded sheets have their neutral-background extraction baked into the public PNGs; the retained generated RGB originals contain painted checkerboards. Preserve the measured extraction thresholds and seeds, silhouette, identity and foot anchors when replacing art. Drone Sentinel, Neon Cultist, Frost Revenant and Wraith Core reuse neutral battle art with hover motion. Boss status belongs to the encounter, so ordinary Mire Warden and Neon Cultist encounters can move while boss encounters remain stationary. Historical prompts and the selected obsidian Gravbot identity are retained in the registry; Rust Scrapper's unavailable original wording is explicitly marked.

Inventory item artwork lives in `public/assets/inventory/`, with measured source bounds in `src/inventory-icon-manifest.js`. It covers weapons, armor, accessories, and consumables. Preserve each item's identity and silhouette, top-left lighting, and real transparency; omit labels, frames, and backgrounds from the source art. Weapons must read as swords for Kaida, full-length staves for Vex, and armored gauntlets for Rune. Party, vendors, and rewards share the Inventory weapon icons; combat and resource icons retain their existing rendering. Weapon equipment does not swap artwork on the character sprites.

The community weapons use three dedicated sources in `community-icon-manifest.js`: Duneglass Blade combines amber desert glass and copper; Rescue Gauntlets use pale metal and cobalt; Orchard Staff uses pale living branches, platinum, and plum crystal. All fifteen forge variants reuse these three sources with real alpha and measured crops.

Cave interior exits use independent transparent sources in `public/assets/world/cave-exits/`, with measured crops and front-step anchors in `src/cave-exit-art.js`. Match each region's entrance materials and accents, with an open passage toward the exterior. Walking into the exterior cave mouth automatically enters; its trigger sits between the solid jambs above the front steps. Mount exits on the entry chamber's north wall, with the threshold just inside the walkable floor. Arrivals face south below the doorway, clear of its trigger; walking north into the doorway returns outside. Keep exit artwork separate from the entrance, field-station, and floor atlases.

Fill the solid space outside cave floors with the region's existing wall rock tiles under a dark neutral shade. Keep the wall edges brighter so the walkable floor and exits remain clear.

Use the logical world scale independently of image/backing resolution. Raw extraction stays at source resolution; filtered rendering uses the higher-resolution backing surface. Town interior layouts, renderers and crop metadata are separate so an art change does not silently change collision geometry or service access.

Generated project art and code-drawn effects are self-contained at runtime. Fonts retain their bundled licenses. Selected runtime assets and the authoring originals needed to reproduce them are tracked. Keep candidate/rejected variants, generation scripts and review copies inside the local Git-ignored `.experiments/` folder. On graduation, promote only the live assets and required code; periodically delete the remaining scratch material.
