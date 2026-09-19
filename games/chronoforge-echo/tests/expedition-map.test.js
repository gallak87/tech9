import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/progression.js';
import { REGIONS } from '../src/world.js';
import {
  mapLayout,
  adjacentMapRegion,
  mapTravelAction,
} from '../src/expedition-map-model.js';
import { ExpeditionMap } from '../src/expedition-map.js';

test('all eight map boxes and their labels fit the content area at desktop and compact sizes', () => {
  for (const [w, h] of [
    [1500, 680],
    [950, 430],
    [600, 280],
    [340, 220],
  ]) {
    const boxes = Object.values(mapLayout(w, h));
    assert.equal(boxes.length, 8);
    for (const box of boxes) {
      assert.ok(box.x >= 0 && box.x + box.width <= w);
      assert.ok(box.y >= 50 && box.y + box.height + 18 * box.scale <= h - 28);
    }
  }
  const a = mapLayout(950, 430),
    b = mapLayout(950, 430, 1, 45, -20);
  for (const id of Object.keys(a)) {
    assert.ok(Math.abs(b[id].x - a[id].x - 45) < 1e-9);
    assert.ok(Math.abs(b[id].y - a[id].y + 20) < 1e-9);
  }
});

test('arrows follow the visible region layout instead of changing map pan', () => {
  assert.equal(adjacentMapRegion('haventide', 'ArrowRight'), 'emberline');
  assert.equal(adjacentMapRegion('emberline', 'ArrowUp'), 'crater_ember');
  assert.equal(adjacentMapRegion('emberline', 'ArrowDown'), 'forest_veil');
  assert.equal(adjacentMapRegion('orbital_reach', 'ArrowUp'), 'frost_canyon');
  assert.equal(adjacentMapRegion('orbital_reach', 'ArrowDown'), 'mire_bog');
  assert.equal(adjacentMapRegion('last_crown', 'ArrowRight'), 'last_crown');
  assert.equal(adjacentMapRegion('forest_veil', 'ArrowRight'), 'mire_bog');
  assert.equal(adjacentMapRegion('mire_bog', 'ArrowUp'), 'orbital_reach');
});

test('normal map travel only targets liberated settlements, while preview allows all eight regions', () => {
  const state = createState(),
    game = { state, mode: 'world', ui: { panel: null } };
  assert.equal(mapTravelAction(game, 'haventide').action, undefined);
  state.visited.haventide = true;
  state.flags.haventide_liberated = true;
  assert.equal(mapTravelAction(game, 'haventide').action, 'travel:haventide');
  state.visited.mire_bog = true;
  state.flags.mire_bog_liberated = true;
  assert.equal(mapTravelAction(game, 'mire_bog').action, undefined);
  const before = structuredClone(state);
  game.devTools = { mapExplored: true };
  for (const id of Object.keys(REGIONS))
    assert.equal(mapTravelAction(game, id).action, 'dev-world:' + id);
  for (const id of ['missing', 'constructor', '__proto__'])
    assert.equal(mapTravelAction(game, id).action, undefined);
  assert.deepEqual(state, before);
  for (const patch of [
    { mode: 'battle' },
    { battle: {} },
    { transition: {} },
    { upgradeTour: { open: true } },
  ]) {
    assert.equal(
      mapTravelAction({ ...game, ...patch }, 'last_crown').action,
      undefined,
    );
  }
  assert.equal(
    mapTravelAction({ ...game, ui: { panel: {} } }, 'last_crown').action,
    undefined,
  );
  game.devTools = null;
  state.flags.pendingEnding = true;
  assert.equal(mapTravelAction(game, 'haventide').action, undefined);
});

test('keyboard activation uses the selected region; dragging a region never jumps', (t) => {
  const actions = [],
    game = {
      state: createState(),
      mode: 'world',
      ui: { panel: null, action: (a) => actions.push(a) },
      devTools: { mapExplored: true },
    };
  const oldDocument = globalThis.document,
    oldObserver = globalThis.ResizeObserver;
  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.ResizeObserver = oldObserver;
  });
  globalThis.document = { activeElement: { closest: () => null } };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const frame = {
    contains: () => true,
    setPointerCapture() {},
    querySelector: () => ({ focus() {} }),
  };
  const canvas = { isConnected: true, closest: () => frame };
  const map = new ExpeditionMap(game);
  map.draw = () => {};
  map.mount(canvas);
  map.key('ArrowRight');
  assert.equal(map.selected, 'emberline');
  assert.equal(map.panX, 0);
  assert.equal(map.panY, 0);
  assert.equal(map.key('w'), false);
  assert.equal(map.key('a'), false);
  map.key(' ');
  map.key('Enter');
  assert.deepEqual(actions, ['dev-world:emberline', 'dev-world:emberline']);
  const target = {
    closest: (selector) =>
      selector === '[data-map-region]'
        ? { dataset: { mapRegion: 'last_crown' } }
        : null,
  };
  frame.onpointerdown({ button: 0, target, clientX: 100, clientY: 100 });
  frame.onpointermove({ pointerId: 1, target, clientX: 160, clientY: 125 });
  frame.onpointerup();
  frame.onclick({ target, preventDefault() {}, stopPropagation() {} });
  assert.equal(map.panX, 60);
  assert.equal(map.panY, 25);
  assert.equal(actions.length, 2);
  frame.onpointermove({ target });
  assert.equal(
    map.selected,
    'last_crown',
    'Hover selects the same target keyboard activation uses',
  );
  map.key('Enter');
  assert.equal(actions.at(-1), 'dev-world:last_crown');
  map.unmount();
  assert.equal(map.key('ArrowLeft'), false);
});
