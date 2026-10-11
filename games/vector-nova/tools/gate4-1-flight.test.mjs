import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createLevel3Track,
  buildLevel3Blockout,
  buildNacreTrack,
  createNacreRuntime,
} from '../src/levels/nacre/track/index.js';
import {
  NACRE_FLIGHT_RULES,
  sweptNacreLanding,
} from '../src/levels/nacre/track/runtime.js';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { createCameraRig } from '../src/camera/index.js';
import createNacreLevel from '../src/levels/nacre/index.js';

const track = createLevel3Track();
const DT = 1 / 120;
const empty = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const scenario = (name) => ({
  ...createVehicleState(),
  ...track.scenarios[name],
});
const runtime = () => createNacreRuntime({ track });
function runJump(name, { input = empty, lap = 0, initial = {}, dt = DT } = {}) {
  const state = { ...scenario(name), ...initial };
  state.distance += lap * track.length;
  const adapter = runtime();
  const events = [];
  for (let i = 0; i < 1400; i += 1) {
    const next = adapter.advance(state, input, dt);
    events.push(...next.map((event) => ({ ...event, time: state.time })));
    if (next.some((event) => event.type === 'jump-transfer')) break;
  }
  return {
    state,
    adapter,
    events,
    transfer: events.find((event) => event.type === 'jump-transfer'),
  };
}

test('Nacre has a compact continuous 3D route, real water crossings, clear nonadjacent road and closed frame seam', () => {
  assert.ok(track.length >= 4600 && track.length <= 5200);
  let maxBank = 0;
  let submerged = 0;
  const frames = [];
  for (let s = 0; s < track.length; s += 1) {
    const a = track.sample(s);
    const b = track.sample(s + 1);
    assert.ok(
      Math.abs(a.position.distanceTo(b.position) - 1) < 0.002,
      `arc metre at ${s}`,
    );
    assert.ok(a.tangent.angleTo(b.tangent) < 0.017, `turn continuity at ${s}`);
    assert.ok(
      a.quaternion.angleTo(b.quaternion) < 0.021,
      `frame continuity at ${s}`,
    );
    for (const axis of [a.right, a.up, a.tangent])
      assert.ok(Math.abs(axis.length() - 1) < 1e-9);
    assert.ok(Math.abs(a.right.dot(a.up)) < 1e-9);
    assert.ok(Math.abs(a.right.dot(a.tangent)) < 1e-9);
    assert.ok(Math.abs(a.up.dot(a.tangent)) < 1e-9);
    assert.ok(
      new THREE.Vector3(0, 0, 1)
        .applyQuaternion(a.quaternion)
        .distanceTo(a.tangent) < 1e-8,
    );
    assert.ok(track.bounds.containsPoint(a.position));
    if (a.position.y < track.waterY - 20) submerged += 1;
    maxBank = Math.max(maxBank, Math.abs(a.bank));
    if (s % 5 === 0) frames.push({ s, ...a });
  }
  assert.ok(
    submerged > 1900,
    'submersion is a genuine sustained world-space descent',
  );
  assert.ok(maxBank > 0.85);
  assert.equal(track.surfaceCrossings.length, 2);
  for (const s of [0, 35, track.length / 2, -100]) {
    assert.ok(
      track
        .sample(s)
        .position.distanceTo(track.sample(s + track.length).position) < 1e-8,
    );
    assert.ok(
      track
        .sample(s)
        .quaternion.angleTo(track.sample(s + track.length).quaternion) < 1e-7,
    );
  }
  assert.ok(
    track.sample(-0.01).position.distanceTo(track.sample(0.01).position) <
      0.0201,
  );
  assert.ok(
    track.sample(-0.01).quaternion.angleTo(track.sample(0.01).quaternion) <
      0.001,
  );
  for (let i = 0; i < frames.length; i += 1)
    for (let j = i + 1; j < frames.length; j += 1) {
      const difference = frames[j].s - frames[i].s;
      if (Math.min(difference, track.length - difference) < 120) continue;
      assert.ok(
        frames[i].position.distanceTo(frames[j].position) > 95,
        'nonadjacent road/camera envelopes are separated',
      );
    }
});

test('exactly two disconnected running surfaces have no road, shell or rail triangles in gaps', () => {
  assert.equal(track.jumps.length, 2);
  for (const jump of track.jumps) {
    const launch = track.sample(jump.takeoff).position;
    const landing = track.sample(jump.landingStart).position;
    assert.ok(
      Math.abs(
        Math.hypot(landing.x - launch.x, landing.z - launch.z) - jump.gap,
      ) < 0.01,
    );
    assert.ok(
      landing.y < launch.y,
      'lower receiving deck covers the requested speed range',
    );
  }
  assert.equal(track.checkpoints.length, 8);
  for (const jump of track.jumps) {
    assert.ok(
      track.checkpoints.some(
        (checkpoint) => checkpoint.distance === jump.landingStart,
      ),
    );
    assert.ok(
      !track.checkpoints.some(
        ({ distance }) =>
          distance > jump.takeoff && distance < jump.landingStart,
      ),
    );
    assert.equal(
      track.surfaceCoverage((jump.takeoff + jump.landingStart) / 2),
      0,
    );
    assert.equal(track.surfaceCoverage(jump.recovery), 1);
    assert.ok(Math.abs(track.sample(jump.recovery).tangent.y) < 0.01);
    assert.ok(Math.abs(track.sample(jump.recovery).bank) < 0.01);
  }
  const group = buildLevel3Blockout(track);
  const surfaces = group.children.filter(
    (child) => child.userData.drivingSurface,
  );
  assert.equal(surfaces.length, 3);
  assert.deepEqual(
    surfaces.map((mesh) => mesh.userData.interval),
    [
      [0, track.jumps[0].takeoff],
      [track.jumps[0].landingStart, track.jumps[1].takeoff],
      [track.jumps[1].landingStart, track.length],
    ],
  );
  for (const mesh of group.children.filter(
    (child) =>
      child.name.startsWith('Disconnected') ||
      child.userData.drivingSurface ||
      child.name.startsWith('Pale edge') ||
      child.name.startsWith('Low neutral'),
  )) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      assert.ok(p.toArray().every(Number.isFinite));
      for (const jump of track.jumps) {
        const launch = track.sample(jump.takeoff);
        const landing = track.sample(jump.landingStart);
        const delta = p.clone().sub(launch.position);
        if (
          Math.abs(delta.dot(launch.right)) > track.width ||
          p.y > launch.position.y + 5 ||
          p.y < landing.position.y - 5
        )
          continue;
        // The ramp's cut face tilts with its frame: the underside may extend
        // horizontally beyond the lip without bridging the actual open volume.
        assert.ok(
          delta.dot(launch.tangent) < 0.03 ||
            p.clone().sub(landing.position).dot(landing.tangent) > -0.03,
          `solid geometry intrudes into ${jump.id}`,
        );
      }
    }
  }
  group.userData.dispose();
});

test('section and surface review scenarios are parked with deterministic named starts', () => {
  assert.equal(track.sections[0].start, 0);
  assert.equal(track.sections.at(-1).end, track.length);
  for (let i = 0; i < track.sections.length; i += 1) {
    const section = track.sections[i];
    if (i) assert.equal(track.sections[i - 1].end, section.start);
    assert.ok(
      section.showcase > section.start && section.showcase < section.end,
    );
    assert.equal(track.scenarios[`${section.id}-showcase`].speed, 0);
  }
  for (const name of [
    'surface-entry',
    'surface-exit',
    'hardest-turn',
    'jump1-approach',
    'jump2-approach',
  ])
    assert.equal(track.scenarios[name].speed, 0);
});

test('swept hull lands only above-to-surface inside the current oriented patch; reject underside, sideways, rolled and wrong road', () => {
  const jump = track.jumps[1];
  const frame = track.sample((jump.landingStart + jump.landingEnd) / 2);
  const makePose = (height, quaternion = frame.quaternion) => ({
    position: frame.position.clone().addScaledVector(frame.up, height),
    quaternion: quaternion.clone(),
  });
  const velocity = frame.up
    .clone()
    .multiplyScalar(-50)
    .addScaledVector(frame.tangent, 110);
  const above = makePose(12);
  const below = makePose(-12);
  const landing = sweptNacreLanding(track, jump, above, below, velocity);
  assert.ok(landing);
  assert.ok(
    landing.fraction > 0 && landing.fraction < 1,
    'continuous crossing catches a large frame jump',
  );
  assert.ok(
    Math.abs(landing.distance - (jump.landingStart + jump.landingEnd) / 2) <
      0.002,
  );
  assert.equal(
    sweptNacreLanding(track, jump, below, above, velocity.clone().negate()),
    null,
  );
  assert.equal(
    sweptNacreLanding(track, jump, below, makePose(-20), velocity),
    null,
  );
  const sideways = frame.quaternion
    .clone()
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 2,
      ),
    );
  assert.equal(
    sweptNacreLanding(
      track,
      jump,
      makePose(12, sideways),
      makePose(-12, sideways),
      velocity,
    ),
    null,
  );
  const rolled = frame.quaternion
    .clone()
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.3),
    );
  assert.equal(
    sweptNacreLanding(
      track,
      jump,
      makePose(12, rolled),
      makePose(-12, rolled),
      velocity,
    ),
    null,
  );
  const wrongWay = frame.quaternion
    .clone()
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI,
      ),
    );
  assert.equal(
    sweptNacreLanding(
      track,
      jump,
      makePose(12, wrongWay),
      makePose(-12, wrongWay),
      velocity,
    ),
    null,
  );
  const outsideA = makePose(12);
  outsideA.position.addScaledVector(frame.right, jump.halfWidth - 1);
  const outsideB = makePose(-12);
  outsideB.position.addScaledVector(frame.right, jump.halfWidth - 1);
  assert.equal(
    sweptNacreLanding(track, jump, outsideA, outsideB, velocity)?.edgeCatch,
    true,
    'majority-supported wing overhang is a forgiving edge catch',
  );
  assert.equal(
    sweptNacreLanding(track, track.jumps[0], above, below, velocity),
    null,
  );
  assert.equal(
    sweptNacreLanding(track, { ...jump }, above, below, velocity),
    null,
  );
});

test('both ramps remain visibly upturned at the lip and create a real rising flight arc', () => {
  for (const [index, jump] of track.jumps.entries()) {
    for (const offset of [0, -10, -20])
      assert.ok(
        Math.asin(track.sample(jump.takeoff + offset).tangent.y) >
          THREE.MathUtils.degToRad(6),
        'last ramp section does not flatten',
      );
    assert.ok(
      Math.asin(track.sample(jump.takeoff).tangent.y) >
        THREE.MathUtils.degToRad(9.5),
    );
    const state = scenario(`jump${index + 1}-success`);
    const adapter = runtime();
    let maximumHeight = -Infinity;
    let transfer;
    for (let tick = 0; tick < 1400 && !transfer; tick += 1) {
      const events = adapter.advance(state, { ...empty, throttle: 1 }, DT);
      const pose = adapter.pose(1);
      if (adapter.snapshot().mode === 'flight' && pose)
        maximumHeight = Math.max(maximumHeight, pose.position.y);
      transfer = events.find(({ type }) => type === 'jump-transfer');
    }
    assert.ok(
      maximumHeight - track.sample(jump.takeoff).position.y > 7,
      'normal cruise has a visible elevated apex',
    );
    assert.equal(transfer?.payload.outcome, 'landed');
  }
});

test('upright descending pitch is distinct from rolled or nearly vertical landings', () => {
  const jump = track.jumps[1];
  const frame = track.sample((jump.landingStart + jump.landingEnd) / 2);
  const hit = (pitch, roll = 0) => {
    const quaternion = frame.quaternion
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          THREE.MathUtils.degToRad(pitch),
        ),
      )
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          roll,
        ),
      );
    const pose = (height) => ({
      position: frame.position.clone().addScaledVector(frame.up, height),
      quaternion,
    });
    return sweptNacreLanding(
      track,
      jump,
      pose(8),
      pose(-8),
      frame.up.clone().multiplyScalar(-50).addScaledVector(frame.tangent, 78),
    );
  };
  assert.ok(hit(38), 'steep top-down upright contact lands');
  assert.equal(hit(38, 0.9), null, 'rolled contact is still rejected');
  assert.equal(hit(65), null, 'near-vertical nose impact is rejected');
});

test('normal and full-boost launches land while genuinely slow and sideways launches retain timed recovery', () => {
  for (let i = 1; i <= 2; i += 1)
    for (const name of [
      'success',
      'cruise70',
      'boost70',
      'short',
      'lateral',
      'long',
    ]) {
      const result = runJump(`jump${i}-${name}`);
      assert.ok(
        result.transfer,
        `${i} ${name} must finish bounded flight/recovery`,
      );
      assert.equal(
        result.transfer.payload.outcome,
        ['short', 'lateral'].includes(name) ? 'recovered' : 'landed',
      );
      assert.equal(
        result.events.filter((e) => e.type === 'jump-transfer').length,
        1,
      );
      assert.equal(result.state.resetCount, 0);
      assert.equal(result.events[0].type, 'jump-launch');
      if (['short', 'lateral'].includes(name)) {
        const miss = result.events.find((e) => e.type === 'jump-miss');
        assert.equal(miss.payload.reason, name);
        assert.ok(Math.abs(result.transfer.time - miss.time - 1.5) < 1e-9);
        assert.equal(result.state.speed, 0);
        assert.equal(result.state.heading, 0);
        assert.equal(result.state.distance, result.transfer.payload.to);
        assert.ok(
          Math.abs(result.state.distance - track.jumps[i - 1].recovery) < 1e-9,
        );
      }
    }
});

test('both jumps accept the entire 70% cruise through full-boost envelope with alignment margin', () => {
  // Normal flat-road cruise is 112 m/s; full boost is 157 m/s. Include extra
  // downhill margin to 165, and test a dense range, not just a tuned sweet spot.
  for (let i = 1; i <= 2; i += 1)
    for (const speed of [78.4, ...Array.from({ length: 87 }, (_, n) => 79 + n)])
      for (const [heading, lateral] of [
        [0, 0],
        [-0.01, -3],
        [0.01, 3],
      ]) {
        const result = runJump(`jump${i}-success`, {
          input: { ...empty, throttle: 1, boost: true },
          initial: { speed, heading, lateral },
        });
        assert.equal(
          result.transfer?.payload.outcome,
          'landed',
          `jump ${i}: ${speed} m/s, heading ${heading}, lateral ${lateral}`,
        );
        assert.equal(
          result.events.some(({ type }) => type === 'jump-miss'),
          false,
        );
        assert.ok(
          result.state.speed > speed * 0.9,
          'landing preserves forward momentum',
        );
      }
});

test('receiving road after the old short strip and across every internal seam catches a swept hull', () => {
  for (const [i, jump] of track.jumps.entries()) {
    const distances = [
      jump.landingStart + (i === 0 ? 90 : 85),
      jump.landingEnd - 8,
    ];
    for (
      let distance = jump.landingStart + 8;
      distance < jump.landingEnd - 8;
      distance += 4
    )
      distances.push(distance);
    for (const distance of distances) {
      const frame = track.sample(distance);
      const before = {
        position: frame.position.clone().addScaledVector(frame.up, 12),
        quaternion: frame.quaternion.clone(),
      };
      const after = {
        ...before,
        position: frame.position.clone().addScaledVector(frame.up, -12),
      };
      const hit = sweptNacreLanding(
        track,
        jump,
        before,
        after,
        frame.up.clone().multiplyScalar(-100),
      );
      assert.ok(hit, `jump ${i + 1} seam/runout at ${distance}`);
      assert.ok(Math.abs(hit.distance - distance) < 0.01);
    }
  }
});

test('landing sweep follows changing road grade and bank instead of an infinite lip plane', () => {
  // Reuse a real curved/banked descent as an authored receiving road fixture.
  const start = track.jumps[0].recovery + 100;
  const jump = { landingStart: start, landingEnd: start + 180, halfWidth: 15 };
  const receiving = { ...track, jumps: [jump] };
  for (
    let distance = start + 12;
    distance < jump.landingEnd - 12;
    distance += 4
  ) {
    const frame = track.sample(distance);
    const pose = (height) => ({
      position: frame.position.clone().addScaledVector(frame.up, height),
      quaternion: frame.quaternion.clone(),
    });
    const hit = sweptNacreLanding(
      receiving,
      jump,
      pose(8),
      pose(-8),
      frame.up.clone().multiplyScalar(-80),
    );
    assert.ok(hit, `actual receiving surface at ${distance}`);
    assert.ok(Math.abs(hit.distance - distance) < 0.01);
    assert.equal(
      sweptNacreLanding(
        receiving,
        jump,
        pose(-2),
        pose(-8),
        frame.up.clone().multiplyScalar(-80),
      ),
      null,
    );
  }
});

test('coarse caller ticks cannot tunnel through a long landing, including on later laps', () => {
  for (let i = 1; i <= 2; i += 1)
    for (const dt of [1 / 120, 1 / 60, 0.1]) {
      const result = runJump(`jump${i}-long`, { dt, lap: 2 });
      assert.equal(result.transfer?.payload.outcome, 'landed');
      assert.ok(
        result.transfer.payload.to >
          2 * track.length + track.jumps[i - 1].landingStart,
      );
      assert.equal(
        result.events.filter(({ type }) => type === 'jump-transfer').length,
        1,
      );
    }
});

test('world flight inherits launch heading and velocity, gravity acts and air steer stays bounded with correct driver-right sign', () => {
  const launch = (heading, steer) => {
    const state = scenario('jump2-success');
    state.heading = heading;
    const adapter = runtime();
    adapter.advance(state, empty, DT);
    const first = adapter.snapshot();
    for (let i = 0; i < 60; i += 1)
      adapter.advance(state, { ...empty, steer }, DT);
    return { state, adapter, first, after: adapter.snapshot() };
  };
  const straight = launch(0, 0);
  const angled = launch(0.2, 0);
  const right = launch(0, 1);
  const frame = track.sample(track.jumps[1].takeoff);
  assert.ok(
    new THREE.Vector3()
      .fromArray(angled.first.flight.velocity)
      .dot(frame.right) > 15,
  );
  assert.ok(
    new THREE.Vector3()
      .fromArray(straight.first.flight.velocity)
      .dot(frame.up) < 0.1,
    'velocity inherits the ramp tangent, without a scripted jump impulse',
  );
  assert.ok(
    Math.abs(
      straight.after.flight.velocity[1] -
        straight.first.flight.velocity[1] +
        NACRE_FLIGHT_RULES.gravity * 0.5,
    ) < 1e-9,
  );
  const controlDelta = new THREE.Vector3()
    .fromArray(right.after.flight.velocity)
    .sub(new THREE.Vector3().fromArray(straight.after.flight.velocity));
  assert.ok(
    Math.abs(controlDelta.length() - NACRE_FLIGHT_RULES.airAcceleration * 0.5) <
      1e-8,
  );
  assert.ok(
    controlDelta.dot(frame.right) < 0,
    'positive input remains driver-right',
  );
  for (const result of [straight, angled, right])
    assert.ok(Math.abs(result.state.distance - track.jumps[1].takeoff) < 1e-9);
  assert.ok(
    straight.adapter
      .pose(0)
      .position.distanceTo(straight.adapter.pose(1).position) > 0.5,
  );
});

test('flight and recovery serialize deterministically; presentation/pause cannot advance simulation and reset clears all owned motion', () => {
  for (const name of ['jump1-success', 'jump2-short']) {
    const state = scenario(name);
    const adapter = runtime();
    for (let i = 0; i < (name.endsWith('short') ? 1000 : 55); i += 1) {
      adapter.advance(state, empty, DT);
      if (name.endsWith('short') && adapter.snapshot().mode === 'recovery')
        break;
    }
    const saved = JSON.parse(JSON.stringify(adapter.snapshot()));
    if (name.endsWith('short')) assert.equal(saved.mode, 'recovery');
    const otherState = { ...state };
    const restored = runtime();
    restored.restore(saved);
    for (let i = 0; i < 500; i += 1) {
      const controls = {
        ...empty,
        steer: i < 20 ? 0.1 : 0,
        throttle: i > 250 ? 1 : 0,
      };
      assert.deepEqual(
        adapter.advance(state, controls, DT),
        restored.advance(otherState, controls, DT),
      );
    }
    assert.deepEqual(state, otherState);
    assert.deepEqual(adapter.snapshot(), restored.snapshot());
    const frozen = adapter.snapshot();
    adapter.update({ state, time: 999, dt: 20, mode: 'paused' });
    adapter.advance(state, empty, 0);
    assert.deepEqual(adapter.snapshot(), frozen);
    for (const reason of [
      'initialize',
      'fresh-lap',
      'scenario',
      'manual-recover',
      'home',
    ]) {
      restored.restore(saved);
      restored.reset({ reason, state: otherState, seed: 17 });
      assert.equal(restored.pose(1), null);
      assert.equal(restored.snapshot().mode, 'magnetic');
      assert.equal(restored.snapshot().flight, null);
    }
    adapter.dispose();
    const before = { ...state };
    adapter.advance(state, empty, DT);
    assert.deepEqual(state, before);
    assert.equal(adapter.pose(), null);
  }
});

test('unwrapped later-lap takeoffs transfer only their authored interval once and normal magnetic ticks are unchanged', () => {
  const result = runJump('jump2-short', { lap: 2 });
  assert.ok(
    Math.abs(
      result.transfer.payload.from -
        (track.jumps[1].takeoff + 2 * track.length),
    ) < 1e-8,
  );
  assert.ok(
    Math.abs(
      result.transfer.payload.to - (track.jumps[1].recovery + 2 * track.length),
    ) < 1e-8,
  );
  for (let i = 0; i < 100; i += 1)
    assert.equal(result.adapter.advance(result.state, empty, DT).length, 0);
  const a = { ...createVehicleState(), distance: 220, speed: 80 };
  const b = { ...a };
  const adapter = runtime();
  for (let i = 0; i < 100; i += 1) {
    const input = { ...empty, throttle: 1, steer: -0.2 };
    assert.deepEqual(
      adapter.advance(a, input, DT),
      stepVehicle(b, input, track, DT),
    );
  }
  assert.deepEqual(a, b);
});

test('production track preserves the two authored holes and its ceramic/fin identity within source budgets', () => {
  const group = buildNacreTrack(track);
  const budgets = group.userData.sourceBudgets;
  assert.ok(budgets.calls <= 35);
  assert.ok(budgets.triangles < 300000);
  assert.ok(budgets.textures <= 2);
  assert.ok(budgets.textureBytes < 200000);
  assert.equal(group.userData.openSpans.length, 2);
  assert.ok(
    group.children.some((child) => child.name.includes('scalloped ceramic')),
  );
  assert.ok(
    group.children.some((child) => child.name.includes('gill containment')),
  );
  for (const mesh of group.children.filter(
    (child) => child.userData.drivingSurface,
  )) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      assert.ok(p.toArray().every(Number.isFinite));
      for (const jump of track.jumps) {
        const launch = track.sample(jump.takeoff);
        const landing = track.sample(jump.landingStart);
        const delta = p.clone().sub(launch.position);
        if (
          Math.abs(delta.dot(launch.right)) > track.width ||
          p.y > launch.position.y + 3 ||
          p.y < landing.position.y - 3
        )
          continue;
        assert.ok(
          delta.dot(launch.tangent) < 0.03 ||
            p.clone().sub(landing.position).dot(landing.tangent) > -0.03,
          `production ceramic crosses ${jump.id}`,
        );
      }
    }
  }
  const resources = {
    geometry: new Set(),
    material: new Set(),
    texture: new Set(),
  };
  group.traverse((object) => {
    if (object.geometry) resources.geometry.add(object.geometry);
    if (object.material) {
      resources.material.add(object.material);
      for (const value of Object.values(object.material))
        if (value?.isTexture) resources.texture.add(value);
    }
  });
  // The level owns its district probe; replacing or disposing the road must
  // never release a probe still shared by scenery and other materials.
  const borrowed = [new THREE.Texture(), new THREE.Texture()];
  let borrowedDisposals = 0;
  for (const probe of borrowed) {
    probe.addEventListener('dispose', () => {
      borrowedDisposals += 1;
    });
    group.userData.setReflection(probe);
    assert.equal(
      [...resources.material].filter((mat) => mat.envMap === probe).length,
      2,
    );
  }
  const disposed = { geometry: 0, material: 0, texture: 0 };
  for (const kind of Object.keys(resources))
    for (const resource of resources[kind])
      resource.addEventListener('dispose', () => {
        disposed[kind] += 1;
      });
  group.userData.dispose();
  for (const kind of Object.keys(resources))
    assert.equal(disposed[kind], resources[kind].size);
  group.userData.dispose();
  for (const kind of Object.keys(resources))
    assert.equal(
      disposed[kind],
      resources[kind].size,
      'disposal is idempotent',
    );
  assert.equal(
    borrowedDisposals,
    0,
    'borrowed probes survive replacement and road disposal',
  );
  borrowed.forEach((probe) => probe.dispose());
});

// Verification-only feedback control. These normalized controls go through the
// exact production runtime and .3 assistance; no state teleport or speed edits.
function driveInput(state, deliberatelyShort) {
  const frame = track.sample(state.distance);
  let curvatureAhead = 0;
  for (let d = 0; d <= 100; d += 10)
    curvatureAhead = Math.max(
      curvatureAhead,
      Math.abs(track.sample(state.distance + d).curvature),
    );
  let target = Math.min(110, Math.sqrt(80 / Math.max(0.00001, curvatureAhead)));
  if (
    deliberatelyShort &&
    state.distance > track.jumps[0].takeoff - 130 &&
    state.distance < track.jumps[0].landingStart
  )
    target = 55;
  const desiredHeading =
    (frame.curvature * state.speed * 0.75) / 7.2 +
    (9.81 * frame.right.y) / (7.2 * Math.max(20, state.speed)) -
    state.lateral * 0.015 -
    state.lateralSpeed * 0.009;
  return {
    throttle: state.speed < target + 1 ? 1 : 0,
    brake: THREE.MathUtils.clamp((state.speed - target - 1) * 0.15, 0, 1),
    steer: THREE.MathUtils.clamp(
      (-frame.curvature * state.speed) / 1.5 +
        (state.heading - desiredHeading) * 3,
      -1,
      1,
    ),
    boost: false,
    airbrake: false,
  };
}

test('a numerical lap from rest uses actual corner exit speeds and preserves a valid finish after delayed jump recovery', () => {
  for (const deliberatelyShort of [false, true]) {
    const state = createVehicleState();
    const adapter = runtime();
    const race = createRace(track, { rulesId: adapter.rulesId });
    const events = [];
    let maximumLateral = 0;
    for (let tick = 0; tick < 12000; tick += 1) {
      const before = state.distance;
      const input =
        adapter.snapshot().mode === 'magnetic'
          ? driveInput(state, deliberatelyShort)
          : empty;
      const next = adapter.advance(state, input, DT);
      events.push(
        ...next.map((event) => ({ ...event, time: state.time })),
        ...race.step(before, state.distance, DT, next),
      );
      maximumLateral = Math.max(maximumLateral, Math.abs(state.lateral));
      if (events.some((event) => event.type === 'lap')) break;
    }
    const lap = events.find((event) => event.type === 'lap');
    assert.ok(lap?.payload.valid);
    assert.ok(lap.payload.duration > 40 && lap.payload.duration < 65);
    assert.equal(events.filter((event) => event.type === 'impact').length, 0);
    assert.ok(maximumLateral < 2);
    assert.deepEqual(
      events
        .filter((event) => event.type === 'checkpoint')
        .map((event) => event.payload.index),
      [1, 2, 3, 4, 5, 6, 7, 0],
    );
    const transfers = events.filter((event) => event.type === 'jump-transfer');
    assert.equal(transfers.length, 2);
    assert.equal(
      transfers[0].payload.outcome,
      deliberatelyShort ? 'recovered' : 'landed',
    );
    assert.equal(transfers[1].payload.outcome, 'landed');
    assert.equal(state.resetCount, 0);
    assert.ok(Math.abs(state.time - lap.payload.duration) < 1e-8);
    if (deliberatelyShort) {
      const miss = events.find((event) => event.type === 'jump-miss');
      assert.ok(Math.abs(transfers[0].time - miss.time - 1.5) < 1e-8);
    }
  }
});

test('parked straight approaches land with ordinary throttle and with boost', () => {
  for (let index = 0; index < track.jumps.length; index += 1)
    for (const boost of [false, true]) {
      const state = scenario(`jump${index + 1}-approach`);
      const adapter = runtime();
      let transfer;
      let launch;
      for (let tick = 0; tick < 1600 && !transfer; tick += 1) {
        for (const event of adapter.advance(
          state,
          { ...empty, throttle: 1, boost },
          DT,
        )) {
          if (event.type === 'jump-launch') launch = event.payload;
          if (event.type === 'jump-transfer') transfer = event.payload;
        }
      }
      assert.equal(
        transfer?.outcome,
        'landed',
        `jump ${index + 1} parked runup, boost ${boost}`,
      );
      assert.ok(
        launch.speed > (boost ? 102 : 81) && launch.speed < (boost ? 106 : 84),
      );
    }
});

test('all banked/submerged/graded road holds at rest and hardest-turn diagnostic faces the true tight bend', () => {
  for (let distance = 0; distance < track.length; distance += 70) {
    if (track.isGap(distance)) continue;
    for (const steer of [-1, 0, 1]) {
      const state = { ...createVehicleState(), distance };
      const adapter = runtime();
      for (let tick = 0; tick < 360; tick += 1)
        adapter.advance(state, { ...empty, steer }, DT);
      assert.equal(state.distance, distance);
      assert.equal(state.lateral, 0);
      assert.equal(state.speed, 0);
    }
  }
  const start = track.scenarios['hardest-turn'].distance;
  const frame = track.sample(start);
  assert.ok(Math.abs(track.sample(start + 80).curvature) > 0.015);
  for (const distance of [30, 60, 100]) {
    const offset = track
      .sample(start + distance)
      .position.clone()
      .sub(frame.position);
    assert.ok(
      offset.dot(frame.tangent) > distance * 0.7,
      'the tight bend is ahead rather than behind a blind crest',
    );
    assert.ok(
      Math.abs(Math.atan2(offset.dot(frame.right), offset.dot(frame.tangent))) <
        0.6,
      'the next100m remains inside a broad chase sight cone',
    );
  }
});

test('ceramic and membrane triangles stay above the actual recessed substrate and every foundation meets the seabed', () => {
  const group = buildNacreTrack(track);
  const bed = group.children.find(
    (mesh) => mesh.name === 'Recessed pressure-seal running bed',
  ).geometry;
  const positions = bed.attributes.position;
  const uv = bed.attributes.uv;
  const segments = [];
  for (let i = 0; i < uv.count; i += 1) {
    const distance = uv.getY(i) * 16;
    for (const jump of track.jumps)
      assert.ok(
        distance <= jump.takeoff + 0.001 ||
          distance >= jump.landingStart - 0.001,
        'backing never bridges a jump',
      );
  }
  // Read the actual backing triangles from the rendered geometry, rather than
  // comparing both surfaces only against the ideal analytic road frame.
  for (let i = 0; i < bed.index.count; i += 6) {
    const a = bed.index.getX(i),
      b = bed.index.getX(i + 1),
      c = bed.index.getX(i + 2),
      d = bed.index.getX(i + 5);
    segments.push({
      from: uv.getY(a) * 16,
      to: uv.getY(b) * 16,
      a: new THREE.Vector3().fromBufferAttribute(positions, a),
      b: new THREE.Vector3().fromBufferAttribute(positions, b),
      c: new THREE.Vector3().fromBufferAttribute(positions, c),
      d: new THREE.Vector3().fromBufferAttribute(positions, d),
    });
  }
  let minimum = Infinity;
  let probes = 0;
  for (const mesh of group.children.filter(
    (child) => child.geometry?.attributes.roadCoord,
  )) {
    const p = mesh.geometry.attributes.position;
    const coord = mesh.geometry.attributes.roadCoord;
    for (let i = 0; i < p.count; i += 3) {
      for (const weights of [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1 / 3, 1 / 3, 1 / 3],
      ]) {
        const surface = new THREE.Vector3();
        let distance = 0,
          x = 0;
        for (let k = 0; k < 3; k += 1) {
          surface.addScaledVector(
            new THREE.Vector3().fromBufferAttribute(p, i + k),
            weights[k],
          );
          distance += coord.getX(i + k) * weights[k];
          x += coord.getY(i + k) * weights[k];
        }
        let lo = 0,
          hi = segments.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (segments[mid].to < distance) lo = mid + 1;
          else hi = mid;
        }
        const segment = segments[lo];
        assert.ok(
          distance >= segment.from - 0.001 && distance <= segment.to + 0.001,
        );
        const v = (distance - segment.from) / (segment.to - segment.from);
        const u = (x + track.width / 2) / track.width;
        const substrate =
          v + u <= 1
            ? segment.a
                .clone()
                .multiplyScalar(1 - v - u)
                .addScaledVector(segment.b, v)
                .addScaledVector(segment.c, u)
            : segment.c
                .clone()
                .multiplyScalar(1 - v)
                .addScaledVector(segment.b, 1 - u)
                .addScaledVector(segment.d, v + u - 1);
        const clearance = surface.sub(substrate).dot(track.sample(distance).up);
        minimum = Math.min(minimum, clearance);
        probes += 1;
        assert.ok(
          clearance > 0.5,
          `rendered ceramic/backing intersection at ${distance}: ${clearance}`,
        );
      }
    }
  }
  assert.ok(probes > 150000);
  assert.ok(minimum < 1, 'the test exercises real curved-triangle variation');
  assert.ok(group.userData.surfaceTreatments.length >= 4);
  for (const foundation of group.userData.foundations) {
    assert.ok(foundation.top < foundation.seabed);
    assert.ok(foundation.bottom < foundation.seabed - 6);
  }
  group.userData.dispose();
});

test('nacre growth shading is continuous fragment response rather than diagonal vertex-color bands', () => {
  const group = buildNacreTrack(track);
  for (const mesh of group.children.filter(
    (entry) => entry.userData.drivingSurface,
  )) {
    const color = mesh.geometry.attributes.color;
    if (!color) continue;
    for (let i = 0; i < color.count; i += 6) {
      for (let vertex = 1; vertex < Math.min(6, color.count - i); vertex += 1) {
        assert.equal(color.getX(i), color.getX(i + vertex));
        assert.equal(color.getY(i), color.getY(i + vertex));
        assert.equal(color.getZ(i), color.getZ(i + vertex));
      }
    }
  }
  const ceramic = group.children.find(
    (entry) => entry.name === 'Pearlescent scalloped ceramic running scales',
  ).material;
  const shader = {
    vertexShader: '#include <uv_vertex>',
    fragmentShader: '#include <color_fragment>',
  };
  ceramic.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('fwidth(nacrePhase)'));
  assert.ok(shader.fragmentShader.includes('varying vec2 vNacreTintUv;'));
  assert.ok(shader.vertexShader.includes('vNacreTintUv = uv;'));
  assert.ok(!shader.fragmentShader.includes('vNormalMapUv'));
  assert.ok(!shader.fragmentShader.includes('undefined'));
  group.userData.dispose();
});

test('running pearl avoids coarse physical map modulation beneath its continuous top coat', () => {
  const group = buildNacreTrack(track);
  const ceramic = group.children.find(
    (entry) => entry.name === 'Pearlescent scalloped ceramic running scales',
  ).material;
  // In rendered A/B captures, either coarse map alone retained angular bands;
  // removing both cleared them while keeping genuine Physical highlights.
  assert.equal(ceramic.normalMap, null);
  assert.equal(ceramic.roughnessMap, null);
  assert.equal(ceramic.clearcoatMap, null);
  assert.equal(ceramic.clearcoatRoughnessMap, null);
  assert.ok(ceramic.roughness >= 0.45 && ceramic.roughness <= 0.7);
  // The smoother coat stays spatially uniform; only its fitted rim bends.
  assert.ok(
    ceramic.clearcoatRoughness >= 0.15 && ceramic.clearcoatRoughness <= 0.5,
  );
  assert.ok(ceramic.isMeshPhysicalMaterial);
  assert.ok(ceramic.clearcoat > 0 && ceramic.iridescence > 0);
  assert.ok(ceramic.specularIntensity > 0);
  group.userData.dispose();
});

const displayedRoadPose = (state) => {
  const frame = track.sample(state.distance);
  return {
    position: frame.position
      .clone()
      .addScaledVector(frame.right, state.lateral)
      .addScaledVector(frame.up, NACRE_FLIGHT_RULES.hover),
    quaternion: frame.quaternion
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          state.heading,
        ),
      )
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          state.steer * 0.08,
        ),
      ),
  };
};

test('takeoff interpolation starts at the displayed magnetic pose, including lane offset and steering roll', () => {
  for (const jump of track.jumps) {
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 0.6,
      speed: 112,
      heading: 0.01,
      lateral: 4,
      lateralSpeed: 1,
      steer: 0.2,
    };
    const before = displayedRoadPose(state);
    const adapter = runtime();
    const events = adapter.advance(state, { ...empty, steer: 0.2 }, DT);
    assert.ok(events.some(({ type }) => type === 'jump-launch'));
    const start = adapter.pose(0);
    assert.equal(start.grounded, false);
    assert.ok(start.position.distanceTo(before.position) < 1e-9);
    assert.ok(start.quaternion.angleTo(before.quaternion) < 1e-7);
    assert.ok(start.position.distanceTo(adapter.pose(1).position) < 1.1);
    adapter.dispose();
  }
});

test('camera handoffs preserve the same craft anchor without injecting lane offset or heading', () => {
  for (const lateral of [-8, 8])
    for (const heading of [-0.04, 0.04]) {
      const state = {
        ...createVehicleState(),
        distance: track.jumps[0].takeoff,
        speed: 112,
        lateral,
        heading,
      };
      const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
      const rig = createCameraRig(
        camera,
        createNacreLevel({ shape: false }).camera,
      );
      rig.update(track, state, 1 / 60);
      const pose = displayedRoadPose(state);
      // With no elapsed motion, merely changing the coordinate source must not
      // move/rotate the view. Previously each transition injected all 8m of lane
      // offset plus craft yaw into camera transport, in opposite directions.
      for (const worldPose of [
        { ...pose, grounded: false },
        { ...pose, grounded: true },
        null,
      ]) {
        const position = camera.position.clone();
        const quaternion = camera.quaternion.clone();
        rig.update(track, state, 0, { worldPose });
        assert.ok(camera.position.distanceTo(position) < 1e-8);
        assert.ok(camera.quaternion.angleTo(quaternion) < 1e-7);
      }
    }
});

test('successful landing keeps the swept contact pose and settles vertically without changing magnetic motion', () => {
  for (let index = 0; index < track.jumps.length; index += 1)
    for (const speed of [78.4, 112, 165]) {
      const state = {
        ...scenario(`jump${index + 1}-success`),
        speed,
        lateral: 3,
      };
      const adapter = runtime();
      let before;
      let velocity;
      let transfer;
      for (let tick = 0; tick < 1000 && !transfer; tick += 1) {
        before = adapter.pose(1);
        velocity = adapter.snapshot().flight?.velocity;
        transfer = adapter
          .advance(state, empty, DT)
          .find(({ type }) => type === 'jump-transfer');
      }
      assert.equal(transfer?.payload.outcome, 'landed');
      let pose = adapter.pose(1);
      assert.equal(pose.grounded, true);
      const displacementBound =
        new THREE.Vector3().fromArray(velocity).length() * DT +
        (NACRE_FLIGHT_RULES.gravity * DT * DT) / 2 +
        0.001;
      assert.ok(pose.position.distanceTo(before.position) <= displacementBound);
      assert.ok(
        pose.quaternion.angleTo(before.quaternion) < 0.025,
        'contact cannot flatten the entire airborne pitch in one tick',
      );
      const contactHeight = pose.position
        .clone()
        .sub(track.sample(state.distance).position)
        .dot(track.sample(state.distance).up);
      const magnetic = { ...state };
      let settled = false;
      for (let tick = 0; tick < 60; tick += 1) {
        const previous = pose;
        stepVehicle(magnetic, empty, track, DT);
        adapter.advance(state, empty, DT);
        assert.deepEqual(
          state,
          magnetic,
          'settling is presentation, not a steering/energy force',
        );
        pose = adapter.pose(1);
        const displayed = pose ?? displayedRoadPose(state);
        const frame = track.sample(state.distance);
        const delta = displayed.position.clone().sub(frame.position);
        assert.ok(Math.abs(delta.dot(frame.right) - state.lateral) < 1e-8);
        assert.ok(Math.abs(delta.dot(frame.tangent)) < 1e-8);
        assert.ok(delta.dot(frame.up) >= NACRE_FLIGHT_RULES.hover - 1e-8);
        assert.ok(delta.dot(frame.up) <= contactHeight + 0.061);
        if (previous)
          assert.ok(displayed.quaternion.angleTo(previous.quaternion) < 0.035);
        if (!pose) settled = true;
      }
      assert.ok(
        settled,
        'the short settle returns to the ordinary magnetic render path',
      );
      adapter.dispose();
    }
});

test('landing settle serializes and resets deterministically without presentation time advancing it', () => {
  const result = runJump('jump2-cruise70');
  for (let i = 0; i < 9; i += 1)
    result.adapter.advance(result.state, empty, DT);
  const saved = JSON.parse(JSON.stringify(result.adapter.snapshot()));
  assert.ok(saved.landingSettle?.elapsed > 0);
  const otherState = { ...result.state };
  const restored = runtime();
  restored.restore(saved);
  const samePose = () => {
    for (const alpha of [0, 0.37, 1]) {
      const a = result.adapter.pose(alpha);
      const b = restored.pose(alpha);
      assert.equal(!!a, !!b);
      if (a) {
        assert.equal(a.grounded, b.grounded);
        assert.ok(a.position.distanceTo(b.position) < 1e-12);
        assert.ok(a.quaternion.angleTo(b.quaternion) < 1e-7);
      }
    }
  };
  samePose();
  result.adapter.update({ state: result.state, dt: 200, mode: 'paused' });
  assert.deepEqual(result.adapter.snapshot(), saved);
  for (let i = 0; i < 60; i += 1) {
    const controls = { ...empty, throttle: 1, steer: 0.1 };
    assert.deepEqual(
      result.adapter.advance(result.state, controls, DT),
      restored.advance(otherState, controls, DT),
    );
    assert.deepEqual(result.state, otherState);
    samePose();
  }
  assert.deepEqual(result.adapter.snapshot(), restored.snapshot());
  restored.restore(saved);
  restored.reset({ reason: 'manual-recover', state: otherState, seed: 47219 });
  assert.equal(restored.pose(), null);
  assert.equal(restored.snapshot().landingSettle, null);
  assert.equal(restored.snapshot().releasePose, false);
  result.adapter.dispose();
  restored.dispose();
});

test('moving off-centre jumps retain their screen composition through takeoff and touchdown', () => {
  for (const jump of track.jumps)
    for (const speed of [78.4, 165])
      for (const lateral of [-6, 6])
        for (const heading of [-0.01, 0, 0.01]) {
          const state = {
            ...createVehicleState(),
            distance: jump.takeoff - 30,
            speed,
            lateral,
            heading,
          };
          const adapter = runtime();
          const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
          const rig = createCameraRig(
            camera,
            createNacreLevel({ shape: false }).camera,
          );
          const input = { ...empty, throttle: 1, boost: speed > 150 };
          let previous = { ...state };
          let previousScreenX;
          let previousAirborne = false;
          let transitions = 0;
          let landed = false;
          let framesAfterLanding = 0;
          rig.update(track, state, 1 / 60);
          for (let frame = 0; frame < 400; frame += 1) {
            // Match the actual fixed-step/render path, including the authored
            // distance transfer and nonzero frame interpolation alpha. A dt=0
            // anchor check alone misses a changing camera goal after takeoff.
            for (let tick = 0; tick < 2; tick += 1) {
              previous = { ...state };
              const events = adapter.advance(state, input, DT);
              const transfer = events.find(
                ({ type }) => type === 'jump-transfer',
              );
              if (transfer) {
                assert.equal(transfer.payload.outcome, 'landed');
                previous = { ...state };
                landed = true;
              }
            }
            const alpha = 0.37;
            const rendered = { ...state };
            for (const key of ['distance', 'lateral', 'heading'])
              rendered[key] = THREE.MathUtils.lerp(
                previous[key],
                state[key],
                alpha,
              );
            const pose = adapter.pose(alpha);
            const position =
              pose?.position ?? displayedRoadPose(rendered).position;
            rig.update(track, rendered, 1 / 60, { worldPose: pose });
            camera.updateMatrixWorld();
            const screenX = position.clone().project(camera).x;
            const airborne = !!pose && !pose.grounded;
            if (previousScreenX !== undefined) {
              const step = Math.abs(screenX - previousScreenX);
              assert.ok(
                step < 0.008,
                `${jump.id}: visible sideways step ${step}`,
              );
              if (airborne !== previousAirborne) {
                transitions += 1;
                assert.ok(
                  step < 0.001,
                  `${jump.id}: camera handoff step ${step}`,
                );
              }
            }
            previousScreenX = screenX;
            previousAirborne = airborne;
            if (landed && ++framesAfterLanding >= 24) break;
          }
          assert.ok(landed);
          assert.equal(transitions, 2);
          adapter.dispose();
        }
});
