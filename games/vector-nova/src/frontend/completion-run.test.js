import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import * as T from 'three';
import {
  loadCompletionRun,
  validateCompletionRun,
  sampleCompletionRun,
} from './completion-run.js';
import {
  COMPLETION_CAPTURE,
  COMPLETION_DURATION,
  COMPLETION_SHIPS,
} from './completion-config.js';

const base = new URL(
  '../../public/assets/completion/shatterline-v1/',
  import.meta.url,
);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', base), 'utf8'),
);
const records = new Map();
const compressed = new Map();
const raw = new Map();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const shipId of COMPLETION_SHIPS) {
  const bytes = await readFile(new URL(`${shipId}.json.gz`, base));
  const json = gunzipSync(bytes, {
    maxOutputLength: COMPLETION_CAPTURE.maxRawBytes,
  });
  compressed.set(shipId, bytes);
  raw.set(shipId, json);
  records.set(shipId, JSON.parse(json));
}
const currentTrack = {
  id: manifest.route.trackId,
  geometryVersion: manifest.geometryVersion,
  length: manifest.route.length,
  finishDistance: manifest.route.finishDistance,
  jumps: [
    {
      id: manifest.route.jumpId,
      takeoff: manifest.route.takeoffDistance,
      landingStart: manifest.route.landingDistance,
    },
  ],
};
function fetchAssets(t, { decoded = false, corrupt = false } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    if (url.endsWith('/manifest.json'))
      return new Response(JSON.stringify(manifest));
    const shipId = url.split('/').at(-1).replace('.json.gz', '');
    let bytes = decoded ? raw.get(shipId) : compressed.get(shipId);
    if (corrupt) {
      bytes = Uint8Array.from(bytes);
      bytes[bytes.length - 1] ^= 1;
    }
    return new Response(bytes);
  });
  return calls;
}

test('four final shipped records preserve native combat, landing and the actual winning checker crossing', () => {
  for (const shipId of COMPLETION_SHIPS) {
    const run = validateCompletionRun(records.get(shipId), {
      shipId,
      track: currentTrack,
    });
    const entry = manifest.records[shipId];
    assert.equal(raw.get(shipId).length, entry.rawBytes);
    assert.equal(compressed.get(shipId).length, entry.compressedBytes);
    assert.equal(hash(raw.get(shipId)), entry.rawSha256);
    assert.equal(hash(compressed.get(shipId)), entry.compressedSha256);
    assert.equal(run.duration, COMPLETION_DURATION);
    assert.equal(
      run.frames.length,
      Math.round(COMPLETION_DURATION / run.step) + 1,
    );
    assert.equal(run.outcome.heroPosition, 1);
    assert.ok(run.landmarks.finishTime < run.landmarks.finishTimes.rook);
    assert.ok(run.landmarks.finishTime < run.landmarks.finishTimes.manta);
    assert.ok(
      run.events.some(
        (event) =>
          event.actor === 'hero' &&
          event.type === 'combat-confirm' &&
          event.payload.kind === 'repulsor' &&
          !event.payload.shielded,
      ),
    );
    for (const { id } of run.actors) {
      const landing = run.events.filter(
        (event) => event.actor === id && event.type === 'jump-transfer',
      );
      assert.equal(landing.length, 1);
      assert.equal(landing[0].payload.id, 'horizon-transfer');
      assert.equal(landing[0].payload.outcome, 'landed');
      const crossing = run.frames.findIndex(
        (frame) => frame[id].state.distance >= currentTrack.finishDistance,
      );
      const before = run.frames[crossing - 1],
        after = run.frames[crossing];
      assert.ok(before[id].grounded && after[id].grounded);
      const time =
        before.time +
        (run.step * (currentTrack.finishDistance - before[id].state.distance)) /
          (after[id].state.distance - before[id].state.distance);
      assert.ok(Math.abs(time - run.landmarks.finishTimes[id]) < 1e-9);
      assert.ok(
        run.frames.every(
          (frame) => frame[id].state.resetCount === 0 && !frame[id].recovering,
        ),
      );
      assert.ok(
        run.frames.at(-1)[id].state.speed >= 0,
        'the native runout never reverses',
      );
    }
    assert.equal(
      run.events.some(({ type }) =>
        ['jump-miss', 'road-recovery'].includes(type),
      ),
      false,
    );
  }
});

test('final capture provenance matches the current physics sources without timestamps or machine paths', async () => {
  assert.equal(
    manifest.provenance.generator,
    'tools/capture-completion-runs.mjs',
  );
  assert.equal(manifest.duration, COMPLETION_DURATION);
  for (const [path, expected] of Object.entries(
    manifest.provenance.sourceFiles,
  )) {
    assert.ok(!path.startsWith('/') && !path.includes('\\'));
    assert.equal(
      hash(await readFile(new URL(`../../${path}`, import.meta.url))),
      expected,
      path,
    );
  }
});

test('the browser loads only the selected final recording and reports bounded progress', async (t) => {
  const calls = fetchAssets(t);
  const progress = [];
  const run = await loadCompletionRun({
    shipId: 'shrike',
    track: currentTrack,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(run.frames[0].hero.state.shipId, 'shrike');
  assert.deepEqual(
    calls.map((url) => url.split('/').at(-1)),
    ['manifest.json', 'shrike.json.gz'],
  );
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value) => value >= 0 && value <= 1));
});

test('hosts that already decode gzip still validate the raw recording', async (t) => {
  fetchAssets(t, { decoded: true });
  assert.equal(
    (await loadCompletionRun({ shipId: 'kestrel' })).outcome.winner,
    'hero',
  );
});

test('corrupt, oversized or stale captures fail honestly', async (t) => {
  fetchAssets(t, { corrupt: true });
  await assert.rejects(loadCompletionRun({ shipId: 'needle' }), /checksum/);
  assert.throws(
    () =>
      validateCompletionRun(records.get('needle'), {
        shipId: 'needle',
        track: {
          ...currentTrack,
          finishDistance: currentTrack.finishDistance + 0.01,
        },
      }),
    /current track/,
  );
  const wrong = structuredClone(records.get('needle'));
  wrong.metadata.hullsId = 'stale';
  assert.throws(
    () => validateCompletionRun(wrong, { shipId: 'needle' }),
    /stale/,
  );
  t.mock.method(globalThis, 'fetch', async (url) =>
    url.endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest))
      : new Response(new Uint8Array(manifest.records.needle.rawBytes + 1)),
  );
  await assert.rejects(loadCompletionRun({ shipId: 'needle' }), /size budget/);
  const oversizedGzip = new Uint8Array(
    manifest.records.needle.compressedBytes + 1,
  );
  oversizedGzip.set([0x1f, 0x8b]);
  t.mock.method(globalThis, 'fetch', async (url) =>
    url.endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest))
      : new Response(oversizedGzip),
  );
  await assert.rejects(loadCompletionRun({ shipId: 'needle' }), /size budget/);
});

test('cancellation stops before loading or between the manifest and selected recording', async (t) => {
  const calls = fetchAssets(t);
  const before = new AbortController();
  before.abort();
  await assert.rejects(
    loadCompletionRun({ shipId: 'kestrel', signal: before.signal }),
    { name: 'AbortError' },
  );
  assert.equal(calls.length, 0);
  const during = new AbortController();
  await assert.rejects(
    loadCompletionRun({
      shipId: 'kestrel',
      signal: during.signal,
      onProgress: () => during.abort(),
    }),
    { name: 'AbortError' },
  );
  assert.equal(calls.length, 1);
});

test('playback interpolates the shipped world poses and retains crossed events without changing records', () => {
  const run = records.get('kestrel');
  for (const frame of run.frames)
    assert.equal(
      sampleCompletionRun(run, frame.time).hero.state.time,
      frame.hero.state.time,
    );
  const a = run.frames[500],
    b = run.frames[501];
  const sample = sampleCompletionRun(run, (a.time + b.time) / 2);
  const expected = new T.Vector3()
    .fromArray(a.hero.position)
    .lerp(new T.Vector3().fromArray(b.hero.position), 0.5);
  assert.ok(
    new T.Vector3().fromArray(sample.hero.position).distanceTo(expected) <
      1e-10,
  );
  const originalSpeed = a.hero.state.speed;
  sample.hero.position[0] += 99;
  sample.hero.state.speed = -99;
  assert.equal(a.hero.state.speed, originalSpeed);
  assert.notEqual(sample.hero.position[0], a.hero.position[0]);
  assert.ok(
    sampleCompletionRun(
      run,
      run.landmarks.firstFireTime + 1 / 60,
    ).eventsThroughTime.some((event) => event.type === 'combat-fire'),
  );
});

test('native slide stays after the unchanged checker crossing and settles clear of the road edges', () => {
  for (const shipId of COMPLETION_SHIPS) {
    const run = records.get(shipId);
    const crossingTick =
      Math.ceil(run.landmarks.finishTime / run.step) * run.step;
    const prefix = JSON.stringify({
      frames: run.frames.filter((frame) => frame.time <= crossingTick + 1e-9),
      events: run.events.filter((event) => event.time <= crossingTick + 1e-9),
    });
    assert.equal(hash(prefix), manifest.records[shipId].preFinishSha256);
    const { finishTime, slideStartTime, slidePeakTime, slideEndTime } =
      run.landmarks;
    assert.ok(
      finishTime < slideStartTime &&
        slideStartTime <= slidePeakTime &&
        slidePeakTime <= slideEndTime &&
        slideEndTime < run.duration,
    );
    const active = run.frames.filter(
      (frame) => frame.hero.effects.slide?.active,
    );
    assert.ok(active.length > 20);
    assert.ok(
      active.some(
        (frame) => frame.hero.input.airbrake && frame.hero.input.steer < 0,
      ),
    );
    assert.ok(
      active.some(
        (frame) => frame.hero.input.airbrake && frame.hero.input.steer > 0,
      ),
    );
    assert.ok(
      active.every(
        (frame) =>
          frame.hero.grounded &&
          frame.hero.race.complete &&
          frame.hero.state.resetCount === 0,
      ),
    );
    assert.ok(
      Math.min(...active.map((frame) => frame.hero.effects.slide.clearance)) >
        4,
    );
    assert.ok(
      Math.max(
        ...active.map((frame) => Math.abs(frame.hero.effects.slide.slipSpeed)),
      ) > 3,
    );
    const peakYaw = Math.max(
      ...active.map((frame) => Math.abs(frame.hero.state.heading)),
    );
    assert.ok(
      peakYaw >= (18 * Math.PI) / 180 && peakYaw <= (35 * Math.PI) / 180,
      'a clearly visible 18–35 degree native body turn',
    );
    assert.ok(slideEndTime - slideStartTime > 0.6);
    assert.ok(run.duration - slideEndTime >= 0.8);
    const crossing = run.frames.find((frame) => frame.time >= finishTime);
    assert.ok(
      active[0].hero.state.speed >= crossing.hero.state.speed * 0.9,
      'the inward airbrake turn starts with racing momentum',
    );
    const yawPeak = active.reduce((peak, frame) =>
      Math.abs(frame.hero.state.heading) > Math.abs(peak.hero.state.heading)
        ? frame
        : peak,
    );
    assert.ok(
      yawPeak.hero.state.speed >= 90,
      'the maximum visible turn still carries at least 324 km/h',
    );
    assert.equal(
      active.some(
        (frame) =>
          ['turn', 'countersteer'].includes(frame.hero.effects.slide.phase) &&
          frame.hero.input.brake > 0,
      ),
      false,
      'wheel braking follows the high-speed turn and countersteer',
    );
    const last = run.frames.at(-1).hero;
    assert.ok(
      Math.abs(last.state.heading) < 0.01 &&
        Math.abs(last.state.lateralSpeed) < 0.5,
    );
    assert.equal(
      run.events.some(
        (event) =>
          event.time > finishTime &&
          ['impact', 'road-departure', 'road-recovery'].includes(event.type),
      ),
      false,
    );
  }
});

test('missing, reversed or prefinish slide anchors reject a stale recording', () => {
  const original = records.get('shrike');
  for (const change of [
    (run) => {
      delete run.landmarks.slideEndTime;
    },
    (run) => {
      run.landmarks.slideStartTime = run.landmarks.finishTime - 0.1;
    },
    (run) => {
      run.landmarks.slidePeakTime = run.landmarks.slideEndTime + 0.1;
    },
  ]) {
    const run = structuredClone(original);
    change(run);
    assert.throws(() => validateCompletionRun(run, { shipId: 'shrike' }));
  }
});
