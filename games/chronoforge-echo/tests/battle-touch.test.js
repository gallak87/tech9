import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createState } from '../src/progression.js';
import { createBattle, updateBattle, battleIntent } from '../src/combat.js';
register('./helpers/css-loader.mjs', import.meta.url);
const { BattleUI } = await import('../src/battle-ui.js');

function fixture(t) {
  const state = createState();
  const battle = createBattle(state, {
    id: 'touch-test',
    enemies: ['rust_scrapper'],
    biome: 'haventide',
  });
  battle.heroes[0].atb = 99.999;
  battle.enemies[0].atb = 0;
  updateBattle(battle, state, 0.001);
  battleIntent(battle, state, { kind: 'hero', id: 'kaida' });
  battleIntent(battle, state, { kind: 'command', index: 0 });
  const listeners = {};
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      setAttribute() {},
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
    }),
    querySelector: () => ({ before() {} }),
  };
  t.after(() => {
    if (previous) globalThis.document = previous;
    else delete globalThis.document;
  });
  const game = {
    state,
    battle,
    audio: { unlock() {} },
    ui: { blocked: false },
  };
  const ui = new BattleUI(game);
  ui.render = () => {};
  const event = (kind, extras = {}) => {
    const control = { dataset: { battleIntent: kind }, disabled: false };
    return {
      pointerType: 'touch',
      detail: 1,
      preventDefault() {},
      stopPropagation() {},
      target: {
        closest: (selector) =>
          selector.includes('="timing"') && kind !== 'timing' ? null : control,
      },
      ...extras,
    };
  };
  return { game, battle, listeners, event };
}

test('Execute contact cannot time an action; only a fresh touch-down can Strike once', (t) => {
  const { battle, listeners, event } = fixture(t);
  assert.equal(battle.mode, 'target');
  listeners.pointerdown(event('execute'));
  assert.equal(battle.action, null);
  listeners.click(event('execute'));
  assert.ok(battle.action);
  battle.action.elapsed =
    (battle.action.windowStart + battle.action.windowEnd) / 2;
  listeners.click(event('timing'));
  assert.equal(battle.action.timingAttempted, false);
  listeners.pointerdown(event('timing'));
  assert.equal(battle.action.timingAttempted, true);
  assert.equal(battle.action.timingSuccess, true);
  const pressedAt = battle.action.timingPressedAt;
  battle.action.elapsed += 0.1;
  listeners.click(event('timing'));
  listeners.pointerdown(event('timing'));
  assert.equal(battle.action.timingPressedAt, pressedAt);
});

test('touch timing respects pause, and keyboard activation remains available on hybrids', (t) => {
  const { game, battle, listeners, event } = fixture(t);
  listeners.click(event('execute'));
  battle.action.elapsed =
    (battle.action.windowStart + battle.action.windowEnd) / 2;
  game.ui.blocked = true;
  listeners.pointerdown(event('timing'));
  assert.equal(battle.action.timingAttempted, false);
  game.ui.blocked = false;
  listeners.click(event('timing', { detail: 0, pointerType: '' }));
  assert.equal(battle.action.timingSuccess, true);
});

test('background pause and foreground asset preparation block battle inputs', (t) => {
  const { game, battle, listeners, event } = fixture(t);
  game.lifecyclePaused = true;
  listeners.click(event('execute'));
  assert.equal(battle.action, null);
  game.lifecyclePaused = false;
  game.assetLoading = { busy: true };
  listeners.click(event('execute'));
  assert.equal(battle.action, null);
  game.assetLoading.busy = false;
  listeners.click(event('execute'));
  assert.ok(battle.action);
});
