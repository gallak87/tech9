import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { createRivalPropulsion } from './rival-propulsion.js';
import { DEVICE_COLORS } from '../pickups/theme.js';
import { createWraithTarget } from './wraith-target.js';

function fixture(quality) {
  const hull = new Group();
  const nozzle = new Group();
  nozzle.name = 'Exhaust_C';
  nozzle.position.set(0, 0.4, -3);
  hull.add(nozzle);
  const material = new MeshStandardMaterial({
    emissive: 0x0088ff,
    emissiveIntensity: 2,
  });
  material.name = 'rook_Ion';
  const mesh = new Mesh(new BoxGeometry(), material);
  hull.add(mesh);
  const propulsion = createRivalPropulsion(hull, { quality });
  return {
    hull,
    material,
    propulsion,
    close() {
      propulsion.dispose();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

test('Low rival exhaust is anchored ordinary geometry with no shaders, lights or textures', () => {
  const f = fixture('low');
  try {
    const plume = f.propulsion.group.children[0];
    assert.deepEqual(plume.position.toArray(), [0, 0.4, -3]);
    assert.equal(plume.material.isMeshBasicMaterial, true);
    assert.equal(plume.material.map, null);
    assert.equal(plume.userData.exhaustHeat, undefined);
    assert.equal(plume.castShadow, false);
    assert.ok(plume.geometry.index.count / 3 <= 24);
    const alpha = Array.from(
      { length: plume.geometry.attributes.color.count },
      (_, i) => plume.geometry.attributes.color.getW(i),
    );
    assert.equal(Math.min(...alpha), 0, 'the tip disappears without a texture');
    assert.equal(Math.max(...alpha), 1, 'the nozzle retains a bright root');
    assert.equal(
      f.propulsion.group.children.some((o) => o.isLight),
      false,
    );
    f.propulsion.update({ speed: 112, time: 1 });
    const cruise = plume.scale.z;
    f.propulsion.update({ speed: 112, boost: true, time: 2 });
    assert.ok(plume.scale.z > cruise * 1.5);
    const boosted = plume.scale.toArray();
    f.propulsion.update({ speed: 112, boost: true, time: 2 });
    assert.deepEqual(plume.scale.toArray(), boosted, 'pause freezes pressure');
    f.propulsion.update({ speed: 112, boost: true, energy: 0, time: 1 });
    assert.equal(plume.scale.z, cruise, 'empty reserve does not show boost');
    f.propulsion.update({ speed: 112, catapulting: true, energy: 0, time: 1 });
    assert.ok(
      plume.scale.z > cruise * 1.5,
      'Vector does not depend on reserve',
    );
  } finally {
    f.close();
  }
});

test('quality changes release the old rival tier; disposal restores borrowed hull materials', () => {
  const f = fixture('high');
  const plume = f.propulsion.group.children[0];
  let geometryDisposals = 0,
    materialDisposals = 0;
  plume.geometry.addEventListener('dispose', () => geometryDisposals++);
  plume.material.addEventListener('dispose', () => materialDisposals++);
  f.propulsion.update({ speed: 112, boost: true, time: 1, quality: 'low' });
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(f.propulsion.group.children.length, 1);
  assert.equal(
    f.propulsion.group.children[0].material.isShaderMaterial,
    undefined,
  );
  assert.ok(f.material.emissiveIntensity > 2);
  f.propulsion.dispose();
  f.propulsion.dispose();
  assert.equal(f.material.emissiveIntensity, 2);
  assert.equal(f.hull.children.includes(f.propulsion.group), false);
  assert.equal(geometryDisposals, 1);
  f.close();
});

test('High rival flow freezes for reduced motion, and visibility/quality remain live', () => {
  const f = fixture('high');
  try {
    f.propulsion.update({ speed: 112, time: 4 });
    const uniforms = f.propulsion.group.children[0].material.uniforms;
    f.propulsion.update({ speed: 112, time: 5, reducedMotion: true });
    assert.equal(uniforms.flowTime.value, 4);
    assert.equal(uniforms.reducedMotion.value, 1);
    f.propulsion.update({ quality: 'low', visible: false });
    assert.equal(f.propulsion.group.visible, false);
    assert.equal(f.propulsion.group.userData.quality, 'low');
  } finally {
    f.close();
  }
});

test('Vector turns the real rival nozzle amber in both tiers and restores blue on exit', () => {
  const f = fixture('high');
  try {
    f.propulsion.update({ speed: 160, catapulting: true, time: 1 });
    const high = f.propulsion.group.children[0];
    assert.equal(
      high.material.uniforms.glowColor.value.getHex(),
      DEVICE_COLORS.vector,
    );
    f.propulsion.update({
      speed: 160,
      catapulting: true,
      time: 1,
      quality: 'low',
    });
    assert.equal(
      f.propulsion.group.children.length,
      1,
      'one exported nozzle remains one draw',
    );
    const low = f.propulsion.group.children[0];
    assert.deepEqual(low.position.toArray(), [0, 0.4, -3]);
    const colors = low.geometry.attributes.color;
    for (let i = 0; i < colors.count; i++)
      assert.ok(colors.getX(i) > colors.getZ(i));
    const version = colors.version;
    f.propulsion.update({
      speed: 160,
      catapulting: true,
      time: 2,
      quality: 'low',
    });
    assert.equal(
      colors.version,
      version,
      'steady Vector does not re-upload vertex colors',
    );
    f.propulsion.update({
      speed: 160,
      catapulting: false,
      time: 3,
      quality: 'low',
    });
    for (let i = 0; i < colors.count; i++)
      assert.ok(colors.getZ(i) > colors.getX(i));
    f.propulsion.update({ speed: 160, time: 3, quality: 'high' });
    assert.equal(
      f.propulsion.group.children[0].material.uniforms.glowColor.value.getHex(),
      0x2376ff,
    );
  } finally {
    f.close();
  }
});

function driveView(propulsion, material) {
  return {
    visible: propulsion.group.visible,
    emission: material.emissiveIntensity,
    outlets: propulsion.group.children.map((plume) => ({
      position: plume.position.toArray(),
      scale: plume.scale.toArray(),
      signal: plume.material.uniforms?.strength.value ?? plume.material.opacity,
      glow: plume.material.uniforms?.glowColor.value.toArray() ?? [
        ...plume.geometry.attributes.color.array,
      ],
    })),
  };
}

for (const quality of ['high', 'low']) {
  test(`${quality} ordinary propulsion remains identical with omitted power or explicit full drive power`, () => {
    const ordinary = fixture(quality),
      explicit = fixture(quality);
    try {
      for (const frame of [
        { speed: 0, time: 0 },
        { speed: 83, time: 1 },
        { speed: 140, time: 1.5, boost: true },
        { speed: 160, time: 2, catapulting: true, energy: 0 },
        { speed: 90, time: 3, boost: true, energy: 0 },
        {
          speed: 83,
          time: 4,
          quality: quality === 'high' ? 'low' : 'high',
          reducedMotion: true,
        },
        { speed: 83, time: 5, quality, visible: false },
      ]) {
        ordinary.propulsion.update(frame);
        explicit.propulsion.update({ ...frame, drivePower: 1 });
        assert.deepEqual(
          driveView(ordinary.propulsion, ordinary.material),
          driveView(explicit.propulsion, explicit.material),
          'ordinary racers retain their exact nozzle, intensity, palette and scale response',
        );
      }
    } finally {
      ordinary.close();
      explicit.close();
    }
  });
}

test('drive charge dims live High/Low exhaust and hull emissions, keeps anchors fixed, and restores without accumulating scale', () => {
  const charged = fixture('high'),
    normal = fixture('high');
  try {
    for (const quality of ['high', 'low', 'high']) {
      const frame = { speed: 300 / 3.6, time: 10, quality };
      normal.propulsion.update(frame);
      charged.propulsion.update({ ...frame, drivePower: 0.35 });
      const full = driveView(normal.propulsion, normal.material);
      const reduced = driveView(charged.propulsion, charged.material);
      assert.ok(
        Math.abs(reduced.emission - full.emission * 0.35) < 1e-12,
        'the real authored Ion chamber loses the same drive power as its plume',
      );
      reduced.outlets.forEach((plume, index) => {
        const reference = full.outlets[index];
        assert.deepEqual(
          plume.position,
          reference.position,
          'a power cue never moves the exported nozzle',
        );
        assert.deepEqual(
          plume.scale.slice(0, 2),
          reference.scale.slice(0, 2),
          'drive reduction preserves nozzle mouth width',
        );
        assert.ok(
          plume.scale[2] > 0 && plume.scale[2] < reference.scale[2],
          'charge has a visibly shorter plume',
        );
        assert.ok(
          Math.abs(plume.signal - reference.signal * 0.35) < 1e-12,
          'High shader strength and Low alpha communicate the same reduced power',
        );
        assert.deepEqual(
          plume.glow,
          reference.glow,
          'power reduction preserves the established ion palette',
        );
      });
      charged.propulsion.update({ ...frame, drivePower: 0.35 });
      assert.deepEqual(
        driveView(charged.propulsion, charged.material),
        reduced,
        'paused/repeated frames never shrink the plume again',
      );
      charged.propulsion.update(frame);
      assert.deepEqual(
        driveView(charged.propulsion, charged.material),
        full,
        'omitting the local charge cue restores ordinary drive exactly',
      );
    }
  } finally {
    charged.close();
    normal.close();
  }
});

test('authored Wraith Low fitting preserves charge power through quality changes without taking hull ownership', () => {
  const ship = createWraithTarget({ quality: 'low' });
  const body = ship.group.getObjectByName('Wraith / authored chassis');
  const borrowed = new Set();
  const emitted = new Set();
  body.traverse((object) => {
    if (object.geometry) borrowed.add(object.geometry);
    for (const material of [object.material].flat())
      if (material) {
        borrowed.add(material);
        if (material.emissive?.getHex()) emitted.add(material);
      }
  });
  const disposed = new Map([...borrowed].map((resource) => [resource, 0]));
  for (const resource of borrowed)
    resource.addEventListener('dispose', () =>
      disposed.set(resource, disposed.get(resource) + 1),
    );
  const propulsion = {
    group: ship.group.getObjectByName('Rival / propulsion'),
  };
  const chamber = [...emitted][0];
  assert.ok(chamber, 'the test observes the real authored ion chamber');
  try {
    let anchors;
    for (const quality of ['low', 'high', 'low']) {
      const frame = { quality, speed: 300 / 3.6, time: 6 };
      ship.update(frame);
      const full = driveView(propulsion, chamber);
      anchors ??= full.outlets.map((plume) => plume.position);
      assert.deepEqual(
        full.outlets.map((plume) => plume.position),
        anchors,
      );
      ship.update({ ...frame, drivePower: 0.35 });
      const charge = driveView(propulsion, chamber);
      assert.ok(Math.abs(charge.emission - full.emission * 0.35) < 1e-12);
      charge.outlets.forEach((plume, index) => {
        assert.deepEqual(plume.position, anchors[index]);
        assert.ok(
          Math.abs(plume.signal - full.outlets[index].signal * 0.35) < 1e-12,
          'boss Low fitting cannot replace the shared reduction with its full-drive opacity',
        );
        assert.ok(plume.scale[2] < full.outlets[index].scale[2]);
      });
      ship.update(frame);
      assert.deepEqual(
        driveView(propulsion, chamber),
        full,
        'Wraith releases back to its exact authored drive response',
      );
      assert.ok(
        [...disposed.values()].every((count) => count === 0),
        'quality/power changes own no authored hull resources',
      );
    }
  } finally {
    ship.dispose();
  }
  assert.ok(
    [...disposed.values()].every((count) => count === 1),
    'only the ship releases its authored resources, exactly once',
  );
});
