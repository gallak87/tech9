import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createViewport,
  clientToWorld,
  worldToClient,
  followCamera,
} from '../src/viewport.js';
import { moveActor, isWalkable, clearSegment } from '../src/exploration.js';
import { TouchMovement } from '../src/touch-input.js';
import {
  frameBounds,
  actorFrame,
  isOccluding,
  validateFrames,
  actorFrames,
} from '../src/frames.js';
import {
  COASTAL_ASSETS,
  COASTAL_FRAMES,
  COASTAL_ACTOR,
} from '../src/coastal.js';
import { AssetCache } from '../src/assets.js';
import { SceneTransition } from '../src/scene-transition.js';
import { keyNeutralExterior } from '../src/authoring.js';
import { validateWorldOptions, copyActor } from '../src/contract.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('logical view preserves artwork aspect and pointer transforms at every rotation and bounded DPR', () => {
  for (const [cssWidth, cssHeight] of [
    [1440, 960],
    [393, 600],
    [844, 300],
  ])
    for (const mobile of [true, false]) {
      const view = createViewport({
        cssWidth,
        cssHeight,
        mobile,
        pixelRatio: 4,
        logicalWidth: 960,
        pixelBudget: 750000,
      });
      assert.ok(
        Math.abs(view.width / view.height - cssWidth / cssHeight) < 1e-10,
      );
      assert.ok(view.width * view.height * view.renderScale ** 2 <= 750000.01);
      assert.ok(Math.max(view.width, view.height) * view.renderScale <= 2048);
      const camera = { x: 110.25, y: 230.75 },
        rect = { left: 24, top: 72, width: cssWidth, height: cssHeight },
        point = { x: 630.1, y: 574.9 };
      const restored = clientToWorld(
        worldToClient(point, camera, view, rect),
        camera,
        view,
        rect,
      );
      assert.ok(Math.hypot(restored.x - point.x, restored.y - point.y) < 1e-9);
    }
});
test('camera follow is delta-based and clamps after viewport resize', () => {
  const scene = { width: 2400, height: 1800 },
    viewport = { width: 960, height: 600 },
    actor = { x: 1700, y: 1200 };
  const one = followCamera({ x: 0, y: 0 }, actor, scene, viewport, 1);
  let many = { x: 0, y: 0 };
  for (let i = 0; i < 60; i++)
    many = followCamera(many, actor, scene, viewport, 1 / 60);
  assert.ok(Math.hypot(one.x - many.x, one.y - many.y) < 1e-8);
  assert.deepEqual(
    followCamera(
      { x: 999, y: 999 },
      actor,
      { width: 300, height: 200 },
      viewport,
      0.01,
    ),
    { x: 0, y: 0 },
  );
});
test('ground footprints preserve overhead passages while swept motion blocks thin solids', () => {
  const scene = {
    id: 'arch',
    width: 500,
    height: 500,
    props: [
      {
        x: 250,
        y: 200,
        footprints: [
          { x: -100, y: -20, w: 65, h: 30 },
          { x: 35, y: -20, w: 65, h: 30 },
        ],
      },
    ],
  };
  assert.equal(isWalkable(scene, 250, 200, 8), true);
  assert.equal(isWalkable(scene, 180, 200, 8), false);
  const actor = { x: 250, y: 240, radius: 8, speed: 1000 };
  for (let i = 0; i < 5; i++) moveActor(actor, { x: 0, y: -1 }, 0.05, scene);
  assert.ok(actor.y < 180);
  const wall = {
    width: 500,
    height: 500,
    props: [{ x: 200, y: 0, footprints: [{ x: 0, y: 0, w: 1, h: 500 }] }],
  };
  const runner = { x: 150, y: 200, radius: 8, speed: 10000 };
  moveActor(runner, { x: 1, y: 0.2 }, 1, wall);
  assert.ok(runner.x <= 192);
  assert.ok(runner.y > 200);
  assert.equal(
    clearSegment(wall, { x: 150, y: 200 }, { x: 250, y: 200 }, 8),
    false,
  );
});
test('touch magnitude and keyboard diagonals use one movement speed budget; water blocks except authored crossing', () => {
  const scene = {
    width: 600,
    height: 600,
    props: [],
    water: [
      [
        [290, 0],
        [400, 0],
        [400, 600],
        [290, 600],
      ],
    ],
    roads: [
      {
        points: [
          [100, 250],
          [500, 250],
        ],
        width: 60,
      },
    ],
  };
  assert.equal(isWalkable(scene, 330, 150), false);
  assert.equal(isWalkable(scene, 330, 250), true);
  const a = { x: 100, y: 100, speed: 100, radius: 8 },
    b = { ...a },
    c = { ...a };
  moveActor(a, { x: 1, y: 1 }, 0.1, scene);
  moveActor(b, { x: 1, y: 0 }, 0.1, scene);
  moveActor(c, { x: 0.5, y: 0 }, 0.1, scene);
  assert.ok(Math.abs(Math.hypot(a.x - 100, a.y - 100) - 10) < 1e-8);
  assert.equal(b.x - 100, 10);
  assert.equal(c.x - 100, 5);
});
test('owned joystick cancels without sticking and ignores a second pointer', () => {
  const stick = new TouchMovement(),
    center = { x: 60, y: 60, radius: 45 };
  assert.ok(stick.begin(1, 80, 60, 0, center));
  assert.equal(stick.begin(2, 0, 0, 20, center), false);
  assert.equal(stick.end(2, 30), false);
  assert.ok(stick.movement.x > 0);
  assert.ok(stick.end(1, 40, true));
  assert.equal(stick.movement.x, 0);
  assert.equal(stick.movement.active, false);
  assert.equal(stick.lastTap, null);
});
test('measured frames preserve foot anchors, directional scale and independent canopy occlusion', () => {
  const tree = COASTAL_FRAMES.tree,
    bounds = frameBounds(tree, 200, 300, 220);
  assert.equal(bounds.left + (tree.anchorX * 220) / tree.h, 200);
  assert.equal(bounds.top + (tree.anchorY * 220) / tree.h, 300);
  const prop = { x: 200, y: 300 };
  assert.equal(isOccluding(prop, bounds, { x: 200, y: 220 }), true);
  assert.equal(isOccluding(prop, bounds, { x: 200, y: 310 }), false);
  const side = actorFrame(
      { ...COASTAL_ACTOR, moving: true, facing: 'left' },
      0.12,
    ),
    up = actorFrame({ ...COASTAL_ACTOR, moving: true, facing: 'up' }, 0.12);
  assert.equal(side.flip, true);
  assert.equal(up.asset, 'kaida-walk');
  assert.notEqual(side.scale, up.scale);
  assert.equal(side.scale, COASTAL_ACTOR.animations.walk.right[0].scale);
  assert.throws(
    () =>
      validateFrames(
        {
          id: 'bad',
          frames: [{ x: 5, y: 0, w: 10, h: 3, anchorX: 0, anchorY: 0 }],
        },
        { width: 10, height: 10 },
      ),
    /Invalid frame/,
  );
});

test('selected runtime and editable originals match provenance; every measured crop fits', async () => {
  const root = new URL('../assets/', import.meta.url),
    provenance = JSON.parse(
      await readFile(new URL('provenance.json', root), 'utf8'),
    );
  for (const asset of provenance.assets) {
    const bytes = await readFile(new URL(asset.runtime, root));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      asset.sha256,
    );
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
    const entry = COASTAL_ASSETS.find((e) => e.id === asset.id);
    assert.equal(entry.width, asset.width);
    const frames = [
      ...Object.values(COASTAL_FRAMES),
      ...actorFrames(COASTAL_ACTOR),
    ].filter((f) => f.asset === asset.id);
    validateFrames(
      { ...entry, frames },
      { width: asset.width, height: asset.height },
    );
    if (asset.authoringSha256) {
      const source = await readFile(new URL(asset.authoring, root));
      assert.equal(
        createHash('sha256').update(source).digest('hex'),
        asset.authoringSha256,
      );
    }
  }
});
function fixture(options = {}) {
  const released = [],
    loads = [];
  const cache = new AssetCache({
    entries: ['shared', 'a', 'b', 'c'].map((id) => ({ id })),
    load: async (entry) => {
      loads.push(entry.id);
      return { id: entry.id, width: 2, height: 2 };
    },
    release: (image) => released.push(image.id),
    warmGroups: 1,
    ...options,
  });
  return { cache, released, loads };
}
test('asset groups load shared sources once and retire only inactive ownership under budget', async () => {
  const { cache, released, loads } = fixture({ budgetBytes: 32 });
  await cache.prepare('a', ['shared', 'a']);
  cache.activate('a');
  await cache.prepare('b', ['shared', 'b']);
  assert.equal(cache.active, 'a');
  assert.ok(cache.images.has('a'));
  cache.activate('b');
  assert.equal(cache.images.has('a'), false);
  assert.ok(cache.images.has('shared'));
  assert.equal(loads.filter((id) => id === 'shared').length, 1);
  assert.deepEqual(released, ['a']);
  cache.dispose();
  assert.equal(cache.diagnostics().assetBytes, 0);
  assert.equal(cache.diagnostics().assetCount, 0);
  assert.equal(new Set(released).size, 3);
  cache.dispose();
  assert.equal(released.length, 3);
});
test('failed destination keeps the active scene usable and retries missing sources', async () => {
  let fail = true;
  const loads = [];
  const { cache } = fixture({
    load: async (entry) => {
      loads.push(entry.id);
      if (entry.id === 'b' && fail) throw new Error('Offline');
      return { id: entry.id, width: 2, height: 2 };
    },
  });
  await cache.prepare('a', ['shared', 'a']);
  cache.activate('a');
  await assert.rejects(cache.prepare('b', ['shared', 'b']), /Offline/);
  assert.equal(cache.active, 'a');
  assert.ok(cache.images.has('a'));
  fail = false;
  await cache.prepare('b', ['shared', 'b']);
  cache.activate('b');
  assert.equal(loads.filter((id) => id === 'shared').length, 1);
  cache.dispose();
});
test('decode queue is bounded and stale sources cannot install after reset or disposal', async () => {
  const waiting = [],
    released = [];
  const { cache } = fixture({
    concurrency: 1,
    load: (entry) =>
      new Promise((resolve) =>
        waiting.push(() => resolve({ id: entry.id, width: 1, height: 1 })),
      ),
    release: (image) => released.push(image.id),
  });
  const preparation = cache.prepare('a', ['a', 'b']);
  const rejected = assert.rejects(preparation, { name: 'AbortError' });
  assert.equal(cache.running, 1);
  assert.equal(waiting.length, 1);
  cache.resetSession();
  waiting.shift()();
  await rejected;
  await tick();
  assert.equal(cache.images.size, 0);
  assert.deepEqual(released, ['a']);
  const later = cache.prepare('c', ['c']);
  const disposed = assert.rejects(later, { name: 'AbortError' });
  cache.dispose();
  waiting.shift()();
  await disposed;
  assert.equal(cache.images.size, 0);
  assert.deepEqual(released, ['a', 'c']);
  assert.equal(cache.running, 0);
});
test('cancelable hung decode releases its slot for the next session', async () => {
  const { cache } = fixture({
    concurrency: 1,
    load: (entry, { signal }) =>
      entry.id === 'a'
        ? new Promise((resolve, reject) =>
            signal.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('Canceled'), { name: 'AbortError' }),
              ),
            ),
          )
        : Promise.resolve({ id: entry.id, width: 1, height: 1 }),
  });
  const pending = cache.prepare('a', ['a']);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  cache.resetSession();
  await cache.prepare('b', ['b']);
  await rejected;
  cache.activate('b');
  assert.equal(cache.images.size, 1);
  assert.equal(cache.running, 0);
  cache.dispose();
});
test('neutral exterior preparation preserves enclosed pale details until specifically seeded', () => {
  const data = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  for (let y = 1; y < 4; y++)
    for (let x = 1; x < 4; x++) {
      const i = (y * 5 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 20;
    }
  data[(2 * 5 + 2) * 4] =
    data[(2 * 5 + 2) * 4 + 1] =
    data[(2 * 5 + 2) * 4 + 2] =
      220;
  const context = { getImageData: () => ({ data }), putImageData: () => {} };
  keyNeutralExterior(context, 5, 5);
  assert.equal(data[3], 0);
  assert.equal(data[(2 * 5 + 2) * 4 + 3], 255);
  keyNeutralExterior(context, 5, 5, { backgroundSeeds: [[2, 2]] });
  assert.equal(data[(2 * 5 + 2) * 4 + 3], 0);
});

test('discarded prepared groups release unused sources without touching active ownership', async () => {
  const { cache, released } = fixture();
  await cache.prepare('a', ['shared', 'a']);
  cache.activate('a');
  await cache.prepare('b', ['shared', 'b']);
  assert.equal(cache.discard('a'), false);
  assert.equal(cache.discard('b'), true);
  assert.deepEqual(released, ['b']);
  assert.equal(cache.active, 'a');
  assert.ok(cache.images.has('shared') && cache.images.has('a'));
  cache.dispose();
});

test('alternate art and scene use the generic contract with variable animation counts and explicit left poses', () => {
  const sprite = (x) => ({
    asset: 'drone-atlas',
    x,
    y: 0,
    w: 10,
    h: 12,
    anchorX: 5,
    anchorY: 10,
  });
  const actor = {
    x: 40,
    y: 40,
    scale: 2,
    speed: 50,
    fps: 5,
    animations: {
      idle: { default: [sprite(0)] },
      walk: {
        right: [sprite(0), sprite(10)],
        left: [sprite(20), sprite(30), sprite(40)],
      },
    },
  };
  const options = {
    mount: { append() {} },
    scene: {
      id: 'orbital-lab',
      width: 300,
      height: 200,
      props: [],
      isWalkable: (x) => x < 200,
    },
    assets: [{ id: 'drone-atlas', url: 'drone.png', width: 50, height: 12 }],
    frames: {},
    actor,
    drawGround() {},
  };
  assert.doesNotThrow(() => validateWorldOptions(options));
  const independent = copyActor(actor);
  independent.animations.walk.right[0].x = 1;
  assert.equal(actor.animations.walk.right[0].x, 0);
  const left = actorFrame({ ...actor, moving: true, facing: 'left' }, 0.4);
  assert.equal(left.x, 40);
  assert.equal(left.flip, false);
  assert.equal(left.height, 24);
  assert.equal(
    actorFrame({ ...actor, moving: true, facing: 'right' }, 0.4).x,
    0,
  );
  assert.equal(actorFrame({ ...actor, moving: false, facing: 'down' }, 1).x, 0);
  moveActor(actor, { x: 1, y: 0 }, 0.1, options.scene);
  assert.equal(actor.x, 45);
  assert.equal(isWalkable(options.scene, 220, 40), false);
  for (const field of ['assets', 'frames', 'actor', 'drawGround'])
    assert.throws(
      () => validateWorldOptions({ ...options, [field]: undefined }),
      /required/,
    );
  assert.equal(actorFrames(actor).length, 6);
});

test('generic runtime has no preset imports or sample asset assumptions', async () => {
  const runtime = await readFile(
    new URL('../src/world.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(runtime, /coastal|kaida|coast-ground|COASTAL|KAIDA/i);
});

test('other prepared reservations survive activation despite zero warm groups and a tiny budget', async () => {
  const { cache } = fixture({ warmGroups: 0, budgetBytes: 1 });
  await cache.prepare('future', ['shared', 'b']);
  await cache.prepare('later', ['shared', 'c']);
  await cache.prepare('now', ['shared', 'a']);
  cache.activate('now');
  assert.ok(
    cache.images.has('a') && cache.images.has('b') && cache.images.has('c'),
  );
  assert.equal(cache.diagnostics().reservationCount, 2);
  cache.activate('future');
  assert.ok(cache.images.has('b') && cache.images.has('c'));
  assert.equal(cache.images.has('a'), false);
  cache.activate('later');
  assert.ok(cache.images.has('c') && cache.images.has('shared'));
  assert.equal(cache.images.has('b'), false);
  assert.equal(cache.diagnostics().reservationCount, 0);
  cache.dispose();
});

test('invalid cache limits and entries fail synchronously instead of hanging the decode queue', () => {
  const options = { entries: [{ id: 'image' }] };
  for (const concurrency of [NaN, Infinity, 0, -1, 1.5, '2'])
    assert.throws(
      () => new AssetCache({ ...options, concurrency }),
      /concurrency/,
    );
  for (const budgetBytes of [NaN, Infinity, -1, '2'])
    assert.throws(
      () => new AssetCache({ ...options, budgetBytes }),
      /budgetBytes/,
    );
  for (const warmGroups of [NaN, Infinity, -1, 0.5, '2'])
    assert.throws(
      () => new AssetCache({ ...options, warmGroups }),
      /warmGroups/,
    );
  for (const entries of [
    undefined,
    {},
    [null],
    [{ id: '' }],
    [{ id: 3 }],
    [{ id: 'same' }, { id: 'same' }],
  ])
    assert.throws(() => new AssetCache({ entries }), /entries|ID/);
  assert.throws(
    () => new AssetCache({ ...options, commonIds: ['missing'] }),
    /registered/,
  );
  assert.doesNotThrow(
    () =>
      new AssetCache({
        ...options,
        concurrency: 1,
        budgetBytes: 0,
        warmGroups: 0,
      }),
  );
});

test('concurrent same-scene transitions keep the latest reservation, including an already active destination', async () => {
  for (const alreadyActive of [false, true]) {
    const { cache } = fixture({ warmGroups: 0, budgetBytes: 1 });
    await cache.prepare('old', ['a']);
    cache.activate('old');
    if (alreadyActive) {
      await cache.prepare('destination', ['b']);
      cache.activate('destination');
    }
    const transitions = new SceneTransition(cache),
      commits = [];
    const transition = (label) =>
      transitions.run('destination', ['b'], {
        validate() {
          assert.ok(
            cache.images.has('b'),
            'destination artwork must remain live',
          );
        },
        commit() {
          commits.push(label);
        },
      });
    const result = await Promise.all([
      transition('stale'),
      transition('latest'),
    ]);
    assert.deepEqual(result, [false, true]);
    assert.deepEqual(commits, ['latest']);
    assert.equal(cache.active, 'destination');
    assert.ok(cache.images.has('b'));
    assert.equal(cache.images.has('a'), false);
    assert.equal(cache.diagnostics().reservationCount, 0);
    transitions.dispose();
    cache.dispose();
  }
});

test('distinct reservation owners release only their sources when sharing a scene id', async () => {
  const { cache } = fixture({ warmGroups: 0, budgetBytes: 1 }),
    first = {},
    second = {};
  await cache.prepare('scene', ['a'], { reservation: first });
  await cache.prepare('scene', ['b'], { reservation: second });
  cache.discard('scene', { reservation: first });
  assert.equal(cache.images.has('a'), false);
  assert.ok(cache.images.has('b'));
  cache.activate('scene', { reservation: second });
  assert.ok(cache.images.has('b'));
  assert.equal(cache.diagnostics().reservationCount, 0);
  cache.dispose();
});

test('camera anchors are consumer-configurable, finite and bounded', () => {
  const scene = { width: 4000, height: 3000 },
    view = { width: 1000, height: 600 },
    actor = { x: 2000, y: 1500 };
  assert.deepEqual(
    followCamera({ x: 0, y: 0 }, actor, scene, view, 0, {
      immediate: true,
      anchorX: 0.4,
      anchorY: 0.72,
    }),
    { x: 1600, y: 1068 },
  );
  assert.deepEqual(
    followCamera({ x: 0, y: 0 }, actor, scene, view, 0, {
      immediate: true,
      anchorX: -2,
      anchorY: 3,
    }),
    { x: 2000, y: 900 },
  );
  assert.deepEqual(
    followCamera({ x: 0, y: 0 }, actor, scene, view, 0, {
      immediate: true,
      anchorX: NaN,
      anchorY: Infinity,
    }),
    { x: 1500, y: 1158 },
  );
});
