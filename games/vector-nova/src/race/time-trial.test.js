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
  readTrialRecords,
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
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
  };
};
function session(id, storage) {
  const race = createRace(track, { continuous: true });
  const trial = createTimeTrial({
    identity: identity(id),
    race,
    store: storage,
  });
  trial.capture(pose());
  let distance = 0;
  return {
    race,
    trial,
    step(speed = 100, dt = 1 / 120) {
      race.step(distance, distance + speed * dt, dt);
      distance += speed * dt;
      trial.capture(pose(distance), dt);
    },
    lap(speed = 100, invalid = false) {
      const next = race.lap + 1;
      if (invalid) race.recover();
      for (let i = 0; race.lap < next && i < 10000; i++) this.step(speed);
      assert.equal(race.lap, next);
      return trial.snapshot().lastLap;
    },
  };
}
function run(id, storage, speed = 100, invalid = false) {
  const s = session(id, storage);
  return { ...s, result: s.lap(speed, invalid) };
}
test('circuits save each lap immediately, replay the first ghost on lap two, and never finish at three laps', () => {
  const storage = store(),
    s = session('timing', storage);
  const first = s.lap(103);
  assert.ok(Math.abs(first.playerTotalTime - 90 / 103) < 1e-10);
  assert.equal(first.splits.length, 3);
  assert.equal(first.improved, true);
  assert.equal(first.start, 'standing');
  assert.equal(s.trial.snapshot().ghost, true);
  assert.equal(s.trial.snapshot().ghostStart, 'standing');
  assert.equal(
    s.trial.snapshot().best,
    null,
    'standing best is separate from flying PB',
  );
  const standing = readTrialBest(identity('timing'), storage);
  assert.ok(
    Math.abs(standing.samples.at(-1)[1] - 90) < 1e-5,
    'finish pose is interpolated at crossing',
  );
  const second = s.lap(97);
  assert.equal(second.start, 'flying');
  assert.equal(
    second.improved,
    true,
    'first flying best may be slower than standing best',
  );
  assert.equal(second.previousBest, null);
  assert.equal(s.trial.snapshot().ghostStart, 'flying');
  const flying = readTrialBest(
    { ...identity('timing'), start: 'flying' },
    storage,
  );
  assert.ok(
    Math.abs(flying.samples[0][1] - 90) < 1e-5,
    'next ghost starts exactly at the previous finish pose',
  );
  assert.ok(Math.abs(flying.samples.at(-1)[1] - 180) < 1e-5);
  assert.ok(flying.splits.every((v, i) => v > (flying.splits[i - 1] ?? 0)));
  const oldReference = s.trial.reference;
  const third = s.lap(120);
  assert.equal(third.improved, true);
  assert.notEqual(
    s.trial.reference,
    oldReference,
    'new best is replayed immediately',
  );
  assert.equal(s.trial.reference.duration, third.playerTotalTime);
  s.lap(80);
  assert.equal(s.race.lap, 5);
  assert.equal(s.race.complete, false);
  assert.equal(s.trial.result, null);
  assert.equal(s.race.history.length, 1, 'continuous history stays bounded');
  assert.ok(s.race.splits.length < 3);
  assert.ok(s.trial.snapshot().elapsed < 1 / 120);
  assert.ok(
    Math.abs(
      s.race.totalElapsed -
        (first.playerTotalTime +
          second.playerTotalTime +
          third.playerTotalTime +
          s.race.lastLap +
          s.race.elapsed),
    ) < 1e-10,
  );
  assert.equal(storage.length, 2);
});
test('invalid laps do not replace a best or contaminate the next lap; splits restart at each line crossing', () => {
  const storage = store(),
    s = session('clean-laps', storage);
  s.lap();
  s.lap();
  const reference = s.trial.reference;
  assert.equal(s.lap(150, true).improved, false);
  assert.equal(s.trial.reference, reference);
  assert.equal(s.trial.snapshot().valid, true);
  assert.equal(s.trial.snapshot().sector, 0);
  assert.equal(s.trial.snapshot().delta, null);
  while (s.race.checkpoint === 0) s.step(120);
  const snap = s.trial.snapshot();
  assert.equal(snap.sector, 1);
  assert.ok(
    snap.delta < 0,
    'delta compares this lap to flying best, not session total',
  );
  s.race.recover();
  s.step();
  assert.equal(s.trial.snapshot().valid, false);
  assert.equal(s.trial.snapshot().delta, null);
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
test('sprint records retain their identity, finish once, and replay on the next attempt', () => {
  const course = {
    ...track,
    id: 'recorded-sprint',
    closed: false,
    length: 120,
    finishDistance: 90,
    checkpoints: [0, 30, 60, 90].map((distance) => ({ distance })),
  };
  const id = trialIdentity({
    track: course,
    ship: { id: 'kestrel', version: 1 },
    version: 1,
    runtime: {},
  });
  assert.equal(id.start, undefined);
  assert.match(id.rules, /^time-trial-v1:/);
  const storage = store();
  const race = createRace(course, { laps: 1 });
  const trial = createTimeTrial({ identity: id, race, store: storage });
  trial.capture(pose());
  let distance = 0;
  while (!race.complete) {
    const next = distance + 103 / 120;
    race.step(distance, next, 1 / 120);
    trial.capture(pose(next), 1 / 120);
    distance = next;
  }
  const result = trial.result;
  assert.equal(result.playerValid, true);
  assert.equal(result.saved.ghostSaved, true);
  assert.ok(Math.abs(result.playerTotalTime - 90 / 103) < 1e-10);
  const saved = readTrialBest(id, storage);
  assert.ok(Math.abs(saved.samples.at(-1)[1] - 90) < 1e-5);
  race.step(distance, distance + 10, 1);
  assert.equal(trial.capture(pose(distance + 10), 1), result);
  const retry = createTimeTrial({
    identity: id,
    race: createRace(course, { laps: 1 }),
    store: storage,
  });
  assert.equal(retry.snapshot().ghost, true);
  assert.equal(retry.snapshot().best, result.playerTotalTime);
});
test('capture limits apply per lap and an invalid opening lap cannot supply a ghost', () => {
  const storage = store(),
    s = session('capture-limit', storage);
  s.lap(100, true);
  assert.equal(storage.length, 0);
  assert.equal(s.trial.snapshot().ghost, false);
  // A stationary wait exceeds the capture limit. The time still saves, then
  // the next clean lap gets a fresh, complete trajectory rather than a tail.
  for (let i = 0; i < 12001; i++) s.step(0, 0.1);
  const long = s.lap();
  assert.equal(long.improved, true);
  assert.equal(long.saved.saved, true);
  assert.equal(long.ghostAvailable, false);
  const short = s.lap();
  assert.equal(short.improved, true);
  assert.equal(short.saved.ghostSaved, true);
  assert.equal(s.trial.snapshot().ghost, true);
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
  run('rounded-tie', storage, 90 / 1.00049);
  const tie = run('rounded-tie', storage, 90 / 0.99989).result;
  assert.equal(tie.improved, false);
  assert.equal(tie.delta, 0);
  run('rounded-pb', storage, 90 / 1.00051);
  const pb = run('rounded-pb', storage, 90 / 1.00049).result;
  assert.equal(pb.improved, true);
  assert.equal(pb.delta, -0.001);
});

for (const continuous of [false, true])
  test(`waiting at the grid cannot invalidate ${continuous ? 'continuous' : 'bounded'} timing`, () => {
    const race = createRace(
      track,
      continuous ? { continuous: true } : { laps: 3 },
    );
    race.step(0, -0.02, 0.5);
    race.step(-0.02, 0, 0.5);
    assert.equal(race.valid, true);
    assert.equal(race.splits.length, 0);
    for (let distance = 0; distance < 270; distance++)
      race.step(distance, distance + 1, 0.01);
    assert.ok(race.history.every((lap) => lap.valid));
    assert.equal(race.splits.length, continuous ? 0 : 9);
    assert.ok(Math.abs(race.totalElapsed - 3.7) < 1e-10);
  });

test('record browser preserves distinct rules profiles, ignores corrupt storage and reports session-only bests', () => {
  const storage = store();
  run('browser-record', storage);
  const original = [...storage.data.entries()][0];
  const record = JSON.parse(original[1]);
  // Clear the memory association by browsing a different exact identity.
  record.identity.version = 'older-course';
  const text = JSON.stringify(record.identity);
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  storage.setItem(
    `vector-nova.trial.v1.${(hash >>> 0).toString(16)}`,
    JSON.stringify(record),
  );
  storage.setItem('vector-nova.trial.v1.corrupt', '{');
  storage.setItem(
    'vector-nova.trial.v1.malformed',
    JSON.stringify({ identity: { ship: null } }),
  );
  const rows = readTrialRecords(storage).filter(
    (r) => r.identity.track === 'browser-record',
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.saved && r.ghostSaved && r.ghost));
  assert.notEqual(rows[0].identity.version, rows[1].identity.version);
  assert.ok(rows.every((r) => !('samples' in r)));
  run('browser-session', null);
  const disabled = {
    get length() {
      throw Error('blocked');
    },
    getItem() {
      throw Error('blocked');
    },
  };
  const session = readTrialRecords(disabled).find(
    (r) => r.identity.track === 'browser-session',
  );
  assert.equal(session.saved, false);
  assert.equal(session.ghostSaved, false);
  assert.equal(session.ghost, true);
});

test('legacy three-lap records remain browsable but never become lap references', () => {
  const storage = store();
  const current = identity('legacy-record');
  const legacy = {
    ...current,
    rules: current.rules.replace(
      'time-trial-v2:continuous-laps:',
      'time-trial-v1:',
    ),
    laps: 3,
  };
  delete legacy.start;
  const record = {
    version: 1,
    identity: legacy,
    duration: 9,
    laps: [3, 3, 3],
    splits: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ghost: null,
  };
  let hash = 2166136261;
  for (const c of JSON.stringify(legacy))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  storage.setItem(
    `vector-nova.trial.v1.${(hash >>> 0).toString(16)}`,
    JSON.stringify(record),
  );
  assert.equal(
    readTrialRecords(storage).filter((r) => r.identity.track === current.track)
      .length,
    1,
  );
  assert.equal(readTrialBest(current, storage), null);
  assert.equal(session(current.track, storage).trial.snapshot().ghost, false);
});
