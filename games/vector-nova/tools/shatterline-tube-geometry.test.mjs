import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import { createShatterlineTube } from '../src/levels/shatterline/track/tube.js';
import { roadIntervals } from '../src/levels/shatterline/track/road.js';

const track = createShatterlineTrack();
const solids = [];
const tube = createShatterlineTube({
  track,
  collectSolid: (solid) => solids.push(solid),
});
after(() => tube.dispose());

test('both transparent tubes replace the opaque ribbon and join all four road edges', () => {
  assert.equal(track.tubes.length, 2);
  assert.equal(
    roadIntervals(track).some((r) =>
      track.tubes.some((t) => r.start < t.end && r.end > t.start),
    ),
    false,
  );
  assert.ok(
    roadIntervals(track).some(
      (r) => r.start <= track.tubes[0].end && r.end >= track.tubes[1].start,
    ),
    'the exposed corkscrew between tubes keeps its real driving deck',
  );
  for (const distance of track.tubes.flatMap((t) => [t.start, t.end])) {
    const base = track.sample(distance);
    for (const lateral of [-25, -12, 0, 12, 25]) {
      const expected = base.position
        .clone()
        .addScaledVector(base.right, lateral);
      assert.ok(
        expected.distanceTo(track.sampleSurface(distance, lateral).position) <
          1e-8,
      );
    }
  }
  assert.ok(
    tube.group.children
      .filter((mesh) => mesh.userData.drivingSurface)
      .every(
        (mesh) => mesh.material.transparent && mesh.material.opacity < 0.25,
      ),
  );
});

test('physical shell has inward driving normals, finite faces and a closed ceiling seam', () => {
  let faceCount = 0;
  for (const solid of solids) {
    const g = solid.geometry;
    const p = g.attributes.position;
    const ix = g.index.array;
    const uv = g.attributes.uv;
    const a = new T.Vector3(),
      b = new T.Vector3(),
      c = new T.Vector3();
    for (let i = 0; i < ix.length; i += 3) {
      a.fromBufferAttribute(p, ix[i]);
      b.fromBufferAttribute(p, ix[i + 1]);
      c.fromBufferAttribute(p, ix[i + 2]);
      const normal = b.sub(a).cross(c.sub(a));
      assert.ok(
        Number.isFinite(normal.lengthSq()) && normal.lengthSq() > 1e-12,
        `${solid.name} face ${i / 3}`,
      );
      if (solid.kind !== 'deck') continue;
      const s = T.MathUtils.clamp(
        ((uv.getY(ix[i]) + uv.getY(ix[i + 1]) + uv.getY(ix[i + 2])) * 52) / 3,
        solid.start,
        solid.end,
      );
      const lateral =
        ((uv.getX(ix[i]) + uv.getX(ix[i + 1]) + uv.getX(ix[i + 2])) * 18) / 3;
      assert.ok(
        normal.normalize().dot(track.sampleSurface(s, lateral).up) > 0.99,
      );
      faceCount++;
    }
  }
  assert.ok(faceCount > 0);
  for (const descriptor of track.tubes) {
    for (let s = descriptor.entryEnd; s <= descriptor.exitStart; s += 80) {
      const width = track.tubeProfile(s).halfWidth;
      assert.ok(
        track
          .sampleSurface(s, -width)
          .position.distanceTo(track.sampleSurface(s, width).position) < 1e-8,
      );
      const floor = track.sampleSurface(s, 0).position;
      const ceiling = track.sampleSurface(s, width).position;
      assert.ok(Math.abs(floor.distanceTo(ceiling) - 70) < 1e-8);
    }
  }
});

test('external gravity supports stay outside the inverted closed bore', () => {
  const samples = [];
  for (const descriptor of track.tubes) {
    for (
      let s = descriptor.entryEnd + 20;
      s < descriptor.exitStart - 20;
      s += 24
    ) {
      const frame = track.sample(s);
      samples.push({
        centre: frame.position
          .clone()
          .addScaledVector(frame.up, descriptor.radius),
        radius: descriptor.radius,
        tangent: frame.tangent,
      });
    }
  }
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  const centroid = new T.Vector3(),
    delta = new T.Vector3();
  for (const solid of solids.filter((item) =>
    item.name.startsWith('Tube external'),
  )) {
    const positions = solid.geometry.attributes.position;
    const index = solid.geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      a.fromBufferAttribute(positions, index[i]);
      b.fromBufferAttribute(positions, index[i + 1]);
      c.fromBufferAttribute(positions, index[i + 2]);
      centroid
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      for (const { centre, tangent, radius } of samples) {
        delta.copy(centroid).sub(centre);
        const along = delta.dot(tangent);
        if (Math.abs(along) > 12) continue;
        const radial = delta.addScaledVector(tangent, -along).length();
        assert.ok(
          radial > radius - 0.5,
          `${solid.name} crosses the drivable bore`,
        );
      }
    }
  }
});

test('steady red inlays and substantial exit outlines guide both collectors', () => {
  const materials = new Set(
    tube.group.children
      .filter((m) => m.userData.drivingSurface)
      .map((m) => m.material),
  );
  assert.equal(materials.size, 2);
  for (const descriptor of track.tubes) {
    const material = [...materials].find(
      (m) => m.userData.exitGuidance?.start === descriptor.guidanceStart,
    );
    assert.ok(material);
    assert.deepEqual(material.userData.exitGuidance, {
      color: '#D01818',
      start: descriptor.exitStart - 100,
      end: descriptor.end,
      referenceLateral: 0,
    });
    const rim = solids.find(
      (s) =>
        s.kind === 'rail' &&
        s.start >= descriptor.exitStart &&
        s.end <= descriptor.end,
    );
    assert.ok(rim);
    assert.equal(
      tube.group.getObjectByName(rim.name).material.color.getHexString(),
      'd01818',
    );
  }
  assert.ok(tube.group.getObjectByName('Tube external exit'));
});
