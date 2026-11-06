import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
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

await mkdir(directory, { recursive: true });
const track = createLevel().createTrack();
const entries = {};
for (const shipId of COMPLETION_SHIPS) {
  const run = await generateCompletionRun({ track, shipId });
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
  };
  console.log(
    `Captured ${shipId}: ${compressed.length} bytes; actual hero finish ${run.landmarks.finishTime.toFixed(6)}s.`,
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
