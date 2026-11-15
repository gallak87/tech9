import test from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import * as T from 'three';
import { generateDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { createRegionPlan } from './region-plan.js';
import {
  createProductionPlacement,
  createProductionEnvironment,
} from './production-environment.js';

const doc = generateDocument({
  biome: 'nightweir',
  seed: 42,
  length: 1800,
  seedJumps: false,
});
const track = createEditorTrack(doc),
  plan = createRegionPlan(doc, track);
const asset = {
  url: '/registered-kit.glb',
  bounds: [
    [10, -4, -20],
    [14, 8, -10],
  ],
};

test('production placement seats tilted trusted bounds and reserves actual road volume', () => {
  const helper = createProductionPlacement(doc, track, plan, {
    assets: { a: asset },
    limit: 2,
  });
  const site = {
    id: 'tilted',
    x: plan.bounds.max.x + 500,
    z: plan.bounds.max.z + 500,
    y: 20,
    scale: [2, 3, 1],
    quaternion: new T.Quaternion().setFromEuler(new T.Euler(0.3, 0.6, 0.2)),
    embed: 0.2,
  };
  const placed = helper.place('a', site);
  assert(placed);
  const height = placed.bounds.max.y - placed.bounds.min.y;
  assert(Math.abs(placed.bounds.min.y - (20 - height * 0.2)) < 1e-8);
  assert.equal(
    helper.place('a', site),
    false,
    'overlapping architecture is not emitted',
  );
  assert(helper.place('a', { ...site, id: 'allowed', overlap: true }));
  assert.equal(
    helper.place('a', { ...site, x: site.x + 1000 }),
    false,
    'placement budget is bounded',
  );
  const fresh = createProductionPlacement(doc, track, plan, {
    assets: { a: asset },
  });
  assert.deepEqual(
    fresh.random(),
    createProductionPlacement(doc, track, plan).random(),
  );
  const frame = track.sample(300);
  const blocking = new T.Box3().setFromCenterAndSize(
    frame.position,
    new T.Vector3(100, 100, 100),
  );
  assert.equal(fresh.acceptBounds(blocking, { id: 'blocked' }), false);
  assert.equal(fresh.accepted.length, 0);
});

test('CPU production builders are synchronous and never construct image finishes', () => {
  const solids = [];
  let finishLoads = 0;
  const owner = createProductionEnvironment(doc, track, {
    plan,
    collectSolid: (solid) => solids.push(solid),
    descriptor: {
      grounded: false,
      name: 'CPU fixture',
      createFinish() {
        finishLoads++;
        throw new Error('CPU cannot request maps');
      },
      build({ owner, placement, collectSolid }) {
        const centre = new T.Vector3(
          plan.bounds.max.x + 500,
          10,
          plan.bounds.max.z + 500,
        );
        const bounds = new T.Box3().setFromCenterAndSize(
          centre,
          new T.Vector3(10, 10, 10),
        );
        if (placement.acceptBounds(bounds, { id: 'actual-assembly' }))
          owner.block(
            'Actual assembly',
            owner.material('Fixture', { color: '#777777' }),
            centre,
            new T.Vector3(10, 10, 10),
            new T.Quaternion(),
            collectSolid,
          );
      },
    },
  });
  assert.equal(finishLoads, 0);
  assert.equal(solids.length, 1);
  assert.equal(owner.group.userData.region.assemblies, 1);
  assert.equal(owner.group.userData.region.terrainMeshes, 0);
  owner.dispose();
  owner.dispose();
});

test('a production finish is ready before material binding and releases after failure', async () => {
  let resolveFinish,
    finishDisposed = 0,
    loads = 0,
    binds = 0;
  const scene = new T.Group(),
    geometry = new T.BoxGeometry(2, 2, 2),
    material = new T.MeshStandardMaterial();
  scene.add(new T.Mesh(geometry, material));
  const ready = new Promise((resolve) => {
    resolveFinish = resolve;
  });
  const descriptor = {
    grounded: false,
    assets: {
      a: {
        url: '/fixture.glb',
        bounds: [
          [-1, -1, -1],
          [1, 1, 1],
        ],
      },
    },
    createFinish() {
      return {
        ready,
        finishMaterial(material) {
          binds++;
          material.roughness = 0.31;
        },
        dispose() {
          finishDisposed++;
        },
      };
    },
    plan(doc, track, plan, helper) {
      helper.place('a', {
        x: plan.bounds.max.x + 500,
        z: plan.bounds.max.z + 500,
      });
    },
    async loadAsset() {
      loads++;
      return { scene };
    },
  };
  const owner = createProductionEnvironment(doc, track, { descriptor, plan });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    loads,
    1,
    'immutable source loading is independent of owner finish maps',
  );
  assert.equal(binds, 0, 'material binding waits for this owner finish');
  resolveFinish();
  await owner.ready;
  const kitMesh = owner.group.children
    .flatMap((child) => child.children ?? [])
    .find((child) => child.isInstancedMesh);
  assert.equal(kitMesh.material.roughness, 0.31);
  owner.dispose();
  owner.dispose();
  assert.equal(finishDisposed, 1);
  let failureDisposed = 0;
  const failed = createProductionEnvironment(doc, track, {
    plan,
    descriptor: {
      grounded: false,
      createFinish() {
        return {
          ready: Promise.reject(new Error('fixture failure')),
          dispose() {
            failureDisposed++;
          },
        };
      },
    },
  });
  await assert.rejects(failed.ready, /fixture failure/);
  assert(failed.isDisposed());
  assert.equal(failureDisposed, 1);
});

test('canceling a pending finish does not poison a replacement sharing the source load', async () => {
  let resolveSource,
    resolveFirst,
    resolveSecond,
    finishes = 0,
    loads = 0;
  const sourceReady = new Promise((resolve) => {
    resolveSource = resolve;
  });
  const gates = [
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
    new Promise((resolve) => {
      resolveSecond = resolve;
    }),
  ];
  const disposedFinishes = [0, 0],
    boundFinishes = [0, 0];
  const descriptor = {
    grounded: false,
    assets: {
      a: {
        url: '/concurrent-finish-fixture.glb',
        bounds: [
          [-1, -1, -1],
          [1, 1, 1],
        ],
      },
    },
    createFinish() {
      const index = finishes++;
      return {
        ready: gates[index],
        finishMaterial(material) {
          boundFinishes[index]++;
          material.roughness = index ? 0.63 : 0.21;
        },
        dispose() {
          disposedFinishes[index]++;
        },
      };
    },
    plan(doc, track, plan, helper) {
      helper.place('a', {
        x: plan.bounds.max.x + 500,
        z: plan.bounds.max.z + 500,
      });
    },
    async loadAsset() {
      loads++;
      await sourceReady;
      const scene = new T.Group();
      scene.add(
        new T.Mesh(new T.BoxGeometry(2, 2, 2), new T.MeshStandardMaterial()),
      );
      return { scene };
    },
  };
  const first = createProductionEnvironment(doc, track, { descriptor, plan });
  const firstResult = first.ready.then(
    () => null,
    (error) => error,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  first.dispose();
  const second = createProductionEnvironment(doc, track, { descriptor, plan });
  try {
    resolveSource();
    resolveSecond();
    await second.ready;
    assert.equal(
      loads,
      1,
      'overlapping owners share one immutable source request',
    );
    assert.equal(
      second.isDisposed(),
      false,
      'first owner cancellation cannot cancel its replacement',
    );
    assert.deepEqual(
      boundFinishes,
      [0, 1],
      'replacement binds only its own ready finish',
    );
    const mesh = second.group.children
      .flatMap((child) => child.children ?? [])
      .find((child) => child.isInstancedMesh);
    assert.equal(mesh.material.roughness, 0.63);
    resolveFirst();
    assert.equal((await firstResult).name, 'AbortError');
  } finally {
    resolveSource();
    resolveFirst();
    resolveSecond();
    first.dispose();
    second.dispose();
    await firstResult;
  }
  assert.deepEqual(disposedFinishes, [1, 1]);
});
