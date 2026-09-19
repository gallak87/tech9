# Haventide interior restoration

Haventide's town hall uses four production asset kits selected by the real
Town Center level. These are independently placed floors, runners, wall bays,
columns and furnishings, with live NPCs and interaction points. The room is
not a flattened concept image.

## Restoration progression

- Survivor: scarce ration supplies, salvaged tools, patched work surfaces,
  makeshift rest facilities and incomplete civic records.
- Reclaimer: reliable provisions, repaired equipment, proper beds and organized
  workshops and records.
- Ascendant: abundant trade, food preservation, specialized powered machinery
  and established civic services.
- Transcendent: food-growing systems, advanced fabrication, sophisticated
  navigation and a flourishing, comfortable coastal town.

Artwork follows building level. Civilization tier still controls service
availability. Locked service bays contain stored supplies and have no vendor;
renovating the room cannot bypass gameplay unlocks.

## Playable layout

The hall stays 1600 × 1125 world units, with a clear central aisle from its
existing entrance. Six service bays occupy the perimeter, and the settlement
planning desk sits to the right of the entrance aisle. Mara, the resident and
the ending beacon remain reachable. Furniture and column footprints participate
in normal movement and click-path collision. Tall pieces use foreground fading
when the crew walks behind them. Staff are separate character sprites standing
beside their counters, never painted into an image.

Every level shares the same circulation and service anchors. The room's floor,
architecture, equipment and stock improve around those anchors. Existing saves
use the ordinary safe-arrival check if an old position overlaps moved furniture.
No save schema, shop prices, stock rules or quest conditions are changed.

## Upgrades and art

Real upgrades use the same production renderer as normal exploration. The
[cinematic](upgrade-cinematic.md) renders the previous and restored hall from
the transaction's before/after snapshots, keeping camera and crew identical. Haventide's
local art panel can also cycle these levels while indoors without changing saves.

Selected immutable sprite sheets are in [public/assets/interiors](../public/assets/interiors/).
Measured crops and background extraction settings are in
[haventide-interior-art.js](../src/haventide-interior-art.js). The opaque floor
sample bypasses extraction. Other pieces use crop-local transparency processing;
no extracted PNG copies are stored. [Layout](../src/haventide-interior-layout.js)
and [renderer](../src/haventide-interior-renderer.js) keep art scale separate from
screen resolution and walking geometry.

Checks cover all production source crops, route connectivity, each service's
approach and staff position, unchanged entry/exit anchors, shared upgrade
geometry, retained unlocks and alpha extraction. No game, dev server or user
browser is launched during this work; gameplay inspection remains with the user.
