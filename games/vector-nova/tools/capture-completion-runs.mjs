import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import * as T from 'three';
import { getCollisionHull } from '../src/ships/collision-hulls.js';
import createLevel from '../src/levels/shatterline/index.js';
import { generateCompletionRun } from './completion-capture.mjs';
import {
  COMPLETION_CAPTURE,
  COMPLETION_DURATION,
  COMPLETION_SHIPS,
} from '../src/frontend/completion-config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'public', COMPLETION_CAPTURE.directory);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function sources(file, retained = new Map()) {
  if (retained.has(file)) return retained;
  const text = await readFile(file, 'utf8');
  retained.set(file, sha256(text));
  for (const match of text.matchAll(
    /\b(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g,
  )) {
    const name = match[1];
    let resolved;
    if (name.startsWith('.')) resolved = path.resolve(path.dirname(file), name);
    else if (name.startsWith('@worldkit/'))
      resolved = createRequire(file).resolve(name);
    if (resolved?.endsWith('.js') || resolved?.endsWith('.mjs'))
      await sources(resolved, retained);
  }
  return retained;
}

function prefix(run) {
  const crossingTick =
    Math.ceil(run.landmarks.finishTime / run.step) * run.step;
  return JSON.stringify({
    frames: run.frames.filter((frame) => frame.time <= crossingTick + 1e-9),
    events: run.events.filter((event) => event.time <= crossingTick + 1e-9),
  });
}
function validateSlide(run, track) {
  const frames = run.frames.filter(
    (frame) => frame.time > run.landmarks.finishTime,
  );
  const active = frames.filter((frame) => frame.hero.effects.slide?.active);
  assert.ok(active.length > 0);
  const crossing = run.frames.find(
    (frame) => frame.time >= run.landmarks.finishTime,
  );
  const yawPeak = active.reduce((peak, frame) =>
    Math.abs(frame.hero.state.heading) > Math.abs(peak.hero.state.heading)
      ? frame
      : peak,
  );
  assert.ok(
    active[0].hero.state.speed >= crossing.hero.state.speed * 0.9,
    'the turn begins with the genuine racing momentum, without preparatory braking',
  );
  assert.ok(
    yawPeak.hero.state.speed >= 90,
    'the visible body turn still carries at least 324 km/h',
  );
  const peakYaw = Math.max(
    ...active.map((frame) => Math.abs(frame.hero.state.heading)),
  );
  assert.ok(
    peakYaw >= (18 * Math.PI) / 180 && peakYaw <= (35 * Math.PI) / 180,
    'the native post-checker yaw is clearly visible',
  );
  assert.ok(
    run.duration - run.landmarks.slideEndTime >= 0.8,
    'the actual slide settles before the closing title',
  );
  assert.ok(run.landmarks.slideStartTime > run.landmarks.finishTime);
  assert.ok(run.landmarks.slideEndTime < run.duration);
  assert.ok(
    run.landmarks.slidePeakTime >= run.landmarks.slideStartTime &&
      run.landmarks.slidePeakTime < run.landmarks.slideEndTime,
  );
  assert.ok(
    Math.min(
      ...frames.map((frame) => frame.hero.effects.slide?.clearance ?? Infinity),
    ) > 4,
  );
  assert.ok(
    frames.every((frame) => frame.hero.grounded && !frame.hero.recovering),
  );
  assert.equal(
    run.events.some(
      (event) =>
        event.time > run.landmarks.finishTime &&
        ['impact', 'road-departure', 'road-recovery'].includes(event.type),
    ),
    false,
  );
  assert.ok(Math.abs(run.frames.at(-1).hero.state.heading) < 0.01);
  assert.ok(Math.abs(run.frames.at(-1).hero.state.lateralSpeed) < 0.5);
  const basis = track.sample(track.finishDistance);
  const axes = [basis.right, basis.up, basis.tangent];
  const vertex = new T.Vector3(),
    quaternion = new T.Quaternion();
  const bounds = (actor) => {
    const result = axes.map(() => [Infinity, -Infinity]);
    const vertices = getCollisionHull(actor.state.chassisId).vertices;
    quaternion.fromArray(actor.quaternion);
    for (let i = 0; i < vertices.length; i += 3) {
      vertex
        .fromArray(vertices, i)
        .applyQuaternion(quaternion)
        .add(new T.Vector3().fromArray(actor.position));
      axes.forEach((axis, index) => {
        const value = vertex.dot(axis);
        result[index][0] = Math.min(result[index][0], value);
        result[index][1] = Math.max(result[index][1], value);
      });
    }
    return result;
  };
  for (const frame of frames) {
    const hulls = Object.fromEntries(
      run.actors.map(({ id }) => [id, bounds(frame[id])]),
    );
    for (const [a, b] of [
      ['hero', 'rook'],
      ['hero', 'manta'],
      ['rook', 'manta'],
    ])
      assert.ok(
        axes.some(
          (_, axis) =>
            hulls[a][axis][1] < hulls[b][axis][0] ||
            hulls[b][axis][1] < hulls[a][axis][0],
        ),
        'post-finish native hull envelopes remain separate',
      );
  }
  return {
    start: run.landmarks.slideStartTime,
    entrySpeed: active[0].hero.state.speed,
    peak: run.landmarks.slidePeakTime,
    speedAtPeakYaw: yawPeak.hero.state.speed,
    end: run.landmarks.slideEndTime,
    peakYaw: Math.max(
      ...active.map((frame) => Math.abs(frame.hero.state.heading)),
    ),
    peakSlip: Math.max(
      ...active.map((frame) => Math.abs(frame.hero.effects.slide.slipAngle)),
    ),
    peakSlipSpeed: Math.max(
      ...active.map((frame) => Math.abs(frame.hero.effects.slide.slipSpeed)),
    ),
    minClearance: Math.min(
      ...frames.map((frame) => frame.hero.effects.slide?.clearance ?? Infinity),
    ),
  };
}

await mkdir(directory, { recursive: true });
const track = createLevel().createTrack();
const entries = {};
for (const shipId of COMPLETION_SHIPS) {
  const previous = JSON.parse(
    gunzipSync(
      await readFile(path.join(directory, `${shipId}.json.gz`)),
    ).toString('utf8'),
  );
  const run = await generateCompletionRun({ track, shipId });
  assert.equal(
    prefix(run),
    prefix(previous),
    'all native poses, controls and events through the real checker stay byte-equivalent',
  );
  const slide = validateSlide(run, track);
  assert.equal(run.duration, COMPLETION_DURATION);
  assert.equal(run.metadata.hullsId, COMPLETION_CAPTURE.hullsId);
  assert.equal(
    run.metadata.geometryVersion,
    COMPLETION_CAPTURE.geometryVersion,
  );
  assert.equal(run.outcome.winner, 'hero');
  assert.equal(run.outcome.heroPosition, 1);
  for (const actor of run.actors) {
    assert.ok(Number.isFinite(run.landmarks.finishTimes[actor.id]));
    assert.ok(
      run.events.some(
        (event) =>
          event.actor === actor.id &&
          event.type === 'jump-transfer' &&
          event.payload.outcome === 'landed',
      ),
    );
    assert.equal(run.frames.at(-1)[actor.id].state.resetCount, 0);
    assert.equal(run.frames.at(-1)[actor.id].race.complete, true);
  }
  assert.equal(
    run.events.some((event) =>
      ['jump-miss', 'road-recovery'].includes(event.type),
    ),
    false,
  );
  const raw = Buffer.from(JSON.stringify(run));
  const compressed = gzipSync(raw, { level: 9 });
  assert.ok(raw.length <= COMPLETION_CAPTURE.maxRawBytes);
  assert.ok(compressed.length <= COMPLETION_CAPTURE.maxCompressedBytes);
  const file = `${shipId}.json.gz`;
  await writeFile(path.join(directory, file), compressed);
  entries[shipId] = {
    file,
    rawBytes: raw.length,
    compressedBytes: compressed.length,
    rawSha256: sha256(raw),
    compressedSha256: sha256(compressed),
    identity: run.identity,
    frames: run.frames.length,
    finishTimes: run.landmarks.finishTimes,
    preFinishSha256: sha256(prefix(run)),
    slide,
  };
  console.log(
    JSON.stringify({
      shipId,
      compressedBytes: compressed.length,
      finish: run.landmarks.finishTime,
      slide,
    }),
  );
}
const provenance = await sources(
  fileURLToPath(new URL('./completion-capture.mjs', import.meta.url)),
);
const sourceFiles = Object.fromEntries(
  [...provenance]
    .map(([file, hash]) => [
      path.relative(root, file).replaceAll(path.sep, '/'),
      hash,
    ])
    .sort(([a], [b]) => a.localeCompare(b)),
);
sourceFiles['tools/capture-completion-runs.mjs'] = sha256(
  await readFile(new URL('./capture-completion-runs.mjs', import.meta.url)),
);
const packageJSON = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const manifest = {
  format: 'vector-nova-completion-native',
  version: 1,
  captureVersion: COMPLETION_CAPTURE.version,
  course: COMPLETION_CAPTURE.course,
  geometryVersion: track.geometryVersion,
  hullsId: COMPLETION_CAPTURE.hullsId,
  duration: COMPLETION_DURATION,
  step: COMPLETION_CAPTURE.step,
  route: {
    trackId: track.id,
    length: track.length,
    finishDistance: track.finishDistance,
    jumpId: 'horizon-transfer',
    takeoffDistance: track.jumps.at(-1).takeoff,
    landingDistance: track.jumps.at(-1).landingStart,
  },
  provenance: {
    generator: 'tools/capture-completion-runs.mjs',
    dependencies: {
      three: packageJSON.dependencies.three,
      rapier: packageJSON.dependencies['@dimforge/rapier3d-compat'],
    },
    sourceFiles,
  },
  records: entries,
};
const json = JSON.stringify(manifest, null, 2) + '\n';
assert.ok(Buffer.byteLength(json) <= COMPLETION_CAPTURE.maxManifestBytes);
await writeFile(path.join(directory, 'manifest.json'), json);
console.log(
  'Wrote the four final native records and deterministic provenance manifest.',
);
