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
  if (track.id !== 'saffron-wide-leviathan')
    throw new Error('Saffron Wide runtime requires its authored fossil route.');
  // Headless callers use the same per-track factory; live core supplies it once.
  context = {
    ...context,
    collisionWorld:
      context.collisionWorld ?? createSaffronCollisionWorld({ track }),
  };
  let surfaceId = null,
    sandExposure = 0,
    disposed = false,
    lastEvent = null;
  let grazer = { lap: -1, startedAt: null };
  let localStep = null;
  const runtime = flightModel.createRuntime(context, {
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.dynamics),
    id: 'saffron-wide-sand-flight',
    version: context.dynamics ? 7 : 5,
    rulesId: `saffron-wide-v${context.dynamics ? 7 : 5}:${JSON.stringify({ track: track.id, geometry: track.geometryVersion, jumps: track.jumps, rules: flightModel.rules, sand: 'migrating-four-v1-drag3', grazer: { event: 'forward-breach-v1', trigger: grazerTrigger(track) } })}`,
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
      lastEvent = {
        text: next
          ? 'SAND DRAG · EXPOSED GLASS IS FASTER'
          : 'EXPOSED GLASS · GRIP RESTORED',
        time: state.time,
      };
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
        saffron: { surfaceId, sandExposure, lastEvent, grazer: { ...grazer } },
      };
    },
    restore(snapshot) {
      runtime.restore(snapshot);
      localStep = null;
      surfaceId = snapshot.saffron?.surfaceId ?? null;
      sandExposure = snapshot.saffron?.sandExposure ?? 0;
      lastEvent = snapshot.saffron?.lastEvent ?? null;
      grazer = {
        ...(snapshot.saffron?.grazer ?? { lap: -1, startedAt: null }),
      };
    },
    reset(options) {
      runtime.reset(options);
      localStep = null;
      surfaceId = null;
      sandExposure = 0;
      lastEvent = null;
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
      lastEvent = null;
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
  const status = document.createElement('div');
  status.dataset.saffronStatus = '';
  status.setAttribute('role', 'status');
  Object.assign(status.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: '340px',
    boxSizing: 'border-box',
    color: '#f5e5b6',
    background: 'rgba(45,32,26,.9)',
    border: '1px solid #a58b57',
    padding: '7px 10px',
    font: '600 11px system-ui',
    lineHeight: '1.35',
    letterSpacing: '.03em',
    textAlign: 'center',
    pointerEvents: 'none',
    zIndex: '8',
    display: 'none',
  });
  host.append(status);
  const dust = createSaffronScreenDust(track, host);
  let presentation = {};
  return {
    update(frame) {
      dust.update(frame);
      const { state, mode } = frame;
      const data = activeRuntimes.get(track)?.snapshot();
      if (!data || !state || mode !== 'racing') {
        status.style.display = 'none';
        return;
      }
      const width = globalThis.innerWidth ?? host.clientWidth;
      const height = globalThis.innerHeight ?? host.clientHeight;
      const portrait = width < 600 && height > width;
      const compact = height < 570;
      status.style.top = portrait ? '306px' : compact ? '100px' : '204px';
      status.style.maxWidth = compact ? '190px' : portrait ? '300px' : '340px';
      status.style.padding = compact ? '4px 6px' : '7px 10px';
      let text = '';
      if (data.mode === 'recovery')
        text = data.flight.manualRecovery
          ? 'CONTACT TEST · R TO REPEAT APPROACH'
          : `MISSED LANDING · RECOVERY ${data.flight.remaining.toFixed(1)}s`;
      else if (data.mode === 'flight') text = 'AIRBORNE · LIMITED AIR STEER';
      else if (data.saffron.sandExposure > 0)
        text = 'SAND DRAG · FIND EXPOSED GLASS';
      else if (
        data.saffron.lastEvent &&
        state.time - data.saffron.lastEvent.time < 1.4
      )
        text = data.saffron.lastEvent.text;
      else {
        const distance =
          ((state.distance % track.length) + track.length) % track.length;
        const jump = track.jumps.find(
          (j) => j.takeoff >= distance && j.takeoff - distance < 175,
        );
        if (jump) {
          const remaining = Math.ceil(jump.takeoff - distance);
          text = jump.optional
            ? `DUNE SKIP ${remaining} m · LEFT CREST / RIGHT GLASS`
            : `VERTEBRA ${remaining} m · ${state.speed < 78 ? 'ACCELERATE' : 'HOLD LINE'}`;
        }
      }
      status.textContent = text;
      status.style.display = text ? 'block' : 'none';
      presentation = {
        status: text,
        sandExposure: data.saffron.sandExposure,
        surfaceId: data.saffron.surfaceId,
        flight: data.mode,
      };
    },
    getPresentation: () => ({ ...presentation }),
    reset() {
      status.style.display = 'none';
      dust.reset();
      presentation = {};
    },
    dispose() {
      status.remove();
      dust.dispose();
    },
  };
}
