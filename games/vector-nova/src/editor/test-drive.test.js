import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { generateDocument, pointRouteFractions } from './document.js';
import { createEditorTrack } from './track.js';
import { getShip } from '../ships/catalog.js';
import {
  createEditorTestAttemptRecorder,
  getEditorTestStartSummary,
  normalizeEditorTestRequest,
  resolveEditorTestStart,
} from './test-drive.js';

const document = generateDocument({
  generatorVersion: 1,
  seed: 17,
  seedJumps: false,
});
const frame = () => ({
  up: new Vector3(0, 1, 0),
  tangent: new Vector3(0, 0, 1),
  curvature: 0,
});
const trackFixture = (jumps) => ({
  length: 5000,
  width: 40,
  closed: true,
  jumps,
  sample: frame,
  isGap: (distance) =>
    jumps.some((j) => distance > j.takeoff && distance < j.landingStart),
});
const jump = (id, takeoff, landingStart, recovery) => ({
  id,
  label: id,
  takeoff,
  landingStart,
  landingEnd: recovery,
  recovery,
});

test('local test requests accept only bundled modes and stock choices', () => {
  assert.deepEqual(normalizeEditorTestRequest(), {
    kind: 'course',
    speed: 'standing',
    reserve: 'full',
  });
  assert.deepEqual(
    normalizeEditorTestRequest({
      kind: 'jump',
      jumpId: 'jump-1',
      module: '/arbitrary.js',
      speed: 'boost',
      reserve: 'half',
      state: { speed: 9000 },
    }),
    {
      kind: 'jump',
      jumpId: 'jump-1',
      speed: 'boost',
      reserve: 'half',
    },
  );
  for (const value of [
    { kind: 'launch-world-pose' },
    { speed: 9000 },
    { reserve: 500 },
    { kind: 'point' },
    { kind: 'jump' },
  ])
    assert.throws(() => normalizeEditorTestRequest(value));
});

test('selected-point tests use the authoritative route station and stock ship handling', () => {
  const track = createEditorTrack(document),
    index = 3,
    plan = resolveEditorTestStart(
      document,
      {
        kind: 'point',
        pointId: document.points[index].id,
        speed: 'boost',
        reserve: 'half',
      },
      { shipId: 'needle', track },
    );
  assert.equal(
    plan.distance,
    pointRouteFractions(document)[index] * track.length,
  );
  assert.equal(plan.speed, getShip('needle').handling.boostSpeed);
  assert.equal(plan.energy, 50);
  assert.deepEqual(plan.state, {
    distance: plan.distance,
    lateral: 0,
    speed: plan.speed,
    energy: 50,
    heading: 0,
  });
  assert.match(getEditorTestStartSummary(plan), /50% reserve · stock Needle/);
  assert.throws(() =>
    resolveEditorTestStart(document, { kind: 'point', pointId: 'removed' }),
  );
  assert.throws(() =>
    resolveEditorTestStart(document, { kind: 'jump', jumpId: 'removed' }),
  );
});

test('jump tests start on the real clear approach and never inside an earlier gap/receiver', () => {
  const jumps = [
      jump('previous', 500, 700, 1000),
      jump('target', 1200, 1400, 1700),
    ],
    track = trackFixture(jumps),
    plan = resolveEditorTestStart(
      document,
      { kind: 'jump', jumpId: 'target' },
      { track },
    );
  assert.equal(plan.distance, 1020);
  assert.equal(plan.approachMetres, 180);
  assert.equal(plan.speed, getShip('kestrel').handling.cruiseSpeed);
  assert.equal(plan.energy, 100);
  assert.equal(plan.targetJumpId, 'target');
  assert.equal(track.isGap(plan.distance), false);
  assert.match(getEditorTestStartSummary(plan), /180 m approach/);
  const blocked = {
    ...track,
    sample: () => ({ ...frame(), up: new Vector3(1, 0, 0) }),
  };
  assert.throws(
    () =>
      resolveEditorTestStart(
        document,
        { kind: 'jump', jumpId: 'target' },
        { track: blocked },
      ),
    /clear, upright approach/,
  );
  assert.equal(document.jumps.length, 0);
});

test('point tests in an authored gap move onto supported landing road', () => {
  const index = 2,
    station = pointRouteFractions(document)[index] * 5000,
    target = jump('gap', station - 30, station + 40, station + 300),
    track = trackFixture([target]),
    plan = resolveEditorTestStart(
      document,
      { kind: 'point', pointId: document.points[index].id },
      { track },
    );
  assert.equal(plan.distance, target.landingStart + 2);
  assert.equal(track.isGap(plan.distance), false);
  assert.match(plan.warnings[0], /selected point is in a gap/);
});

test('jump tests check the complete approach and prefer a final straight over an earlier bend', () => {
  const track = trackFixture([jump('target', 1000, 1200, 1500)]);
  track.sample = (station) => ({
    ...frame(),
    tangent:
      station > 790 && station < 875
        ? new Vector3(Math.sin(0.4), 0, Math.cos(0.4))
        : new Vector3(0, 0, 1),
  });
  assert.equal(track.sample(760).tangent.x, 0);
  const plan = resolveEditorTestStart(
    document,
    { kind: 'jump', jumpId: 'target' },
    { track },
  );
  assert.equal(plan.approachMetres, 120);
  assert.equal(plan.distance, 880);
  assert.match(getEditorTestStartSummary(plan), /Short approach/);
  assert.equal(
    plan.warnings.some((warning) => warning.startsWith('Curved')),
    false,
  );
  // Geometry alone chooses a useful start; it never supplies steering or a
  // launch impulse to make a stock speed succeed.
  assert.equal(plan.state.heading, 0);
  assert.equal(plan.speed, getShip('kestrel').handling.cruiseSpeed);
});

test('unavoidable curved and short approaches disclose assumptions in the visible summary', () => {
  const track = trackFixture([jump('target', 1000, 1200, 1500)]);
  track.sample = (station) => {
    const angle = ((1000 - station) / 120) * 0.3;
    return {
      ...frame(),
      tangent: new Vector3(Math.sin(angle), 0, Math.cos(angle)),
    };
  };
  const curved = resolveEditorTestStart(
    document,
    { kind: 'jump', jumpId: 'target' },
    { track },
  );
  assert.equal(curved.approachMetres, 120);
  assert.match(
    getEditorTestStartSummary(curved),
    /Curved approach: steer through/,
  );
  assert.match(
    getEditorTestStartSummary(curved),
    /Start speed is not launch speed/,
  );
  assert.match(getEditorTestStartSummary(curved), /Short approach/);
  const shortTrack = trackFixture([
    jump('previous', 600, 700, 890),
    jump('target', 1000, 1200, 1500),
  ]);
  const short = resolveEditorTestStart(
    document,
    { kind: 'jump', jumpId: 'target', reserve: 'half' },
    { track: shortTrack },
  );
  assert.equal(short.approachMetres, 90);
  assert.equal(short.energy, 50);
  assert.match(getEditorTestStartSummary(short), /Short approach/);
  shortTrack.jumps[0].recovery = 920;
  assert.throws(
    () =>
      resolveEditorTestStart(
        document,
        { kind: 'jump', jumpId: 'target' },
        { track: shortTrack },
      ),
    /at least 80 m to react/,
  );
});

test('a supported start cannot conceal an intervening rotated road section', () => {
  const track = trackFixture([jump('target', 1000, 1200, 1500)]);
  track.sample = (station) => ({
    ...frame(),
    up:
      station >= 920 && station <= 940
        ? new Vector3(1, 0, 0)
        : new Vector3(0, 1, 0),
  });
  assert.equal(track.sample(760).up.y, 1);
  assert.throws(
    () =>
      resolveEditorTestStart(
        document,
        { kind: 'jump', jumpId: 'target' },
        { track },
      ),
    /clear, upright approach/,
  );
});

test('attempt reports retain actual launch and miss pose, separately from the configured start', () => {
  const recorder = createEditorTestAttemptRecorder(),
    plan = resolveEditorTestStart(document),
    state = {
      distance: 201,
      lateral: -3,
      speed: 88,
      energy: 45,
      heading: 0.1,
      time: 5,
    },
    pose = { position: new Vector3(12, 34, 56) };
  assert.equal(recorder.read(state, pose), null);
  recorder.begin(plan);
  recorder.event(
    { type: 'jump-launch', payload: { id: 'gap', speed: 87.5, heading: 0.08 } },
    state,
    pose,
  );
  state.distance = 203;
  state.time = 7;
  pose.position.set(100, -30, 900);
  recorder.event(
    { type: 'jump-miss', payload: { id: 'gap', reason: 'short' } },
    state,
    pose,
  );
  const report = recorder.read(state, pose);
  assert.equal(report.start.speed, 0);
  assert.equal(report.status, 'missed');
  assert.equal(report.lastAttempt.launch.speed, 87.5);
  assert.equal(report.lastAttempt.launch.energy, 45);
  assert.deepEqual(report.lastAttempt.launch.position, [12, 34, 56]);
  assert.equal(report.lastAttempt.reason, 'short');
  assert.deepEqual(report.lastAttempt.miss.position, [100, -30, 900]);
  report.lastAttempt.miss.position[0] = -1;
  assert.equal(recorder.read(state, pose).lastAttempt.miss.position[0], 100);
  // Real support after a provisional miss is reported as a landing, retaining
  // the earlier miss location rather than hiding a physical wall rebound.
  recorder.event(
    { type: 'jump-transfer', payload: { id: 'gap', outcome: 'landed' } },
    state,
    pose,
  );
  assert.equal(recorder.read(state, pose).status, 'landed');
  assert.equal(recorder.read(state, pose).lastAttempt.outcome, 'landed');
  assert.ok(recorder.read(state, pose).lastAttempt.miss);
  recorder.begin(plan);
  assert.equal(recorder.read(state, pose).lastAttempt, null);
  assert.equal(recorder.read(state, pose).status, 'not-launched');
});
