import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetCache } from '../src/asset-cache.js';
import { GameAssetLoading } from '../src/game-asset-loading.js';
import { GameSession } from '../src/game-session.js';
import { WorldTraversal } from '../src/world-traversal.js';
import { createState } from '../src/progression.js';
import { getScene } from '../src/world.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));

function loadingShell(t) {
  const previous = globalThis.document;
  const nodes = new Map(
    [
      '[data-load-title]',
      '[data-load-status]',
      '[data-load-actions]',
      '[data-load-progress]',
      'progress',
      '[data-loading-count]',
      '[data-load-retry]',
      '[data-load-return]',
    ].map((selector) => [
      selector,
      { hidden: false, textContent: '', addEventListener() {} },
    ]),
  );
  const root = {
    setAttribute() {},
    querySelector: (selector) => nodes.get(selector),
  };
  globalThis.document = { createElement: () => root };
  t.after(() => {
    globalThis.document = previous;
  });
  return { append() {}, root, nodes };
}

async function fixture(shell) {
  const held = new Set(),
    waiting = new Map(),
    installed = new Set(),
    checkpoints = [],
    arrivals = [],
    ids = ['ui', 'haventide', 'emberline', 'forest_veil'],
    loader = new AssetCache({
      entries: ids.map((id) => ({ id })),
      profile: 'mobile',
      budgetBytes: 64,
      dependencies: (destination) => {
        const key =
          typeof destination === 'string' ? destination : destination?.region;
        return { key: key || 'common', ids: key ? ['ui', key] : ['ui'] };
      },
      load: async ({ id }) => {
        if (held.has(id))
          await new Promise((resolve, reject) =>
            waiting.set(id, { resolve, reject }),
          );
        return { width: 2, height: 2 };
      },
      install: ({ id }) => installed.add(id),
      release: ({ id }) => installed.delete(id),
    });
  loader.isSceneReady = (id) => loader.isReady(id);
  loader.prepareScene = (id) => loader.prepare(id);
  loader.prefetch = (id) => loader.prepare(id, { speculative: true });
  await loader.prepare('haventide');
  loader.activate('haventide');
  const state = createState(),
    game = {
      state,
      mode: 'world',
      time: 0,
      keys: new Set(['d']),
      movePath: [{ x: 2, y: 2 }],
      moving: true,
      camera: { x: 0, y: 0 },
      followers: [],
      followPath: [],
      ui: { blocked: false },
      get scene() {
        return getScene(this.state.region);
      },
      condition: () => true,
      audio: { sound() {} },
      log() {},
      checkpoint() {
        checkpoints.push({
          region: this.state.region,
          x: this.state.x,
          y: this.state.y,
        });
      },
      resolveResult(result) {
        arrivals.push(result);
      },
    };
  game.assetLoading = new GameAssetLoading(game, loader, shell);
  const traversal = new WorldTraversal(game);
  traversal.resetFollowers();
  return {
    loader,
    game,
    traversal,
    held,
    waiting,
    installed,
    checkpoints,
    arrivals,
  };
}

test('cold travel holds its opaque midpoint and pins source until prepared arrival commits once', async () => {
  const {
    loader,
    game,
    traversal,
    held,
    waiting,
    installed,
    checkpoints,
    arrivals,
  } = await fixture();
  const source = {
    region: game.state.region,
    x: game.state.x,
    y: game.state.y,
  };
  held.add('emberline');
  traversal.travel('emberline');
  await tick();
  assert.deepEqual(
    checkpoints,
    [source],
    'Departure checkpoint remains a coherent source state',
  );
  assert.equal(game.keys.size, 0);
  assert.deepEqual(game.movePath, []);
  for (let i = 0; i < 30; i++) traversal.updateTransition(0.05);
  assert.equal(game.transition.time, 0.275);
  assert.equal(game.state.region, 'haventide');
  assert.ok(installed.has('haventide'));
  assert.equal(loader.active, 'haventide');
  assert.equal(arrivals.length, 0);
  assert.equal(checkpoints.length, 1);
  waiting.get('emberline').resolve();
  await tick();
  assert.equal(game.transition.assetsReady, true);
  traversal.updateTransition(0.01);
  assert.equal(game.state.region, 'emberline');
  assert.equal(loader.active, 'emberline');
  traversal.updateTransition(0.265);
  assert.equal(game.transition, null);
  assert.equal(arrivals.length, 1);
  assert.equal(checkpoints.length, 2);
  assert.equal(checkpoints[1].region, 'emberline');
  traversal.updateTransition(1);
  assert.equal(checkpoints.length, 2);
  assert.equal(arrivals.length, 1);
});

test('warm travel keeps the original .55-second cadence without an extra loading frame', async (t) => {
  const shell = loadingShell(t);
  const { loader, game, traversal, arrivals } = await fixture(shell);
  await loader.prepare('emberline');
  traversal.travel('emberline');
  assert.equal(game.transition.assetsReady, true);
  traversal.updateTransition(0.275);
  game.assetLoading.update();
  assert.equal(shell.root.hidden, true);
  assert.equal(game.state.region, 'emberline');
  traversal.updateTransition(0.275);
  assert.equal(game.transition, null);
  assert.equal(arrivals.length, 1);
});

test('failed crossing can retry without replaying departure or arrival rewards', async (t) => {
  const shell = loadingShell(t);
  const { game, traversal, held, waiting, checkpoints, arrivals } =
    await fixture(shell);
  held.add('emberline');
  traversal.travel('emberline');
  await tick();
  waiting.get('emberline').reject(new Error('Offline'));
  await tick();
  traversal.updateTransition(0.5);
  game.assetLoading.update();
  assert.equal(shell.nodes.get('[data-load-actions]').hidden, false);
  assert.equal(shell.nodes.get('[data-load-progress]').hidden, true);
  assert.match(game.transition.assetError.message, /Offline/);
  assert.equal(game.state.region, 'haventide');
  assert.equal(checkpoints.length, 1);
  held.delete('emberline');
  game.assetLoading.retry();
  assert.equal(shell.nodes.get('[data-load-actions]').hidden, true);
  assert.equal(shell.nodes.get('[data-load-progress]').hidden, false);
  assert.equal(shell.nodes.get('progress').value, 1);
  assert.equal(shell.nodes.get('progress').max, 2);
  await tick();
  assert.equal(shell.root.hidden, true);
  traversal.updateTransition(0.275);
  assert.equal(game.transition, null);
  assert.equal(game.state.region, 'emberline');
  assert.equal(checkpoints.length, 2);
  assert.equal(arrivals.length, 1);
});

test('destination progress counts cached destination assets and waits for installation, ignoring other regions', async (t) => {
  const shell = loadingShell(t);
  const { loader, game, traversal, held, waiting } = await fixture(shell);
  await loader.prepare('forest_veil');
  let finishInstall;
  const install = loader.install;
  loader.install = async (entry) => {
    if (entry.id === 'emberline')
      await new Promise((resolve) => {
        finishInstall = resolve;
      });
    install(entry);
  };
  held.add('emberline');
  traversal.travel('emberline');
  await tick();
  traversal.updateTransition(0.275);
  game.assetLoading.update();
  assert.equal(
    shell.root.hidden,
    true,
    'Quick crossings do not flash a loader',
  );
  traversal.updateTransition(0.4);
  game.assetLoading.update();
  assert.equal(shell.root.hidden, false);
  const bar = shell.nodes.get('progress');
  assert.equal(bar.max, 2);
  assert.equal(bar.value, 1, 'Cached common art counts; other regions do not');
  assert.equal(
    shell.nodes.get('[data-loading-count]').textContent,
    '1 / 2 assets ready · 50%',
  );
  waiting.get('emberline').resolve();
  await tick();
  game.assetLoading.update();
  assert.equal(bar.value, 1, 'A decoded source is not ready until installed');
  assert.equal(game.transition.assetsReady, false);
  finishInstall();
  await tick();
  assert.equal(game.transition.assetsReady, true);
  assert.equal(shell.root.hidden, true);
});

test('Return cancels late preparation and prevents automatic doorway re-entry', async () => {
  const {
    loader,
    game,
    traversal,
    held,
    waiting,
    installed,
    checkpoints,
    arrivals,
  } = await fixture();
  held.add('emberline');
  traversal.travel('emberline');
  await tick();
  traversal.updateTransition(0.4);
  game.assetLoading.cancel();
  assert.equal(game.transition, null);
  assert.equal(game.state.region, 'haventide');
  assert.equal(game.travelBlockedAt.region, 'haventide');
  assert.equal(
    traversal.autoTravel([
      { type: 'portal', to: 'emberline', x: game.state.x, y: game.state.y },
    ]),
    false,
  );
  waiting.get('emberline').resolve();
  await tick();
  assert.equal(installed.has('emberline'), false);
  assert.equal(loader.active, 'haventide');
  assert.equal(arrivals.length, 0);
  assert.equal(checkpoints.length, 1);
});

test('loading an unrelated save invalidates an in-flight departure and commits only the prepared save', async (t) => {
  const shell = loadingShell(t);
  const { loader, game, traversal, held, waiting, installed } =
    await fixture(shell);
  held.add('emberline');
  held.add('forest_veil');
  traversal.travel('emberline');
  await tick();
  const next = { ...createState(), region: 'forest_veil' };
  let committed = 0;
  game.assetLoading.session(next, () => {
    game.state = next;
    committed++;
  });
  await tick();
  assert.equal(game.transition, null);
  assert.equal(shell.root.hidden, false);
  assert.equal(shell.nodes.get('progress').max, 2);
  assert.equal(shell.nodes.get('progress').value, 1);
  assert.equal(game.state.region, 'haventide');
  assert.equal(loader.active, 'haventide');
  assert.ok(installed.has('haventide'));
  waiting.get('emberline').resolve();
  await tick();
  game.assetLoading.update();
  assert.equal(shell.nodes.get('progress').value, 1);
  assert.equal(installed.has('emberline'), false);
  assert.equal(committed, 0);
  waiting.get('forest_veil').resolve();
  await tick();
  assert.equal(game.state.region, 'forest_veil');
  assert.equal(loader.active, 'forest_veil');
  assert.equal(committed, 1);
  assert.equal(game.assetLoading.busy, false);
  assert.equal(shell.root.hidden, true);
});

test('canceling a deferred save load retains the playable source and ignores late completion', async () => {
  const { loader, game, held, waiting, installed } = await fixture();
  held.add('forest_veil');
  let committed = 0;
  game.assetLoading.session(
    { ...createState(), region: 'forest_veil' },
    () => committed++,
  );
  await tick();
  game.assetLoading.cancel();
  waiting.get('forest_veil').resolve();
  await tick();
  assert.equal(committed, 0);
  assert.equal(game.state.region, 'haventide');
  assert.equal(game.assetLoading.busy, false);
  assert.equal(loader.active, 'haventide');
  assert.ok(installed.has('haventide'));
  assert.equal(installed.has('forest_veil'), false);
});

test('a failed speculative route can retry and a new session resets its prefetch clock', async () => {
  const { game, loader } = await fixture();
  Object.defineProperty(game, 'scene', {
    get: () => ({
      portals: [{ to: 'emberline', x: game.state.x, y: game.state.y }],
      objects: [],
    }),
  });
  let attempts = 0;
  loader.prefetch = async () => {
    attempts++;
    return false;
  };
  game.assetLoading.update();
  await tick();
  game.time = 2;
  game.assetLoading.update();
  await tick();
  assert.equal(
    attempts,
    1,
    'Avoid repeatedly downloading a speculative bundle that cannot fit',
  );
  game.time = 31;
  game.assetLoading.update();
  await tick();
  assert.equal(attempts, 2);
  game.assetLoading.prefetchAt = 500;
  game.assetLoading.prefetchTarget = 'emberline';
  game.assetLoading.session(game.state, () => {});
  assert.equal(game.assetLoading.prefetchAt, 0);
  assert.equal(game.assetLoading.prefetchTarget, null);
});

test('saving during the second half of travel preserves departure until arrival events finish', async () => {
  const { loader, game, traversal, arrivals } = await fixture();
  const session = new GameSession(game);
  game.saveSnapshot = () => session.saveSnapshot();
  const departure = game.saveSnapshot();
  await loader.prepare('emberline');
  traversal.travel('emberline');
  traversal.updateTransition(0.3);
  assert.equal(game.transition.swapped, true);
  assert.equal(
    game.state.region,
    'emberline',
    'Renderer now shows the destination',
  );
  assert.equal(
    arrivals.length,
    0,
    'Arrival event has not committed before fade completion',
  );
  const interrupted = game.saveSnapshot();
  assert.deepEqual(
    interrupted,
    departure,
    'Background or manual save must retain the coherent departure',
  );
  interrupted.region = 'forest_veil';
  assert.equal(
    game.saveSnapshot().region,
    'haventide',
    'Returned snapshots cannot mutate the retained source',
  );
  traversal.updateTransition(0.25);
  assert.equal(game.transition, null);
  assert.equal(arrivals.length, 1);
  assert.equal(game.saveSnapshot().region, 'emberline');
  assert.deepEqual(
    game.saveSnapshot(),
    game.state,
    'Completed arrival saves its fully committed state',
  );
});

test('replacing a save after the scene swap completes the original arrival before a cancelable load', async () => {
  const { loader, game, traversal, held, waiting, arrivals, checkpoints } =
    await fixture();
  game.traversal = traversal;
  const session = new GameSession(game);
  game.saveSnapshot = () => session.saveSnapshot();
  await loader.prepare('emberline');
  traversal.travel('emberline');
  traversal.updateTransition(0.3);
  held.add('forest_veil');
  let committed = 0;
  game.assetLoading.session(
    { ...createState(), region: 'forest_veil' },
    () => committed++,
  );
  await tick();
  assert.equal(game.transition, null);
  assert.equal(game.state.region, 'emberline');
  assert.equal(arrivals.length, 1);
  assert.equal(checkpoints.length, 2);
  assert.equal(game.saveSnapshot().region, 'emberline');
  game.assetLoading.cancel();
  waiting.get('forest_veil').resolve();
  await tick();
  assert.equal(committed, 0);
  assert.equal(game.state.region, 'emberline');
  assert.equal(loader.active, 'emberline');
  assert.equal(arrivals.length, 1);
});
