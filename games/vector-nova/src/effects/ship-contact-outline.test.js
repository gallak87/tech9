import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {
  contactOutlineStrength,
  createShipContactOutline,
} from './ship-contact-outline.js';

test('contact and recovery each get at most three hull pulses within one second', () => {
  for (const contact of [0, 1]) {
    const values = Array.from({ length: 101 }, (_, index) =>
      contactOutlineStrength({
        contact,
        contactDuration: index / 100,
        contactAge: index / 100,
      }),
    );
    const peaks = values.filter(
      (value, index) =>
        value > 0.01 &&
        (index === 0 || value > values[index - 1]) &&
        (index === values.length - 1 || value > values[index + 1]),
    );
    assert.ok(peaks.length >= 2 && peaks.length <= 3);
    assert.ok(Math.max(...values) <= 0.76);
    assert.ok(values.slice(85).every((value) => value === 0));
    const reduced = values.map((_value, index) =>
      contactOutlineStrength(
        { contact, contactDuration: index / 100, contactAge: index / 100 },
        true,
      ),
    );
    assert.ok(
      reduced.every(
        (value, index) => index === 0 || value <= reduced[index - 1],
      ),
    );
  }
  assert.equal(contactOutlineStrength(), 0);
});

test('outline borrows opaque geometry and follows ancestor visibility, LOD and hull transforms', () => {
  const ship = new T.Group();
  ship.position.set(20, 8, -50);
  ship.rotation.y = 0.7;
  const geometry = new T.BoxGeometry(2, 1, 5);
  const material = new T.MeshStandardMaterial();
  const high = new T.Group(),
    low = new T.Group(),
    effects = new T.Group();
  high.visible = false;
  effects.userData.aoExclude = true;
  const sources = [high, low, effects].map((group, index) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `part-${index}`;
    mesh.position.x = index;
    group.add(mesh);
    ship.add(group);
    return mesh;
  });
  const outline = createShipContactOutline();
  outline.update(ship, 0.2);
  assert.equal(outline.group.children.length, 2, 'exclude whole VFX branches');
  assert.deepEqual(
    outline.group.children.map((mesh) => mesh.visible),
    [false, true],
  );
  assert.ok(outline.group.children.every((mesh) => mesh.geometry === geometry));
  assert.equal(outline.group.children[0].material.side, T.DoubleSide);
  assert.equal(outline.group.children[0].material.forceSinglePass, true);
  assert.equal(
    outline.group.children[0].material.uniforms.color.value.getHex(),
    0xff4020,
  );
  assert.equal(outline.group.children[0].material.depthWrite, false);
  assert.equal(outline.group.children[0].material.depthTest, true);
  const point = new T.Vector3();
  assert.ok(
    outline.group.children[1]
      .getWorldPosition(point)
      .distanceTo(sources[1].getWorldPosition(new T.Vector3())) < 1e-9,
  );
  high.visible = true;
  low.visible = false;
  outline.update(ship, 0.2);
  assert.deepEqual(
    outline.group.children.map((mesh) => mesh.visible),
    [true, false],
  );
  ship.visible = false;
  outline.update(ship, 0.2);
  assert.ok(outline.group.children.every((mesh) => !mesh.visible));
  outline.dispose();
  geometry.dispose();
  material.dispose();
});

test('outline recaches a changed fleet model and disposes only its material once', () => {
  const ship = new T.Group();
  const geometry = new T.BoxGeometry(),
    material = new T.MeshBasicMaterial();
  const first = new T.Mesh(geometry, material);
  ship.add(first);
  const outline = createShipContactOutline();
  outline.update(ship, 0.2);
  let geometryDisposals = 0,
    materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  outline.group.children[0].material.addEventListener(
    'dispose',
    () => materialDisposals++,
  );
  first.removeFromParent();
  const next = new T.Mesh(geometry, material);
  next.name = 'replacement';
  ship.add(next);
  ship.userData = { model: 'replacement' };
  outline.update(ship, 0.2);
  assert.equal(outline.group.children.length, 1);
  assert.match(outline.group.children[0].name, /replacement/);
  outline.reset();
  assert.equal(outline.group.visible, false);
  outline.dispose();
  outline.dispose();
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 1);
  assert.equal(outline.group.parent, null);
  geometry.dispose();
  material.dispose();
});
