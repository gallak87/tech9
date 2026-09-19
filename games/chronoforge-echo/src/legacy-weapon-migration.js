import { ITEMS, TECHS } from './content.js';
import { canEquip, WEAPON_PROGRESSIONS } from './equipment.js';
import { stats } from './progression.js';

// Temporary bridge for saves predating weapon families (2026-09-19).
// Called only after save validation; remove after the legacy-save support window.
export function migrateWeaponFamilies(state) {
  if (state.equipmentRevision === 1) return;
  const updateHero = (hero) => {
    const weapon = hero.equip.weapon;
    if (weapon && !canEquip(hero.id, weapon))
      hero.equip.weapon = WEAPON_PROGRESSIONS[hero.id][ITEMS[weapon].tier - 1];
    const current = stats(hero, state);
    hero.hp = Math.min(hero.hp, current.maxHp);
    hero.mp = Math.min(hero.mp, current.maxMp);
    return current;
  };
  for (const hero of state.heroes) updateHero(hero);
  const battle = state.suspendedBattle;
  if (battle) {
    for (const hero of battle.heroes) Object.assign(hero, updateHero(hero));
    const updateCommand = (command) => {
      if (
        command?.kind === 'tech' &&
        ['anchor_blow', 'harbor_break'].includes(command.id)
      ) {
        command.stat = TECHS[command.id].stat;
        command.power = TECHS[command.id].power;
      }
    };
    updateCommand(battle.pending);
    updateCommand(battle.action?.returnSelection?.pending);
    if (battle.action?.side === 'hero' && !battle.action.resolved)
      updateCommand(battle.action.command);
  }
  state.equipmentRevision = 1;
}
