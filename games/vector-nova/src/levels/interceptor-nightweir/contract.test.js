import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createNightweirLockdownTrack } from './track/model.js';
import { createLockdownRoad } from './road.js';
import { createLockdownDevices } from './devices.js';
import { createLockdownLayout } from './environment/layout.js';
import { createLockdownEnvironment } from './environment/index.js';
import { createNightweirTrack } from '../nightweir/track/model.js';
import { createVehicleState, stepVehicle } from '../../physics/index.js';
import { getRacerControl } from '../../race/racers.js';
import { createMagneticRuntime } from '../../core/session-runtime.js';
import { createRapierWorld } from '../../physics/rapier-world.js';
import { createLockdownCollision } from './road.js';

test('Lockdown is a continuous wide two-lap circuit independent of the Nightweir sprint', () => {
  const track = createNightweirLockdownTrack(),
    original = createNightweirTrack();
  assert.equal(track.closed, true);
  assert.equal(track.width, 44);
  assert.ok(track.length > 4700 && track.length < 4800);
  assert.equal(original.closed, false);
  assert.ok(original.length > 13000);
  assert.ok(original.jumps.length >= 8);
  assert.deepEqual(track.jumps, []);
  assert.deepEqual(
    track.inversions.map(({ id }) => id),
    ['generating-corkscrew'],
    'borrowed Nightweir road receives the authored twisting spans',
  );
  assert.ok(track.id !== original.id);
  for (const distance of [
    -0.001,
    0,
    track.length - 0.001,
    track.length,
    track.length * 2,
  ]) {
    const frame = track.sample(distance),
      wrapped = track.sample(
        T.MathUtils.euclideanModulo(distance, track.length),
      );
    for (const key of ['position', 'tangent', 'up', 'right'])
      assert.ok(frame[key].distanceTo(wrapped[key]) < 1e-8);
  }
  const start = track.sample(0),
    end = track.sample(track.length - 0.001);
  assert.ok(start.position.distanceTo(end.position) < 0.002);
  assert.ok(start.tangent.dot(end.tangent) > 0.99999);
  assert.ok(start.up.dot(end.up) > 0.99999);
  for (let s = 0; s < track.length; s += 7) {
    const f = track.sample(s);
    assert.ok(Math.abs(f.up.length() - 1) < 1e-8);
    assert.ok(Math.abs(f.tangent.y) < 0.52);
    assert.ok(f.quaternion.angleTo(track.sample(s + 0.5).quaternion) < 0.009);
    assert.ok(Math.abs(f.curvature) < 0.018);
    assert.ok(Math.abs(f.right.dot(f.up)) < 1e-8);
    assert.ok(f.position.toArray().every(Number.isFinite));
  }
  const gates = createLockdownDevices(track);
  assert.ok(gates.every((gate) => gate.type !== 'vector'));
  assert.ok(
    gates.filter((gate) => ['arc', 'repulsor'].includes(gate.type)).length >=
      16,
  );
  for (const gate of gates) {
    assert.ok(
      gate.distance - gate.length / 2 >= 0 &&
        gate.distance + gate.length / 2 < track.length,
    );
    assert.ok(Math.abs(gate.lateral) + gate.width / 2 < track.width / 2);
  }
});

test('the borrowed municipal road closes its sprint-only extension without a duplicate start sheet', async () => {
  const track = createNightweirLockdownTrack(),
    road = createLockdownRoad({ track, shape: true });
  await road.ready;
  try {
    const deck = road.group.children.find((mesh) => mesh.userData.roadSurface),
      coord = deck.geometry.attributes.roadCoord,
      p = deck.geometry.attributes.position;
    const used = [...new Set(deck.geometry.index.array)];
    assert.ok(used.every((i) => coord.getX(i) >= 0));
    assert.ok(used.some((i) => coord.getX(i) === 0));
    assert.ok(used.some((i) => Math.abs(coord.getX(i) - track.length) < 0.001));
    for (const lateral of [-22, 22]) {
      const first = used.find(
        (i) => coord.getX(i) === 0 && coord.getY(i) === lateral,
      );
      const last = used.find(
        (i) =>
          Math.abs(coord.getX(i) - track.length) < 0.001 &&
          coord.getY(i) === lateral,
      );
      assert.ok(
        new T.Vector3()
          .fromBufferAttribute(p, first)
          .distanceTo(new T.Vector3().fromBufferAttribute(p, last)) < 0.001,
      );
    }
  } finally {
    road.dispose();
    road.dispose();
  }
});

test('new ward buildings and generating halls retain a deliberate clear racing corridor', () => {
  const track = createNightweirLockdownTrack(),
    layout = createLockdownLayout(track);
  assert.ok(layout.buildings.length > 70);
  assert.equal(layout.quays.length, 3);
  for (let s = 0; s < track.length; s += 25) {
    assert.ok(Number.isFinite(track.groundSample(s).curvature));
    assert.ok(Number.isFinite(track.scenerySample(s).curvature));
    assert.ok(Number.isFinite(layout.quayFar(s)));
  }
  assert.ok(layout.halls.length >= 3);
  for (const building of [...layout.buildings, ...layout.halls]) {
    const radius = Math.hypot(building.width, building.depth) / 2;
    assert.ok(
      layout.nearest(building.position.x, building.position.z).distance >=
        36 + radius,
    );
    if (!building.hero)
      assert.ok(!layout.inRiver(building.position.x, building.position.z));
  }
  for (let s = 0; s < track.length; s += 12) {
    const f = track.sample(s);
    assert.ok(
      layout.terrainHeight(f.position.x, f.position.z) < f.position.y - 10,
    );
  }
});

test('the composed Nightweir kit owns its resources and only borrows reflection textures', async () => {
  const textures = [],
    loadTexture = async () => {
      const texture = new T.DataTexture(
        new Uint8Array([160, 170, 180, 255]),
        1,
        1,
      );
      textures.push(texture);
      return texture;
    };
  const world = await createLockdownEnvironment({
    track: createNightweirLockdownTrack(),
    loadTexture,
  });
  const borrowed = new T.Texture(),
    counts = new Map(),
    resources = new Set(textures);
  let draws = 0;
  world.group.traverse((object) => {
    if (object.isMesh) draws++;
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean))
      resources.add(material);
  });
  resources.add(borrowed);
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      counts.set(resource, (counts.get(resource) ?? 0) + 1),
    );
  assert.ok(draws < 40);
  assert.equal(world.group.userData.originalCityLoaded, false);
  world.setReflection(borrowed);
  world.update({
    time: 1,
    settings: { quality: 'low' },
    state: { distance: 300 },
  });
  world.dispose();
  world.dispose();
  for (const resource of resources)
    assert.equal(counts.get(resource) ?? 0, resource === borrowed ? 0 : 1);
  borrowed.dispose();
});

test('ordinary shared driving completes the new circuit without a rail impact', () => {
  const track = createNightweirLockdownTrack(),
    state = createVehicleState('shrike');
  let impacts = 0;
  for (let tick = 0; tick < 120 * 70 && state.distance < track.length; tick++) {
    const events = stepVehicle(
      state,
      getRacerControl(state, track, { difficulty: 'medium' }),
      track,
      1 / 120,
    );
    impacts += events.filter((event) => event.type === 'impact').length;
  }
  assert.ok(state.distance >= track.length);
  assert.equal(impacts, 0);
  assert.ok(state.time < 60);
});

test('the real magnetic stock and equipment bodies cross the closed support seam cleanly', async () => {
  const track = createNightweirLockdownTrack(),
    collisionWorld = createLockdownCollision({ track }),
    dynamics = await createRapierWorld({ collisionWorld });
  try {
    for (const equipment of [false, true]) {
      const state = createVehicleState('shrike');
      state.distance = track.length - 90;
      state.speed = 80;
      const runtime = createMagneticRuntime({
        track,
        collisionWorld,
        dynamics,
        equipment,
      });
      runtime.reset({ state });
      let impacts = 0,
        minimumSpeed = 80,
        maximumHeight = 0;
      try {
        for (let tick = 0; tick < 240; tick++) {
          const events = runtime.advance(
            state,
            getRacerControl(state, track, { difficulty: 'medium' }),
            1 / 120,
          );
          impacts += events.filter((event) => event.type === 'impact').length;
          minimumSpeed = Math.min(minimumSpeed, state.speed);
          const pose = runtime.pose(1),
            frame = track.sample(state.distance);
          maximumHeight = Math.max(
            maximumHeight,
            pose.position.clone().sub(frame.position).dot(frame.up),
          );
        }
        assert.ok(state.distance > track.length + 90);
        assert.equal(impacts, 0);
        assert.ok(minimumSpeed >= 79.9);
        assert.ok(maximumHeight < 3);
      } finally {
        runtime.dispose();
      }
    }
  } finally {
    dynamics.dispose();
  }
});

test('the generating corkscrew is a full supported road roll followed by a substantial plunge', async () => {
  const track = createNightweirLockdownTrack(),
    roll = track.routeMoments.find((moment) => moment.type === 'corkscrew'),
    plunge = track.routeMoments.find((moment) => moment.type === 'drop');
  assert.ok(roll.end - roll.start > 1000);
  let minimumUp = 1;
  for (let s = roll.start; s < roll.end; s += 4)
    minimumUp = Math.min(minimumUp, track.sample(s).up.y);
  assert.ok(minimumUp < -0.99, 'the running skin becomes genuinely inverted');
  assert.ok(
    track.sample(plunge.start).position.y -
      track.sample(plunge.end).position.y >
      100,
  );
  for (let s = 0; s < track.length; s += 2) {
    const a = track.sample(s),
      b = track.sample(s + 0.5);
    for (const side of [-22, 22]) {
      const edgeA = a.position.clone().addScaledVector(a.right, side),
        edgeB = b.position.clone().addScaledVector(b.right, side);
      assert.ok(
        Math.abs(edgeB.y - edgeA.y) / 0.5 < 0.55,
        `smooth edge at ${s}`,
      );
    }
    assert.ok(track.scenerySample(s).up.y > 0.85);
    assert.ok(track.groundSample(s).up.y > 0.98);
  }
  const collisionWorld = createLockdownCollision({ track }),
    dynamics = await createRapierWorld({ collisionWorld });
  try {
    for (const equipment of [false, true]) {
      const state = createVehicleState('shrike');
      state.distance = roll.start - 100;
      state.speed = 300 / 3.6;
      const runtime = createMagneticRuntime({
        track,
        collisionWorld,
        dynamics,
        equipment,
        settings: { steeringAssist: 0.3 },
      });
      runtime.reset({ state });
      let impacts = 0;
      try {
        for (
          let tick = 0;
          tick < 120 * 24 && state.distance < plunge.end + 60;
          tick++
        ) {
          const control = getRacerControl(state, track, {
            difficulty: 'medium',
          });
          control.boost = false;
          const events = runtime.advance(state, control, 1 / 120),
            frame = track.sample(state.distance),
            height = runtime
              .pose(1)
              .position.clone()
              .sub(frame.position)
              .dot(frame.up);
          impacts += events.filter((event) => event.type === 'impact').length;
          assert.ok(state.speed > 80);
          assert.ok(Math.abs(state.lateral) < 1);
          assert.ok(height > 0.35 && height < 1.1);
        }
        assert.ok(state.distance > plunge.end + 60);
        assert.equal(impacts, 0);
      } finally {
        runtime.dispose();
      }
    }
  } finally {
    dynamics.dispose();
  }
});
