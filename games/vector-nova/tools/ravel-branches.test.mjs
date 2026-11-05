import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createRavelTrack } from '../src/levels/ravel/track/model.js';
import {
  installRavelBranches,
  RAVEL_BRANCHES,
  ravelBandBounds,
} from '../src/levels/ravel/track/branches.js';

const createStraightBraid = () =>
  installRavelBranches({
    length: 12000,
    closed: true,
    width: 320,
    braid: { start: 2500, splitEnd: 3250, mergeStart: 4800, end: 5300 },
    jumps: [
      {
        id: 'crest-skip',
        optional: true,
        takeoff: 950,
        landingStart: 1015,
        lateralMin: 3,
        lateralMax: 50,
      },
      {
        id: 'outer-transfer',
        optional: true,
        branch: 'outer',
        takeoff: 5100,
        landingStart: 5300,
        lateralMin: 60,
        lateralMax: 140,
      },
    ],
    sampleBase(distance) {
      return {
        position: new Vector3(0, 0, distance),
        tangent: new Vector3(0, 0, 1),
        right: new Vector3(1, 0, 0),
        up: new Vector3(0, 1, 0),
        quaternion: new Quaternion(),
        curvature: 0,
        bank: 0,
      };
    },
  });

const production = installRavelBranches(createRavelTrack());

test('Ravel ribbons pay their real distinct world lengths through surface metrics', () => {
  const track = createStraightBraid();
  const lengths = [];
  for (const branch of RAVEL_BRANCHES) {
    let previous = track.branchPoint(track.braid.splitEnd, branch.centre);
    let measured = 0,
      metricLength = 0;
    for (let s = track.braid.splitEnd + 1; s <= track.braid.mergeStart; s++) {
      const point = track.branchPoint(s, branch.centre);
      measured += previous.distanceTo(point);
      metricLength += track.sampleBranchSurface(
        s - 0.5,
        branch.centre,
      ).longitudinalMetric;
      previous = point;
    }
    assert.ok(Math.abs(metricLength - measured) < measured * 0.0001);
    lengths.push(measured);
  }
  assert.ok(lengths[0] < lengths[1], 'inside is genuinely shorter than middle');
  assert.ok(lengths[1] < lengths[2], 'outer is genuinely longer than middle');
  assert.ok(
    lengths[2] > lengths[0] * 1.15,
    'outer sweep has a meaningful length cost',
  );
});

test('a split fan connects the ordinary 100m road to all three ribbons without teleporting', () => {
  const track = createStraightBraid();
  assert.equal(track.surfaceCoverage(track.braid.start, 0), 1);
  assert.equal(track.surfaceCoverage(track.braid.start, 100), 0);
  const halfway =
    track.braid.start + (track.braid.splitEnd - track.braid.start) * 0.5;
  for (const branch of RAVEL_BRANCHES) {
    assert.equal(track.surfaceCoverage(halfway, branch.centre), 1);
    const before = track.branchPoint(
      track.braid.splitEnd - 0.001,
      branch.centre,
    );
    const after = track.branchPoint(
      track.braid.splitEnd + 0.001,
      branch.centre,
    );
    assert.ok(before.distanceTo(after) < 0.003);
    const a = track.sampleBranchSurface(
      track.braid.splitEnd - 0.001,
      branch.centre,
    );
    const b = track.sampleBranchSurface(
      track.braid.splitEnd + 0.001,
      branch.centre,
    );
    assert.ok(a.quaternion.angleTo(b.quaternion) < 0.003);
  }
  const core = (track.braid.splitEnd + track.braid.mergeStart) / 2;
  assert.equal(
    track.surfaceCoverage(core, 50),
    0,
    'no invisible road between separated ribbons',
  );
});

test('weaving ribbons cross at separate heights instead of colliding', () => {
  const track = createStraightBraid();
  let crossings = 0;
  let previous = null;
  for (let s = track.braid.splitEnd; s <= track.braid.mergeStart; s += 2) {
    const inner = track.branchPoint(s, -100),
      middle = track.branchPoint(s, 0);
    const delta = inner.x - middle.x;
    if (previous !== null && delta * previous < 0) {
      crossings++;
      assert.ok(
        Math.abs(inner.y - middle.y) > 25,
        'full ship/camera clearance at crossing',
      );
    }
    previous = delta;
  }
  assert.ok(crossings >= 2, 'inner and middle ribbons exchange sides twice');
});

test('the crest and outer gaps are truly absent while their supported alternatives remain', () => {
  const crest = production.jumps.find((jump) => jump.id === 'crest-skip');
  const outer = production.jumps.find((jump) => jump.branch === 'outer');
  const crestMiddle = (crest.takeoff + crest.landingStart) / 2;
  const outerMiddle = (outer.takeoff + outer.landingStart) / 2;
  assert.equal(production.surfaceCoverage(crestMiddle, 12), 0);
  assert.equal(production.surfaceCoverage(crestMiddle, -12), 1);
  assert.equal(production.surfaceCoverage(outerMiddle, 100), 0);
  assert.equal(production.surfaceCoverage(outerMiddle, 0), 1);
  for (const jump of production.mandatoryJumps)
    assert.equal(
      production.surfaceCoverage((jump.takeoff + jump.landingStart) / 2, 0),
      0,
    );
  assert.equal(production.surfaceCoverage(outer.landingStart + 5, 0), 1);
});

test('the outer launch aims over the common receiver with a real elevated lip', () => {
  const track = createStraightBraid();
  const jump = track.jumps.find((entry) => entry.branch === 'outer');
  const lip = track.sampleBranchSurface(jump.takeoff, 100);
  assert.ok(Math.abs(lip.position.x) < 0.01);
  assert.ok(lip.position.y > 70 && lip.position.y < 90);
  assert.ok(lip.tangent.z > 0.95);
  assert.ok(lip.tangent.y < -0.1 && lip.tangent.y > -0.3);
  assert.ok(
    Math.abs(lip.right.y) < 0.01,
    'lip levels its banking before free flight',
  );
});

test('road bands, coverage and finite physical frames agree throughout the production braid', () => {
  for (const band of production.roadBands) {
    for (let s = band.start + 0.01; s < band.end; s += 15) {
      const bounds = ravelBandBounds(band, s);
      assert.ok(bounds.max > bounds.min);
      for (const lateral of [
        bounds.min + 0.01,
        (bounds.min + bounds.max) / 2,
        bounds.max - 0.01,
      ]) {
        assert.equal(
          production.surfaceCoverage(s, lateral),
          1,
          `${band.id} at ${s}, ${lateral}`,
        );
        const frame = production.sampleBranchSurface(s, lateral);
        for (const axis of [frame.right, frame.up, frame.tangent]) {
          assert.ok(axis.toArray().every(Number.isFinite));
          assert.ok(Math.abs(axis.length() - 1) < 0.00001);
        }
        assert.ok(Math.abs(frame.right.dot(frame.tangent)) < 0.00001);
        assert.ok(Math.abs(frame.up.dot(frame.right)) < 0.00001);
        assert.ok(
          frame.longitudinalMetric > 0.1 && frame.longitudinalMetric < 5,
        );
      }
    }
  }
});

test('the full-width main membrane keeps forward-facing shoulders through rolls and bends', () => {
  for (const band of production.roadBands.filter(
    (entry) => entry.branch === 'main',
  )) {
    for (let s = band.start + 0.5; s < band.end - 0.5; s += 2) {
      const bounds = ravelBandBounds(band, s);
      const tangent = production.sampleBase(s).tangent;
      for (const x of [bounds.min + 0.05, bounds.max - 0.05]) {
        const progress = production
          .branchPoint(s + 0.2, x)
          .sub(production.branchPoint(s - 0.2, x))
          .multiplyScalar(1 / 0.4)
          .dot(tangent);
        assert.ok(
          progress > 0.15,
          `the wide shoulder folds backward at ${s}m / ${x}m`,
        );
      }
    }
  }
});
