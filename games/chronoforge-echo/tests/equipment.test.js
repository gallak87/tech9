import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, ITEMS, TECHS, ENEMIES } from '../src/content.js';
import {
  canEquip,
  weaponOwner,
  weaponFamilyLabel,
  WEAPON_PROGRESSIONS,
} from '../src/equipment.js';
import {
  createState,
  recruit,
  equip,
  stats,
  serviceAvailable,
  serviceStock,
  buy,
} from '../src/progression.js';

function crew() {
  const state = createState();
  recruit(state, 'vex');
  recruit(state, 'rune');
  return state;
}

test('weapons have exactly one eligible hero; armor and accessories stay shared', () => {
  for (const item of Object.values(ITEMS)) {
    const eligible = Object.keys(HEROES).filter((id) => canEquip(id, item.id));
    if (item.slot === 'weapon') {
      assert.equal(eligible.length, 1, item.id);
      assert.equal(weaponOwner(item.id), eligible[0]);
      assert.equal(item.weaponFamily, HEROES[eligible[0]].weaponFamily);
      assert.ok(weaponFamilyLabel(item.id));
    } else {
      assert.equal(
        eligible.length,
        item.slot === 'consumable' ? 0 : 3,
        item.id,
      );
      assert.equal(weaponOwner(item.id), null);
      assert.equal(weaponFamilyLabel(item.id), '');
    }
  }
  assert.equal(canEquip('unknown', 'iron_blade'), false);
  assert.equal(canEquip('kaida', 'unknown'), false);
  assert.equal(weaponOwner('unknown'), null);
});

test('equipping the wrong weapon family cannot change inventory, gear, HP or MP', () => {
  const state = crew();
  for (const item of Object.values(ITEMS).filter(
    (item) => item.slot === 'weapon',
  )) {
    state.inventory[item.id] = 2;
    for (const hero of state.heroes) {
      if (canEquip(hero.id, item.id)) continue;
      const before = structuredClone(state);
      assert.equal(equip(state, hero.id, item.id).ok, false);
      assert.deepEqual(state, before);
    }
  }
});

test('each hero has four affordable canonical tiers with meaningful primary-stat upgrades', () => {
  const state = crew();
  for (const hero of state.heroes) {
    const progression = WEAPON_PROGRESSIONS[hero.id],
      primary = hero.id === 'vex' ? 'int' : 'str';
    assert.equal(progression.length, 4);
    assert.equal(HEROES[hero.id].weapon, progression[0]);
    assert.equal(canEquip(hero.id, hero.equip.weapon), true);
    let previous = 0;
    for (const [index, id] of progression.entries()) {
      const item = ITEMS[id];
      assert.equal(item.tier, index + 1);
      assert.equal(item.price, [30, 80, 155, 260][index]);
      assert.ok(item.stats[primary] - previous >= 5, id);
      state.inventory[id] = 1;
      const before = stats(hero, state)[primary];
      assert.equal(equip(state, hero.id, id).ok, true);
      if (index) assert.ok(stats(hero, state)[primary] > before, id);
      previous = item.stats[primary];
    }
  }
});

test('regional smiths offer every weapon family at their local tier', () => {
  const state = crew();
  state.heroes[0].level = 40;
  state.buildings.forge = 1;
  state.buildings.research_lab = 1;
  state.resources.ore = 9999;
  const regions = ['haventide', 'forest_veil', 'crater_ember', 'last_crown'];
  for (let tier = 1; tier <= 4; tier++) {
    state.tier = tier;
    const service = 'smith',
      stock = serviceStock(state, service, regions[tier - 1]);
    assert.equal(serviceAvailable(state, service), true);
    for (const progression of Object.values(WEAPON_PROGRESSIONS)) {
      const id = progression[tier - 1];
      assert.ok(stock.includes(id), `${service} at tier ${tier}: ${id}`);
      assert.equal(buy(state, id).ok, true);
    }
    assert.ok(stock.every((id) => ITEMS[id].tier <= tier));
  }
  assert.deepEqual(serviceStock(state, 'archivist', 'emberline'), []);
  assert.deepEqual(serviceStock(state, 'artificer', 'emberline'), []);
  assert.equal(ENEMIES.gravbot.drop, 'anchor_hammer');
  assert.equal(ENEMIES.neon_cultist.drop, 'glass_needle');
});

test('gauntlet upgrades improve Rune attacks and Technique-based protection', () => {
  const state = crew(),
    rune = state.heroes.find((hero) => hero.id === 'rune');
  rune.level = 12;
  assert.equal(TECHS.anchor_blow.stat, 'str');
  assert.equal(TECHS.anchor_blow.power, 2.1);
  assert.equal(TECHS.harbor_break.stat, 'str');
  for (const id of ['aegis_field', 'bulwark', 'temporal_wall', 'open_horizon'])
    assert.equal(TECHS[id].stat, 'tec');
  let previous;
  for (const id of WEAPON_PROGRESSIONS.rune) {
    state.inventory[id] = 1;
    assert.equal(equip(state, 'rune', id).ok, true);
    const current = stats(rune, state);
    if (previous) {
      assert.ok(current.str > previous.str);
      assert.ok(current.tec > previous.tec);
      assert.ok(current.def > previous.def);
    }
    previous = current;
  }
});
