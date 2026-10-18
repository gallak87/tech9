import { createSaffronScreenDust } from './atmosphere.js';
import { createFlightModel } from '../../physics/flight.js';
import { sampleSaffronDeposits, saffronSandExposure } from './track/sand.js';
import { grazerTrigger } from './grazer.js';
import { createSaffronCollisionWorld } from './collision.js';

export const SAFFRON_RULES = Object.freeze({
  gravity: 26,
  railOffset: {
    'dune-skip': 1.3,
    'first-vertebra': 1.3,
    'second-vertebra': 1.3,
  },
  airAcceleration: 4,
  railHeight: {
    'dune-skip': 2.7,
    'first-vertebra': 2.7,
    'second-vertebra': 2.7,
  },
});
const activeRuntimes = new WeakMap();
const flightModel = createFlightModel(SAFFRON_RULES);

export function createSaffronRuntime(context) {
  const { track } = context;
  if (track.id !== 'saffron-leviathan')
    throw new Error(
      'Saffron Leviathan runtime requires its authored fossil route.',
    );
  // Headless callers use the same per-track factory; live core supplies it once.
  context = {
    ...context,
    collisionWorld:
      context.collisionWorld ?? createSaffronCollisionWorld({ track }),
  };
  let surfaceId = null,
    sandExposure = 0,
    disposed = false;
  let grazer = { lap: -1, startedAt: null };
  let localStep = null;
  const runtime = flightModel.createRuntime(context, {
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.dynamics),
    id: 'saffron-sand-flight',
    version: context.dynamics ? 7 : 5,
    rulesId: `saffron-width40-v${context.dynamics ? 7 : 5}:${JSON.stringify({ track: track.id, geometry: track.geometryVersion, jumps: track.jumps, rules: flightModel.rules, sand: 'migrating-four-v1-drag3', grazer: { event: 'forward-breach-v1', trigger: grazerTrigger(track) } })}`,
    edgeSource: 'saffron-baffle-catch',
    automaticRecovery: context.playtest?.automaticRecovery !== false,
    scenarios: Object.fromEntries(
      Object.entries(track.scenarios).map(([id, state]) => [
        id,
        { label: id.replaceAll('-', ' '), state: { ...state } },
      ]),
    ),
    shouldLaunch: ({ jump, state }) =>
      !jump.optional || state.lateral >= jump.lateralMin,
    groundOptions: ({ state }) => ({
      surface: {
        drag:
          3 *
          saffronSandExposure(track, state.distance, state.lateral, state.time),
      },
    }),
  });
  function finishLocal(state, events, beforeDistance, beforeTime) {
    // Crossing time is interpolated within the simulation tick. Stopping,
    // reversing or leaving the Vista cannot scrub or retrigger the animal.
    const lap = Math.floor(
      (state.distance - grazerTrigger(track)) / track.length,
    );
    const crossing = grazerTrigger(track) + lap * track.length;
    if (
      lap >= 0 &&
      lap > grazer.lap &&
      beforeDistance < crossing &&
      state.distance >= crossing
    ) {
      const fraction =
        (crossing - beforeDistance) / (state.distance - beforeDistance);
      grazer = {
        lap,
        startedAt: beforeTime + (state.time - beforeTime) * fraction,
      };
    }
    const grounded = runtime.snapshot().mode === 'magnetic';
    sandExposure = grounded
      ? saffronSandExposure(track, state.distance, state.lateral, state.time)
      : 0;
    const distance =
      ((state.distance % track.length) + track.length) % track.length;
    const next =
      sandExposure > 0
        ? (sampleSaffronDeposits(track, state.time).find(
            (z) => distance >= z.start && distance <= z.end,
          )?.id ?? null)
        : null;
    if (next !== surfaceId) {
      if (surfaceId)
        events.push({ type: 'sand-exit', payload: { id: surfaceId } });
      if (next)
        events.push({ type: 'sand-enter', payload: { id: next, drag: 3 } });
      surfaceId = next;
    }
    return events;
  }
  const owner = {
    ...runtime,
    advance(state, input, dt, modifiers) {
      if (disposed) return [];
      const beforeDistance = state.distance;
      const beforeTime = state.time;
      const events = runtime.advance(state, input, dt, modifiers);
      return finishLocal(state, events, beforeDistance, beforeTime);
    },
    snapshot() {
      return {
        ...runtime.snapshot(),
        saffron: { surfaceId, sandExposure, grazer: { ...grazer } },
      };
    },
    restore(snapshot) {
      runtime.restore(snapshot);
      localStep = null;
      surfaceId = snapshot.saffron?.surfaceId ?? null;
      sandExposure = snapshot.saffron?.sandExposure ?? 0;
      grazer = {
        ...(snapshot.saffron?.grazer ?? { lap: -1, startedAt: null }),
      };
    },
    reset(options) {
      runtime.reset(options);
      localStep = null;
      surfaceId = null;
      sandExposure = 0;
      if (options?.reason !== 'manual-recover') {
        const state = options?.state ?? { distance: 0, time: 0 };
        const lap = Math.floor(state.distance / track.length);
        const distance = state.distance - lap * track.length;
        const previewAge = { 'burrower-ridge': 1.5, 'burrower-breach': 8 }[
          options?.scenario
        ];
        const inVista =
          distance >= grazerTrigger(track) &&
          distance <= track.landmarks.vistaEnd;
        grazer = {
          lap:
            previewAge !== undefined || distance >= grazerTrigger(track)
              ? lap
              : lap - 1,
          startedAt:
            previewAge !== undefined
              ? state.time - previewAge
              : inVista
                ? state.time
                : null,
        };
      }
    },
    dispose() {
      disposed = true;
      localStep = null;
      if (activeRuntimes.get(track) === owner) activeRuntimes.delete(track);
      runtime.dispose();
      surfaceId = null;
      sandExposure = 0;
    },
  };
  if (runtime.beginAdvance) {
    owner.beginAdvance = (state, input, dt, modifiers) => {
      if (localStep) throw new Error('Finish the pending Saffron step first.');
      localStep = { distance: state.distance, time: state.time };
      runtime.beginAdvance(state, input, dt, modifiers);
    };
    owner.finishAdvance = (state) => {
      if (!localStep)
        throw new Error('Stage the Saffron step before resolving it.');
      const before = localStep;
      const events = runtime.finishAdvance(state);
      localStep = null;
      return finishLocal(state, events, before.distance, before.time);
    };
  }
  if (context.presentation !== false) activeRuntimes.set(track, owner);
  return owner;
}

export function createSaffronOverlay({ track, host }) {
  if (typeof document === 'undefined' || !host?.appendChild)
    return { dispose() {} };
  const dust = createSaffronScreenDust(track, host);
  let presentation = {};
  return {
    update(frame) {
      dust.update(frame);
      const data = activeRuntimes.get(track)?.snapshot();
      presentation = {
        sandExposure: data?.saffron.sandExposure ?? 0,
        surfaceId: data?.saffron.surfaceId ?? null,
        flight: data?.mode,
      };
    },
    getPresentation: () => ({ ...presentation }),
    reset() {
      dust.reset();
      presentation = {};
    },
    dispose() {
      dust.dispose();
    },
  };
}
