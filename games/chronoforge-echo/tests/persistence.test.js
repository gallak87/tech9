import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, recruit } from '../src/progression.js';
import { createBattle, updateBattle, battleKey } from '../src/combat.js';
import { SAVE_PREFIX, migrate, saveState, loadState, saveMeta, deleteSave, latestSave } from '../src/persistence.js';

function storage() {
  const rows = new Map();
  return { rows, getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key) };
}

test('manual saves and checkpoint preserve the entire expedition without sharing the reference namespace', () => {
  const s = createState(), store = storage(); recruit(s, 'vex');
  s.region = 'forest_veil'; s.flags.branch = 'voices'; s.quests.test = { stage: 2, claimed: true };
  s.cleared.guard = true; s.pickups.relic = true; s.fog.forest_veil = [2, 5, 9]; s.playTime = 234.5;
  s.settings.timingAssist = true; s.settings.keys = { up: 'i' };
  for (const slot of [1, 2, 3, 'checkpoint']) saveState(s, slot, store);
  assert.deepEqual(loadState(1, store), s);
  assert.deepEqual(loadState('checkpoint', store), s);
  assert.equal(store.rows.size, 4);
  assert.ok([...store.rows.keys()].every(k => k.startsWith('chronforge_echo_v1:')));
  assert.equal(SAVE_PREFIX, 'chronforge_echo_v1');
  const loaded = loadState(1, store); loaded.flags.branch = 'silence';
  assert.equal(loadState(1, store).flags.branch, 'voices', 'Loaded states do not alias stored records.');
});

test('save metadata, latest record selection, and deletion isolate manual slots', () => {
  const s = createState(), store = storage();
  saveState(s, 1, store); saveState(s, 2, store); saveState(s, 'checkpoint', store);
  for (const [slot, savedAt] of [[1, '2026-09-14T00:00:00.000Z'], [2, '2026-09-16T00:00:00.000Z'], ['checkpoint', '2026-09-15T00:00:00.000Z']]) {
    const key = `${SAVE_PREFIX}:${slot}`, record = JSON.parse(store.getItem(key)); record.savedAt = savedAt; store.setItem(key, JSON.stringify(record));
  }
  assert.equal(latestSave(store), 2);
  assert.deepEqual(saveMeta(2, store), { savedAt: '2026-09-16T00:00:00.000Z', level: 1, region: s.region, playTime: 0, complete: false, party: 'Kaida' });
  deleteSave(2, store);
  assert.equal(saveMeta(2, store), null); assert.equal(latestSave(store), 'checkpoint');
  assert.deepEqual(loadState(1, store), s);
});

test('corrupt records are reported while other slots remain recoverable', () => {
  const store = storage(), s = createState(); saveState(s, 2, store);
  store.setItem(`${SAVE_PREFIX}:1`, '{not valid json');
  assert.deepEqual(saveMeta(1, store), { corrupt: true });
  assert.throws(() => loadState(1, store));
  assert.throws(() => loadState(3, store), /empty/);
  assert.equal(latestSave(store), 2); assert.deepEqual(loadState(2, store), s);
  store.setItem(`${SAVE_PREFIX}:3`, JSON.stringify({ savedAt: '2026-09-20', state: { heroes: [] } }));
  assert.deepEqual(saveMeta(3, store), { corrupt: true });
});

test('versionless base saves migrate idempotently without modifying their source', () => {
  const legacy = createState(); delete legacy.version; delete legacy.flags; delete legacy.cleared; delete legacy.pickups; delete legacy.fog; delete legacy.visited; delete legacy.settings;
  const before = JSON.stringify(legacy), migrated = migrate(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(migrated.version, 1); assert.deepEqual(migrate(migrated), migrated);
  assert.deepEqual(migrated.flags, {}); assert.deepEqual(migrated.cleared, {});
  assert.deepEqual(migrated.visited, { [legacy.region]: true });
  assert.equal(migrated.settings.minimap, true);
});

test('future formats and malformed hero/resource records cannot silently enter the game', () => {
  assert.throws(() => migrate(null), /no expedition/);
  const mutations = [
    s => { s.version = 100; },
    s => { s.heroes = []; },
    s => { s.heroes[0].level = -1; },
    s => { s.heroes[0].hp = 'healthy'; },
    s => { s.x = null; },
    s => { s.resources.ore = -3; },
    s => { s.resources.energy = Infinity; },
  ];
  for (const mutate of mutations) { const state = createState(); mutate(state); assert.throws(() => migrate(state)); }
});

test('unknown party members, duplicate identities, and invalid combat values are rejected on load', () => {
  const mutations = [
    s => { s.heroes.push({ ...s.heroes[0], id: 'missing_content' }); },
    s => { s.heroes.push({ ...s.heroes[0] }); },
    s => { s.heroes[0].level = 1.5; },
    s => { s.heroes[0].hp = -1; },
    s => { s.heroes[0].mp = 'many'; },
    s => { s.heroes[0].xp = -1; },
    s => { s.heroes[0].skillPoints = -1; },
    s => { s.inventory.field_tonic = -2; },
    s => { s.inventory.missing_content = 1; },
  ];
  for (const mutate of mutations) {
    const state = createState(); mutate(state);
    assert.throws(() => migrate(state), undefined, `Invalid record accepted: ${JSON.stringify(state.heroes)} / ${JSON.stringify(state.inventory)}`);
  }
});

test('saving during a battle preserves the exact action and timing opportunity', () => {
  const state = createState(), store = storage(), b = createBattle(state, { id: 'save_test', enemies: ['gravbot'] });
  b.heroes[0].atb = 99.99; updateBattle(b, state, .01);
  for (let i = 0; i < 3; i++) battleKey(b, state, 'Enter');
  updateBattle(b, state, b.action.windowStart + .01);
  state.suspendedBattle = b;
  saveState(state, 1, store);
  const loaded = loadState(1, store), resumed = loaded.suspendedBattle;
  assert.deepEqual(resumed, b);
  battleKey(resumed, loaded, ' ');
  assert.equal(resumed.action.timingSuccess, true);
  const enemyHp = resumed.enemies[0].hp;
  updateBattle(resumed, loaded, resumed.action.contact - resumed.action.elapsed);
  assert.ok(resumed.enemies[0].hp < enemyHp);
  assert.equal(loadState(1, store).suspendedBattle.action.timingAttempted, false);
});

test('storage errors propagate without overwriting the previous record', () => {
  const store = storage(), state = createState(); saveState(state, 1, store);
  const previous = store.getItem(`${SAVE_PREFIX}:1`);
  store.setItem = () => { throw new Error('Quota exceeded'); };
  state.heroes[0].level = 2;
  assert.throws(() => saveState(state, 1, store), /Quota/);
  assert.equal(store.getItem(`${SAVE_PREFIX}:1`), previous);
});
