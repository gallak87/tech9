import * as T from 'three';
import { assetURL } from '../assets/url.js';
import {
  COMPLETION_CAPTURE,
  COMPLETION_DURATION,
  COMPLETION_SHIPS,
} from './completion-config.js';

export const COMPLETION_RUN_STEP = COMPLETION_CAPTURE.step;
export const COMPLETION_RUN_DURATION = COMPLETION_DURATION;
const ACTOR_IDS = ['hero', 'rook', 'manta'];
const demand = (condition, message) => {
  if (!condition) throw new Error(`Completion replay ${message}.`);
};
const finiteArray = (value, length) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every(Number.isFinite);
// Route tables can differ by a few floating point ulps across supported CPUs.
const sameDistance = (a, b) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5;
function finiteTree(value, depth = 0) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth > 24 || value === undefined) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (Array.isArray(value))
    return value.every((item) => finiteTree(item, depth + 1));
  return (
    typeof value === 'object' &&
    Object.values(value).every((item) => finiteTree(item, depth + 1))
  );
}
export function validateCompletionRun(run, { shipId, track } = {}) {
  demand(COMPLETION_SHIPS.includes(shipId), 'has an unknown selected chassis');
  demand(
    run?.version === COMPLETION_CAPTURE.version,
    'has an incompatible format',
  );
  demand(
    run.identity ===
      `completion-shatterline-native-v2:${COMPLETION_CAPTURE.geometryVersion}:${shipId}`,
    'has an incompatible identity',
  );
  demand(
    run.metadata?.course === COMPLETION_CAPTURE.course &&
      run.metadata.trackId === COMPLETION_CAPTURE.trackId &&
      run.metadata.geometryVersion === COMPLETION_CAPTURE.geometryVersion &&
      run.metadata.hullsId === COMPLETION_CAPTURE.hullsId,
    'uses stale course or hull data',
  );
  demand(
    run.duration === COMPLETION_DURATION && run.step === COMPLETION_RUN_STEP,
    'has an incompatible clock',
  );
  demand(
    Array.isArray(run.actors) &&
      run.actors.length === 3 &&
      run.actors.every((actor, index) => actor.id === ACTOR_IDS[index]),
    'has an incompatible field',
  );
  demand(
    run.actors[0].shipId === shipId &&
      run.actors[0].combatId === 'player' &&
      run.actors[1].shipId === 'kestrel' &&
      run.actors[2].shipId === 'bastion',
    'uses the wrong chassis',
  );
  const anchors = run.landmarks;
  demand(
    anchors?.jumpId === 'horizon-transfer' &&
      [
        anchors.startDistance,
        anchors.weaponDistance,
        anchors.takeoffDistance,
        anchors.landingDistance,
        anchors.finishDistance,
        anchors.firstFireTime,
        anchors.firstHitTime,
        anchors.launchTime,
        anchors.landingTime,
        anchors.finishTime,
      ].every(Number.isFinite),
    'has missing course events',
  );
  demand(
    anchors.startDistance < anchors.weaponDistance &&
      anchors.weaponDistance < anchors.takeoffDistance &&
      anchors.takeoffDistance < anchors.landingDistance &&
      anchors.landingDistance < anchors.finishDistance &&
      anchors.finishDistance < run.metadata.trackLength,
    'has inconsistent route anchors',
  );
  demand(
    anchors.firstFireTime <= anchors.firstHitTime &&
      anchors.firstHitTime < anchors.launchTime &&
      anchors.launchTime < anchors.landingTime &&
      anchors.landingTime < anchors.finishTime &&
      anchors.finishTime < run.duration,
    'has inconsistent event timing',
  );
  if (track) {
    const jump = track.jumps?.find((item) => item.id === anchors.jumpId);
    demand(
      track.id === run.metadata.trackId &&
        track.geometryVersion === run.metadata.geometryVersion &&
        sameDistance(track.length, run.metadata.trackLength) &&
        sameDistance(track.finishDistance, anchors.finishDistance) &&
        jump &&
        sameDistance(jump.takeoff, anchors.takeoffDistance) &&
        sameDistance(jump.landingStart, anchors.landingDistance),
      'does not match the current track',
    );
  }
  demand(
    Array.isArray(run.frames) &&
      run.frames.length === Math.round(run.duration / run.step) + 1,
    'has an incomplete frame count',
  );
  demand(
    Array.isArray(run.events) &&
      run.events.length < 2048 &&
      Array.isArray(run.devices) &&
      run.devices.length === 3,
    'has invalid events or devices',
  );
  demand(finiteTree(run), 'contains invalid numeric data');
  for (const [index, frame] of run.frames.entries()) {
    demand(
      Math.abs(frame.time - index * run.step) < 1e-9 &&
        Array.isArray(frame.events),
      'has an invalid frame clock',
    );
    for (const id of ACTOR_IDS) {
      const actor = frame[id];
      demand(
        actor &&
          finiteArray(actor.position, 3) &&
          finiteArray(actor.quaternion, 4) &&
          Math.abs(
            actor.quaternion.reduce((sum, value) => sum + value * value, 0) - 1,
          ) < 1e-5,
        'has an invalid physical pose',
      );
      demand(
        actor.state?.shipId ===
          run.actors.find((entry) => entry.id === id).shipId &&
          [
            'distance',
            'lateral',
            'speed',
            'heading',
            'steer',
            'energy',
            'time',
          ].every((key) => Number.isFinite(actor.state[key])) &&
          actor.state.resetCount === 0 &&
          typeof actor.grounded === 'boolean' &&
          actor.recovering === false &&
          ['magnetic', 'flight'].includes(actor.motion?.mode) &&
          actor.effects &&
          actor.race,
        'has an invalid racer state',
      );
    }
    demand(
      frame.combat &&
        ['shots', 'flashes', 'wakes'].every((key) =>
          Array.isArray(frame.combat[key]),
        ) &&
        frame.combat.shots.length <= 30 &&
        frame.combat.flashes.length <= 32 &&
        frame.combat.wakes.length <= 256,
      'has invalid combat presentation',
    );
  }
  demand(
    run.outcome?.winner === 'hero' && run.outcome.heroPosition === 1,
    'has an incompatible finish outcome',
  );
  for (const id of ACTOR_IDS) {
    const finishes = run.events.filter(
      (event) => event.actor === id && event.type === 'sprint-complete',
    );
    demand(
      finishes.length === 1 &&
        finishes[0].time === anchors.finishTimes[id] &&
        run.frames.at(-1)[id].race.complete === true,
      'has a missing real finish',
    );
  }
  demand(
    anchors.finishTime === anchors.finishTimes.hero &&
      anchors.finishTime < anchors.finishTimes.rook &&
      anchors.finishTime < anchors.finishTimes.manta,
    'has inconsistent finish order',
  );
  return run;
}
function validateManifest(manifest, shipId) {
  demand(
    manifest?.format === 'vector-nova-completion-native' &&
      manifest.version === 1 &&
      manifest.captureVersion === COMPLETION_CAPTURE.version &&
      manifest.course === COMPLETION_CAPTURE.course &&
      manifest.geometryVersion === COMPLETION_CAPTURE.geometryVersion &&
      manifest.hullsId === COMPLETION_CAPTURE.hullsId &&
      manifest.duration === COMPLETION_DURATION &&
      manifest.step === COMPLETION_RUN_STEP,
    'manifest is incompatible',
  );
  demand(
    Object.keys(manifest.records ?? {})
      .sort()
      .join(',') === [...COMPLETION_SHIPS].sort().join(','),
    'manifest has an incomplete fleet',
  );
  const entry = manifest.records[shipId];
  demand(
    entry?.file === `${shipId}.json.gz` &&
      Number.isSafeInteger(entry.rawBytes) &&
      entry.rawBytes > 0 &&
      entry.rawBytes <= COMPLETION_CAPTURE.maxRawBytes &&
      Number.isSafeInteger(entry.compressedBytes) &&
      entry.compressedBytes > 0 &&
      entry.compressedBytes <= COMPLETION_CAPTURE.maxCompressedBytes &&
      /^[a-f0-9]{64}$/.test(entry.rawSha256) &&
      /^[a-f0-9]{64}$/.test(entry.compressedSha256),
    'manifest has an invalid asset entry',
  );
  return entry;
}
async function boundedBytes(
  response,
  limit,
  signal,
  progress,
  gzipLimit = null,
) {
  signal?.throwIfAborted();
  demand(response.ok, `request failed (${response.status})`);
  const reader = response.body?.getReader();
  demand(reader, 'response has no readable body');
  const chunks = [];
  let length = 0,
    firstByte,
    secondByte;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength) {
        if (firstByte === undefined) {
          firstByte = value[0];
          if (value.byteLength > 1) secondByte = value[1];
        } else if (secondByte === undefined) secondByte = value[0];
      }
      length += value.byteLength;
      const budget =
        gzipLimit !== null && firstByte === 0x1f && secondByte === 0x8b
          ? gzipLimit
          : limit;
      demand(length <= budget, 'asset exceeds its size budget');
      chunks.push(value);
      progress?.(length);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  signal?.throwIfAborted();
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function verifyHash(bytes, expected) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  demand(
    Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join(
      '',
    ) === expected,
    'asset checksum does not match',
  );
}
const parseJSON = (bytes) =>
  JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const yieldLoading = () => new Promise((resolve) => setTimeout(resolve, 0));

// The finale loads one final native recording, never a second simulation/world.
export async function loadCompletionRun({
  shipId,
  track,
  signal,
  onProgress,
} = {}) {
  demand(COMPLETION_SHIPS.includes(shipId), 'has an unknown selected chassis');
  signal?.throwIfAborted();
  const directory = assetURL(COMPLETION_CAPTURE.directory);
  const manifest = parseJSON(
    await boundedBytes(
      await fetch(`${directory}/manifest.json`, { signal }),
      COMPLETION_CAPTURE.maxManifestBytes,
      signal,
    ),
  );
  const entry = validateManifest(manifest, shipId);
  onProgress?.(0.05);
  signal?.throwIfAborted();
  const response = await fetch(`${directory}/${entry.file}`, { signal });
  let bytes = await boundedBytes(
    response,
    entry.rawBytes,
    signal,
    (length) =>
      onProgress?.(0.05 + Math.min(1, length / entry.compressedBytes) * 0.55),
    entry.compressedBytes,
  );
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (gzip) {
    demand(
      bytes.byteLength === entry.compressedBytes &&
        bytes.byteLength <= COMPLETION_CAPTURE.maxCompressedBytes,
      'compressed asset size does not match',
    );
    await verifyHash(bytes, entry.compressedSha256);
    signal?.throwIfAborted();
    demand(
      typeof DecompressionStream === 'function',
      'requires gzip decompression support',
    );
    bytes = await boundedBytes(
      new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
      ),
      entry.rawBytes,
      signal,
      (length) => onProgress?.(0.6 + (length / entry.rawBytes) * 0.25),
    );
  }
  // Some hosts decode Content-Encoding:gzip before fetch exposes the body.
  demand(
    bytes.byteLength === entry.rawBytes,
    'decoded asset size does not match',
  );
  await verifyHash(bytes, entry.rawSha256);
  signal?.throwIfAborted();
  onProgress?.(0.9);
  await yieldLoading();
  signal?.throwIfAborted();
  const run = validateCompletionRun(parseJSON(bytes), { shipId, track });
  demand(
    run.identity === entry.identity && run.frames.length === entry.frames,
    'asset does not match its manifest',
  );
  signal?.throwIfAborted();
  onProgress?.(1);
  return run;
}
// Interpolation only observes two recorded physical endpoint poses. Gameplay
// booleans, flight mode and effects retain their current recorded 120 Hz tick.
export function sampleCompletionRun(run, time) {
  const at = T.MathUtils.clamp(
    Number.isFinite(time) ? time : 0,
    0,
    run.duration,
  );
  let index = Math.min(run.frames.length - 1, Math.floor(at / run.step));
  // Division can round an exact stored tick just below its integer index.
  // Compare recorded timestamps so discrete events/modes never lag a tick.
  while (index > 0 && run.frames[index].time > at) index--;
  while (index < run.frames.length - 1 && run.frames[index + 1].time <= at)
    index++;
  const before = run.frames[index],
    after = run.frames[Math.min(index + 1, run.frames.length - 1)];
  const fraction = T.MathUtils.clamp((at - before.time) / run.step, 0, 1);
  const sample = {
    time: at,
    duration: run.duration,
    combat: before.combat,
    events: before.events,
    outcome: run.outcome,
    eventsThroughTime: run.events.filter((event) => event.time <= at),
  };
  for (const { id } of run.actors) {
    const a = before[id],
      b = after[id];
    sample[id] = {
      ...a,
      position: new T.Vector3()
        .fromArray(a.position)
        .lerp(new T.Vector3().fromArray(b.position), fraction)
        .toArray(),
      quaternion: new T.Quaternion()
        .fromArray(a.quaternion)
        .slerp(new T.Quaternion().fromArray(b.quaternion), fraction)
        .toArray(),
      state: { ...a.state },
      distance: a.state.distance,
      lateral: a.state.lateral,
      speed: a.state.speed,
      heading: a.state.heading,
      steer: a.state.steer,
      boost: a.state.boosting,
      energy: a.state.energy,
    };
  }
  return sample;
}
