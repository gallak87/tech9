import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { indexedTriangles } from '../src/physics/collision-world.js';
import { buildFossilPlacements as originalPlacements } from '../src/levels/saffron/environment/placements.js';
import { buildFossilPlacements as widePlacements } from '../src/levels/saffron-wide/environment/placements.js';
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
  assert.equal(wideTrack.width, 40);
  assert.deepEqual(
    wideTrack.jumps,
    originalTrack.jumps.map((jump) => ({ ...jump, halfWidth: 20 })),
    'only receiving width changes; longitudinal jump intervals stay fixed',
  );
  for (const key of [
    'length',
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

function meshTriangles(mesh) {
  return indexedTriangles(
    mesh.geometry.attributes.position.array,
    mesh.geometry.index.array,
    {},
  ).map(({ points }) => points);
}

test('40 m production and shape decks match collision while scenery stays fixed', () => {
  const worlds = [
    original.createCollisionWorld({ track: originalTrack }),
    wide.createCollisionWorld({ track: wideTrack }),
  ];
  try {
    assert.notEqual(worlds[0].id, worlds[1].id);
    assert.notEqual(worlds[0].rulesId, worlds[1].rulesId);
    const scenery = (world) =>
      world.triangles.filter(
        ({ id, kind }) =>
          kind !== 'deck' &&
          kind !== 'rail' &&
          !id.startsWith('road-') &&
          id !== 'ramp-faces',
      );
    assert.deepEqual(scenery(worlds[1]), scenery(worlds[0]));
    assert.deepEqual(
      widePlacements(wideTrack, worlds[1].survey),
      originalPlacements(originalTrack, worlds[0].survey),
      'widening must not rerandomize or remove existing scenery',
    );
    for (const shape of [false, true]) {
      const road = wideLevel({ shape }).createRoad({
        track: wideTrack,
        collisionWorld: worlds[1],
      });
      try {
        const decks = road.group.children.filter(
          ({ userData }) => userData.drivingSurface,
        );
        assert.equal(decks.length, 3, 'every supported run remains present');
        for (const deck of decks) {
          const positions = deck.geometry.attributes.position;
          const [start, end] = deck.userData.interval;
          const rows = positions.count / 2;
          for (let row = 0; row < rows; row++) {
            const frame = wideTrack.sample(
              start + ((end - start) * row) / (rows - 1),
            );
            for (const [index, lateral] of [
              [row * 2, -20],
              [row * 2 + 1, 20],
            ]) {
              const actual = new T.Vector3().fromBufferAttribute(
                positions,
                index,
              );
              const expected = frame.position
                .clone()
                .addScaledVector(frame.right, lateral);
              assert.ok(actual.distanceTo(expected) < 0.0002);
            }
          }
        }
        assert.deepEqual(
          decks.flatMap(meshTriangles),
          worlds[1].triangles
            .filter(({ kind }) => kind === 'deck')
            .map(({ points }) => points),
          'the entire visible 40 m top is the physical deck',
        );
        assert.deepEqual(
          road.group.children
            .filter(({ name }) => name === 'Continuous grounded baffle toe')
            .flatMap(meshTriangles),
          worlds[1].triangles
            .filter(({ kind, id }) => kind === 'rail' && id.startsWith('road-'))
            .map(({ points }) => points),
          'visible continuous boundary matches its physical rail',
        );
      } finally {
        road.dispose();
      }
    }
    const frame = wideTrack.sample(100);
    const pose = (lateral) => ({
      position: frame.position
        .clone()
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, 1.1),
      quaternion: frame.quaternion.clone(),
    });
    for (const side of [-1, 1]) {
      assert.equal(
        worlds[0].sweepHull(pose(side * 14), pose(side * 17))?.shape.kind,
        'rail',
      );
      assert.equal(
        worlds[1].sweepHull(pose(side * 14), pose(side * 17)),
        null,
        'old rail footprint is open',
      );
      assert.equal(
        worlds[1].sweepHull(pose(side * 17), pose(side * 21))?.shape.kind,
        'rail',
        'new outer rail remains physical',
      );
    }
  } finally {
    worlds.forEach((world) => world.dispose());
  }
});

async function session(level, track, playtest = null) {
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const runtime = createDeviceRuntime({
    track,
    devices: level.racing.createDevices(track),
    motion: level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      playtest,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    }),
  });
  let state, race;
  return {
    runtime,
    dynamics,
    reset(scenario, overrides = {}) {
      dynamics.reset();
      state = {
        ...createVehicleState(),
        ...track.scenarios[scenario],
        ...overrides,
      };
      runtime.reset({ state, scenario, seed: 17 });
      race = createRace(track, { rulesId: runtime.rulesId, untimed: true });
      race.placeScenario(state.distance);
    },
    launch(setup) {
      runtime.launch(state, setup);
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

test('production runtime uses wider grounded and receiving bounds with independent replay identity', async () => {
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
    for (const side of [-1, 1]) {
      a.reset('staging', { distance: 100, lateral: side * 17, speed: 40 });
      b.reset('staging', { distance: 100, lateral: side * 17, speed: 40 });
      const oldGround = a.step();
      const wideGround = b.step();
      assert.ok(Math.abs(oldGround.state.lateral) <= 13.75);
      assert.ok(
        Math.abs(wideGround.state.lateral) > 16.9,
        'new lane is drivable',
      );
      assert.equal(wideGround.motion.mode, 'magnetic');
      assert.ok(!wideGround.events.some(({ type }) => type === 'impact'));
      b.reset('staging', { distance: 100, lateral: side * 19, speed: 40 });
      assert.ok(
        Math.abs(b.step().state.lateral) <= 17.75,
        'full hull still respects the new edge',
      );
    }
    for (const [owner, label] of [
      [a, 'original'],
      [b, 'wide'],
    ]) {
      for (let index = 0; index < 3; index++) {
        const scenario = `jump${index + 1}-success`;
        owner.reset(scenario);
        let landed = false;
        for (let tick = 0; tick < 600; tick++) {
          const after = owner.step();
          const transfer = after.events.find(
            ({ type }) => type === 'jump-transfer',
          );
          if (transfer) {
            assert.equal(
              transfer.payload.outcome,
              'landed',
              `${label} ${scenario}`,
            );
            assert.equal(after.motion.mode, 'magnetic');
            landed = true;
            break;
          }
        }
        assert.ok(landed, `${label} ${scenario} lands within five seconds`);
      }
    }
  } finally {
    a.dispose();
    b.dispose();
  }
});

test('real receiving decks relatch inside the added outer lane', async () => {
  const owner = await session(wide, wideTrack, { automaticRecovery: false });
  try {
    for (const [index, jump] of wideTrack.jumps.entries()) {
      if (jump.optional) continue;
      owner.reset(`jump${index + 1}-success`);
      const frame = wideTrack.sample(jump.landingStart + 170);
      owner.launch({
        jump: jump.id,
        position: frame.position
          .clone()
          .addScaledVector(frame.right, 17)
          .addScaledVector(frame.up, 2)
          .toArray(),
        quaternion: frame.quaternion.toArray(),
        velocity: frame.tangent
          .clone()
          .multiplyScalar(20)
          .addScaledVector(frame.up, -6)
          .toArray(),
      });
      let landed = false;
      for (let tick = 0; tick < 120; tick++) {
        const after = owner.step();
        const transfer = after.events.find(
          ({ type }) => type === 'jump-transfer',
        );
        if (!transfer) continue;
        assert.equal(transfer.payload.outcome, 'landed', jump.id);
        assert.equal(after.motion.mode, 'magnetic');
        assert.ok(
          after.state.lateral > 16,
          `${jump.id} supports the added outer lane`,
        );
        landed = true;
        break;
      }
      assert.ok(landed, `${jump.id} relatches within one second`);
    }
  } finally {
    owner.dispose();
  }
});
