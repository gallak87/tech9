// Player records are pose trajectories, never developer input logs. Changing
// the rules or physics identity starts a separate record and ghost namespace.
export const TRIAL_RULES =
  'time-trial-v1:rest-center-seed7:boost-regen:no-devices:assist0.3';
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
    rules: TRIAL_RULES,
    track: track.id,
    version,
    geometry: track.geometryVersion ?? null,
    length: track.length,
    checkpoints: track.checkpoints.map((p) => p.distance ?? p.s),
    ship: { id: ship.id, version: ship.version },
    runtime,
    format: track.closed === false ? 'sprint' : 'circuit',
    finish: track.closed === false ? track.finishDistance : track.length,
    laps: track.closed === false ? 1 : 3,
    physics: 3,
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
      id.laps !== (id.format === 'sprint' ? 1 : 3) ||
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
  const best = readTrialBest(identity, store);
  const samples = [];
  const perLap =
    identity.checkpoints.length - (identity.format === 'sprint' ? 1 : 0);
  const gates = [
    Math.max(1, Math.floor(perLap / 3)),
    Math.max(2, Math.floor((perLap * 2) / 3)),
    perLap,
  ];
  const splitIndices = Array.from({ length: identity.laps }, (_, lap) =>
    gates.map((gate) => lap * perLap + gate - 1),
  ).flat();
  let overflow = false,
    result = null;
  const splits = () =>
    splitIndices
      .filter((i) => i < race.splits.length)
      .map((i) => race.splits[i]);
  return {
    best,
    get result() {
      return result;
    },
    capture(pose) {
      if (result) return result;
      const t = race.totalElapsed;
      if (t > MAX_SECONDS || samples.length >= MAX_SAMPLES) overflow = true;
      if (
        !overflow &&
        pose &&
        (!samples.length ||
          t - samples.at(-1)[0] >= 0.1 - 1e-6 ||
          race.complete)
      ) {
        if (!samples.length || t > samples.at(-1)[0])
          samples.push([
            t,
            ...pose.position.toArray(),
            ...pose.quaternion.toArray(),
          ]);
      }
      if (!race.complete) return null;
      const valid = race.history.every((lap) => lap.valid);
      const improved = valid && (!best || delta(t, best.duration) < 0);
      const record = {
        version: 1,
        identity,
        duration: t,
        laps: race.history.map((lap) => lap.duration),
        splits: splits(),
        ghost: !overflow && samples.length >= 2 ? encodeGhost(samples) : null,
      };
      const saved = improved ? saveBest(record, store) : null;
      result = {
        mode: 'time-trial',
        shipId: identity.ship.id,
        laps: identity.laps,
        format: identity.format,
        playerValid: valid,
        playerTotalTime: t,
        playerLapTimes: record.laps,
        standings: [],
        splits: record.splits,
        previousBest: best?.duration ?? null,
        bestTime: improved ? t : (best?.duration ?? null),
        splitDeltas: record.splits.map((v, i) =>
          best ? delta(v, best.splits[i]) : null,
        ),
        delta: best ? delta(t, best.duration) : null,
        improved,
        saved,
        ghostAvailable: improved
          ? Boolean(record.ghost)
          : Boolean(best?.samples),
      };
      return result;
    },
    snapshot() {
      const current = splits();
      return {
        elapsed: race.totalElapsed,
        valid: race.valid && race.history.every((lap) => lap.valid),
        best: best?.duration ?? null,
        ghost: Boolean(best?.samples),
        sector: current.length,
        delta:
          current.length && best
            ? delta(current.at(-1), best.splits[current.length - 1])
            : null,
        result,
      };
    },
  };
}
