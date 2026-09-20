import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game-session.js';
import { createState } from '../src/progression.js';
import { saveState, loadState } from '../src/persistence.js';
import { getScene, safeArrival } from '../src/world.js';
import { createBattle } from '../src/combat.js';

function fixture(t) {
  const rows = new Map(),
    storage = {
      getItem: (key) => rows.get(key) ?? null,
      setItem: (key, value) => rows.set(key, value),
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
  ])
    game[name] = (...args) => session[name](...args);
  return { game, calls, rows, storage };
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
