import test from 'node:test';
import assert from 'node:assert/strict';
import { FrontSide, Raycaster } from 'three';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import { createVesperRoad } from '../src/levels/vesper/track/road.js';
import { createWorldspireTrack } from '../src/levels/worldspire/track/model.js';
import { createWorldspireRoad } from '../src/levels/worldspire/track/road.js';
import { createNightweirTrack } from '../src/levels/nightweir/track/model.js';
import { createNightweirRoad } from '../src/levels/nightweir/track/road.js';

for (const [name, createTrack, createRoad, shellName] of [
  ['Vesper', createVesperTrack, createVesperRoad, /sides and underside/],
  ['Worldspire', createWorldspireTrack, createWorldspireRoad, /^Keel /],
  [
    'Nightweir',
    createNightweirTrack,
    createNightweirRoad,
    /Bridge steel soffit/,
  ],
]) {
  test(`${name} road shells remain opaque and visible from below through banks and inversions`, () => {
    const track = createTrack();
    // Production geometry/materials, without loading the sprint texture maps.
    const road = createRoad({ track, collectSolid() {} });
    try {
      road.group.updateMatrixWorld(true);
      const shells = road.group.children.filter((mesh) =>
        shellName.test(mesh.name),
      );
      assert.ok(shells.length);
      for (const mesh of shells) {
        assert.equal(mesh.material.side, FrontSide);
        assert.equal(mesh.material.transparent, false);
        assert.equal(mesh.material.opacity, 1);
      }
      let checked = 0;
      for (let s = 45; s < track.length; s += 53) {
        // Probe supported roadway, leaving actual jump openings untouched.
        if (
          track.jumps.some(
            (jump) => s > jump.takeoff - 4 && s < jump.landingStart + 4,
          )
        )
          continue;
        const frame = track.sample(s);
        for (const lateral of [-track.width * 0.22, 0, track.width * 0.22]) {
          const origin = frame.position
            .clone()
            .addScaledVector(frame.right, lateral)
            .addScaledVector(frame.up, -18);
          const ray = new Raycaster(origin, frame.up, 0, 18);
          const hit = ray.intersectObjects(shells, false)[0];
          assert.ok(
            hit,
            `${name} missing underside at ${s}m, lateral ${lateral}m`,
          );
          assert.ok(
            hit.face.normal.dot(frame.up) < -0.5,
            `${name} underside faces inward at ${s}m`,
          );
          checked++;
        }
      }
      assert.ok(checked > 200);
    } finally {
      road.dispose();
    }
  });
}
