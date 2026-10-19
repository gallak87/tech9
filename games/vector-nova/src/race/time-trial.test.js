import test from 'node:test';
import { formatTime, formatDelta } from './timing.js';
import assert from 'node:assert/strict';
import {
  Vector3,
  Quaternion,
  Group,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
} from 'three';
import { createPersonalGhost } from './ghost.js';
import { createRace } from './index.js';
import {
  trialIdentity,
  createTimeTrial,
  readTrialBest,
  decodeGhost,
  encodeGhost,
} from './time-trial.js';
import { createDeviceRuntime } from '../pickups/runtime.js';

const track = {
  id: 'trial-test',
  length: 90,
  checkpoints: [0, 30, 60].map((distance) => ({ distance })),
};
const identity = (id = 'test') =>
  trialIdentity({
    track: { ...track, id },
    ship: { id: 'kestrel', version: 1 },
    version: 1,
    runtime: { id: 'test', version: 1, rulesId: 'test' },
  });
const pose = (x = 0) => ({
  position: new Vector3(x, 0, 0),
  quaternion: new Quaternion(),
});
const store = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
    data,
  };
};
function run(id, storage, speed = 100, invalid = false) {
  const race = createRace(track, { laps: 3 });
  const trial = createTimeTrial({
    identity: identity(id),
    race,
    store: storage,
  });
  trial.capture(pose());
  let distance = 0;
  for (let i = 0; !race.complete && i < 10000; i++) {
    if (invalid && i === 5) race.recover();
    race.step(distance, distance + speed / 120, 1 / 120);
    distance += speed / 120;
    trial.capture(pose(distance));
  }
  return { race, trial, result: trial.result };
}
test('three laps have exact interpolated total, nine sector boundaries, and a frozen finish', () => {
  const { race, result } = run('timing', store());
  assert.ok(Math.abs(result.playerTotalTime - 2.7) < 1e-10);
  assert.equal(result.splits.length, 9);
  assert.ok(result.playerLapTimes.every((t) => Math.abs(t - 0.9) < 1e-10));
  race.step(300, 400, 1);
  assert.ok(Math.abs(race.totalElapsed - 2.7) < 1e-10);
});
test('best improves only on a clean faster run; retries and identities isolate records', () => {
  const storage = store();
  assert.equal(run('records', storage).result.improved, true);
  assert.equal(run('records', storage, 90).result.improved, false);
  assert.equal(run('records', storage, 120, true).result.improved, false);
  const improved = run('records', storage, 120).result;
  assert.equal(improved.improved, true);
  assert.ok(improved.delta < 0);
  const saved = readTrialBest(identity('records'), storage);
  assert.ok(saved.samples.length > 2);
  assert.equal(
    readTrialBest(
      { ...identity('records'), ship: { id: 'needle', version: 1 } },
      storage,
    ),
    null,
  );
  assert.equal(
    readTrialBest({ ...identity('records'), runtime: { version: 2 } }, storage),
    null,
  );
});
test('sprint uses one supported finish and automatic jump recovery retains elapsed time', () => {
  const sprint = {
    ...track,
    id: 'sprint-test',
    closed: false,
    length: 120,
    finishDistance: 90,
    checkpoints: [0, 30, 60, 90].map((distance) => ({ distance })),
    jumps: [
      {
        id: 'gap',
        takeoff: 30,
        landingStart: 60,
        landingEnd: 65,
        recovery: 64,
      },
    ],
  };
  const race = createRace(sprint, { laps: 1 });
  race.step(0, 30, 1);
  race.step(30, 30, 4);
  race.step(30, 64, 0.1, [
    {
      type: 'jump-transfer',
      payload: { id: 'gap', from: 30, to: 64, outcome: 'recovered' },
    },
  ]);
  race.step(64, 100, 1);
  assert.equal(race.complete, true);
  assert.equal(race.valid, true);
  assert.ok(race.totalElapsed > 5);
  assert.equal(race.splits.length, 3);
  assert.ok(Math.abs(race.splits.at(-1) - race.totalElapsed) < 1e-10);
});
test('ghost decoder rejects incompatible, incomplete, non-finite and malformed trajectories', () => {
  const samples = [
    [0, 0, 0, 0, 0, 0, 0, 1],
    [0.1, 1, 0, 0, 0, 0, 0, 1],
  ];
  assert.equal(decodeGhost(encodeGhost(samples), 0.1).length, 2);
  assert.equal(decodeGhost({ ...encodeGhost(samples), version: 9 }, 0.1), null);
  assert.equal(decodeGhost(encodeGhost(samples), 0.2), null);
  samples[1][1] = Infinity;
  assert.equal(decodeGhost(encodeGhost(samples), 0.1), null);
  assert.equal(
    decodeGhost({ version: 1, encoding: 'f32le-txyzxyzw', data: 'junk' }, 0.1),
    null,
  );
});
test('quota errors preserve best time where possible and disabled storage preserves session best', () => {
  const storage = store(),
    put = storage.setItem;
  storage.setItem = (key, value) => {
    if (JSON.parse(value).ghost) throw Error('Quota');
    put(key, value);
  };
  const limited = run('quota', storage).result;
  assert.deepEqual(limited.saved, { saved: true, ghostSaved: false });
  const denied = {
    getItem() {
      throw Error('Denied');
    },
    setItem() {
      throw Error('Denied');
    },
  };
  assert.deepEqual(run('denied', denied).result.saved, {
    saved: false,
    ghostSaved: false,
  });
  assert.equal(run('denied', denied, 90).result.improved, false);
});
test('disabled devices pass manual control to motion without entry impulses', () => {
  const inputs = [],
    state = { distance: 0, lateral: 0, speed: 40, energy: 100 };
  const motion = {
    id: 'test',
    version: 1,
    rulesId: 'test',
    pose: () => null,
    snapshot: () => null,
    reset() {},
    advance(s, input) {
      inputs.push(input);
      s.distance = 15;
      return [];
    },
    update() {},
    dispose() {},
  };
  const devices = [
    {
      id: 'boost',
      type: 'vector',
      distance: 10,
      lateral: 0,
      length: 20,
      width: 8,
    },
  ];
  const runtime = createDeviceRuntime({ track, devices, motion });
  runtime.setEnabled(false);
  const control = { throttle: 1, boost: true };
  assert.deepEqual(runtime.advance(state, control, 1 / 120), []);
  assert.equal(inputs[0], control);
  assert.equal(state.speed, 40);
  assert.equal(runtime.snapshot().vectorActive, false);
});

test('ghost borrows visible hulls, excludes exhaust and hidden effects, and owns no geometry', () => {
  const scene = new Group(),
    source = new Group(),
    geometry = new BoxGeometry(),
    material = new MeshBasicMaterial();
  const hull = new Mesh(geometry, material),
    exhaust = new Mesh(geometry, material);
  exhaust.userData.exhaustHeat = true;
  const hidden = new Group();
  hidden.visible = false;
  hidden.add(new Mesh(geometry, material));
  source.add(hull, exhaust, hidden);
  const ghost = createPersonalGhost(scene);
  ghost.reset(source, [
    [0, 0, 0, 0, 0, 0, 0, 1],
    [0.1, 10, 0, 0, 0, 0, 0, 1],
  ]);
  const root = scene.children[0];
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].geometry, geometry);
  ghost.update(0.05, true, new Vector3(100, 0, 0));
  assert.equal(root.position.x, 5);
  assert.equal(root.children[0].material.depthWrite, false);
  ghost.dispose();
  assert.equal(scene.children.length, 0);
  geometry.dispose();
  material.dispose();
});

test('finish samples within one float32 timestamp ULP still decode on retry', () => {
  const samples = Array.from({ length: 12 }, (_, i) => [
    i / 10,
    i,
    0,
    0,
    0,
    0,
    0,
    1,
  ]);
  samples.push([1.10000001, 99, 0, 0, 0, 0, 0, 1]);
  const decoded = decodeGhost(encodeGhost(samples), 1.10000001);
  assert.equal(decoded.length, 12);
  assert.equal(decoded.at(-1)[1], 99);
});

test('shared timing formatting carries rounded milliseconds through minute boundaries', () => {
  assert.equal(formatTime(59.9996), '1:00.000');
  assert.equal(formatTime(59.9994, 2), '00:59.999');
  assert.equal(formatTime(null), '—');
  assert.equal(formatDelta(-0.00001), '0.000 s');
  assert.equal(formatDelta(-1.2346), '−1.235 s');
});

test('PB decisions and displayed deltas use the same rounded millisecond totals', () => {
  const storage = store();
  run('rounded-tie', storage, 270 / 1.00049);
  const tie = run('rounded-tie', storage, 270 / 0.99989).result;
  assert.equal(tie.improved, false);
  assert.equal(tie.delta, 0);
  run('rounded-pb', storage, 270 / 1.00051);
  const pb = run('rounded-pb', storage, 270 / 1.00049).result;
  assert.equal(pb.improved, true);
  assert.equal(pb.delta, -0.001);
});

test('waiting at the grid cannot invalidate a trial when hull settling crosses zero', () => {
  const race = createRace(track, { laps: 3 });
  race.step(0, -0.02, 0.5);
  race.step(-0.02, 0, 0.5);
  assert.equal(race.valid, true);
  assert.equal(race.splits.length, 0);
  for (let distance = 0; distance < 270; distance++)
    race.step(distance, distance + 1, 0.01);
  assert.ok(race.history.every((lap) => lap.valid));
  assert.equal(race.splits.length, 9);
  assert.ok(Math.abs(race.totalElapsed - 3.7) < 1e-10);
});
