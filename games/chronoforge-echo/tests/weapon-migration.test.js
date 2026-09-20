import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, TECHS } from '../src/content.js';
import { canEquip, WEAPON_PROGRESSIONS } from '../src/equipment.js';
import { createState, recruit, stats } from '../src/progression.js';
import {
  createBattle,
  updateBattle,
  battleIntent,
  battleView,
} from '../src/combat.js';
import {
  SAVE_PREFIX,
  migrate,
  loadState,
  exportSave,
  parseSaveFile,
  importSave,
} from '../src/persistence.js';

function legacyState() {
  const state = createState();
  recruit(state, 'vex');
  recruit(state, 'rune');
  delete state.equipmentRevision;
  state.tier = 3;
  state.playTime = 9876;
  state.resources.ore = 543;
  state.flags.rewardLedger = { old_reward: true };
  state.quests.personal = { stage: 2, claimed: true };
  state.cleared.crater_north = true;
  state.pickups.crater_blade = true;
  state.fog.haventide = { '2,3': 1 };
  state.inventory = { field_tonic: 4, ember_core: 2, horizon_edge: 1 };
  for (const hero of state.heroes) {
    hero.level = 19;
    hero.xp = 43;
    hero.skillPoints = 6;
    hero.hp = 12;
    hero.mp = 7;
  }
  state.heroes[0].equip.weapon = 'ember_core';
  state.heroes[1].equip.weapon = 'horizon_edge';
  state.heroes[2].equip.weapon = 'void_scepter';
  return state;
}

test('legacy equipment changes preserve progression and ownership, once only', () => {
  const original = legacyState(),
    before = structuredClone(original);
  const migrated = migrate(original);
  assert.deepEqual(original, before);
  const expected = structuredClone(original);
  expected.equipmentRevision = 1;
  expected.heroes[0].equip.weapon = 'magma_blade';
  expected.heroes[1].equip.weapon = 'concord_staff';
  expected.heroes[2].equip.weapon = 'ash_gauntlet';
  assert.deepEqual(migrated, expected);
  assert.deepEqual(migrate(migrated), migrated);
});

test('every legacy weapon keeps its tier or stays equipped when already compatible', () => {
  for (const item of Object.values(ITEMS).filter(
    (item) => item.slot === 'weapon' && !item.exotic,
  )) {
    const old = legacyState();
    for (const hero of old.heroes) hero.equip.weapon = item.id;
    const migrated = migrate(old);
    for (const hero of migrated.heroes) {
      assert.equal(
        hero.equip.weapon,
        canEquip(hero.id, item.id)
          ? item.id
          : WEAPON_PROGRESSIONS[hero.id][item.tier - 1],
      );
      assert.equal(ITEMS[hero.equip.weapon].tier, item.tier);
    }
    assert.deepEqual(migrated.inventory, old.inventory);
  }
  const empty = legacyState();
  for (const hero of empty.heroes) hero.equip.weapon = null;
  assert.ok(migrate(empty).heroes.every((hero) => hero.equip.weapon === null));
});

test('load persists the automatic upgrade and portable saves use the same migration', () => {
  const rows = new Map(),
    writes = [];
  const storage = {
    getItem: (key) => rows.get(key) ?? null,
    setItem(key, value) {
      rows.set(key, value);
      writes.push(key);
    },
  };
  const record = {
    game: 'chronforge-echo',
    version: 1,
    savedAt: '2026-09-19T12:00:00.000Z',
    state: legacyState(),
  };
  rows.set(`${SAVE_PREFIX}:1`, JSON.stringify(record));
  const exported = parseSaveFile(exportSave(1, storage));
  assert.equal(exported.state.equipmentRevision, 1);
  assert.equal(writes.length, 0, 'export does not rewrite its source slot');
  const loaded = loadState(1, storage);
  assert.deepEqual(loaded, exported.state);
  assert.equal(
    JSON.parse(rows.get(`${SAVE_PREFIX}:1`)).savedAt,
    record.savedAt,
  );
  assert.deepEqual(writes, [`${SAVE_PREFIX}:1`]);
  loadState(1, storage);
  assert.equal(
    writes.length,
    1,
    'upgraded slots are not rewritten on every load',
  );
  importSave(record, 2, storage);
  assert.deepEqual(loadState(2, storage), loaded);
  assert.equal(
    JSON.parse(rows.get(`${SAVE_PREFIX}:2`)).state.equipmentRevision,
    1,
  );
  assert.deepEqual(parseSaveFile(JSON.stringify(record.state)).state, loaded);
});

test('current saves reject incompatible weapons and malformed revision markers', () => {
  const wrong = legacyState();
  wrong.equipmentRevision = 1;
  assert.throws(() => migrate(wrong), /weapon does not match/);
  for (const revision of [2, -1, '1', null]) {
    const state = createState();
    state.equipmentRevision = revision;
    assert.throws(() => migrate(state), /equipment revision/);
  }
});

test('suspended fights refresh equipment and pending techniques without restarting timing or paying twice', () => {
  const old = legacyState();
  const battle = createBattle(old, {
    id: 'migration_fight',
    enemies: ['gravbot'],
  });
  battle.heroes[2].atb = 99.999;
  updateBattle(battle, old, 0.001);
  battleIntent(battle, old, { kind: 'hero', id: 'rune' });
  battleIntent(battle, old, { kind: 'command', index: 1 });
  const index = battleView(battle, old).techs.findIndex(
    (tech) => tech.id === 'anchor_blow',
  );
  battleIntent(battle, old, { kind: 'list', index });
  battle.pending.stat = 'tec';
  battle.pending.power = 1.8;
  old.suspendedBattle = battle;
  const pending = migrate(old).suspendedBattle;
  assert.equal(pending.mode, 'target');
  assert.equal(pending.pending.stat, 'str');
  assert.equal(pending.pending.power, TECHS.anchor_blow.power);
  battleIntent(battle, old, { kind: 'execute' });
  updateBattle(battle, old, battle.action.windowStart + 0.01);
  battle.heroes[2].str = 1;
  battle.heroes[2].tec = 999;
  const before = structuredClone(battle),
    rng = old.rng;
  const migrated = migrate(old),
    resumed = migrated.suspendedBattle;
  for (const hero of resumed.heroes) {
    assert.equal(canEquip(hero.id, hero.equip.weapon), true);
    const current = stats(hero, migrated);
    for (const [key, value] of Object.entries(current))
      assert.equal(hero[key], value);
    const original = before.heroes.find((member) => member.id === hero.id);
    for (const key of [
      'hp',
      'mp',
      'atb',
      'shield',
      'slowTurns',
      'guarding',
      'home',
    ])
      assert.deepEqual(hero[key], original[key]);
  }
  const expectedAction = structuredClone(before.action);
  expectedAction.command.stat = 'str';
  expectedAction.command.power = TECHS.anchor_blow.power;
  assert.deepEqual(resumed.action, expectedAction);
  assert.deepEqual(resumed.enemies, before.enemies);
  assert.deepEqual(resumed.readyQueue, before.readyQueue);
  assert.equal(resumed.clock, before.clock);
  assert.equal(migrated.rng, rng);
  const hp = resumed.enemies[0].hp;
  battleIntent(resumed, migrated, { kind: 'timing' });
  assert.equal(resumed.action.timingSuccess, true);
  updateBattle(
    resumed,
    migrated,
    resumed.action.contact - resumed.action.elapsed,
  );
  assert.ok(resumed.enemies[0].hp < hp);
  assert.deepEqual(migrate(migrated), migrated);
});
