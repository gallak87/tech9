import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game-session.js';
import { createState, equip, useItem } from '../src/progression.js';
import { saveState, loadState } from '../src/persistence.js';
import { getScene, safeArrival } from '../src/world.js';
import {
  createBattle,
  updateBattle,
  battleKey,
  battleView,
} from '../src/combat.js';
import {
  communityStatus,
  restoreCommunity,
  reforgeCommunityWeapon,
} from '../src/community-restoration.js';

function fixture(t) {
  const writes = [],
    rows = new Map(),
    storage = {
      getItem: (key) => rows.get(key) ?? null,
      setItem: (key, value) => {
        writes.push(key);
        rows.set(key, value);
      },
    };
  const previous = globalThis.localStorage;
  globalThis.localStorage = storage;
  t.after(() => {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  });
  const calls = [],
    game = {
      state: createState(),
      mode: 'world',
      battle: null,
      keys: new Set(['w']),
      movePath: [{ x: 1, y: 2 }],
      transition: {},
      near: {},
      rewardQueue: [{ id: 'ore' }],
      audio: { set() {}, sound() {} },
      ui: {
        resetSession() {
          calls.push('reset-ui');
        },
        render() {},
        showDialogue() {
          calls.push('opening');
        },
        feedback(result) {
          calls.push(result);
        },
      },
      worldView: {
        close() {
          calls.push('close-world');
        },
      },
      upgradeTour: {
        close() {
          calls.push('close-tour');
        },
      },
      devTools: {
        reset() {
          calls.push('reset-dev');
        },
        saveSource() {
          return game;
        },
      },
      get scene() {
        return getScene(this.state.region);
      },
      safePoint: safeArrival,
      resetFollowers() {
        calls.push('followers');
      },
      updateCamera() {
        calls.push('camera');
      },
      presentEnding() {
        calls.push('ending');
      },
      log(type) {
        calls.push(type);
      },
    };
  const session = new GameSession(game);
  for (const name of [
    'resetSession',
    'startNew',
    'load',
    'saveSnapshot',
    'save',
    'checkpoint',
    'autosaveInventory',
  ])
    game[name] = (...args) => session[name](...args);
  return { game, calls, rows, storage, writes };
}

test('load clears transient controls, resumes pending endings, and leaves other save slots intact', (t) => {
  const { game, calls, storage, rows } = fixture(t);
  const saved = createState();
  saved.resources.ore = 321;
  saved.flags.pendingEnding = true;
  saved.endingProgress = { index: 2, panel: 'dialogue' };
  saveState(saved, 1, storage);
  const before = new Map(rows);
  game.load(1);
  assert.equal(game.state.resources.ore, 321);
  assert.equal(game.mode, 'world');
  assert.equal(game.keys.size, 0);
  assert.deepEqual(game.movePath, []);
  assert.deepEqual(game.rewardQueue, []);
  assert.equal(game.transition, null);
  assert.equal(game.near, null);
  assert.deepEqual(calls, [
    'close-world',
    'close-tour',
    'reset-dev',
    'reset-ui',
    'followers',
    'camera',
    'ending',
    'load',
  ]);
  assert.deepEqual(rows, before);
  game.autosaveInventory();
  assert.deepEqual(
    rows,
    before,
    'Loading a record does not overwrite the autosave',
  );
});

test('inventory writes checkpoint complete transactions without saving unchanged frames or manual slots', (t) => {
  const { game, storage, writes, rows } = fixture(t);
  game.save(1);
  const manual = new Map(rows);
  const before = writes.length;
  game.autosaveInventory();
  game.state.resources.ore++;
  game.autosaveInventory();
  assert.equal(
    writes.length,
    before,
    'Reads and passive income do not write every frame',
  );
  const changes = [
    () => {
      game.state.inventory.iron_blade = 2;
    },
    () => {
      game.state.inventory.iron_blade--;
      game.state.resources.ore += 12;
    },
    () => {
      delete game.state.inventory.iron_blade;
    },
    () => {
      game.state.inventory = { ...game.state.inventory, scrap_vest: 1 };
    },
    () => {
      game.state.inventory.bog_fang = 1;
      assert.equal(equip(game.state, 'kaida', 'bog_fang').ok, true);
    },
    () => {
      game.state.heroes[0].equip.accessory = 'data_chip';
    },
  ];
  for (const change of changes) {
    const count = writes.length;
    change();
    game.autosaveInventory();
    assert.equal(writes.length, count + 1);
    assert.deepEqual(loadState('checkpoint', storage), game.state);
    game.autosaveInventory();
    assert.equal(writes.length, count + 1);
  }
  for (const [key, value] of manual) assert.equal(rows.get(key), value);
  game.state.inventory.field_tonic++;
  game.checkpoint();
  const afterCheckpoint = writes.length;
  game.autosaveInventory();
  assert.equal(
    writes.length,
    afterCheckpoint,
    'Existing action checkpoints are not duplicated',
  );
});

test('menu consumables save their effect and spent supply; rejected uses do not write', (t) => {
  const { game, storage, writes } = fixture(t);
  game.ui.panel = 'menu';
  assert.equal(useItem(game.state, 'field_tonic', 'kaida').ok, false);
  game.autosaveInventory();
  assert.equal(writes.length, 0);
  game.state.heroes[0].hp = 1;
  assert.equal(useItem(game.state, 'field_tonic', 'kaida').ok, true);
  game.autosaveInventory();
  assert.equal(writes.length, 1);
  const saved = loadState('checkpoint', storage);
  assert.equal(saved.heroes[0].hp, 81);
  assert.equal(saved.inventory.field_tonic, 4);
});

test('community reward and reforge saves keep the weapon and restoration state consistent', (t) => {
  const { game, storage, writes } = fixture(t);
  const state = game.state;
  state.region = 'emberline_town';
  Object.assign(state, getScene(state.region).spawn);
  state.flags.emberline_liberated = true;
  state.resources = { food: 2000, ore: 2000, energy: 2000, renown: 100 };
  state.heroes[0].level = 20;
  for (const project of communityStatus(state, 'emberline').projects)
    assert.equal(restoreCommunity(state, 'emberline', project.id).ok, true);
  game.autosaveInventory();
  assert.equal(writes.length, 1);
  assert.deepEqual(loadState('checkpoint', storage), state);
  assert.equal(state.communities.emberline.weaponTier, 3);
  assert.equal(equip(state, 'kaida', 'duneglass_blade_3').ok, true);
  game.autosaveInventory();
  state.heroes[0].level = 40;
  for (const tier of [4, 5]) {
    assert.equal(reforgeCommunityWeapon(state, 'emberline').ok, true);
    game.autosaveInventory();
    assert.equal(writes.length, tier - 1);
    assert.equal(state.communities.emberline.weaponTier, tier);
    assert.equal(state.heroes[0].equip.weapon, `duneglass_blade_${tier}`);
    assert.deepEqual(loadState('checkpoint', storage), state);
  }
});

test('battle item autosaves resume the resolved contact without spending or healing twice', (t) => {
  const { game, storage, writes } = fixture(t);
  game.mode = 'battle';
  const battle = (game.battle = createBattle(game.state, {
    id: 'hav_guard',
    enemies: ['drone_sentinel'],
    x: 300,
    y: 300,
  }));
  const hero = battle.heroes[0];
  hero.hp = 1;
  hero.atb = 99.999;
  battle.enemies[0].atb = 0;
  updateBattle(battle, game.state, 0.001);
  battleKey(battle, game.state, 'Enter');
  for (let i = 0; i < 3; i++) battleKey(battle, game.state, 'ArrowDown');
  battleKey(battle, game.state, 'Enter');
  const index = battleView(battle, game.state).items.findIndex(
    (item) => item.id === 'field_tonic',
  );
  assert.ok(index >= 0);
  for (let i = 0; i < index; i++) battleKey(battle, game.state, 'ArrowDown');
  battleKey(battle, game.state, 'Enter');
  battleKey(battle, game.state, 'Enter');
  assert.equal(battle.action.command.kind, 'item');
  game.autosaveInventory();
  assert.equal(writes.length, 0, 'Selecting an item has not consumed it');
  updateBattle(
    battle,
    game.state,
    battle.action.contact - battle.action.elapsed + 0.0001,
  );
  assert.equal(battle.action.resolved, true);
  game.autosaveInventory();
  assert.equal(writes.length, 1);
  const saved = loadState('checkpoint', storage);
  assert.equal(saved.inventory.field_tonic, 4);
  assert.deepEqual(saved.suspendedBattle, battle);
  game.load('checkpoint');
  assert.equal(game.mode, 'battle');
  for (let i = 0; game.battle.action && i < 100; i++) {
    updateBattle(game.battle, game.state, 0.025);
    game.autosaveInventory();
  }
  assert.equal(game.battle.action, null);
  assert.equal(game.battle.heroes[0].hp, 81);
  assert.equal(game.state.inventory.field_tonic, 4);
  assert.equal(writes.length, 1);
});

test('inventory autosaves ignore title and detached preview changes but resume for the expedition', (t) => {
  const { game, storage, writes } = fixture(t);
  game.mode = 'title';
  game.state.inventory.field_tonic++;
  game.autosaveInventory();
  assert.equal(writes.length, 0);
  game.mode = 'world';
  game.checkpoint();
  const original = game.state;
  game.state = structuredClone(original);
  game.devTools.saveSource = () => ({ state: original, battle: null });
  game.state.inventory.field_tonic = 99;
  game.autosaveInventory();
  game.checkpoint();
  assert.deepEqual(loadState('checkpoint', storage), original);
  const before = writes.length;
  game.state = original;
  game.autosaveInventory();
  assert.equal(writes.length, before);
  game.state.inventory.field_tonic--;
  game.autosaveInventory();
  assert.equal(writes.length, before + 1);
  assert.equal(loadState('checkpoint', storage).inventory.field_tonic, 5);
});

test('failed inventory autosaves log once rather than retrying every frame', (t) => {
  const { game, calls, storage } = fixture(t);
  const setItem = storage.setItem;
  storage.setItem = () => {
    throw new Error('Storage full');
  };
  game.state.inventory.field_tonic++;
  game.autosaveInventory();
  game.autosaveInventory();
  assert.deepEqual(calls, ['save_error']);
  storage.setItem = setItem;
  game.checkpoint();
  assert.equal(loadState('checkpoint', storage).inventory.field_tonic, 6);
});

test('new sessions replace only the autosave and resume exact suspended battles on load', (t) => {
  const { game, storage } = fixture(t);
  const saved = createState();
  saved.suspendedBattle = createBattle(saved, {
    id: 'hav_guard',
    enemies: ['drone_sentinel'],
    x: 300,
    y: 300,
  });
  saveState(saved, 2, storage);
  game.load(2);
  assert.equal(game.mode, 'battle');
  assert.deepEqual(game.battle, saved.suspendedBattle);
  assert.equal(game.state.suspendedBattle, undefined);
  game.checkpoint();
  assert.throws(() => loadState('checkpoint', storage), /empty/);
  game.startNew();
  assert.equal(game.battle, null);
  assert.equal(game.mode, 'world');
  assert.deepEqual(loadState('checkpoint', storage), game.state);
  assert.deepEqual(
    loadState(2, storage).suspendedBattle,
    saved.suspendedBattle,
  );
});

test('snapshots detach live state and checkpoints use the original expedition during previews', (t) => {
  const { game, storage } = fixture(t);
  const snapshot = game.saveSnapshot();
  snapshot.resources.ore = 0;
  assert.notEqual(game.state.resources.ore, 0);
  const original = createState();
  original.resources.ore = 543;
  game.devTools.saveSource = () => ({ state: original, battle: null });
  game.state.resources.ore = 9;
  game.checkpoint();
  assert.equal(loadState('checkpoint', storage).resources.ore, 543);
  assert.equal(game.save(3), true);
  assert.equal(loadState(3, storage).resources.ore, 543);
});

test('failed loads preserve the current session and storage failures remain visible or logged', (t) => {
  const { game, calls, storage } = fixture(t);
  const current = game.state;
  game.load(3);
  assert.equal(game.state, current);
  assert.equal(calls.at(-1).ok, false);
  assert.ok(!calls.includes('reset-ui'));
  storage.setItem = () => {
    throw new Error('Storage full');
  };
  assert.equal(game.save(1), false);
  assert.match(calls.at(-1).message, /Storage full/);
  game.checkpoint();
  assert.equal(calls.at(-1), 'save_error');
});
