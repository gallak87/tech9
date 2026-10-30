import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Group, Texture } from 'three';
import { createInterceptorTarget } from './interceptor-target.js';
import { GOLIATH_HULL } from './interceptor-target-hull.js';
import { SHIPS } from './catalog.js';
import { createCrucibleTrack } from '../levels/crucible/track/model.js';
import { createInterceptorTrack } from '../levels/interceptor/track/model.js';
import { createInterceptorDevices } from '../levels/interceptor/devices.js';
import { createRivalPropulsion } from './rival-propulsion.js';

test('Goliath is a distinct large AI hull whose contact bounds match its rendered chassis', () => {
  const target = createInterceptorTarget({ quality: 'low' }),
    body = target.group.getObjectByName('Goliath / manufactured chassis');
  const bounds = new Box3().setFromObject(body);
  assert.equal(target.specification.id, 'goliath');
  assert.equal(
    SHIPS.some((ship) => ship.id === 'goliath'),
    false,
  );
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(
      Math.abs(bounds.min.getComponent(axis) - GOLIATH_HULL.bounds.min[axis]) <
        1e-6,
    );
    assert.ok(
      Math.abs(bounds.max.getComponent(axis) - GOLIATH_HULL.bounds.max[axis]) <
        1e-6,
    );
  }
  assert.deepEqual(GOLIATH_HULL.bounds, {
    min: [-8, -0.2, -20],
    max: [8, 5.8, 20],
  });
  assert.equal(
    GOLIATH_HULL.hullSha256,
    createHash('sha256')
      .update(
        JSON.stringify({
          vertices: GOLIATH_HULL.vertices,
          parts: GOLIATH_HULL.parts,
        }),
      )
      .digest('hex'),
  );
  assert.ok(GOLIATH_HULL.parts.length >= 8);
  for (const part of GOLIATH_HULL.parts) {
    assert.ok(part.vertices.length >= 12);
    assert.ok(part.vertices.every(Number.isFinite));
    assert.equal(part.vertices.length % 3, 0);
  }
  for (const side of ['L', 'R', 'C'])
    assert.ok(target.group.getObjectByName('Exhaust_' + side).position.z < -18);
  assert.ok(
    body.children.length <= 10,
    'source assemblies are consolidated by material',
  );
  target.dispose();
});

test('large propulsion stays bounded across repeated frames and quality changes, with exactly-once resource disposal', () => {
  const target = createInterceptorTarget({ quality: 'low' }),
    resources = new Set(),
    counts = new Map(),
    borrowed = new Texture();
  target.group.traverse((object) => {
    if (object.material)
      for (const value of Object.values(object.material))
        if (value?.isTexture && value !== borrowed) resources.add(value);
    if (object.geometry) resources.add(object.geometry);
    if (object.material) {
      resources.add(object.material);
      object.material.envMap = borrowed;
    }
  });
  for (const resource of [...resources, borrowed])
    resource.addEventListener('dispose', () =>
      counts.set(resource, (counts.get(resource) ?? 0) + 1),
    );
  const frame = {
    speed: 120,
    time: 1,
    quality: 'low',
    energy: 1,
    visible: true,
  };
  target.update(frame);
  const plume = target.group.getObjectByName('Rival / propulsion').children[0],
    scale = plume.scale.toArray();
  target.update(frame);
  assert.deepEqual(
    plume.scale.toArray(),
    scale,
    'repeated rendered frames do not compound the large-craft scale',
  );
  assert.ok(
    scale[0] * 0.28 < 1.85 * 0.65 && scale[2] > 8,
    'Low retains the long heavy-craft thrust while its root clears the nozzle',
  );
  target.update({ ...frame, quality: 'high' });
  target.update({ ...frame, quality: 'low', visible: false });
  assert.equal(
    target.group.getObjectByName('Rival / propulsion').visible,
    false,
  );
  target.dispose();
  target.dispose();
  for (const resource of resources) assert.equal(counts.get(resource), 1);
  assert.equal(counts.has(borrowed), false);
  borrowed.dispose();
});

test('Goliath Low exhaust leaves its chambers readable and responds to driving/boost without altering High propulsion', () => {
  const target = createInterceptorTarget({ quality: 'low' });
  const referenceHull = new Group();
  for (const [side, x, y, z] of [
    ['L', -5.4, 2.5, -19.99],
    ['R', 5.4, 2.5, -19.99],
    ['C', 0, 1.94, -18.99],
  ]) {
    const anchor = new Group();
    anchor.name = 'Exhaust_' + side;
    anchor.position.set(x, y, z);
    referenceHull.add(anchor);
  }
  const reference = createRivalPropulsion(referenceHull, { quality: 'high' });
  const group = target.group.getObjectByName('Rival / propulsion');
  const checkClearance = () => {
    for (const plume of group.children) {
      const mouthRadius = Math.abs(plume.position.x) < 1 ? 1.16 : 1.85;
      const positions = plume.geometry.attributes.position;
      let rootRadius = 0;
      for (let vertex = 0; vertex < positions.count; vertex++)
        rootRadius = Math.max(
          rootRadius,
          Math.hypot(
            positions.getX(vertex) * plume.scale.x,
            positions.getY(vertex) * plume.scale.y,
          ),
        );
      assert.ok(
        rootRadius < mouthRadius * 0.65,
        'the cone root stays inside the deep pressure mouth',
      );
      assert.ok(
        plume.material.opacity >= 0.15 && plume.material.opacity <= 0.7,
      );
      assert.ok(plume.scale.z > 0 && Number.isFinite(plume.scale.z));
    }
  };
  try {
    checkClearance();
    const idleOpacity = group.children[0].material.opacity;
    assert.ok(
      idleOpacity >= 0.15 && idleOpacity < 0.25,
      'idle shows a faint powered core while preserving the dark chamber',
    );
    const driving = { quality: 'low', speed: 120, time: 1, energy: 1 };
    target.update(driving);
    checkClearance();
    const drivingOpacity = group.children[0].material.opacity;
    const drivingScales = group.children.map((plume) => plume.scale.toArray());
    assert.ok(drivingOpacity > idleOpacity && group.children[0].scale.z > 8);
    target.update(driving);
    assert.deepEqual(
      group.children.map((plume) => plume.scale.toArray()),
      drivingScales,
    );
    assert.equal(group.children[0].material.opacity, drivingOpacity);
    for (let frame = 1; frame <= 6; frame++)
      target.update({ ...driving, boost: true, time: 1 + frame / 20 });
    checkClearance();
    assert.ok(group.children[0].material.opacity > drivingOpacity);
    const boostScales = group.children.map((plume) => plume.scale.toArray());
    target.update({ ...driving, boost: true, time: 1.3 });
    assert.deepEqual(
      group.children.map((plume) => plume.scale.toArray()),
      boostScales,
    );
    target.update({ quality: 'low', speed: 0, time: 3 });
    assert.equal(
      group.children[0].material.opacity,
      idleOpacity,
      'seek/reset restores the readable idle chamber',
    );
    const high = { quality: 'high', speed: 120, time: 3, energy: 1 };
    target.update(high);
    reference.update(high);
    for (let index = 0; index < group.children.length; index++) {
      const actual = group.children[index],
        shared = reference.group.children[index];
      assert.deepEqual(
        actual.scale.toArray(),
        shared.scale
          .toArray()
          .map((value, axis) => value * [3.8, 3.8, 2.4][axis]),
        'High keeps the existing shared response and exact large-craft multiplier',
      );
      for (const uniform of ['strength', 'flowTime', 'boostMix', 'thrustMix'])
        assert.equal(
          actual.material.uniforms[uniform].value,
          shared.material.uniforms[uniform].value,
        );
    }
  } finally {
    reference.dispose();
    target.dispose();
  }
});

test('Crucible Dispatch owns a separate pursuit route with support and offensive weapon gates', () => {
  const original = createCrucibleTrack(),
    pursuit = createInterceptorTrack();
  assert.notEqual(original.id, pursuit.id);
  assert.notEqual(pursuit.geometryVersion, original.geometryVersion);
  assert.notEqual(pursuit.length, original.length);
  assert.equal(pursuit.width, original.width);
  assert.deepEqual(
    pursuit.routeMoments.map((moment) => moment.type),
    ['drop', 'bank-reversal'],
  );
  const devices = createInterceptorDevices(pursuit);
  assert.ok(devices.length > 4);
  assert.ok(
    devices.every((device) =>
      ['aegis', 'arc', 'repulsor'].includes(device.type),
    ),
  );
});
