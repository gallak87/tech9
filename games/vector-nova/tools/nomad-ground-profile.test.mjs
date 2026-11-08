import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import {
  createNomadGroundProfile,
  nomadGroundHeightAt,
  nomadGroundNormalAt,
} from '../src/levels/nomad/ground-profile.js';

const benches = [
  {
    id: 'upper',
    minX: -1500,
    maxX: 150,
    heightOffset: 500,
    carrierIds: ['upper-truck'],
  },
  { id: 'middle', minX: 350, maxX: 700, heightOffset: 320 },
  { id: 'lower', minX: 1000, maxX: 1450, heightOffset: 0 },
];

test('the connected salt profile retains exact flat shelves, continuous scarps and analytic facet normals', () => {
  const profile = createNomadGroundProfile({
    height: 700,
    grade: 0.095,
    benches,
  });
  for (const bench of benches)
    for (const x of [bench.minX, (bench.minX + bench.maxX) / 2, bench.maxX])
      for (const z of [-500, 0, 9000]) {
        assert.equal(
          profile.groundHeightAt(x, z),
          700 - 0.095 * z + bench.heightOffset,
        );
        assert.ok(
          profile
            .groundNormalAt(x, z)
            .distanceTo(new Vector3(0, 1, 0.095).normalize()) < 1e-12,
        );
      }
  for (const x of [190, 270, 760, 850, 980]) {
    const z = 1234,
      delta = 0.01;
    const a = new Vector3(x - delta, profile.groundHeightAt(x - delta, z), z);
    const b = new Vector3(x + delta, profile.groundHeightAt(x + delta, z), z);
    const c = new Vector3(x, profile.groundHeightAt(x, z + delta), z + delta);
    const geometric = c.clone().sub(a).cross(b.clone().sub(a)).normalize();
    assert.ok(geometric.distanceTo(profile.groundNormalAt(x, z)) < 1e-9);
  }
  for (const { x } of profile.groundProfileKnots)
    assert.ok(
      Math.abs(
        profile.groundHeightAt(x - 1e-6, 0) -
          profile.groundHeightAt(x + 1e-6, 0),
      ) < 1e-5,
    );
  assert.equal(profile.groundProfileKnots.length, benches.length * 2);
  assert.equal(profile.groundHeightAt(-100000, 0), 1200);
  assert.equal(profile.groundHeightAt(100000, 0), 700);
});

test('terraces and scarps remain physically invariant under the moving ground at every time', () => {
  const grade = 0.095;
  const profile = createNomadGroundProfile({ height: 700, grade, benches });
  for (const x of [-1300, 50, 210, 500, 850, 1200, 3000])
    for (const z of [-500, 4500, 11000])
      for (const time of [0, 5, 90, 180]) {
        const travel = 62.5 * time;
        const carried = new Vector3(x, profile.groundHeightAt(x, z), z).add(
          new Vector3(0, grade * travel, -travel),
        );
        assert.ok(
          Math.abs(carried.y - profile.groundHeightAt(carried.x, carried.z)) <
            1e-9,
        );
      }
});

test('profile records are immutable copies, malformed shelves fail clearly and plane-only fixtures remain supported', () => {
  const input = structuredClone(benches);
  const profile = createNomadGroundProfile({
    height: 700,
    grade: 0.095,
    benches: input,
  });
  input[0].heightOffset = -1;
  input[0].carrierIds.push('changed');
  assert.equal(profile.saltBenches[0].heightOffset, 500);
  assert.deepEqual(profile.saltBenches[0].carrierIds, ['upper-truck']);
  assert.ok(Object.isFrozen(profile.saltBenches));
  assert.ok(Object.isFrozen(profile.saltBenches[0]));
  assert.ok(Object.isFrozen(profile.groundProfileKnots[0]));
  assert.throws(
    () => createNomadGroundProfile({ height: NaN, grade: 0.1 }),
    /finite/,
  );
  assert.throws(
    () =>
      createNomadGroundProfile({
        height: 0,
        grade: 0.1,
        benches: [benches[0], benches[0]],
      }),
    /ordered/,
  );
  assert.throws(
    () =>
      createNomadGroundProfile({
        height: 0,
        grade: 0.1,
        benches: [{ ...benches[0], minX: 300, maxX: 10 }],
      }),
    /plateaus/,
  );
  const flat = { saltPlane: { height: 700, grade: 0.095 } };
  assert.equal(nomadGroundHeightAt(flat, 1000, 300), 671.5);
  const target = new Vector3();
  assert.equal(nomadGroundNormalAt(flat, 0, 0, target), target);
  const profiled = { ...flat, ...profile };
  assert.equal(nomadGroundHeightAt(profiled, 500, 300), 991.5);
  assert.equal(nomadGroundNormalAt(profiled, 500, 0, target), target);
});
