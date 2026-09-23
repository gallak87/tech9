import { preparedIcon } from './prepared-icon.js';

// Original generated PNGs retain their alpha. Bounds include alpha >= 8 plus six source pixels.
// All five quality tiers reuse the corresponding community weapon source.
export const COMMUNITY_ICON_ASSETS = [
  {
    id: 'inventory_duneglass_blade',
    itemId: 'duneglass_blade',
    source: 'assets/inventory/duneglass_blade-source.png',
    width: 1254,
    height: 1254,
    bounds: [16, 8, 1227, 1230],
    kind: 'inventoryIcon',
    columns: 1,
    rows: 1,
    required: true,
  },
  {
    id: 'inventory_rescue_gauntlets',
    itemId: 'rescue_gauntlets',
    source: 'assets/inventory/rescue_gauntlets-source.png',
    width: 1254,
    height: 1254,
    bounds: [43, 21, 1174, 1213],
    kind: 'inventoryIcon',
    columns: 1,
    rows: 1,
    required: true,
  },
  {
    id: 'inventory_orchard_staff',
    itemId: 'orchard_staff',
    source: 'assets/inventory/orchard_staff-source.png',
    width: 1024,
    height: 1536,
    bounds: [50, 21, 918, 1480],
    kind: 'inventoryIcon',
    columns: 1,
    rows: 1,
    required: true,
  },
].map(preparedIcon);
