import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { sweepGeometry } from '../track/geometry.js';
import { createSurfaceProjector } from './surface-projector.js';
import { createRoadPulsePresentation } from './road-pulse.js';

function fixture() {
  const track = {
    length: 400,
    width: 28,
    closed: false,
    sample(distance) {
      const tangent = new T.Vector3(
        0,
        Math.cos(distance / 45) * 0.6,
        1,
      ).normalize();
      const up = new T.Vector3(0, 1, 0).projectOnPlane(tangent).normalize();
      const right = up
        .clone()
        .cross(tangent)
        .applyAxisAngle(tangent, Math.sin(distance / 50) * 0.7);
      up.crossVectors(tangent, right).normalize();
      return {
        position: new T.Vector3(0, Math.sin(distance / 45) * 27, distance),
        tangent,
        right,
        up,
        quaternion: new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().makeBasis(right, up, tangent),
        ),
      };
    },
  };
  const material = new T.MeshBasicMaterial();
  const surfaces = [
    [0, 170],
    [180, 400],
  ].map(
    ([start, end]) =>
      new T.Mesh(
        sweepGeometry(
          track,
          [
            [-14, 0],
            [14, 0],
          ],
          { start, end, step: 3 },
        ),
        material,
      ),
  );
  for (const mesh of surfaces) mesh.updateMatrixWorld();
  const projector = createSurfaceProjector(track, surfaces);
  return {
    track,
    projector,
    dispose() {
      projector.dispose();
      for (const mesh of surfaces) mesh.geometry.dispose();
      material.dispose();
    },
  };
}

for (const low of [false, true])
  test(`Repulsor wave stays on exact banked road triangles, clips edges/gaps and releases resources (${low ? 'Low' : 'High'})`, () => {
    const f = fixture();
    const root = new T.Group();
    const presentation = createRoadPulsePresentation(root, f, { low });
    const flash = {
      id: 1,
      kind: 'repulsor',
      radius: 108,
      distance: 200,
      lateral: 6,
      age: 0.1,
    };
    const state = { flashes: [flash], time: 1 };
    try {
      let samples = 0;
      for (const age of [0.05, 0.15, 0.3, 0.45]) {
        flash.age = age;
        presentation.update(state);
        assert.equal(root.children.length, 1);
        const mesh = root.children[0];
        if (low) assert.ok(mesh.material.isMeshBasicMaterial);
        const p = mesh.geometry.getAttribute('position');
        const c = mesh.geometry.getAttribute('roadCoord');
        assert.ok(p.count > 0);
        for (let i = 0; i < p.count; i++) {
          const x = c.getX(i),
            s = c.getY(i);
          assert.ok(
            x >= -14.0001 && x <= 14.0001,
            `wave crossed lateral edge at ${x}`,
          );
          assert.ok(
            s <= 170.0001 || s >= 179.9999,
            `wave filled a real gap at ${s}`,
          );
          const road = f.projector.sample(s, x);
          const point = new T.Vector3().fromBufferAttribute(p, i);
          assert.ok(
            Math.abs(point.distanceTo(road) - 0.16) < 0.0001,
            `wave penetrated the road at ${s}, ${x}`,
          );
          samples++;
        }
      }
      assert.ok(samples > 300);
      const mesh = root.children[0];
      const geometry = mesh.geometry;
      presentation.update(state);
      assert.equal(
        mesh.geometry,
        geometry,
        'paused/fading pulses reuse their geometry',
      );
      presentation.update(state, { reducedMotion: true });
      const strength = low
        ? mesh.material.opacity
        : mesh.material.uniforms.strength.value;
      assert.ok(strength < 0.35);
      let freed = 0;
      geometry.addEventListener('dispose', () => freed++);
      mesh.material.addEventListener('dispose', () => freed++);
      state.flashes = [];
      presentation.update(state);
      assert.equal(freed, 2);
      assert.equal(root.children.length, 0);
    } finally {
      presentation.dispose();
      presentation.dispose();
      f.dispose();
    }
  });

test('an open-course Repulsor footprint stops at the start instead of wrapping to the finish', () => {
  const f = fixture();
  const root = new T.Group();
  const presentation = createRoadPulsePresentation(root, f);
  try {
    presentation.update({
      time: 0.3,
      flashes: [
        {
          id: 2,
          kind: 'repulsor',
          radius: 108,
          distance: 20,
          lateral: 0,
          age: 0.3,
        },
      ],
    });
    const c = root.children[0].geometry.getAttribute('roadCoord');
    for (let i = 0; i < c.count; i++)
      assert.ok(c.getY(i) >= -0.0001 && c.getY(i) <= 172.0001);
  } finally {
    presentation.dispose();
    f.dispose();
  }
});

test('nearby High pulses borrow one road window until its last owner expires', () => {
  const f = fixture();
  const root = new T.Group();
  const presentation = createRoadPulsePresentation(root, f);
  const state = {
    time: 1,
    flashes: [200, 212].map((distance, id) => ({
      id,
      kind: 'repulsor',
      radius: 108,
      distance,
      lateral: id * 4,
      age: 0.2,
    })),
  };
  try {
    presentation.update(state);
    assert.equal(root.children.length, 2);
    assert.equal(root.children[0].geometry, root.children[1].geometry);
    assert.notEqual(root.children[0].material, root.children[1].material);
    assert.equal(root.children[1].material.uniforms.origin.value.y, 212);
    let freed = 0;
    root.children[0].geometry.addEventListener('dispose', () => freed++);
    state.flashes.shift();
    presentation.update(state);
    assert.equal(freed, 0);
    state.flashes = [];
    presentation.update(state);
    assert.equal(freed, 1);
  } finally {
    presentation.dispose();
    f.dispose();
  }
});
