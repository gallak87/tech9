import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetCache } from '../src/asset-cache.js';
import { assetDependencies, regionForScene } from '../src/asset-groups.js';
import { ASSET_MANIFEST } from '../src/assets.js';
import { ALL_SCENES } from '../src/world.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(options = {}) {
  const installed = new Set(),
    released = [],
    loads = [],
    groups = {
      common: ['ui'],
      a: ['ui', 'shared', 'a'],
      b: ['ui', 'shared', 'b'],
      c: ['ui', 'c'],
    },
    cache = new AssetCache({
      entries: ['ui', 'shared', 'a', 'b', 'c'].map((id) => ({ id })),
      dependencies: (destination = 'common') => ({
        key: destination,
        ids: groups[destination],
      }),
      profile: 'mobile',
      budgetBytes: 200,
      concurrency: 2,
      load: async (entry) => {
        loads.push(entry.id);
        return { width: 2, height: 2 };
      },
      install: (entry) => installed.add(entry.id),
      release: (entry) => {
        released.push(entry.id);
        installed.delete(entry.id);
      },
      ...options,
    });
  return { cache, installed, released, loads };
}

test('regional groups cover every live source and all authored encounters without loading every region', () => {
  const covered = new Set(),
    byId = new Map(ASSET_MANIFEST.map((entry) => [entry.id, entry]));
  for (const scene of Object.values(ALL_SCENES)) {
    const spec = assetDependencies(ASSET_MANIFEST, scene.id),
      ids = new Set(spec.ids);
    assert.ok(spec.ids.length < ASSET_MANIFEST.length, scene.id);
    for (const id of ids) {
      assert.ok(byId.has(id));
      covered.add(id);
    }
    for (const enemy of scene.objects.flatMap(
      (object) => object.enemies || [],
    )) {
      assert.ok(ids.has(enemy), scene.id + ': ' + enemy);
      if (byId.has(enemy + '_walk')) assert.ok(ids.has(enemy + '_walk'));
    }
    assert.ok(ids.has('kaida_showcase') && ids.has('rune') && ids.has('vex'));
    assert.ok(ids.has(regionForScene(scene.id) + '_town_center'));
    for (const entry of ASSET_MANIFEST.filter(
      (entry) => entry.kind === 'inventoryIcon',
    ))
      assert.ok(
        ids.has(entry.id),
        'Every inventory and reward icon is always ready',
      );
  }
  assert.equal(covered.size, ASSET_MANIFEST.length);
  assert.deepEqual(
    assetDependencies(ASSET_MANIFEST, 'haventide').ids,
    assetDependencies(ASSET_MANIFEST, 'hav_cave').ids,
    'Local cave/house/town travel stays warm',
  );
});

test('late saves, suspended battle enemies and ending homecoming add actual destination dependencies', () => {
  const ids = new Set(
    assetDependencies(ASSET_MANIFEST, {
      region: 'frost_cave',
      suspendedBattle: { enemies: [{ id: 'void_architect' }] },
      flags: { pendingEnding: true },
    }).ids,
  );
  assert.ok(ids.has('frost_colossus') && ids.has('void_architect'));
  assert.ok(ids.has('coast_ground') && ids.has('frost_canyon_ground'));
  assert.ok(ids.has('cave_exit_ice'));
  assert.throws(
    () => assetDependencies(ASSET_MANIFEST, 'unknown'),
    /Unknown asset destination/,
  );
});

test('shared sources load once, previous region stays warm, LRU eviction drops only unused sources', async () => {
  const { cache, installed, released, loads } = fixture();
  await cache.prepare('a');
  cache.activate('a');
  await cache.prepare('b');
  assert.equal(
    cache.active,
    'a',
    'Preparing travel does not commit the destination',
  );
  cache.activate('b');
  assert.equal(cache.isReady('a'), true);
  await cache.prepare('c');
  cache.activate('c');
  assert.equal(cache.isReady('a'), false);
  assert.equal(cache.isReady('b'), true);
  assert.deepEqual(released, ['a']);
  assert.equal(loads.filter((id) => id === 'shared').length, 1);
  assert.ok(installed.has('ui') && installed.has('shared'));
  await cache.prepare('a');
  cache.activate('a');
  assert.equal(cache.isReady('b'), false);
  assert.ok(
    installed.has('shared'),
    'Reloaded A still owns the shared source after B eviction',
  );
});

test('memory budget releases inactive region while active and pending destination remain protected', async () => {
  const { cache, installed } = fixture({ budgetBytes: 48 });
  await cache.prepare('a');
  cache.activate('a');
  await cache.prepare('b');
  assert.ok(
    installed.has('a'),
    'Source scene remains valid until travel commits',
  );
  assert.ok(
    installed.has('b'),
    'Prepared destination remains reserved until activation',
  );
  cache.activate('b');
  assert.equal(cache.isReady('a'), false);
  assert.equal(cache.isReady('b'), true);
  assert.equal(cache.diagnostics().retainedBytes, 48);
});

test('decodes are bounded and foreground preparation passes queued speculative work', async () => {
  const waiting = [],
    order = [];
  const { cache } = fixture({
    concurrency: 1,
    load: (entry) => {
      order.push(entry.id);
      return new Promise((resolve) =>
        waiting.push(() => resolve({ width: 1, height: 1 })),
      );
    },
  });
  const prefetch = cache.prepare('a', { speculative: true });
  const foreground = cache.prepare('c');
  assert.equal(cache.running, 1);
  for (let i = 0; i < 4; i++) {
    waiting.shift()();
    await tick();
  }
  await Promise.all([prefetch, foreground]);
  assert.deepEqual(order, ['ui', 'c', 'shared', 'a']);
});

test('failed preparations keep source active and retry only missing assets', async () => {
  let fail = true;
  const { cache, installed } = fixture({
    load: async (entry) => {
      if (entry.id === 'b' && fail) throw new Error('Offline');
      return { width: 2, height: 2 };
    },
  });
  await cache.prepare('a');
  cache.activate('a');
  await assert.rejects(cache.prepare('b'), /Offline/);
  assert.equal(cache.active, 'a');
  assert.ok(installed.has('a') && installed.has('shared'));
  assert.equal(cache.isReady('b'), false);
  fail = false;
  await cache.prepare('b');
  cache.activate('b');
  assert.equal(cache.isReady('b'), true);
});

test('session replacement rejects stale work without installing it or evicting the source', async () => {
  let finish;
  const { cache, installed } = fixture({
    load: async (entry) => {
      if (entry.id === 'b')
        await new Promise((resolve) => {
          finish = resolve;
        });
      return { width: 2, height: 2 };
    },
  });
  await cache.prepare('a');
  cache.activate('a');
  const stale = cache.prepare('b');
  const rejected = assert.rejects(stale, { name: 'AbortError' });
  await tick();
  cache.resetSession();
  finish();
  await rejected;
  assert.equal(cache.active, 'a');
  assert.ok(cache.isReady('a'));
  assert.equal(installed.has('b'), false);
});

test('desktop default prepares the full manifest and never evicts on travel', async () => {
  const { cache, loads, released } = fixture({
    profile: 'full',
    budgetBytes: 1,
  });
  await cache.prepare('a');
  cache.activate('a');
  assert.equal(loads.length, 5);
  await cache.prepare('b');
  cache.activate('b');
  cache.resetSession();
  assert.equal(loads.length, 5);
  assert.deepEqual(released, []);
});

test('session cancellation aborts hung downloads and frees the queue for a new destination', async () => {
  let aborted = false;
  const { cache, installed } = fixture({
    concurrency: 1,
    load: async (entry, { signal }) => {
      if (entry.id === 'shared')
        await new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(
                Object.assign(new Error('Canceled'), { name: 'AbortError' }),
              );
            },
            { once: true },
          );
        });
      return { width: 2, height: 2 };
    },
  });
  const stale = cache.prepare('a');
  const rejected = assert.rejects(stale, { name: 'AbortError' });
  await tick();
  cache.resetSession();
  await cache.prepare('c');
  await rejected;
  cache.activate('c');
  assert.equal(aborted, true);
  assert.equal(cache.running, 0);
  assert.equal(cache.queue.length, 0);
  assert.equal(cache.inflight.size, 0);
  assert.ok(installed.has('c'));
  assert.equal(installed.has('a'), false);
});
