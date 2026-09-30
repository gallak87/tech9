import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLevel2Track, buildOrbitalTrack } from './index.js';
import { sweepGeometry } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { createLatticeLayout } from './lattice.js';

const track = createLevel2Track();

test('opaque coverage follows runners, cross ribs and tapered apertures, including wrapped distances', () => {
  const layout = createLatticeLayout(track);
  assert.equal(layout.spans.length, 3);
  for (const span of layout.spans) {
    assert.ok(
      Math.abs(
        span.start / layout.step - Math.round(span.start / layout.step),
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(span.end / layout.step - Math.round(span.end / layout.step)) <
        1e-8,
    );
    const open = span.start + 40;
    for (const x of [0, -8.5, 8.5]) {
      assert.equal(layout.surfaceCoverage(open, x), 0);
      assert.equal(layout.surfaceCoverage(open + track.length, x), 0);
      assert.equal(layout.surfaceCoverage(open - track.length, x), 0);
    }
    for (const x of [-13, -4.8, 4.8, 13])
      assert.equal(layout.surfaceCoverage(open, x), 1);
    for (const x of [-12, -8.5, 0, 8.5, 12])
      assert.equal(layout.surfaceCoverage(span.start + 16, x), 1, 'cross rib');
    assert.equal(
      layout.surfaceCoverage(span.start + 8, 2.6),
      1,
      'solid taper beside the opening',
    );
    assert.equal(
      layout.surfaceCoverage(span.start + 8, 0),
      0,
      'opening widens from its tapered tip',
    );
    assert.equal(layout.surfaceCoverage(span.start, 0), 1);
    assert.equal(layout.surfaceCoverage(span.end, 0), 1);
    assert.ok(
      layout.surfaceCoverage(open, 3.83) > 0 &&
        layout.surfaceCoverage(open, 3.83) < 1,
      'contact alpha softens only at the physical edge',
    );
  }
  for (const distance of [0, 300, 1470, 2120, 2640, 3690, 3890, 4290])
    assert.equal(layout.surfaceCoverage(distance, 0), 1);
});

test('lattice holes are geometric through-apertures and opaque runners retain the original road triangle planes', () => {
  const group = buildOrbitalTrack(track);
  group.updateMatrixWorld(true);
  const surface = group.children.find((child) => child.userData.drivingSurface);
  const referenceGeometry = sweepGeometry(
    track,
    [
      [-14, 0],
      [14, 0],
    ],
    { step: 4 },
  );
  const referenceMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });
  const reference = new THREE.Mesh(referenceGeometry, referenceMaterial);
  reference.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const span of group.userData.openSpans) {
    const distance = span.start + 40;
    const frame = track.sample(distance);
    for (const x of [0, -8.5, 8.5, -4.8, 4.8, -13, 13]) {
      ray.set(framePoint(frame, x, 1), frame.up.clone().negate());
      ray.far = 2;
      const hits = ray.intersectObject(surface);
      const covered = group.userData.surfaceCoverage(distance, x) === 1;
      assert.equal(hits.length > 0, covered, `${span.name} lateral ${x}`);
      if (covered) {
        const oldHit = ray.intersectObject(reference)[0];
        assert.ok(
          hits[0].point.distanceTo(oldHit.point) < 0.0002,
          'unchanged contact triangle plane',
        );
      }
    }
    ray.set(framePoint(frame, 0, 1), frame.up.clone().negate());
    ray.far = 13;
    assert.equal(
      ray.intersectObject(group, true).length,
      0,
      `${span.name} has no opaque keel beneath its aperture`,
    );
  }
  referenceGeometry.dispose();
  referenceMaterial.dispose();
  group.userData.dispose();
});
