import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { indexedTriangles } from '../src/physics/collision-world.js';
import createLevel from '../src/levels/saffron/index.js';
import metadata from '../src/levels/saffron/metadata.js';
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

const level = createLevel({});
const track = level.createTrack();

test('Saffron has one canonical identity with a 40 m production and shape route', async () => {
  const catalog = createCatalog(
    {
      './halcyon/metadata.js': halcyonMetadata,
      './saffron/metadata.js': metadata,
    },
    {
      './halcyon/index.js': () => import('../src/levels/halcyon/index.js'),
      './saffron/index.js': async () => ({ default: createLevel }),
    },
  );
  assert.equal(catalog.list.length, 2);
  assert.equal(
    (await catalog.load('saffron')).metadata.name,
    'Saffron Leviathan',
  );
  assert.equal(track.width, 40);
  assert.ok(track.jumps.every((jump) => jump.halfWidth === 20));
  const shape = createLevel({ shape: true }).createTrack();
  for (let distance = 0; distance <= track.length; distance += 5) {
    assert.deepEqual(shape.sample(distance), track.sample(distance));
    assert.equal(
      shape.surfaceCoverage(distance),
      track.surfaceCoverage(distance),
    );
  }
});

function meshTriangles(mesh) {
  return indexedTriangles(
    mesh.geometry.attributes.position.array,
    mesh.geometry.index.array,
    {},
  ).map(({ points }) => points);
}

test('40 m production and shape decks match physical collision', () => {
  const world = level.createCollisionWorld({ track });
  try {
    for (const shape of [false, true]) {
      const road = createLevel({ shape }).createRoad({
        track: track,
        collisionWorld: world,
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
            const frame = track.sample(
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
          world.triangles
            .filter(({ kind }) => kind === 'deck')
            .map(({ points }) => points),
          'the entire visible 40 m top is the physical deck',
        );
        assert.deepEqual(
          road.group.children
            .filter(({ name }) => name === 'Continuous grounded baffle toe')
            .flatMap(meshTriangles),
          world.triangles
            .filter(({ kind, id }) => kind === 'rail' && id.startsWith('road-'))
            .map(({ points }) => points),
          'visible continuous boundary matches its physical rail',
        );
      } finally {
        road.dispose();
      }
    }
    const frame = track.sample(100);
    const pose = (lateral) => ({
      position: frame.position
        .clone()
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, 1.1),
      quaternion: frame.quaternion.clone(),
    });
    for (const side of [-1, 1]) {
      assert.equal(
        world.sweepHull(pose(side * 14), pose(side * 17)),
        null,
        'the inner lanes are open',
      );
      assert.equal(
        world.sweepHull(pose(side * 17), pose(side * 21))?.shape.kind,
        'rail',
        'the outer rail remains physical',
      );
    }
  } finally {
    world.dispose();
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

test('production runtime supports both outer lanes and all authored jumps', async () => {
  const owner = await session(level, track);
  try {
    assert.ok(compatibleRuntime(owner.runtime, runtimeIdentity(owner.runtime)));
    for (const side of [-1, 1]) {
      owner.reset('staging', { distance: 100, lateral: side * 17, speed: 40 });
      const grounded = owner.step();
      assert.ok(Math.abs(grounded.state.lateral) > 16.9);
      assert.equal(grounded.motion.mode, 'magnetic');
      assert.ok(!grounded.events.some(({ type }) => type === 'impact'));
    }
    for (let index = 0; index < 3; index++) {
      const scenario = `jump${index + 1}-success`;
      owner.reset(scenario);
      let landed = false;
      for (let tick = 0; tick < 600; tick++) {
        const after = owner.step();
        const transfer = after.events.find(
          ({ type }) => type === 'jump-transfer',
        );
        if (!transfer) continue;
        assert.equal(transfer.payload.outcome, 'landed', scenario);
        assert.equal(after.motion.mode, 'magnetic');
        landed = true;
        break;
      }
      assert.ok(landed, `${scenario} lands within five seconds`);
    }
  } finally {
    owner.dispose();
  }
});

test('real receiving decks relatch inside the outer lane', async () => {
  const owner = await session(level, track, { automaticRecovery: false });
  try {
    for (const [index, jump] of track.jumps.entries()) {
      if (jump.optional) continue;
      owner.reset(`jump${index + 1}-success`);
      const frame = track.sample(jump.landingStart + 170);
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
          `${jump.id} supports the outer lane`,
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
