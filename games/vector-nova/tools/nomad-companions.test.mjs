import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, Matrix4, Vector3 } from 'three';
import createNomadLevel from '../src/levels/nomad/index.js';
import { createNomadCompanions } from '../src/levels/nomad/companions.js';
import { sampleCarrierMotion } from '../src/levels/nomad/motion.js';
import kit from '../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const track = createNomadLevel().createTrack();
const companions = createNomadCompanions(track);
const hullBounds = new Box3();
for (const prototype of kit.prototypes.filter((part) =>
  /^nomad_carrier(?:_mid|_far)?$/.test(part.name),
)) {
  hullBounds.union(
    new Box3(
      new Vector3().fromArray(prototype.bounds.min),
      new Vector3().fromArray(prototype.bounds.max),
    ),
  );
}
// Rubber/tread rotates beyond the nominal 24m rolling radius by ~1.1m.
// The body remains wider and longer than every anchored wheel at every angle.
hullBounds.min.y = Math.min(hullBounds.min.y, -1.1);
const atTime = (carrier, time) =>
  hullBounds
    .clone()
    .applyMatrix4(
      new Matrix4().compose(
        carrier.origin
          .clone()
          .add(sampleCarrierMotion(carrier, time).translation),
        carrier.quaternion,
        carrier.scale,
      ),
    );
const allMotion = (carrier) =>
  atTime(carrier, 0).expandByVector(
    new Vector3(
      2 * carrier.motion.lateralAmplitude,
      2 * track.saltPlane.grade * carrier.motion.longitudinalAmplitude,
      2 * carrier.motion.longitudinalAmplitude,
    ),
  );

test('two companion machines reuse fleet records without becoming authored route owners', () => {
  assert.equal(companions.length, 2);
  assert.equal(track.carriers.length, 11);
  assert.equal(track.jumps.length, 10);
  assert.equal(track.roadRuns.length, 11);
  for (const companion of companions) {
    assert.equal(companion.sourcePrototype, 'nomad_carrier');
    assert.equal(companion.visualOnly, true);
    assert.ok(!track.carriers.some((carrier) => carrier.id === companion.id));
    assert.ok(!track.roadRuns.some((run) => run.carrierId === companion.id));
    assert.ok(companion.scale.x > track.carriers[0].scale.x);
    assert.notEqual(companion.origin, track.carriers[0].origin);
    assert.notEqual(companion.quaternion, track.carriers[0].quaternion);
  }
  const fresh = createNomadCompanions(track);
  fresh[0].motion.period = 1;
  fresh[0].origin.x = 0;
  assert.equal(companions[0].motion.period, 42);
  assert.notEqual(companions[0].origin.x, 0);
});

test('companion rolling contacts stay on the same graded salt plane across all four phases', () => {
  const normal = new Vector3(0, 1, track.saltPlane.grade).normalize();
  for (const carrier of companions)
    for (const quarter of [0, 1, 2, 3]) {
      const time = (quarter * carrier.motion.period) / 4;
      const pose = new Matrix4().compose(
        carrier.origin
          .clone()
          .add(sampleCarrierMotion(carrier, time).translation),
        carrier.quaternion,
        carrier.scale,
      );
      for (const anchor of kit.prototypes[0].anchors.filter(
        (anchor) => anchor.kind === 'wheel',
      )) {
        const contact = new Vector3()
          .fromArray(anchor.position)
          .applyMatrix4(pose)
          .addScaledVector(normal, -anchor.rollingRadius * carrier.scale.x);
        const planeError =
          contact.y +
          track.saltPlane.grade * contact.z -
          track.saltPlane.height;
        assert.ok(
          Math.abs(planeError) < 1e-9,
          `${carrier.id}: ${anchor.name} salt error ${planeError}`,
        );
      }
    }
});

test('all detail tiers and full bounded companion motion clear every raced hull and route envelope', () => {
  for (const companion of companions) {
    const bounds = allMotion(companion);
    for (const carrier of [...track.carriers, ...companions]) {
      if (carrier === companion) continue;
      assert.equal(
        bounds.intersectsBox(allMotion(carrier)),
        false,
        `${companion.id} overlaps ${carrier.id}`,
      );
    }
    for (const time of [0, 9.5, 19, 28.5]) {
      const box = atTime(companion, time);
      for (let s = -60; s <= track.length; s += 2) {
        // Full driving width plus 25m covers chase eyes and generous transfer
        // steering around the unsupported, nominal gap corridor as well.
        const frame = track.frameAtTime(s, time);
        const reservedRadius = track.halfWidthAt(s) + 25;
        const nearest = box.clampPoint(frame.position, new Vector3());
        assert.ok(
          nearest.distanceTo(frame.position) > reservedRadius,
          `${companion.id} crosses the road/flight/camera envelope at ${s}/${time}`,
        );
      }
    }
  }
});
