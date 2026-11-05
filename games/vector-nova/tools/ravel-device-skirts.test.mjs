import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { createSurfaceProjector } from '../src/pickups/surface-projector.js';

const shape = [
  [-2, 0.5],
  [2, 0.5],
  [2, 3.5],
  [-2, 3.5],
];
const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function build(outline) {
  const surface = new T.BufferGeometry();
  surface.setAttribute(
    'position',
    new T.Float32BufferAttribute([-4, 0, 0, 4, 0, 0, -4, 0.4, 4, 4, 1.2, 4], 3),
  );
  surface.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute([0, -4, 0, 4, 4, -4, 4, 4], 2),
  );
  surface.setIndex([0, 2, 1, 1, 2, 3]);
  const projector = createSurfaceProjector(
    { length: 4, closed: false, deviceOutlineSkirts: outline },
    [{ geometry: surface, matrixWorld: new T.Matrix4() }],
  );
  const geometry = projector.geometry([shape], 0.08, 0.003);
  projector.dispose();
  surface.dispose();
  return geometry;
}
function inspect(geometry) {
  const c = geometry.attributes.roadCoord;
  let area = 0,
    skirts = 0,
    internal = 0;
  for (let i = 0; i < c.count; i += 3) {
    const p = [0, 1, 2].map((j) => [c.getX(i + j), c.getY(i + j)]),
      a = Math.abs(cross(...p)) / 2;
    if (a > 1e-7) {
      area += a;
      continue;
    }
    skirts++;
    const onBoundary = shape.some((a, j) => {
      const b = shape[(j + 1) % shape.length],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return p.every((q) => Math.abs(cross(a, b, q)) < length * 1e-5);
    });
    if (!onBoundary) internal++;
  }
  return { area, skirts, internal };
}
test('Ravel projected device skirts retain outer thickness without internal curved-deck walls', () => {
  const legacy = build(false),
    outline = build(true);
  try {
    const a = inspect(legacy),
      b = inspect(outline);
    assert.ok(
      Math.abs(a.area - 12) < 1e-6 && Math.abs(b.area - 12) < 1e-6,
      'same complete painted footprint',
    );
    assert.ok(a.internal > 0, 'negative control reproduces internal skirts');
    assert.equal(b.internal, 0);
    assert.ok(b.skirts > 0 && b.skirts < a.skirts);
  } finally {
    legacy.dispose();
    outline.dispose();
  }
});
