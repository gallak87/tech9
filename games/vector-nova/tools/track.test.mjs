import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTrack } from '../src/levels/halcyon/track/index.js';

const track = createTrack();
test('the circuit closes without a position or orientation jump', () => {
  for (const distance of [-20, 0, 42, track.length / 3]) {
    const a = track.sample(distance),
      b = track.sample(distance + track.length);
    assert.ok(a.position.distanceTo(b.position) < 1e-6);
    assert.ok(a.quaternion.angleTo(b.quaternion) < 1e-6);
  }
  const before = track.sample(-0.01),
    after = track.sample(0.01);
  assert.ok(before.position.distanceTo(after.position) < 0.03);
  assert.ok(before.quaternion.angleTo(after.quaternion) < 0.005);
});

test('shared road frames remain orthonormal and match ship-local axes', () => {
  for (let s = 0; s < track.length; s += 7) {
    const f = track.sample(s);
    assert.ok(Math.abs(f.tangent.length() - 1) < 1e-8);
    assert.ok(Math.abs(f.up.length() - 1) < 1e-8);
    assert.ok(Math.abs(f.right.length() - 1) < 1e-8);
    assert.ok(Math.abs(f.up.dot(f.tangent)) < 1e-8);
    assert.ok(Math.abs(f.right.dot(f.tangent)) < 1e-8);
    assert.ok(Math.abs(f.right.dot(f.up)) < 1e-8);
    assert.ok(
      new Vector3(1, 0, 0).applyQuaternion(f.quaternion).distanceTo(f.right) <
        1e-8,
    );
    assert.ok(
      new Vector3(0, 1, 0).applyQuaternion(f.quaternion).distanceTo(f.up) <
        1e-8,
    );
    assert.ok(
      new Vector3(0, 0, 1).applyQuaternion(f.quaternion).distanceTo(f.tangent) <
        1e-8,
    );
  }
});

test('compact first level retains elevation, banking and a complete route', () => {
  const frames = Array.from({ length: 360 }, (_, i) =>
    track.sample((i * track.length) / 360),
  );
  const heights = frames.map((f) => f.position.y);
  assert.ok(track.length >= 4500 && track.length <= 5500);
  assert.ok(
    Math.max(...heights) - Math.min(...heights) >= 40,
    'route must have meaningful elevation',
  );
  assert.ok(
    Math.max(...frames.map((f) => Math.abs(f.bank))) > 0.4,
    'route must include substantial banking',
  );
  assert.ok(
    track.sections.some((section) => section.tunnel),
    'short tunnel/overpass section must be represented',
  );
});
