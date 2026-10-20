import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { createPairedFraming } from './inspection-framing.js';

// Fleet-sized hulls at the inspector's retained 27.5 m target distance.
const subjects = [
  { min: [-1.69, -0.12, -3.5], max: [1.69, 1.4, 3.5] },
  { min: [-2.3, 0, 24], max: [2.3, 1.6, 31] },
];
const bounds = {
  min: [-2.3, -0.12, -3.5],
  max: [2.3, 1.6, 31],
  subjects,
};

function projectedHulls({ width, height, rotation, elevation }) {
  const viewport = {
    left: width * 0.06 + 320 + 12,
    top: height * 0.12,
    width: width * 0.915 - 332,
    height: height * 0.5833,
  };
  const quaternion = new Quaternion().setFromEuler(new Euler(0, rotation, 0));
  const direction = new Vector3().setFromSphericalCoords(
    1,
    Math.PI / 2 - elevation,
    Math.atan2(10.4, 12.5),
  );
  const camera = new PerspectiveCamera(39, width / height, 0.1, 200);
  const framing = createPairedFraming(bounds).frame(
    direction,
    quaternion,
    viewport,
    height,
    camera.fov,
  );
  const target = new Vector3(0, 0, 13.75)
    .applyQuaternion(quaternion)
    .add(new Vector3(0, 0.7, 0));
  camera.position.copy(direction).multiplyScalar(framing.distance).add(target);
  camera.lookAt(target);
  camera.setViewOffset(
    width,
    height,
    width / 2 - (viewport.left + viewport.width / 2) + framing.offsetX,
    height / 2 - (viewport.top + viewport.height / 2) + framing.offsetY,
    width,
    height,
  );
  camera.updateMatrixWorld(true);
  const hulls = subjects.map((subject) => {
    const points = [];
    for (const x of [subject.min[0], subject.max[0]])
      for (const y of [subject.min[1], subject.max[1]])
        for (const z of [subject.min[2], subject.max[2]]) {
          const point = new Vector3(x, y, z)
            .applyQuaternion(quaternion)
            .add(new Vector3(0, 0.15, 0))
            .project(camera);
          points.push({
            x: ((point.x + 1) * width) / 2,
            y: ((1 - point.y) * height) / 2,
          });
        }
    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  });
  return { hulls, viewport };
}

test('paired desktop view fills and centers the free area at default and rotated angles', () => {
  for (const [width, height] of [
    [1600, 900],
    [1920, 1080],
  ])
    for (const [rotation, elevation] of [
      [-Math.PI * 0.6, 0.3],
      [-Math.PI * 0.6 - 0.5, 0.38],
      [-Math.PI * 0.6 + 0.5, 0.55],
    ]) {
      const { hulls, viewport } = projectedHulls({
        width,
        height,
        rotation,
        elevation,
      });
      const minX = Math.min(...hulls.map((hull) => hull.minX));
      const maxX = Math.max(...hulls.map((hull) => hull.maxX));
      const minY = Math.min(...hulls.map((hull) => hull.minY));
      const maxY = Math.max(...hulls.map((hull) => hull.maxY));
      assert.ok(
        minX >= viewport.left && maxX <= viewport.left + viewport.width,
      );
      assert.ok(minY >= viewport.top && maxY <= viewport.top + viewport.height);
      assert.ok(
        Math.abs((minX + maxX) / 2 - viewport.left - viewport.width / 2) < 0.01,
      );
      assert.ok(
        Math.abs((minY + maxY) / 2 - viewport.top - viewport.height / 2) < 0.01,
      );
      assert.ok(
        Math.max(
          (maxX - minX) / (viewport.width * 0.92),
          (maxY - minY) / (viewport.height * 0.9),
        ) > 0.999,
        'occupied hulls use the available area',
      );
    }
});

test('default dev composition gives both hulls useful inspection size with the target still ahead', () => {
  const { hulls } = projectedHulls({
    width: 1600,
    height: 900,
    rotation: -Math.PI * 0.6,
    elevation: 0.3,
  });
  assert.ok(
    hulls[0].maxX - hulls[0].minX > 400,
    'player is large enough to inspect effects',
  );
  assert.ok(hulls[1].maxX - hulls[1].minX > 190, 'target remains readable');
  assert.ok(
    hulls[1].maxX < hulls[0].minX,
    'shot path stays visible between the ships',
  );
});
