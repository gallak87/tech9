import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene } from 'three';
import { createInspectionGlideTrail } from './glide-trail.js';

test('the inspection wake keeps a planar, fading footprint', (t) => {
  const trail = createInspectionGlideTrail();
  t.after(() => trail.dispose());
  const scene = new Scene();
  const { mesh } = trail;
  scene.add(mesh);
  const frame = {
    active: true,
    speed: 80,
    tail: -3.9,
    boost: 1,
    accent: 0xff674f,
    hullWidth: 4.2,
  };

  trail.update(frame);
  const { position, fade } = mesh.geometry.attributes;
  const extent = position.array.slice();
  const opacity = fade.array.slice();
  assert.ok(mesh.visible && mesh.geometry.drawRange.count > 0);
  assert.equal(mesh.material.uniforms.accent.value.getHex(), frame.accent);
  assert.ok(Math.abs(position.getX(1) - position.getX(0) - 4.2 * 0.65) < 1e-6);
  assert.ok(Math.abs(position.getZ(0) + 0.585) < 1e-6);
  assert.ok(Math.abs(position.getZ(position.count - 1) + 6.3) < 1e-6);
  for (let i = 0; i < position.count; i++) assert.equal(position.getY(i), 0);
  assert.ok(fade.getX(0) > 0.28);
  assert.equal(fade.getX(fade.count - 1), 0);

  trail.update({ ...frame, fadeScale: 0.5 });
  assert.deepEqual(position.array, extent);
  assert.deepEqual(
    fade.array,
    opacity.map((value) => value * 0.5),
  );
  trail.update({ ...frame, fadeScale: 0 });
  assert.equal(mesh.visible, false);
  assert.equal(mesh.geometry.drawRange.count, 0);
  trail.dispose();
  assert.equal(mesh.parent, null);
});
