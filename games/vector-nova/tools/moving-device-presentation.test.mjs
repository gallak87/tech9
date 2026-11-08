import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { sweepGeometry } from '../src/track/geometry.js';
import { createSurfaceProjector } from '../src/pickups/surface-projector.js';
import { createDeviceHardware } from '../src/pickups/hardware.js';
import { disposeGroup } from '../src/pickups/geometry.js';
import { createFinishMarker } from '../src/race/finish-marker.js';
import { createRoadPulsePresentation } from '../src/pickups/road-pulse.js';
import { createCombatSimulation, COMBAT_RULES } from '../src/pickups/combat.js';
import { createHash } from 'node:crypto';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { installNomadMotion } from '../src/levels/nomad/motion.js';
import { createNomadRoad } from '../src/levels/nomad/track/road.js';
import { createDevices as createNomadDevices } from '../src/levels/nomad/devices.js';
import { collectRoadSurfaces } from '../src/pickups/device-mount.js';

function fixture({ moving = true } = {}) {
  const quaternion = new T.Quaternion()
    .setFromAxisAngle(new T.Vector3(1, 0, 0), Math.atan(0.03))
    .multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), 0.12),
    );
  const right = new T.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new T.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const tangent = new T.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const nominalSample = (distance) => ({
    position: new T.Vector3(0, 30 - distance * 0.03, distance),
    right: right.clone(),
    up: up.clone(),
    tangent: tangent.clone(),
    quaternion: quaternion.clone(),
  });
  const nominalSurface = (distance, lateral) => {
    const frame = nominalSample(distance);
    frame.position.addScaledVector(frame.right, lateral);
    return frame;
  };
  const track = {
    width: 50,
    length: 500,
    finishDistance: 450,
    closed: false,
    deviceProjection: 'rendered-surface',
    presentationTime: 0,
    sample: nominalSample,
    nominalSample,
    nominalSurface,
  };
  const motion = (distance) => {
    const t = track.presentationTime;
    return distance < 250
      ? new T.Vector3(
          Math.sin(t) * 19,
          Math.sin(t * 0.7) * 3,
          (Math.cos(t) - 1) * 17,
        )
      : new T.Vector3(
          -Math.sin(t * 0.7) * 23,
          Math.sin(t) * 2,
          Math.sin(t * 0.6) * 21,
        );
  };
  track.sampleSurface = (distance, lateral) => {
    const frame = nominalSurface(distance, lateral);
    if (moving) frame.position.add(motion(distance));
    return frame;
  };
  if (moving) track.deviceMotionAt = motion;
  const road = new T.Group(),
    surfaces = [];
  for (const [index, start] of [0, 250].entries()) {
    const root = new T.Group();
    road.add(root);
    const geometry = sweepGeometry(
      track,
      [
        [-25, 0],
        [25, 0],
      ],
      { start, end: start + 250, step: 4, transverseStep: 4 },
    );
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial());
    mesh.userData = {
      roadSurface: true,
      ...(moving
        ? {
            motionGroup: `carrier-${index}`,
            nominalMatrixWorld: new T.Matrix4(),
          }
        : {}),
    };
    root.add(mesh);
    surfaces.push(mesh);
  }
  const placeRoad = (time) => {
    track.presentationTime = time;
    surfaces.forEach((mesh, index) =>
      mesh.parent.position.copy(
        moving ? motion(index * 250 + 1) : new T.Vector3(),
      ),
    );
    road.updateWorldMatrix(true, true);
  };
  const devices = [
    {
      id: 'moving-vector',
      type: 'vector',
      distance: 100,
      lateral: 0,
      length: 40,
      width: 12,
    },
    {
      id: 'moving-aegis',
      type: 'aegis',
      distance: 175,
      lateral: 0,
      length: 8,
      width: 10,
    },
    {
      id: 'moving-arc',
      type: 'arc',
      distance: 285,
      lateral: -8,
      length: 10,
      width: 8,
    },
    {
      id: 'moving-repulsor',
      type: 'repulsor',
      distance: 345,
      lateral: 8,
      length: 10,
      width: 8,
    },
    {
      id: 'moving-ion',
      type: 'ion',
      distance: 405,
      lateral: 0,
      length: 10,
      width: 8,
    },
  ];
  placeRoad(0);
  return {
    track,
    road,
    surfaces,
    devices,
    placeRoad,
    dispose() {
      surfaces.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
    },
  };
}
function bufferPositions(group) {
  const result = [];
  group.traverse((object) => {
    if (object.geometry?.attributes.position)
      result.push(Array.from(object.geometry.attributes.position.array));
  });
  return result;
}
const close = (actual, expected, message) =>
  assert.ok(actual.distanceTo(expected) < 1e-5, message);

test('nominal hardware projection remains independent of a live road matrix while ordinary projection follows it', () => {
  const f = fixture();
  f.placeRoad(2.3);
  const before = f.surfaces.map((mesh) => mesh.matrixWorld.toArray());
  const nominal = createSurfaceProjector(f.track, f.surfaces, {
    nominal: true,
  });
  const actual = createSurfaceProjector(f.track, f.surfaces);
  try {
    for (const distance of [100, 350]) {
      const rest = f.track.nominalSurface(distance, 2).position;
      close(
        nominal.sample(distance, 2),
        rest,
        'hardware bakes at its immutable rest pose',
      );
      close(
        actual.sample(distance, 2),
        rest.clone().add(f.track.deviceMotionAt(distance)),
        'other surface queries retain current world geometry',
      );
    }
    assert.deepEqual(
      f.surfaces.map((mesh) => mesh.matrixWorld.toArray()),
      before,
      'baking never repositions the live road',
    );
  } finally {
    nominal.dispose();
    actual.dispose();
    f.dispose();
  }
});

test('High and Low devices follow separate carriers through phase changes, quality rebuilds, pause and reset', () => {
  const f = fixture();
  const owned = [];
  try {
    for (const quality of ['high', 'low']) {
      f.placeRoad(0);
      const original = createDeviceHardware({ ...f, quality });
      owned.push(...original);
      const originalBuffers = original.map((record) =>
        bufferPositions(record.group),
      );
      f.placeRoad(3.7);
      const rebuilt = createDeviceHardware({ ...f, quality });
      owned.push(...rebuilt);
      assert.deepEqual(
        rebuilt.map((record) => bufferPositions(record.group)),
        originalBuffers,
        `${quality}: a phase-time rebuild must not bake or double the carrier displacement`,
      );
      for (const record of [...original, ...rebuilt]) {
        record.updateMotion();
        close(
          record.group.position,
          f.track.deviceMotionAt(record.device.distance),
        );
      }
      const frozen = rebuilt.map((record) => record.group.position.toArray());
      for (const record of rebuilt) {
        record.updateMotion();
        record.updateMotion();
      }
      assert.deepEqual(
        rebuilt.map((record) => record.group.position.toArray()),
        frozen,
        'paused motion has no independent clock',
      );
      f.placeRoad(6.4);
      for (const record of rebuilt) {
        record.updateMotion();
        close(
          record.group.position,
          f.track.deviceMotionAt(record.device.distance),
        );
      }
      assert.deepEqual(
        rebuilt.map((record) => bufferPositions(record.group)),
        originalBuffers,
        'travel changes only the rigid parent, never the device buffers',
      );
      f.placeRoad(0);
      for (const record of rebuilt) {
        record.updateMotion();
        close(
          record.group.position,
          new T.Vector3(),
          'reset returns to the nominal deck',
        );
      }
    }
  } finally {
    owned.forEach((record) => disposeGroup(record.group));
    f.dispose();
  }
});

test('the Aegis arch protects the chase sightline at its translated position', () => {
  const f = fixture();
  const [visual] = createDeviceHardware({
    ...f,
    devices: [f.devices[1]],
    quality: 'high',
  });
  try {
    const bounds = new T.Box3().setFromObject(visual.arch);
    const translation = new T.Vector3(75, 10, 120);
    const eye = bounds.getCenter(new T.Vector3()).add(translation);
    const camera = { position: eye },
      ship = eye.clone().add(new T.Vector3(0, 0, 20));
    visual.updateCamera(camera, ship);
    assert.equal(
      visual.arch.visible,
      true,
      'the nominal arch is far from this sightline',
    );
    visual.updateCamera(camera, ship, translation);
    assert.equal(
      visual.arch.visible,
      false,
      'the actual moving arch cannot obscure the craft',
    );
  } finally {
    disposeGroup(visual.group);
    f.dispose();
  }
});

test('finish paint is baked at rest and follows the final carrier even when constructed mid-motion', () => {
  const f = fixture();
  const initial = createFinishMarker(f.track, { width: 48 });
  f.placeRoad(2.8);
  const moving = createFinishMarker(f.track, { width: 48 });
  try {
    assert.deepEqual(
      bufferPositions(moving.group),
      bufferPositions(initial.group),
    );
    close(
      moving.group.position,
      f.track.deviceMotionAt(f.track.finishDistance),
    );
    f.placeRoad(5.7);
    moving.update();
    initial.update();
    close(
      moving.group.position,
      f.track.deviceMotionAt(f.track.finishDistance),
    );
    close(initial.group.position, moving.group.position);
    f.placeRoad(0);
    moving.update();
    close(moving.group.position, new T.Vector3());
    moving.dispose();
    moving.update();
    moving.dispose();
  } finally {
    initial.dispose();
    moving.dispose();
    f.dispose();
  }
});

test('unmoving levels retain their world-space hardware and finish marker without nominal metadata', () => {
  const f = fixture({ moving: false });
  const visuals = createDeviceHardware({ ...f, quality: 'high' });
  const finish = createFinishMarker(f.track, { width: 48 });
  try {
    assert.ok(visuals.every((visual) => !visual.updateMotion));
    assert.ok(
      visuals.every((visual) => visual.group.position.lengthSq() === 0),
    );
    finish.update();
    close(finish.group.position, new T.Vector3());
  } finally {
    visuals.forEach((visual) => disposeGroup(visual.group));
    finish.dispose();
    f.dispose();
  }
});

for (const low of [false, true])
  test(`Repulsor pressure follows only its owning moving deck (${low ? 'Low' : 'High'})`, () => {
    const f = fixture();
    f.placeRoad(3.4);
    const projector = createSurfaceProjector(f.track, f.surfaces, {
      nominal: true,
    });
    const root = new T.Group();
    const presentation = createRoadPulsePresentation(
      root,
      { track: f.track, projector },
      { low },
    );
    // Two cues share a 64m cache bucket but belong to different moving carriers.
    const flashes = [245, 255].map((distance, id) => ({
      id,
      kind: 'repulsor',
      radius: 108,
      distance,
      lateral: 0,
      age: 0.24,
    }));
    const state = { time: 3.4, flashes };
    try {
      presentation.update(state);
      assert.equal(root.children.length, 2);
      assert.notEqual(
        root.children[0].geometry,
        root.children[1].geometry,
        'differently moving surfaces cannot borrow one rigid pressure window',
      );
      const buffers = root.children.map((mesh) => bufferPositions(mesh));
      for (const [index, mesh] of root.children.entries()) {
        const c = mesh.geometry.attributes.roadCoord;
        assert.ok(c.count > 0);
        for (let n = 0; n < c.count; n++) {
          const distance = c.getY(n);
          assert.ok(
            index ? distance >= 250 - 1e-4 : distance <= 250 + 1e-4,
            'a pressure patch must not attach neighboring-carrier vertices to the wrong rigid parent',
          );
        }
        close(mesh.position, f.track.deviceMotionAt(flashes[index].distance));
      }
      f.placeRoad(5.6);
      presentation.update(state);
      root.children.forEach((mesh, index) =>
        close(mesh.position, f.track.deviceMotionAt(flashes[index].distance)),
      );
      assert.deepEqual(
        root.children.map((mesh) => bufferPositions(mesh)),
        buffers,
        'moving the deck does not rebuild a paused pressure footprint',
      );
      f.placeRoad(0);
      presentation.update(state);
      root.children.forEach((mesh) => close(mesh.position, new T.Vector3()));
    } finally {
      presentation.dispose();
      presentation.dispose();
      projector.dispose();
      f.dispose();
    }
  });

test('Arc launches continuously at a nonzero carrier phase and replays independently of the presentation clock', () => {
  const f = fixture();
  const track = f.track;
  const explicitMotion = (time) =>
    new T.Vector3(
      60 + Math.sin(time) * 11,
      Math.sin(time * 0.7) * 3,
      90 + Math.cos(time) * 19,
    );
  track.frameAtTime = (distance, time) => {
    const frame = track.nominalSample(distance);
    frame.position.add(explicitMotion(time));
    return frame;
  };
  track.surfaceAtTime = (distance, lateral, time) => {
    const frame = track.frameAtTime(distance, time);
    frame.position.addScaledVector(frame.right, lateral);
    return frame;
  };
  const combat = createCombatSimulation({ track });
  const actor = {
    state: { distance: 100, lateral: 2, speed: 0, time: 9.5 },
    pose() {
      const frame = track.surfaceAtTime(
        this.state.distance,
        this.state.lateral,
        this.state.time,
      );
      return {
        position: frame.position.addScaledVector(frame.up, 1.2),
        quaternion: frame.quaternion,
        grounded: true,
      };
    },
    notify() {},
  };
  const dt = 1 / 120;
  const step = (count) => {
    for (let tick = 0; tick < count; tick++) {
      actor.state.time += dt;
      combat.bind('player', actor);
      combat.step(dt);
    }
  };
  try {
    combat.bind('player', actor);
    combat.request('player', {
      type: 'pickup-activate',
      payload: { kind: 'arc', deviceId: 'moving-arc' },
    });
    track.presentationTime = 10000;
    step(Math.ceil(COMBAT_RULES.arcDelay / dt));
    const shot = combat.view().shots[0];
    assert.ok(shot, 'the native three-shot Arc program fires');
    const frame = track.frameAtTime(shot.distance, actor.state.time);
    const expected = frame.position
      .clone()
      .addScaledVector(frame.right, shot.lateral)
      .addScaledVector(frame.up, shot.height);
    close(new T.Vector3().fromArray(shot.position), expected);
    assert.ok(
      new T.Vector3().fromArray(shot.velocity).length() < 400,
      'the first shot step must not snap tens of metres back onto the nominal route',
    );
    const wrong = track
      .nominalSample(shot.distance)
      .position.addScaledVector(frame.right, shot.lateral)
      .addScaledVector(frame.up, shot.height);
    assert.ok(
      wrong.distanceTo(expected) > 60,
      'the nominal-route negative control is materially displaced',
    );
    const saved = combat.snapshot(),
      savedActor = { ...actor.state };
    track.presentationTime = -1234;
    step(12);
    const forward = combat.snapshot();
    combat.restore(saved);
    Object.assign(actor.state, savedActor);
    track.presentationTime = 456789;
    step(12);
    assert.deepEqual(
      combat.snapshot(),
      forward,
      'replay carries the physical carrier clock, never the view clock',
    );
    const staticTrack = { ...track, frameAtTime: undefined };
    assert.equal(
      Object.hasOwn(
        createCombatSimulation({ track: staticTrack }).snapshot(),
        'frameTime',
      ),
      false,
      'approved static worlds retain their original snapshot shape',
    );
  } finally {
    f.dispose();
  }
});

test('the complete Nomad device layout projects onto its real nominal skins in both presets at a nonzero phase', () => {
  const track = installNomadMotion(createNomadTrack());
  track.deviceProjection = 'rendered-surface';
  const road = createNomadRoad({ track });
  const surfaces = collectRoadSurfaces(road.group);
  const devices = createNomadDevices(track),
    owned = [];
  const signature = (group) => {
    const hash = createHash('sha256');
    group.traverse((object) => {
      const array = object.geometry?.attributes.position?.array;
      if (array)
        hash.update(
          Buffer.from(array.buffer, array.byteOffset, array.byteLength),
        );
    });
    return hash.digest('hex');
  };
  try {
    assert.deepEqual(
      new Set(devices.map((device) => device.type)),
      new Set(['vector', 'aegis', 'arc', 'repulsor', 'ion']),
    );
    for (const quality of ['high', 'low']) {
      track.presentationTime = 0;
      road.update();
      road.group.updateWorldMatrix(true, true);
      const before = createDeviceHardware({
        track,
        surfaces,
        devices,
        quality,
      });
      owned.push(...before);
      const hashes = before.map((record) => signature(record.group));
      track.presentationTime = 8.2;
      road.update();
      road.group.updateWorldMatrix(true, true);
      const after = createDeviceHardware({ track, surfaces, devices, quality });
      owned.push(...after);
      assert.deepEqual(
        after.map((record) => signature(record.group)),
        hashes,
        'actual curved carrier skins retain the same reference-pose device buffers',
      );
      for (const record of after)
        close(
          record.group.position,
          track.motionAt(record.device.distance, 8.2).translation,
        );
    }
  } finally {
    owned.forEach((record) => disposeGroup(record.group));
    road.dispose();
  }
});
