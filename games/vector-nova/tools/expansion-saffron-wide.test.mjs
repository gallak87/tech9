import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import originalLevel from '../src/levels/saffron/index.js';
import wideLevel from '../src/levels/saffron-wide/index.js';
import originalMetadata from '../src/levels/saffron/metadata.js';
import wideMetadata from '../src/levels/saffron-wide/metadata.js';
import halcyonMetadata from '../src/levels/halcyon/metadata.js';
import { createCatalog } from '../src/levels/contract.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createRace } from '../src/race/index.js';
import {
  advanceSession,
  compatibleRuntime,
  runtimeIdentity,
} from '../src/core/session-runtime.js';

const original = originalLevel({});
const wide = wideLevel({});
const originalTrack = original.createTrack();
const wideTrack = wide.createTrack();

test('Saffron Wide is independently discoverable and preserves the complete reference route', async () => {
  const catalog = createCatalog(
    {
      './halcyon/metadata.js': halcyonMetadata,
      './saffron/metadata.js': originalMetadata,
      './saffron-wide/metadata.js': wideMetadata,
    },
    {
      './halcyon/index.js': () => import('../src/levels/halcyon/index.js'),
      './saffron/index.js': async () => ({ default: originalLevel }),
      './saffron-wide/index.js': async () => ({ default: wideLevel }),
    },
  );
  assert.equal(catalog.list.length, 3);
  for (const id of ['saffron', 'saffron-wide'])
    assert.equal((await catalog.load(id)).metadata.id, id);
  assert.notEqual(original.version, wide.version);
  assert.notEqual(originalTrack.id, wideTrack.id);
  assert.notEqual(originalTrack.geometryVersion, wideTrack.geometryVersion);
  assert.equal(originalTrack.width, 32);
  assert.equal(wideTrack.width, 32, 'gate 2 remains an unwidened copy');
  for (const key of [
    'length',
    'jumps',
    'sections',
    'checkpoints',
    'landmarks',
    'scenarios',
  ])
    assert.deepEqual(wideTrack[key], originalTrack[key], key);
  assert.deepEqual(wide.playtests, original.playtests);
  assert.deepEqual(wide.camera, original.camera);
  assert.deepEqual(
    wide.racing.createDevices(wideTrack),
    original.racing.createDevices(originalTrack),
  );
  const shape = wideLevel({ shape: true }).createTrack();
  for (let distance = 0; distance <= originalTrack.length; distance++) {
    assert.deepEqual(
      wideTrack.sample(distance),
      originalTrack.sample(distance),
    );
    assert.deepEqual(shape.sample(distance), originalTrack.sample(distance));
    assert.equal(
      wideTrack.surfaceCoverage(distance),
      originalTrack.surfaceCoverage(distance),
    );
  }
  assert.throws(
    () => wide.createRuntime({ track: originalTrack }),
    /requires its authored fossil route/,
  );
  assert.throws(
    () => original.createRuntime({ track: wideTrack }),
    /requires its authored fossil route/,
  );
});

function geometryDigest(group) {
  const hash = createHash('sha256');
  let meshes = 0;
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    hash.update(
      JSON.stringify({
        name: object.name,
        matrix: object.matrixWorld.elements,
        count: object.count,
      }),
    );
    for (const array of [
      object.geometry.index?.array,
      ...Object.values(object.geometry.attributes).map(
        (attribute) => attribute.array,
      ),
      object.instanceMatrix?.array,
    ])
      if (array)
        hash.update(
          Buffer.from(array.buffer, array.byteOffset, array.byteLength),
        );
  });
  return { meshes, sha256: hash.digest('hex') };
}

test('reference copy retains production and shape construction with independent collision identity', () => {
  const worlds = [
    original.createCollisionWorld({ track: originalTrack }),
    wide.createCollisionWorld({ track: wideTrack }),
  ];
  try {
    assert.notEqual(worlds[0].id, worlds[1].id);
    assert.notEqual(worlds[0].rulesId, worlds[1].rulesId);
    assert.deepEqual(worlds[1].triangles, worlds[0].triangles);
    assert.deepEqual(worlds[1].targets, worlds[0].targets);
    for (const shape of [false, true]) {
      const roads = [
        originalLevel({ shape }).createRoad({
          track: originalTrack,
          collisionWorld: worlds[0],
        }),
        wideLevel({ shape }).createRoad({
          track: wideTrack,
          collisionWorld: worlds[1],
        }),
      ];
      try {
        assert.deepEqual(
          geometryDigest(roads[1].group),
          geometryDigest(roads[0].group),
        );
      } finally {
        roads.forEach((road) => road.dispose());
      }
    }
  } finally {
    worlds.forEach((world) => world.dispose());
  }
});

async function session(level, track) {
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const runtime = createDeviceRuntime({
    track,
    devices: level.racing.createDevices(track),
    motion: level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    }),
  });
  let state, race;
  return {
    runtime,
    dynamics,
    reset(scenario) {
      dynamics.reset();
      state = { ...createVehicleState(), ...track.scenarios[scenario] };
      runtime.reset({ state, scenario, seed: 17 });
      race = createRace(track, { rulesId: runtime.rulesId, untimed: true });
      race.placeScenario(state.distance);
    },
    step() {
      const events = [];
      advanceSession({
        state,
        runtime,
        dynamics,
        race,
        input: {},
        dt: 1 / 120,
        emit: (event) => events.push(event),
      });
      return { state: { ...state }, motion: runtime.snapshot(), events };
    },
    dispose() {
      runtime.dispose();
      dynamics.dispose();
      collisionWorld.dispose();
    },
  };
}

test('production Rapier clone preserves all three jump outcomes and rejects cross-level replay identity', async () => {
  const a = await session(original, originalTrack);
  const b = await session(wide, wideTrack);
  try {
    assert.notEqual(a.dynamics.rulesId, b.dynamics.rulesId);
    assert.ok(compatibleRuntime(a.runtime, runtimeIdentity(a.runtime)));
    assert.ok(compatibleRuntime(b.runtime, runtimeIdentity(b.runtime)));
    assert.equal(
      compatibleRuntime(a.runtime, runtimeIdentity(b.runtime)),
      false,
    );
    assert.equal(
      compatibleRuntime(b.runtime, runtimeIdentity(a.runtime)),
      false,
    );
    for (let index = 0; index < 3; index++) {
      const scenario = `jump${index + 1}-success`;
      a.reset(scenario);
      b.reset(scenario);
      let landed = false;
      for (let tick = 0; tick < 600; tick++) {
        const before = a.step();
        const after = b.step();
        assert.deepEqual(after, before, `${scenario} tick ${tick}`);
        const transfer = after.events.find(
          ({ type }) => type === 'jump-transfer',
        );
        if (transfer) {
          assert.equal(transfer.payload.outcome, 'landed');
          landed = true;
          break;
        }
      }
      assert.ok(landed, `${scenario} lands within five seconds`);
    }
  } finally {
    a.dispose();
    b.dispose();
  }
});
