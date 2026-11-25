import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { createRacerPresentation } from './racer-presentation.js';
import { RACE_OPPONENTS } from './roster.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createTrack } from '../levels/halcyon/track/model.js';
import { createHalcyonDevices } from '../levels/halcyon/devices.js';

test('rivals follow their own speed, boost/Vector, simulation clock and live graphics tier', async () => {
  const frames = [];
  let vectorActive = false;
  const state = { steer: 0, speed: 120, time: 8, boosting: true, energy: 50 };
  const racer = {
    specification: { id: 'rook', name: 'Rook' },
    state,
    prev: { speed: 100 },
    runtime: {
      snapshot: () => ({ vectorActive }),
      pose: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
    },
  };
  const presentation = await createRacerPresentation({
    racers: { enabled: true, opponents: [racer] },
    scene: new Scene(),
    settings: { quality: 'low' },
    loadRival: async (_id, { settings }) => {
      assert.equal(settings.quality, 'low');
      return {
        group: new Group(),
        update: (frame) => frames.push(frame),
        dispose() {},
      };
    },
  });
  try {
    presentation.update({
      alpha: 0.5,
      mode: 'racing',
      settings: { quality: 'low' },
    });
    assert.equal(frames.at(-1).speed, 110);
    assert.equal(frames.at(-1).boost, true);
    assert.equal(frames.at(-1).catapulting, false);
    assert.equal(frames.at(-1).energy, 0.5);
    state.boosting = false;
    vectorActive = true;
    presentation.update({
      mode: 'paused',
      settings: { quality: 'high', reducedMotion: true },
    });
    assert.equal(frames.at(-1).boost, false);
    assert.equal(frames.at(-1).catapulting, true);
    assert.equal(frames.at(-1).time, 8);
    assert.equal(frames.at(-1).quality, 'high');
    assert.equal(frames.at(-1).reducedMotion, true);
    state.time = 9;
    state.speed = 95;
    presentation.update({ mode: 'results', settings: { quality: 'high' } });
    assert.equal(
      frames.at(-1).visible,
      true,
      'rivals stay visible behind results',
    );
    assert.equal(frames.at(-1).time, 9);
    assert.equal(frames.at(-1).speed, 95);
    presentation.update({ mode: 'title', settings: { quality: 'low' } });
    assert.equal(frames.at(-1).visible, false);
  } finally {
    presentation.dispose();
  }
});

test('each rival leaves one livery-colored wake through takeoff, pause and touchdown', async (t) => {
  const track = createTrack();
  const scene = new Scene();
  const cameraPosition = track.sample(80).position.clone();
  const opponents = RACE_OPPONENTS.slice(0, 2).map((specification, i) => {
    const state = {
      ...createVehicleState(),
      distance: 80,
      lateral: i === 0 ? -2 : 2,
      speed: 90,
      steer: i === 0 ? 0.8 : -0.8,
    };
    const pose = {
      position: new Vector3(),
      quaternion: new Quaternion(),
      grounded: true,
      steeringBank: true,
    };
    return {
      specification,
      state,
      prev: { ...state },
      pose,
      runtime: { pose: () => (i === 0 ? pose : null) },
    };
  });
  const presentation = await createRacerPresentation({
    racers: { enabled: true, opponents },
    scene,
    track,
    loadRival: async () => {
      const group = new Group();
      group.userData.bounds = { min: [-2, 0, -3.6], max: [2, 1.3, 3.6] };
      return { group, dispose: () => group.removeFromParent() };
    },
  });
  t.after(() => presentation.dispose());
  const settings = { quality: 'low' };
  const [rook, latch] = opponents.map((opponent) => ({
    opponent,
    color: opponent.specification.color.slice(1),
    wake: scene.getObjectByName(`${opponent.specification.name} / glide wake`),
  }));
  assert.equal(scene.children.filter((child) => child.isMesh).length, 2);

  const right = new Vector3(1, 0, 0);
  const forward = new Vector3(0, 0, 1);
  const flightRoll = new Quaternion().setFromAxisAngle(forward, Math.PI / 3);

  function step(rookHeight = 0, mode = 'racing') {
    for (const [i, { state, prev, pose }] of opponents.entries()) {
      Object.assign(prev, state);
      state.time += 1 / 60;
      state.distance += state.speed / 60;
      const frame = track.sample(state.distance);
      const height = i === 0 ? rookHeight : 0;
      pose.grounded = height === 0;
      pose.steeringBank = pose.grounded;
      pose.position
        .copy(frame.position)
        .addScaledVector(frame.right, state.lateral)
        .addScaledVector(frame.up, 0.72 + height);
      pose.quaternion.copy(frame.quaternion);
      if (!pose.grounded) pose.quaternion.multiply(flightRoll);
    }
    presentation.update({ mode, settings, cameraPosition });
  }
  function edge(mesh, row, side) {
    return new Vector3().fromBufferAttribute(
      mesh.geometry.attributes.position,
      row * 4 + side,
    );
  }
  function wakeAxis(mesh, row = 0) {
    return edge(mesh, row, 1)
      .sub(edge(mesh, row, 0))
      .normalize();
  }
  function assertPoseAxis(mesh, quaternion) {
    assert.ok(
      wakeAxis(mesh).dot(right.clone().applyQuaternion(quaternion)) > 0.99999,
    );
  }

  for (let i = 0; i < 24; i++) step();
  for (const rival of [rook, latch]) {
    const { accent, wakeLength } = rival.wake.material.uniforms;
    assert.ok(rival.wake.visible);
    assert.equal(accent.value.getHexString(), rival.color);
    assert.ok(Math.abs(wakeLength.value - 30) < 1e-5);
    assertPoseAxis(rival.wake, rival.opponent.pose.quaternion);
  }
  const fades = rook.wake.geometry.attributes.fade;
  const cruiseFade = fades.getX(0);
  rook.opponent.state.boosting = true;
  step();
  assert.ok(fades.getX(0) > cruiseFade);

  const takeoff = edge(rook.wake, 0, 0);
  step(0.25);
  assert.ok(rook.wake.visible && latch.wake.visible);
  assert.deepEqual(edge(rook.wake, 1, 0), takeoff);
  assertPoseAxis(rook.wake, rook.opponent.pose.quaternion);
  for (let i = 2; i <= 14; i++) step(i * 0.25);

  const flight = edge(rook.wake, 0, 0);
  const flightIndices = rook.wake.geometry.drawRange.count;
  step(3.5, 'paused');
  assert.deepEqual(edge(rook.wake, 0, 0), flight);
  assert.equal(rook.wake.geometry.drawRange.count, flightIndices);
  for (let i = 13; i >= 1; i--) step(i * 0.25);
  const arrival = edge(rook.wake, 0, 0);
  step();
  assert.ok(rook.wake.visible);
  assert.deepEqual(edge(rook.wake, 1, 0), arrival);
  assertPoseAxis(rook.wake, rook.opponent.pose.quaternion);

  rook.opponent.pose.recovering = true;
  step();
  assert.equal(rook.wake.visible, false);
  assert.equal(latch.wake.visible, true);

  cameraPosition.set(2000, 2000, 2000);
  step();
  assert.equal(rook.wake.visible, false);
  assert.equal(latch.wake.visible, false);
  presentation.dispose();
  assert.equal(scene.children.length, 0);
});

test('an eliminated rival hides propulsion, pickup fields and hull contact feedback in racing and pause', async () => {
  const frames = [],
    group = new Group();
  const geometry = new BoxGeometry(),
    material = new MeshBasicMaterial();
  group.add(new Mesh(geometry, material));
  const opponent = {
    specification: { id: 'rook', name: 'Rook' },
    eliminated: false,
    state: { steer: 0, speed: 100, time: 4, boosting: true, energy: 80 },
    runtime: {
      snapshot: () => ({ aegisRemaining: 2, vectorActive: true }),
      pose: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
    },
  };
  const presentation = await createRacerPresentation({
    racers: { enabled: true, opponents: [opponent] },
    scene: new Scene(),
    combat: {
      view: () => ({
        time: 4,
        flashes: [{ target: 'rook', kind: 'arc', age: 0.08 }],
      }),
      ionContact: () => 0,
    },
    loadRival: async () => ({
      group,
      update: (frame) => frames.push(frame),
      dispose() {
        geometry.dispose();
        material.dispose();
        group.removeFromParent();
      },
    }),
  });
  try {
    presentation.update({ mode: 'racing' });
    assert.equal(group.visible, true);
    opponent.eliminated = true;
    for (const mode of ['racing', 'paused']) {
      presentation.update({ mode });
      assert.equal(group.visible, false);
      assert.equal(frames.at(-1).visible, false);
      assert.equal(
        group.getObjectByName('Combat / hull hit outline').visible,
        false,
      );
    }
  } finally {
    presentation.dispose();
  }
});

test('racing applies the shared Arc glow to the struck rival, preserves pause, and clears it on exit', async () => {
  const scene = new Scene();
  const groups = [];
  const state = { flashes: [], time: 1 };
  let exposure = 0;
  const racers = {
    enabled: true,
    opponents: ['rook', 'latch'].map((id) => ({
      specification: { id, name: id },
      state: { steer: 0 },
      runtime: {
        pose: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
      },
    })),
  };
  const presentation = await createRacerPresentation({
    racers,
    scene,
    combat: {
      view: () => state,
      ionContact: (id) => (id === 'rook' ? exposure : 0),
    },
    loadRival: async () => {
      const group = new Group();
      const geometry = new BoxGeometry();
      const material = new MeshBasicMaterial();
      group.add(new Mesh(geometry, material));
      groups.push(group);
      return {
        group,
        dispose() {
          group.removeFromParent();
          geometry.dispose();
          material.dispose();
        },
      };
    },
  });
  const effects = groups.map((group) =>
    group.getObjectByName('Combat / hull hit outline'),
  );
  state.flashes = [{ target: 'latch', kind: 'arc', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, false);
  assert.equal(effects[1].visible, true);
  const strength = effects[1].children[0].material.uniforms.strength;
  assert.equal(strength.value, 1);
  presentation.update({ mode: 'paused' });
  assert.equal(strength.value, 1);
  presentation.update({ mode: 'racing', settings: { reducedMotion: true } });
  assert.equal(strength.value, 0.45);
  state.flashes.push({ target: 'latch', kind: 'arc', age: 0 });
  presentation.update({ mode: 'racing' });
  assert.equal(
    strength.value,
    0,
    'a new pellet contact starts a fresh soft pulse',
  );
  state.flashes = [{ target: 'rook', kind: 'aegis', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.ok(
    effects.every((effect) => !effect.visible),
    'shield blocks do not pretend to hit bare hull',
  );
  state.flashes = [{ target: 'rook', kind: 'repulsor', age: 0.08 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, true);
  assert.equal(effects[1].visible, false);
  const response = effects[0].children[0].material.uniforms;
  assert.ok(
    response.color.value.r > response.color.value.b,
    'Repulsor hits tint the whole target rose',
  );
  assert.equal(response.strength.value, 1);
  state.flashes = [];
  exposure = 1;
  presentation.update({ mode: 'racing' });
  assert.equal(response.interference.value, 1);
  assert.equal(response.strength.value, 0.38);
  assert.equal(effects[1].visible, false, 'only the exposed rival glows');
  presentation.update({ mode: 'paused' });
  assert.equal(response.time.value, 1);
  assert.equal(response.strength.value, 0.38);
  state.flashes = [{ target: 'rook', kind: 'aegis', age: 0.1 }];
  presentation.update({ mode: 'racing' });
  assert.equal(effects[0].visible, false, 'shield fracture takes priority');
  exposure = 0;
  state.flashes = [{ target: 'rook', kind: 'arc', age: 0.08 }];
  presentation.update({ mode: 'title' });
  assert.ok(effects.every((effect) => !effect.visible));
  presentation.dispose();
  presentation.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok(effects.every((effect) => effect.parent === null));
});

test('rival shield consumes real combat hits, cracks once, freezes on pause and releases its observer', async () => {
  const track = createTrack();
  const actors = new Map();
  const combat = {
    bind: (id, actor) => actors.set(id, actor),
    resetActor: (id) => actors.delete(id),
    view: () => ({ flashes: [] }),
    disruption: () => null,
  };
  const state = {
    ...createVehicleState(),
    distance: 359.7,
    lateral: 3,
    speed: 80,
  };
  const runtime = createDeviceRuntime({
    track,
    devices: createHalcyonDevices(track),
    combat,
    combatId: 'rook',
  });
  runtime.reset({ state });
  const group = new Group();
  const presentation = await createRacerPresentation({
    racers: {
      enabled: true,
      opponents: [
        {
          specification: { id: 'rook', name: 'Rook' },
          state,
          prev: { ...state },
          runtime,
        },
      ],
    },
    scene: new Scene(),
    track,
    combat,
    loadRival: async () => ({ group, dispose: () => group.removeFromParent() }),
  });
  try {
    runtime.advance(state, { throttle: 1 }, 1 / 120);
    runtime.update({});
    presentation.update({ mode: 'racing' });
    const shield = group.getObjectByName(
      'Aegis / hull field and outward pulses',
    );
    const field = shield.material.uniforms;
    assert.equal(shield.visible, true);
    const reserve = state.energy;
    assert.equal(
      actors.get('rook').hit({
        source: 'player',
        kind: 'arc',
        impulse: new Vector3(),
        cost: 6,
      }),
      true,
    );
    assert.equal(
      state.energy,
      reserve,
      'shield protection still comes from the runtime',
    );
    runtime.update({});
    presentation.update({ mode: 'racing' });
    assert.equal(runtime.snapshot().aegisRemaining, 0);
    assert.equal(field.hit.value, 1);
    assert.equal(
      group.getObjectByName('Aegis / dim driving trail').visible,
      false,
    );
    runtime.update({});
    for (let i = 0; i < 2; i++) {
      runtime.advance(state, { throttle: 1 }, 0.1);
      runtime.update({});
      presentation.update({ mode: 'racing' });
    }
    const age = field.breakAge.value;
    assert.ok(
      age > 0.19 && age < 0.21,
      'drained hit events never restart the fracture',
    );
    presentation.update({ mode: 'paused' });
    assert.equal(field.breakAge.value, age);
    for (let i = 0; i < 10; i++) {
      runtime.advance(state, { throttle: 1 }, 0.1);
      runtime.update({});
      presentation.update({ mode: 'racing' });
    }
    assert.equal(shield.visible, false);
    presentation.dispose();
    assert.equal(group.getObjectByName('Rival / pickups'), undefined);
    assert.doesNotThrow(() => {
      runtime.reset({ state });
      runtime.advance(state, { throttle: 1 }, 0.1);
      runtime.update({});
    }, 'disposed race presentation leaves no active observer');
  } finally {
    presentation.dispose();
    runtime.dispose();
  }
});

for (const quality of ['high', 'low'])
  test(`${quality} rival equipment reuses the existing shield and drive presentation without snapshot cloning`, async () => {
    const group = new Group();
    const frames = [];
    const equipment = {
      shield: true,
      shieldRemaining: 2,
      slipstreamRemaining: 3,
    };
    let observer;
    const state = {
      ...createVehicleState(),
      distance: 100,
      speed: 120,
      time: 1,
    };
    const runtime = {
      readFrame: () => ({ vectorActive: false, aegisRemaining: 0, equipment }),
      snapshot() {
        throw new Error('a display frame must not clone a checkpoint');
      },
      pose: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
      observePresentation(value) {
        observer = value;
        return () => {
          observer = null;
        };
      },
    };
    const presentation = await createRacerPresentation({
      racers: {
        enabled: true,
        opponents: [
          { specification: { id: 'rook', name: 'Rook' }, state, runtime },
        ],
      },
      scene: new Scene(),
      settings: { quality },
      loadRival: async () => ({
        group,
        update: (frame) => frames.push(frame),
        dispose: () => group.removeFromParent(),
      }),
    });
    try {
      const nodes = [];
      group.traverse((node) => nodes.push(node));
      observer.events([
        { type: 'equipment-activate', payload: { kind: 'deflector' } },
      ]);
      presentation.update({ mode: 'racing', settings: { quality } });
      const shield = group.getObjectByName(
        quality === 'low'
          ? 'Low Aegis / field'
          : 'Aegis / hull field and outward pulses',
      );
      assert.equal(shield.visible, true);
      assert.equal(frames.at(-1).catapulting, true);
      equipment.shield = false;
      equipment.shieldRemaining = equipment.slipstreamRemaining = 0;
      state.time += 0.1;
      observer.events([
        { type: 'equipment-block', payload: { kind: 'deflector' } },
      ]);
      presentation.update({ mode: 'racing', settings: { quality } });
      assert.equal(
        shield.visible,
        true,
        'a real Deflector block retains the existing fracture tail',
      );
      assert.equal(frames.at(-1).catapulting, false);
      const after = [];
      group.traverse((node) => after.push(node));
      assert.deepEqual(
        after,
        nodes,
        'equipment does not add another render graph',
      );
      presentation.update({ mode: 'title', settings: { quality } });
      assert.equal(group.visible, false);
    } finally {
      presentation.dispose();
    }
    assert.equal(observer, null);
  });
