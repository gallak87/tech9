import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { createRivalPropulsion } from './rival-propulsion.js';
import { DEVICE_COLORS } from '../pickups/theme.js';

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
