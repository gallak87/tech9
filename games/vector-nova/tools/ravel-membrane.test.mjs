import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createPlayableRavelTrack } from '../src/levels/ravel/index.js';
import { createRavelRoad } from '../src/levels/ravel/track/road.js';
import { ravelBandBounds } from '../src/levels/ravel/track/branches.js';

const track = createPlayableRavelTrack();
let road;
after(() => road?.dispose());

function sheet(id) {
  const profile = track.sheetProfiles.find((entry) => entry.id === id);
  assert.ok(profile, `missing continuous membrane ${id}`);
  return profile;
}

test('the representative sail is a vast actual curved driving surface with overhanging walls', () => {
  const base = track.sampleBase(700);
  let min = Infinity,
    max = -Infinity,
    height = 0;
  for (let lateral = -650; lateral <= 650; lateral += 5) {
    const point = track.branchPoint(700, lateral).sub(base.position);
    min = Math.min(min, point.dot(base.right));
    max = Math.max(max, point.dot(base.right));
    height = Math.max(height, point.dot(base.up));
    assert.equal(track.surfaceCoverage(700, lateral), 1);
  }
  assert.ok(
    max - min > 630,
    'the membrane spans hundreds of physical world metres',
  );
  assert.ok(height > 450, 'the drivable sidewall rises hundreds of metres');
  const leftHeight = track
    .branchPoint(700, -650)
    .sub(base.position)
    .dot(base.up);
  const rightHeight = track
    .branchPoint(700, 650)
    .sub(base.position)
    .dot(base.up);
  assert.ok(
    rightHeight - leftHeight > 150,
    'the broad open left side differs from the curled right wall',
  );
  const overhang = track.sampleBranchSurface(700, 650);
  assert.ok(
    overhang.up.dot(base.up) < -0.4,
    'the same running skin curls beyond vertical',
  );
  assert.ok(overhang.transverseCurvature > 0);
  assert.equal(
    overhang.lateralMetric,
    1,
    'lateral coordinate is true arc length',
  );
});

test('static walls and the moving floor share support across their rendering partitions', () => {
  for (const lateral of [-120.1, -120, -119.9, 119.9, 120, 120.1]) {
    const frame = track.sampleBranchSurface(700, lateral);
    assert.equal(track.surfaceCoverage(700, lateral), 1);
    assert.ok(frame.bounds.min < -649.9 && frame.bounds.max > 649.9);
  }
  assert.equal(
    track.surfaceCoverage(980, 30),
    0,
    'the original crest hole remains real',
  );
  for (const lateral of [-600, -35, 0, 75, 300, 600])
    assert.equal(
      track.surfaceCoverage(980, lateral),
      1,
      'the rest of the vast membrane stays supported',
    );
});

test('all continuous sail bays keep finite longitudinal metrics and forward-facing shoulders', () => {
  for (const profile of track.sheetProfiles) {
    for (
      let distance = profile.start + 0.5;
      distance < profile.end;
      distance += 4
    ) {
      const shape = track.sheetProfileAt(distance);
      for (const fraction of [-1, -0.75, -0.5, 0, 0.5, 0.75, 1]) {
        const lateral =
          fraction *
          (fraction < 0 ? shape.leftHalfWidth : shape.rightHalfWidth);
        const frame = track.sampleBranchSurface(distance, lateral);
        for (const axis of [frame.right, frame.up, frame.tangent]) {
          assert.ok(axis.toArray().every(Number.isFinite));
          assert.ok(Math.abs(axis.length() - 1) < 1e-5);
        }
        const forward =
          frame.tangent.dot(track.sampleBase(distance).tangent) *
          frame.longitudinalMetric;
        assert.ok(
          forward > 0.2,
          `${profile.id} folds backwards at ${distance}, ${lateral}`,
        );
        assert.ok(
          frame.longitudinalMetric > 0.2 && frame.longitudinalMetric < 5,
        );
        const across =
          track
            .branchPoint(distance, lateral + 0.01)
            .sub(track.branchPoint(distance, lateral - 0.01))
            .length() / 0.02;
        assert.ok(
          Math.abs(across - 1) < 0.001,
          'surface uses physical arc metres',
        );
      }
    }
  }
});

test('later sail bays have unequal real walls and the braid tears into its three existing ribbons', () => {
  for (const id of ['ascent-sail-fold', 'braid-sail-fan']) {
    const p = sheet(id),
      distance = (p.entryEnd + p.plateauEnd) / 2;
    const shape = track.sheetProfileAt(distance),
      base = track.sampleBase(distance);
    const left = track
      .branchPoint(distance, -shape.leftHalfWidth)
      .sub(base.position)
      .dot(base.up);
    const right = track
      .branchPoint(distance, shape.rightHalfWidth)
      .sub(base.position)
      .dot(base.up);
    assert.ok(
      Math.abs(left - right) > 100,
      'unequal heights form a lopsided sail fold',
    );
  }
  const end = sheet('braid-sail-fan').end;
  for (const lateral of [-100, 0, 100]) {
    assert.equal(track.surfaceCoverage(end - 0.01, lateral), 1);
    assert.equal(track.surfaceCoverage(end + 0.01, lateral), 1);
    const before = track.branchPoint(end - 0.001, lateral);
    const after = track.branchPoint(end + 0.001, lateral);
    assert.ok(
      before.distanceTo(after) < 0.003,
      'the sheet physically joins its branch',
    );
  }
  assert.equal(track.surfaceCoverage(end - 1, -50), 0);
  assert.equal(track.surfaceCoverage(end - 1, 50), 0);
});

test('all band endpoints resolve safely after closed-track floating-point wrapping', () => {
  for (const band of track.roadBands) {
    for (const distance of [
      band.start,
      band.end,
      (band.start + band.end) / 2,
    ]) {
      const bounds = ravelBandBounds(band, distance);
      assert.ok(Number.isFinite(bounds.min) && Number.isFinite(bounds.max));
      assert.ok(bounds.max >= bounds.min - 1e-7);
    }
  }
});

test('rendered membrane vertices reproduce the same static walls and live wave surface', () => {
  road = createRavelRoad({ track });
  const actual = new Vector3(),
    lift = new Vector3();
  let sampled = 0;
  for (const mesh of road.group.children) {
    if (!mesh.userData.roadSurface) continue;
    const g = mesh.geometry;
    const position = g.getAttribute('position'),
      coordinate = g.getAttribute('roadCoord');
    const waves = g.getAttribute('ravelWave'),
      ups = g.getAttribute('ravelWaveUp');
    const stride = Math.max(1, Math.floor(position.count / 300));
    for (let i = 0; i < position.count; i += stride) {
      const distance = coordinate.getX(i),
        lateral = coordinate.getY(i);
      if (!track.sheetProfileAt(distance)) continue;
      for (const time of [0, 1.37]) {
        actual.fromBufferAttribute(position, i);
        const height =
          waves.getX(i) *
          (0.5 + 0.5 * Math.cos(waves.getY(i) + waves.getZ(i) * time));
        lift.fromBufferAttribute(ups, i).multiplyScalar(height);
        actual.add(lift);
        const expected = track.pointAtTime(distance, lateral, time);
        assert.ok(
          actual.distanceTo(expected) < 0.025,
          `render/support disagree at ${distance}, ${lateral}`,
        );
        sampled++;
      }
    }
  }
  assert.ok(
    sampled > 100,
    'the check includes the actual extensive membrane mesh',
  );
});
