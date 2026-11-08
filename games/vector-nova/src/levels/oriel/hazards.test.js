import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrielTrack } from './track/model.js';
import { createOrielRoad } from './track/index.js';
import { createOrielCollisionWorld } from './collision.js';
import { createOrielRuntime } from './runtime.js';
import { createDevices } from './devices.js';
import { orielRoadBounds } from './hazards.js';
import { createVehicleState } from '../../physics/index.js';
import { createRapierWorld } from '../../physics/rapier-world.js';
import { withMagneticBoundaries } from '../../physics/magnetic-boundaries.js';
import { createRacers, getRacerControl } from '../../race/racers.js';
import { createDeviceRuntime } from '../../pickups/runtime.js';
import { createCollisionWorld } from '../../physics/collision-world.js';

const track = createOrielTrack();
const dt = 1 / 120;
const ships = ['shrike', 'kestrel', 'bastion', 'needle'];
const isReset = (event) => ['road-recovery', 'jump-miss'].includes(event.type);

async function worldFor(course) {
  const collisionWorld = createOrielCollisionWorld({ track: course });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(course, collisionWorld),
  });
  return {
    collisionWorld,
    dynamics,
    dispose() {
      dynamics.dispose();
      collisionWorld.dispose();
    },
  };
}

test('the Oriel rival preview survives runtime rollback before the next staged tick', () => {
  const island = track.challenges.find(
    (challenge) => challenge.kind === 'garden',
  );
  const state = { ...createVehicleState(), distance: island.start - 90 };
  const runtime = createOrielRuntime({ track });
  try {
    runtime.reset({ state });
    const saved = runtime.snapshot();
    const lane = runtime.avoidance();
    state.distance = 4700;
    runtime.advance(state, { throttle: 0, brake: 0, steer: 0 }, dt);
    assert.equal(runtime.avoidance(), null);
    runtime.restore(saved);
    assert.equal(runtime.avoidance(), lane);
    assert.deepEqual(runtime.snapshot(), saved);
  } finally {
    runtime.dispose();
  }
});

test('visible civic islands preserve the forty-metre base and clear consistent 18–40m corridors', () => {
  assert.equal(track.width, 40);
  assert.equal(track.challenges.filter((c) => c.kind === 'garden').length, 5);
  assert.equal(track.challenges.filter((c) => c.kind === 'launch').length, 4);
  let minimum = 40;
  for (let s = 0; s < track.length; s += 0.5) {
    const bounds = orielRoadBounds(track, s);
    if (!bounds) continue;
    assert.ok(bounds.min >= -20 && bounds.max <= 20);
    assert.ok(bounds.max - bounds.min >= 18 - 1e-8, `clear lane at ${s}`);
    minimum = Math.min(minimum, bounds.max - bounds.min);
    assert.deepEqual(track.sampleSurface(s, 0).bounds, bounds);
    assert.ok(!track.isGap(s), 'all islands are supported road features');
  }
  assert.equal(minimum, 18);
  for (const jump of track.jumps) {
    const bounds = orielRoadBounds(track, jump.takeoff - 50);
    assert.equal(bounds.max - bounds.min, 19);
    assert.equal(bounds.min + bounds.max, 0);
    assert.equal(orielRoadBounds(track, jump.landingStart + 1), null);
  }
  for (const state of Object.values(track.scenarios)) {
    if (state.speed) continue;
    const bounds = orielRoadBounds(track, state.distance);
    if (bounds)
      assert.ok(
        state.lateral > bounds.min + 4.5 && state.lateral < bounds.max - 4.5,
      );
  }
  for (const device of createDevices(track)) {
    for (
      let offset = -device.length / 2;
      offset <= device.length / 2;
      offset += 0.5
    ) {
      const bounds = orielRoadBounds(track, device.distance + offset);
      if (!bounds) continue;
      assert.ok(
        device.lateral - device.width / 2 > bounds.min + 0.6,
        device.id,
      );
      assert.ok(
        device.lateral + device.width / 2 < bounds.max - 0.6,
        device.id,
      );
    }
  }
});

test('every rendered divider face is retained as a native solid around the entire lap', () => {
  const road = createOrielRoad(track);
  const world = createOrielCollisionWorld({ track });
  try {
    const mesh = road.group.children.find(
      (object) => object.userData.challengeBarrier,
    );
    const faces = world.triangles.filter(
      (triangle) => triangle.id === 'oriel-civic-chicane-dividers',
    );
    assert.equal(faces.length, mesh.geometry.index.count / 3);
    const position = mesh.geometry.attributes.position;
    const indices = mesh.geometry.index;
    for (let face = 0; face < faces.length; face++)
      for (let vertex = 0; vertex < 3; vertex++) {
        const index = indices.getX(face * 3 + vertex);
        assert.deepEqual(faces[face].points[vertex], [
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        ]);
      }
    for (const winding of track.windings)
      assert.ok(
        faces.some(
          (face) =>
            face.distance > winding.start && face.distance < winding.end,
        ),
      );
    for (const id of [
      'oriel-civic-chicane-dividers',
      'oriel-civic-outer-parapets',
    ])
      assert.ok(world.targets.some((target) => target.id === id));
    const bounded = createCollisionWorld({
      id: 'oriel-challenge-test',
      version: 1,
      geometryId: track.challengeVersion,
      triangles: withMagneticBoundaries(track, world).triangles,
    });
    try {
      for (const island of track.challenges.filter(
        (challenge) => challenge.kind === 'garden',
      )) {
        const frame = track.sample(island.center);
        const pose = (lateral) => ({
          position: frame.position
            .clone()
            .addScaledVector(frame.right, lateral)
            .addScaledVector(frame.up, 1.1),
          quaternion: frame.quaternion.clone(),
        });
        const hit = bounded.sweepHull(
          pose(-island.side * 15),
          pose(-island.side * 25),
        );
        assert.equal(hit?.shape.id, 'oriel-civic-outer-parapets', island.id);
      }
    } finally {
      bounded.dispose();
    }
  } finally {
    world.dispose();
    road.dispose();
  }
});

test('all stock ships must choose the chicane line: old centerline is clean, new centerline hits real dividers, active cruise/boost lines clear', async (t) => {
  const open = { ...track, challenges: [], sampleSurface: undefined };
  const before = await worldFor(open);
  const after = await worldFor(track);
  t.after(() => {
    before.dispose();
    after.dispose();
  });
  const counts = [];
  for (const winding of track.windings)
    for (const shipId of ships)
      for (const mode of ['open', 'centerline', 'guided', 'guided-boost']) {
        const course = mode === 'open' ? open : track;
        const physical = mode === 'open' ? before : after;
        const runtime = createOrielRuntime({
          track: course,
          ...physical,
          settings: { steeringAssist: 0.3 },
        });
        const state = {
          ...createVehicleState(shipId),
          distance: winding.start - 80,
          speed: 90,
        };
        const events = [];
        try {
          runtime.reset({ state, seed: 7 });
          for (
            let tick = 0;
            tick < 2400 && state.distance < winding.end;
            tick++
          ) {
            const guided = mode.startsWith('guided');
            const input = getRacerControl(state, guided ? track : open, {
              difficulty: 'hard',
              runtime: guided ? runtime : null,
            });
            input.boost = mode === 'guided-boost';
            events.push(...runtime.advance(state, input, dt));
          }
          assert.ok(
            state.distance >= winding.end,
            `${shipId} ${mode} completes ${winding.id}`,
          );
          assert.ok(
            !events.some(isReset),
            `${shipId} ${mode} stays on the road`,
          );
          const impacts = events.filter((event) => event.type === 'impact');
          if (mode === 'centerline') {
            assert.ok(
              impacts.some(
                (event) =>
                  event.payload.collider === 'oriel-civic-chicane-dividers',
              ),
              `${shipId} hits actual rendered divider`,
            );
          } else assert.equal(impacts.length, 0, `${shipId} ${mode} clear`);
          counts.push({
            shipId,
            winding: winding.id,
            mode,
            impacts: impacts.length,
          });
        } finally {
          runtime.dispose();
        }
      }
  const summary = Object.fromEntries(
    ['open', 'centerline', 'guided', 'guided-boost'].map((mode) => {
      const cases = counts.filter((entry) => entry.mode === mode);
      return [
        mode,
        {
          cases: cases.length,
          contacts: cases.reduce((sum, entry) => sum + entry.impacts, 0),
        },
      ];
    }),
  );
  t.diagnostic(`Native contacts: ${JSON.stringify(summary)}`);
});

test('nine native hard rivals complete two valid laps; a bounded pack recovery requires real airborne racer contact', async (t) => {
  const physical = await worldFor(track);
  const devices = createDevices(track);
  const records = [];
  const field = createRacers({
    track,
    devices,
    dynamics: physical.dynamics,
    createRuntime() {
      const motion = createOrielRuntime({ track, ...physical });
      const record = { resets: [], airCollisions: [], transfers: [] };
      records.push(record);
      const finish = motion.finishAdvance;
      motion.finishAdvance = (...args) => {
        const events = finish(...args);
        for (const event of events) {
          if (isReset(event))
            record.resets.push({
              type: event.type,
              ...event.payload,
              time: args[0].time,
              distance: args[0].distance,
            });
          if (
            event.type === 'impact' &&
            event.payload.contactKind === 'racer' &&
            motion.pose(1).grounded === false
          )
            record.airCollisions.push({
              time: args[0].time,
              distance: args[0].distance,
            });
          if (event.type === 'jump-transfer')
            record.transfers.push({ ...event.payload, time: args[0].time });
        }
        return events;
      };
      return createDeviceRuntime({ track, devices, motion });
    },
  });
  t.after(() => {
    field.dispose();
    physical.dispose();
  });
  field.reset({ enabled: true, difficulty: 'hard' });
  for (let tick = 0; tick < 120 * 200; tick++) {
    field.advance(dt);
    if (field.opponents.every((opponent) => opponent.finish)) break;
  }
  let totalResets = 0;
  const recoveries = [];
  field.opponents.forEach((opponent, index) => {
    assert.equal(opponent.finish?.valid, true, opponent.specification.id);
    assert.equal(opponent.finish.lapTimes.length, 2);
    const resets = records[index].resets.filter(
      (event) => event.time <= opponent.finish.totalTime + 1e-6,
    );
    totalResets += resets.length;
    for (const reset of resets) {
      assert.equal(reset.type, 'jump-miss');
      assert.ok(
        records[index].airCollisions.some(
          (hit) =>
            hit.time < reset.time &&
            hit.time > reset.time - 7 &&
            Math.abs(hit.distance - reset.distance) < 1,
        ),
        `${opponent.specification.id} recovery needs an actual midair collision`,
      );
      recoveries.push({ racer: opponent.specification.id, ...reset });
    }
    for (const jump of track.jumps) {
      const transfers = records[index].transfers.filter(
        (event) =>
          event.id === jump.id &&
          event.time <= opponent.finish.totalTime + 1e-6,
      );
      assert.equal(
        transfers.length,
        2,
        `${opponent.specification.id} completes ${jump.id} each lap`,
      );
      const misses = resets.filter((event) => event.id === jump.id).length;
      assert.equal(
        transfers.filter((event) => event.outcome === 'landed').length,
        2 - misses,
      );
    }
  });
  assert.ok(
    totalResets <= 1,
    `at most one observed pack collision recovery: ${JSON.stringify(recoveries)}`,
  );
  t.diagnostic(`Native pack recoveries: ${JSON.stringify(recoveries)}`);
  t.diagnostic(
    `Native field seconds: ${field.opponents.map((o) => `${o.specification.id}=${o.finish.totalTime.toFixed(2)}`).join(', ')}`,
  );
});
