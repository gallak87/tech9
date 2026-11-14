import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionNavigation,
  createMenuHistory,
} from './session-navigation.js';
import { createCupStore } from '../race/cup.js';

function fixture({
  active = true,
  snapshot = {},
  cup = false,
  cupState = null,
  intent = 'race',
} = {}) {
  const calls = [];
  const game = {
    hasSession: () => active,
    getSnapshot: () => snapshot,
    setSuspended: (value) => calls.push(['suspend', value]),
    resumeSession: () => calls.push(['resume']),
  };
  return {
    calls,
    navigation: createSessionNavigation({
      getGame: () => game,
      getSession: () => ({ cup, cupState, intent }),
      setScreen: (screen) => calls.push(['screen', screen]),
      onResume: () => calls.push(['restore']),
    }),
  };
}

test('all menu surfaces suspend the retained run; resuming restores setup before showing its pause panel', () => {
  const { calls, navigation } = fixture();
  for (const screen of [
    'home',
    'cup',
    'circuits',
    'setup',
    'records',
    'career',
    'settings',
    'loading',
    'inspection',
  ])
    navigation.sync(screen);
  assert.ok(calls.every(([, suspended]) => suspended));
  calls.length = 0;
  navigation.sync('race');
  navigation.sync('race', { inspector: true });
  assert.deepEqual(calls, [
    ['suspend', false],
    ['suspend', true],
  ]);
  calls.length = 0;
  assert.equal(navigation.resume(), true);
  assert.deepEqual(calls, [['restore'], ['screen', 'race'], ['resume']]);
});

test('completed races and missions cannot expose a misleading Resume action', () => {
  for (const options of [
    { active: false },
    { snapshot: { competition: { playerFinished: true } } },
    { snapshot: { timeTrial: { result: {} } } },
    { snapshot: { eliminator: { result: {} } } },
    { snapshot: { interceptor: { result: {} } } },
    { intent: 'freestyle', snapshot: { mode: 'results' } },
    { cup: true },
    { cup: true, cupState: { phase: 'results' } },
    {
      cup: true,
      cupState: { phase: 'racing', cupId: 'founders', results: [] },
      snapshot: { competition: { playerFinished: true } },
    },
  ]) {
    const { navigation, calls } = fixture(options);
    assert.equal(navigation.resume(), false);
    assert.deepEqual(calls, []);
  }
  const store = createCupStore(() => null);
  store.start('founders', 'shrike', 'easy');
  assert.equal(
    fixture({
      cup: true,
      cupState: store.snapshot().state,
    }).navigation.canResume(),
    true,
  );
  assert.equal(
    fixture({
      intent: 'practice',
      snapshot: { mode: 'paused' },
    }).navigation.canResume(),
    true,
  );
});

test('page history preserves separate focus and scroll positions', () => {
  const history = createMenuHistory();
  const original = { scroll: 420, focus: '[data-level="nacre"]' };
  history.remember('circuits', original);
  original.scroll = 0;
  history.remember('settings', {
    scroll: 200,
    focus: '[data-setting="quality"]',
  });
  assert.deepEqual(history.recall('circuits'), {
    scroll: 420,
    focus: '[data-level="nacre"]',
  });
  history.remember('settings', { scroll: 240, focus: null });
  assert.deepEqual(
    history.recall('settings'),
    { scroll: 240, focus: '[data-setting="quality"]' },
    'header navigation preserves the last content focus',
  );
  assert.equal(history.recall('career'), null);
});

test('an unfinished cup does not make its finished current race resumable', () => {
  const store = createCupStore(() => null);
  store.start('founders', 'shrike', 'easy');
  const cupState = store.snapshot().state;
  for (const options of [
    { cupState: { ...cupState, phase: 'results' } },
    { cupState, snapshot: { competition: { playerFinished: true } } },
  ]) {
    const { navigation, calls } = fixture({ cup: true, ...options });
    assert.equal(navigation.canResume(), false);
    assert.equal(navigation.resume(), false);
    assert.deepEqual(calls, []);
  }
});
