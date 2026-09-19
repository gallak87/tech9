import { HEROES, ITEMS } from './content.js';

export const WEAPON_PROGRESSIONS = {
  kaida: ['iron_blade', 'signal_saber', 'magma_blade', 'horizon_edge'],
  vex: ['void_shard', 'glass_needle', 'void_scepter', 'concord_staff'],
  rune: ['rune_gauntlet', 'anchor_hammer', 'ash_gauntlet', 'harbor_aegis'],
};

const FAMILY_LABELS = {
  sword: 'Sword',
  staff: 'Staff',
  gauntlet: 'Gauntlets',
};

export function canEquip(heroId, itemId) {
  const hero = HEROES[heroId],
    item = ITEMS[itemId];
  if (!hero || !item) return false;
  if (item.slot === 'weapon') return item.weaponFamily === hero.weaponFamily;
  return item.slot === 'armor' || item.slot === 'accessory';
}

export function weaponOwner(itemId) {
  const item = ITEMS[itemId];
  if (item?.slot !== 'weapon') return null;
  return (
    Object.values(HEROES).find(
      (hero) => hero.weaponFamily === item.weaponFamily,
    )?.id || null
  );
}

export function weaponFamilyLabel(itemId) {
  return FAMILY_LABELS[ITEMS[itemId]?.weaponFamily] || '';
}
