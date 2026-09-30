import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { createTrack } from '../src/levels/halcyon/track/model.js';
import { createLevel2Track } from '../src/levels/orbital/track/model.js';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { assertTrackContract } from './level-checks/track-contract.mjs';

for (const [name, create] of [
  ['Halcyon', createTrack],
  ['Orbital', createLevel2Track],
  ['Nacre', createLevel3Track],
])
  test(name + ' satisfies the reusable track contract', () => {
    const track = create();
    const report = assertTrackContract(track);
    assert.ok(Math.abs(report.measuredLength - track.length) < 0.1);
  });

import { loop } from './level-checks/fixtures.mjs';

function changeSamples(change) {
  const track = loop();
  const sample = track.sample;
  track.sample = (distance) => change(sample(distance), distance, track);
  return track;
}

test('exact vertical tangents and inverted driving are valid frames', () => {
  const track = loop();
  const vertical = track.sample(track.length / 4);
  assert.ok(vertical.tangent.y > 0.999999);
  assert.ok(track.sample(track.length / 2).up.y < -0.999999);
  assertTrackContract(track, { step: track.length / 800 });
});

test('world-up cross-product frames fail at an exact vertical tangent', () => {
  const track = changeSamples((frame) => {
    if (Math.abs(frame.tangent.y - 1) < 1e-12) {
      frame.tangent.set(0, 1, 0);
      frame.right.crossVectors(new Vector3(0, 1, 0), frame.tangent).normalize();
    }
    return frame;
  });
  assert.throws(
    () => assertTrackContract(track, { step: track.length / 800 }),
    /right must be unit length/,
  );
});

test('a valid quaternion cannot hide a mismatched road basis', () => {
  const track = changeSamples((frame) => {
    frame.quaternion.identity();
    return frame;
  });
  assert.throws(() => assertTrackContract(track), /quaternion does not match/);
});

test('position and orientation must wrap for negative and multiple laps', () => {
  const track = changeSamples((frame, distance) => {
    if (distance < 0) frame.position.x += 2;
    return frame;
  });
  assert.throws(() => assertTrackContract(track), /wrap across laps/);
});

test('reusing sampler objects cannot conceal incorrect wrapping', () => {
  const track = loop();
  const sample = track.sample;
  const shared = sample(0);
  track.sample = (distance) => {
    const frame = sample(distance);
    for (const key of ['position', 'right', 'up', 'tangent', 'quaternion'])
      shared[key].copy(frame[key]);
    if (distance < 0) shared.position.x += 2;
    return shared;
  };
  assert.throws(() => assertTrackContract(track), /wrap across laps/);
});

test('a route whose metres disagree with its reported length is rejected', () => {
  const track = changeSamples((frame) => {
    frame.position.multiplyScalar(1.2);
    return frame;
  });
  assert.throws(
    () => assertTrackContract(track),
    /sample distance must be in metres/,
  );
});

test('an abrupt bank flip is rejected even when each frame is valid', () => {
  const track = changeSamples((frame, distance, route) => {
    const wrapped = ((distance % route.length) + route.length) % route.length;
    if (wrapped >= route.length / 2) {
      frame.right.negate();
      frame.up.negate();
      frame.quaternion.multiply(
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI),
      );
    }
    return frame;
  });
  assert.throws(() => assertTrackContract(track), /frame discontinuity/);
});

test('non-finite samples produce an actionable distance instead of a false pass', () => {
  const track = changeSamples((frame) => {
    frame.position.x = NaN;
    return frame;
  });
  assert.throws(
    () => assertTrackContract(track),
    /at 0.0000m: invalid position/,
  );
});

test('review and race metadata cannot omit route stretches or disagree on checkpoints', () => {
  const track = loop();
  track.sections[0].start = 10;
  assert.throws(() => assertTrackContract(track), /without gaps\/overlap/);
  track.sections[0].start = 0;
  track.checkpoints[0].s = 12;
  assert.throws(
    () => assertTrackContract(track),
    /checkpoint s\/distance must agree/,
  );
  track.checkpoints[0].s = 0;
  track.scenarios.staging.speed = NaN;
  assert.throws(
    () => assertTrackContract(track),
    /scenario must contain finite/,
  );
});

test('invalid sampling options fail before invoking a sampler', () => {
  const track = loop();
  track.sample = () => assert.fail('invalid options must never sample');
  assert.throws(
    () => assertTrackContract(track, { step: 0 }),
    /step must be positive/,
  );
  assert.throws(
    () => assertTrackContract(track, { step: 1e-8 }),
    /4–25000 samples/,
  );
});

test('a locally smooth roll that fails to close is rejected at the lap seam', () => {
  const track = changeSamples((frame, distance, route) => {
    const wrapped = ((distance % route.length) + route.length) % route.length;
    const roll = (wrapped / route.length) * Math.PI;
    frame.right.applyAxisAngle(frame.tangent, roll);
    frame.up.applyAxisAngle(frame.tangent, roll);
    frame.quaternion.multiply(
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll),
    );
    return frame;
  });
  assert.throws(() => assertTrackContract(track), /frame discontinuity/);
});
