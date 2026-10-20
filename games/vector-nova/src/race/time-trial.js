// Player records are pose trajectories, never developer input logs. Changing
// the rules or physics identity starts a separate record and ghost namespace.
export const TRIAL_RULES =
  'time-trial-v1:rest-center-seed7:boost-regen:no-devices:assist0.3';
export const LAP_TRIAL_RULES =
  'time-trial-v2:continuous-laps:rest-center-seed7:boost-regen:no-devices:assist0.3';
export const GHOST_VERSION = 1;
const MAX_SECONDS = 1200;
const MAX_SAMPLES = MAX_SECONDS * 10 + 2;
const memory = new Map();
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const copy = (v) => structuredClone(v);
const delta = (time, reference) =>
  (Math.round(time * 1000) - Math.round(reference * 1000)) / 1000;
const keyFor = (identity) => {
  const text = JSON.stringify(identity);
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `vector-nova.trial.v1.${(hash >>> 0).toString(16)}`;
};
function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
export function trialIdentity({ track, ship, version, runtime }) {
  return {
    rules: track.closed === false ? TRIAL_RULES : LAP_TRIAL_RULES,
    track: track.id,
    version,
    geometry: track.geometryVersion ?? null,
    length: track.length,
    checkpoints: track.checkpoints.map((p) => p.distance ?? p.s),
    ship: { id: ship.id, version: ship.version },
    runtime,
    format: track.closed === false ? 'sprint' : 'circuit',
    finish: track.closed === false ? track.finishDistance : track.length,
    laps: 1,
    physics: 3,
    ...(track.closed === false ? {} : { start: 'standing' }),
  };
}
export function encodeGhost(source) {
  // The terminal crossing can be less than one float32 ULP after a sample.
  // Coalesce in the encoded time domain so a saved trajectory remains valid.
  const samples = [];
  for (const sample of source) {
    const next = [Math.fround(sample[0]), ...sample.slice(1)];
    if (samples.length && next[0] === samples.at(-1)[0])
      samples[samples.length - 1] = next;
    else samples.push(next);
  }
  const bytes = new Uint8Array(samples.length * 32);
  const view = new DataView(bytes.buffer);
  samples.forEach((s, i) =>
    s.forEach((v, j) => view.setFloat32(i * 32 + j * 4, v, true)),
  );
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return {
    version: GHOST_VERSION,
    encoding: 'f32le-txyzxyzw',
    data: btoa(raw),
  };
}
export function decodeGhost(ghost, duration) {
  try {
    if (
      ghost?.version !== GHOST_VERSION ||
      ghost.encoding !== 'f32le-txyzxyzw' ||
      typeof ghost.data !== 'string' ||
      ghost.data.length > MAX_SAMPLES * 44
    )
      return null;
    const raw = atob(ghost.data);
    if (raw.length % 32 || raw.length < 64 || raw.length > MAX_SAMPLES * 32)
      return null;
    const view = new DataView(
      Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer,
    );
    const samples = Array.from({ length: raw.length / 32 }, (_, i) =>
      Array.from({ length: 8 }, (_, j) =>
        view.getFloat32(i * 32 + j * 4, true),
      ),
    );
    if (
      samples[0][0] !== 0 ||
      Math.abs(samples.at(-1)[0] - duration) > 0.001 ||
      samples.some(
        (s, i) =>
          !s.every(finite) ||
          s.slice(1, 4).some((n) => Math.abs(n) > 1e7) ||
          Math.abs(Math.hypot(...s.slice(4)) - 1) > 0.01 ||
          (i > 0 &&
            (s[0] <= samples[i - 1][0] || s[0] - samples[i - 1][0] > 0.12)),
      )
    )
      return null;
    return samples;
  } catch {
    return null;
  }
}
export function readTrialBest(identity, store = storage()) {
  const key = keyFor(identity);
  let data = memory.get(key);
  try {
    const raw = store?.getItem(key);
    if (raw && !data) data = JSON.parse(raw);
  } catch {
    /* Corrupt/disabled storage cannot prevent driving. */
  }
  if (
    !data ||
    JSON.stringify(data.identity) !== JSON.stringify(identity) ||
    data.version !== 1 ||
    !finite(data.duration) ||
    data.duration <= 0 ||
    !Array.isArray(data.laps) ||
    data.laps.length !== identity.laps ||
    data.laps.some((n) => !finite(n) || n <= 0) ||
    Math.abs(data.laps.reduce((a, b) => a + b, 0) - data.duration) > 0.001 ||
    !Array.isArray(data.splits) ||
    data.splits.length !== identity.laps * 3 ||
    data.splits.some((n, i) => !finite(n) || n <= (data.splits[i - 1] ?? 0)) ||
    Math.abs(data.splits.at(-1) - data.duration) > 0.001
  )
    return null;
  return { ...copy(data), samples: decodeGhost(data.ghost, data.duration) };
}
// Browsing records must not build tracks/worlds. Keep every exact rules profile
// separate; only the race runtime can confirm full compatibility at launch.
export function readTrialRecords(store = storage()) {
  const entries = new Map();
  try {
    for (let i = 0; i < store?.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith('vector-nova.trial.v1.')) continue;
      try {
        entries.set(key, JSON.parse(store.getItem(key)));
      } catch {
        /* Skip corrupt entries. */
      }
    }
  } catch {
    /* Disabled storage still permits page-session records. */
  }
  for (const [key, record] of memory) entries.set(key, record);
  const records = [];
  for (const [key, data] of entries) {
    const id = data?.identity;
    if (
      !id ||
      typeof id.track !== 'string' ||
      typeof id.ship?.id !== 'string' ||
      typeof id.rules !== 'string' ||
      !['sprint', 'circuit'].includes(id.format) ||
      !(id.format === 'sprint'
        ? id.laps === 1
        : (id.laps === 3 && !id.start) ||
          (id.laps === 1 && ['standing', 'flying'].includes(id.start))) ||
      keyFor(id) !== key
    )
      continue;
    const best = readTrialBest(id, store);
    if (!best) continue;
    let persisted = null;
    try {
      persisted = JSON.parse(store?.getItem(key) ?? 'null');
    } catch {
      /* Optional storage. */
    }
    const saved =
      persisted?.duration === best.duration &&
      JSON.stringify(persisted?.identity) === JSON.stringify(id);
    records.push({
      key,
      identity: copy(id),
      duration: best.duration,
      laps: best.laps,
      ghost: Boolean(best.samples),
      saved,
      ghostSaved:
        saved && Boolean(decodeGhost(persisted?.ghost, best.duration)),
    });
  }
  return records;
}

function saveBest(record, store) {
  const key = keyFor(record.identity);
  memory.set(key, copy(record));
  try {
    if (!store) throw new Error('No storage');
    store.setItem(key, JSON.stringify(record));
    return { saved: true, ghostSaved: Boolean(record.ghost) };
  } catch {
    try {
      if (!store) throw new Error('No storage');
      store.setItem(key, JSON.stringify({ ...record, ghost: null }));
      return { saved: true, ghostSaved: false };
    } catch {
      return { saved: false, ghostSaved: false };
    }
  }
}
export function createTimeTrial({ identity, race, store = storage() }) {
  const sprint = identity.format === 'sprint';
  const identities = sprint
    ? { sprint: identity }
    : { standing: identity, flying: { ...identity, start: 'flying' } };
  const bests = Object.fromEntries(
    Object.entries(identities).map(([start, id]) => [
      start,
      readTrialBest(id, store),
    ]),
  );
  let start = sprint ? 'sprint' : 'standing';
  let best = bests[start];
  // A fresh driver's first completed lap supplies lap two's ghost. Once a
  // flying best exists, only that category is used for flying comparisons.
  let reference = best;
  let samples = [],
    overflow = false,
    result = null,
    lastLap = null;
  let lap = race.lap,
    previous = null,
    persistence = null;
  const perLap = identity.checkpoints.length - (sprint ? 1 : 0);
  const gates = [
    Math.max(1, Math.floor(perLap / 3)),
    Math.max(2, Math.floor((perLap * 2) / 3)),
    perLap,
  ];
  const sectors = (splits) =>
    gates.filter((n) => n <= splits.length).map((n) => splits[n - 1]);
  function captureSample(pose, t, force = false) {
    if (t > MAX_SECONDS || samples.length >= MAX_SAMPLES) overflow = true;
    if (
      !overflow &&
      pose &&
      (!samples.length || t - samples.at(-1)[0] >= 0.1 - 1e-6 || force) &&
      (!samples.length || t > samples.at(-1)[0])
    ) {
      samples.push([
        t,
        ...pose.position.toArray(),
        ...pose.quaternion.toArray(),
      ]);
    }
  }
  function finish(duration, valid, splits) {
    const improved = valid && (!best || delta(duration, best.duration) < 0);
    const record = {
      version: 1,
      identity: identities[start],
      duration,
      laps: [duration],
      splits: sectors(splits),
      ghost:
        improved && !overflow && samples.length >= 2
          ? encodeGhost(samples)
          : null,
    };
    const saved = improved ? saveBest(record, store) : null;
    const completed = {
      mode: 'time-trial',
      shipId: identity.ship.id,
      laps: 1,
      format: identity.format,
      start,
      lap,
      playerValid: valid,
      playerTotalTime: duration,
      playerLapTimes: record.laps,
      standings: [],
      splits: record.splits,
      previousBest: best?.duration ?? null,
      bestTime: improved ? duration : (best?.duration ?? null),
      splitDeltas: record.splits.map((v, i) =>
        best ? delta(v, best.splits[i]) : null,
      ),
      delta: best ? delta(duration, best.duration) : null,
      improved,
      saved,
      ghostAvailable: improved ? Boolean(record.ghost) : Boolean(best?.samples),
    };
    if (improved) {
      bests[start] = {
        ...record,
        samples: decodeGhost(record.ghost, duration),
      };
      persistence = saved;
    }
    return completed;
  }
  // Pose sampling straddles a fixed physics step. Split that step at the
  // same interpolated crossing as the timer, sharing its pose at t=0 of the
  // next lap, so neither trajectory includes an extra frame past the line.
  function crossingPose(pose, duration, dt) {
    if (!previous || !dt) return pose;
    const alpha = Math.max(0, Math.min(1, (duration - previous.elapsed) / dt));
    return {
      position: previous.position.clone().lerp(pose.position, alpha),
      quaternion: previous.quaternion.clone().slerp(pose.quaternion, alpha),
    };
  }
  return {
    get best() {
      return best;
    },
    get reference() {
      return reference;
    },
    get result() {
      return result;
    },
    capture(pose, dt = 0) {
      if (result) return result;
      if (sprint && race.complete) {
        captureSample(crossingPose(pose, race.elapsed, dt), race.elapsed, true);
        result = finish(race.elapsed, race.valid, race.splits);
        return result;
      }
      if (!sprint && race.lap !== lap) {
        const completed = race.history.at(-1);
        const boundary = crossingPose(pose, completed.duration, dt);
        captureSample(boundary, completed.duration, true);
        lastLap = finish(completed.duration, completed.valid, completed.splits);
        lap = race.lap;
        start = 'flying';
        best = bests.flying;
        reference = best ?? bests.standing;
        samples = [];
        overflow = false;
        captureSample(boundary, 0);
      }
      captureSample(pose, race.elapsed);
      previous = {
        elapsed: race.elapsed,
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone(),
      };
      return null;
    },
    snapshot() {
      const current = sectors(race.splits);
      return {
        elapsed: race.elapsed,
        valid: race.valid,
        lap,
        start,
        best: best?.duration ?? null,
        standingBest: bests.standing?.duration ?? null,
        flyingBest: bests.flying?.duration ?? null,
        ghost: Boolean(reference?.samples),
        ghostStart: reference?.identity.start ?? null,
        sector: current.length,
        delta:
          race.valid && current.length && best
            ? delta(current.at(-1), best.splits[current.length - 1])
            : null,
        lastLap,
        persistence,
        result,
      };
    },
  };
}
