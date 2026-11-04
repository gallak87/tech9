import { Vector3 } from 'three';
import { headingExtents } from '../../physics/hull.js';
import { createFlightModel } from '../../physics/flight.js';
import {
  installRavelWaves,
  RAVEL_WAVE_RULES,
  ravelJumpLaneBounds,
  ravelWaveTimeForPhase,
  sampleRavelSurface,
  sampleRavelWave,
} from './waves.js';

export const RAVEL_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  timeout: 9,
  missBelow: 100,
  missBeyond: 120,
  missLateral: 160,
  airAcceleration: 4,
  airYaw: 0.16,
  pitchTolerance: 1.1,
});
export const RAVEL_PLAYTEST_CASES = Object.freeze(
  [
    ['wave-approach', 'Moving sail · centre wave'],
    ['wave-seam', 'Moving sail · steady seam'],
    ['ascent-wave', 'Ascent bowl · moving swell'],
    ['fan-wave', 'Fork approach · moving swell'],
    ['crest-rising', 'Crest Skip · favourable wave'],
    ['crest-falling', 'Crest Skip · adverse wave'],
    ['crest-safe', 'Crest Skip · supported bypass'],
    ['braid-inner', 'Braided sails · short inner path'],
    ['braid-middle', 'Braided sails · wave path'],
    ['braid-outer', 'Braided sails · long boost path'],
    ['outer-transfer-approach', 'Outer sail · gap approach'],
    ['anchor-gulf-approach', 'Sundiver · giant jump approach'],
    ['anchor-gulf-launch', 'Sundiver · nominal launch'],
    ['anchor-gulf-short', 'Sundiver · slow launch / miss'],
    ['anchor-gulf-landing', 'Sundiver · receiving descent'],
  ].map(([id, label]) => Object.freeze({ id, label, scenario: id })),
);
const model = createFlightModel(RAVEL_FLIGHT_RULES);
const wrapTime = (time, period) => ((time % period) + period) % period;

/** A physical hole always releases support; wave phase never gates launch. */
export function ravelShouldLaunch(track, { jump, state }) {
  if (!jump.optional) return true;
  const { min, max } = ravelJumpLaneBounds(track, jump);
  const inset = headingExtents(state.heading ?? 0).lateral + 0.15;
  return state.lateral >= min + inset && state.lateral <= max - inset;
}

/** Add only the membrane's own velocity, never a target-seeking jump force. */
export function ravelCrestLaunch(track, jump, state, time = state.time) {
  if (!(jump.lane === 'crest' || jump.id.includes('crest')))
    return new Vector3();
  const wave = sampleRavelWave(track, jump.takeoff, state.lateral, time);
  return track
    .sample(jump.takeoff)
    .up.clone()
    .multiplyScalar(wave.materialVelocity);
}

function createScenarios(track) {
  const scenarios = Object.fromEntries(
    Object.entries(track.scenarios ?? {}).map(([id, state]) => [
      id,
      { label: id.replaceAll('-', ' '), state: { ...state } },
    ]),
  );
  const first = track.waveZones[0];
  if (first) {
    scenarios['wave-approach'] = {
      label: 'Moving sail · centre wave',
      state: {
        distance: first.start + 5,
        lateral: 30,
        speed: 125,
        time: 0,
      },
    };
    scenarios['wave-seam'] = {
      label: 'Moving sail · steady seam',
      state: {
        distance: first.start + 5,
        lateral: -35,
        speed: 125,
        time: 0,
      },
    };
  }
  for (const [id, zoneId] of [
    ['ascent-wave', 'ascent-swell'],
    ['fan-wave', 'fan-swell'],
  ]) {
    const zone = track.waveZones.find((entry) => entry.id === zoneId);
    if (!zone) continue;
    scenarios[id] = {
      label: RAVEL_PLAYTEST_CASES.find((entry) => entry.id === id).label,
      state: { distance: zone.start + 5, lateral: 30, speed: 125, time: 0 },
    };
  }
  const crest = track.jumps.find(
    (jump) => jump.lane === 'crest' || jump.id.includes('crest'),
  );
  if (crest) {
    const zone = track.waveZones.find(
      (entry) => crest.takeoff >= entry.start && crest.takeoff <= entry.end,
    );
    const period =
      (zone?.wavelength ?? RAVEL_WAVE_RULES.wavelength) /
      Math.abs(zone?.speed ?? RAVEL_WAVE_RULES.speed);
    for (const [id, phase, label] of [
      ['crest-rising', -Math.PI / 2, 'Crest Skip · favourable wave'],
      ['crest-falling', Math.PI / 2, 'Crest Skip · adverse wave'],
    ]) {
      const runway = 75;
      const speed = 135;
      const arrival = ravelWaveTimeForPhase(track, crest.takeoff, phase, 30);
      scenarios[id] = {
        label,
        state: {
          distance: crest.takeoff - runway,
          lateral: 30,
          speed,
          time: wrapTime(arrival - runway / speed, period),
        },
      };
    }
    scenarios['crest-safe'] = {
      label: 'Crest Skip · supported bypass',
      state: {
        distance: crest.takeoff - 90,
        lateral: -35,
        speed: 125,
        time: 0,
      },
    };
  }
  const giant = track.jumps.find((jump) => jump.hero);
  if (giant) {
    for (const [id, distance, speed] of [
      ['anchor-gulf-approach', giant.takeoff - 230, 145],
      ['anchor-gulf-launch', giant.takeoff - 0.1, giant.targetSpeed ?? 160],
      ['anchor-gulf-short', giant.takeoff - 0.1, 75],
      ['anchor-gulf-landing', giant.landingStart + 25, 135],
    ])
      scenarios[id] = {
        label: RAVEL_PLAYTEST_CASES.find((entry) => entry.id === id).label,
        state: {
          distance,
          lateral: 0,
          speed,
          time: 0,
        },
      };
  }
  return scenarios;
}

/** Each motion adapter has a private clock; rivals never mutate player geometry. */
export function createRavelRuntime(context) {
  const track = context.track;
  if (!track.surfaceAtTime) installRavelWaves(track);
  const player = context.presentation !== false;
  let clock = 0;
  let previousClock = 0;
  let driver = null;
  let pending = false;
  let disposed = false;
  const privateTrack = Object.create(track);
  privateTrack.sampleSurface = (s, x = 0) => {
    const surface = sampleRavelSurface(track, s, x, clock);
    // The shared controller first solves the complete magnetic tick, then
    // releases at a crossed lip. Keep only that tick's mathematical departure
    // chart until the flight adapter can release it. The next tick is free
    // flight; this never supplies support along an empty branch.
    if (driver) {
      const from =
        ((driver.distance % track.length) + track.length) % track.length;
      const to = ((s % track.length) + track.length) % track.length;
      const crossing = track.jumps.find(
        (jump) =>
          jump.optional &&
          from <= jump.takeoff &&
          from >= jump.takeoff - 10 &&
          to > jump.takeoff &&
          to < jump.landingStart &&
          ravelShouldLaunch(track, { jump, state: driver }),
      );
      if (crossing) {
        const lane = ravelJumpLaneBounds(track, crossing);
        return {
          ...surface,
          bounds: {
            min: Math.min(surface.bounds?.min ?? lane.min, lane.min),
            max: Math.max(surface.bounds?.max ?? lane.max, lane.max),
          },
        };
      }
    }
    return surface;
  };
  const syncPresentation = (time = clock) => {
    if (player) track.presentationTime = time;
  };
  const flight = model.createRuntime(
    { ...context, track: privateTrack },
    {
      id: 'ravel-flexible-sail',
      version: 1,
      rulesId: `ravel-greybox-v1:${JSON.stringify({
        geometry: track.geometryVersion,
        branches: track.branchRulesId,
        branchDimensions: track.ravelBranches,
        mainHalfWidth: track.roadHalfWidth,
        pace: track.pace,
        waves: track.waveZones,
        waveRules: RAVEL_WAVE_RULES,
        jumps: track.jumps,
        flight: model.rules,
      })}`,
      groundOptions: () => ({ pace: track.pace }),
      shouldLaunch: (args) => ravelShouldLaunch(track, args),
      launchImpulse: ({ jump, state, time }) =>
        ravelCrestLaunch(track, jump, state, time),
      supportHeight: 0.045,
      forgivingContacts: true,
      automaticRecovery: context.playtest?.automaticRecovery !== false,
      testLaunch: Boolean(context.playtest),
    },
  );
  const remember = (state) => {
    clock = state.time;
    driver = { ...state };
    syncPresentation();
  };
  const runtime = {
    ...flight,
    scenarios: createScenarios(track),
    avoidance() {
      if (!driver) return null;
      const s =
        ((driver.distance % track.length) + track.length) % track.length;
      const crest = track.jumps.find(
        (jump) =>
          jump.optional && (jump.lane === 'crest' || jump.id.includes('crest')),
      );
      if (crest && s >= crest.takeoff - 220 && s <= crest.landingStart + 60)
        return -35;
      return track.preferredBranchLane?.(driver) ?? null;
    },
    advance(state, input, dt, modifiers) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      const elapsed = Math.min(dt, 0.1);
      const count = Math.ceil(elapsed * 120 - 1e-10);
      const step = elapsed / count;
      const events = [];
      for (let i = 0; i < count; i++) {
        if (flight.beginAdvance) {
          runtime.beginAdvance(state, input, step, modifiers);
          context.dynamics.step(step);
          events.push(...runtime.finishAdvance(state));
        } else {
          previousClock = state.time;
          clock = state.time + step;
          events.push(...flight.advance(state, input, step, modifiers));
          remember(state);
        }
      }
      return events;
    },
    reset(args = {}) {
      if (pending) pending = false;
      previousClock = clock = args.state?.time ?? 0;
      driver = args.state ? { ...args.state } : null;
      syncPresentation();
      flight.reset(args);
    },
    snapshot() {
      const motion = flight.snapshot();
      return {
        time: clock,
        previousTime: previousClock,
        driver,
        motion,
        // Shared flight feedback and minimap consumers inspect these fields
        // after the ordinary device wrapper has exposed this custom adapter.
        mode: motion.mode,
        currentPose: motion.currentPose,
        previousPose: motion.previousPose,
        flight: motion.flight,
      };
    },
    restore(data) {
      if (
        !data ||
        !Number.isFinite(data.time) ||
        data.time < 0 ||
        !Number.isFinite(data.previousTime) ||
        data.previousTime < 0 ||
        data.previousTime > data.time
      )
        throw new Error('Invalid Ravel moving-sail snapshot.');
      clock = data.time;
      previousClock = data.previousTime;
      driver = data.driver ? { ...data.driver } : null;
      pending = false;
      syncPresentation();
      flight.restore(data.motion);
    },
    pose(alpha = 1) {
      syncPresentation(
        previousClock +
          (clock - previousClock) * Math.max(0, Math.min(1, alpha)),
      );
      return flight.pose(alpha);
    },
    dispose() {
      disposed = true;
      pending = false;
      flight.dispose();
    },
  };
  if (flight.beginAdvance) {
    runtime.beginAdvance = (state, input, dt, modifiers) => {
      if (pending) throw new Error('Finish the pending Ravel step first.');
      pending = true;
      previousClock = state.time;
      clock = state.time + dt;
      driver = { ...state };
      syncPresentation();
      flight.beginAdvance(state, input, dt, modifiers);
    };
    runtime.finishAdvance = (state) => {
      if (!pending)
        throw new Error('Stage the Ravel step before resolving it.');
      const events = flight.finishAdvance(state);
      pending = false;
      remember(state);
      return events;
    };
  }
  return runtime;
}
