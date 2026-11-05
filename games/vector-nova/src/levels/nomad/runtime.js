import { createFlightModel } from '../../physics/flight.js';
import { installNomadMotion, NOMAD_MOTION_RULES } from './motion.js';
import { createNomadRecovery, NOMAD_RECOVERY_RULES } from './recovery.js';
import {
  assistedNomadStep,
  NOMAD_LAUNCH_ASSIST_RULES,
} from './launch-assist.js';
import {
  nomadLaunchTarget,
  nomadFlightBoost,
  NOMAD_PILOT_RULES,
} from './pilot.js';

export const NOMAD_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  timeout: 10,
  missBelow: 80,
  missBeyond: 100,
  missLateral: 600,
  airAcceleration: 4,
  airYaw: 0.22,
  pitchTolerance: 0.95,
});
const model = createFlightModel(NOMAD_FLIGHT_RULES);

/** Each racer borrows the same pure carrier motion with its own replay clock. */
export function createNomadRuntime(context) {
  const track = context.track;
  if (!track.frameAtTime) installNomadMotion(track);
  track.aiLaunchTarget ??= (state, jump, { allowBoost = false } = {}) =>
    nomadLaunchTarget(track, state, jump, { boost: allowBoost && jump.bigAir });
  track.aiFlightBoost ??= (state, jump, driver) =>
    nomadFlightBoost(track, state, jump, driver);
  const player = context.presentation !== false;
  const launchAssist = context.launchAssist !== false;
  const recovery = createNomadRecovery(track);
  let clock = 0,
    previousClock = 0,
    countdownOffset = null,
    pending = false,
    disposed = false;
  const privateTrack = Object.create(track);
  const sampleTime = (time = clock) => time + (countdownOffset ?? 0);
  privateTrack.sample = (distance) => track.frameAtTime(distance, sampleTime());
  privateTrack.sampleSurface = (distance, lateral = 0) =>
    track.surfaceAtTime(distance, lateral, sampleTime());
  const syncPresentation = (time = clock) => {
    if (player) track.presentationTime = sampleTime(time);
  };
  const flight = model.createRuntime(
    { ...context, track: privateTrack },
    {
      id: 'nomad-moving-convoy',
      version: 1,
      rulesId: `nomad-convoy-v1:${JSON.stringify({
        geometry: track.geometryVersion,
        carriers: track.carriers.map(
          ({ id, origin, scale, quaternion, motion }) => ({
            id,
            origin: origin.toArray(),
            scale: scale.toArray(),
            quaternion: quaternion?.toArray(),
            motion,
          }),
        ),
        motion: NOMAD_MOTION_RULES,
        pilot: NOMAD_PILOT_RULES,
        pace: track.pace,
        jumps: track.jumps,
        flight: model.rules,
        countdownPreroll: 1,
        recovery: NOMAD_RECOVERY_RULES,
        launchAssist: launchAssist ? NOMAD_LAUNCH_ASSIST_RULES : false,
      })}`,
      groundOptions: () => ({ pace: track.pace }),
      supportVelocity({ state, jump, time, phase }) {
        const distance =
          jump && !jump.id.startsWith('equipment-')
            ? phase === 'launch'
              ? jump.takeoff
              : Math.max(jump.landingStart, state.distance)
            : state.distance;
        return track.motionAt(distance, time).velocity;
      },
      supportHeight: 0.045,
      forgivingContacts: true,
      automaticRecovery: context.playtest?.automaticRecovery !== false,
      testLaunch: Boolean(context.playtest),
    },
  );
  function resolveRecovery(state, events) {
    const target = recovery.observe(state, events, flight.pose(1));
    if (target) {
      Object.assign(state, target, {
        lateral: 0,
        heading: 0,
        steeringHeading: 0,
        lateralSpeed: 0,
        steer: 0,
        boosting: false,
      });
      flight.reset({ state, seed: flight.snapshot().seed });
    }
    return events;
  }
  const runtime = {
    ...flight,
    manualRecoveryTarget: (state) =>
      recovery.manualTarget(state, flight.snapshot(), flight.pose(1)),
    advance(state, input, dt, modifiers) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      if (countdownOffset !== null) runtime.stageCountdown(state, 0);
      const elapsed = Math.min(dt, 0.1);
      const count = Math.ceil(elapsed * 120 - 1e-10);
      const step = elapsed / count,
        events = [];
      for (let i = 0; i < count; i++) {
        if (flight.beginAdvance) {
          runtime.beginAdvance(state, input, step, modifiers);
          context.dynamics.step(step);
          events.push(...runtime.finishAdvance(state));
        } else {
          previousClock = state.time;
          clock = state.time + step;
          const assisted = launchAssist
            ? assistedNomadStep(track, state, input, modifiers, flight.pose(1))
            : { input, modifiers };
          events.push(
            ...resolveRecovery(
              state,
              flight.advance(state, assisted.input, step, assisted.modifiers),
            ),
          );
          clock = state.time;
          syncPresentation();
        }
      }
      return events;
    },
    stageCountdown(state, phase) {
      if (disposed) return;
      if (
        pending ||
        !Number.isFinite(phase) ||
        phase > 0 ||
        !Number.isFinite(state?.time) ||
        state.time < 0
      )
        throw new Error('Nomad countdown requires a finite pre-start phase.');
      const nextOffset = phase === 0 ? null : phase;
      if (nextOffset === countdownOffset && clock === state.time) return;
      previousClock = clock = state.time;
      countdownOffset = nextOffset;
      context.dynamics?.setNomadCountdownTime?.(
        countdownOffset === null ? null : sampleTime(),
      );
      // Locked ships use the same whole-hull clearance as a normal reset. No
      // force, control, device or race tick runs while the grid is carried.
      flight.reset({ state, seed: flight.snapshot().seed });
      syncPresentation();
    },
    reset(args = {}) {
      const nextClock = args.state?.time ?? 0;
      if (!Number.isFinite(nextClock) || nextClock < 0)
        throw new Error('Invalid Nomad reset time.');
      pending = false;
      recovery.reset({
        preserveBank: args.reason === 'manual-recover',
        state: args.state,
      });
      countdownOffset = null;
      previousClock = clock = nextClock;
      context.dynamics?.setNomadTime?.(clock);
      syncPresentation();
      flight.reset(args);
    },
    snapshot() {
      const motion = flight.snapshot();
      return {
        time: clock,
        previousTime: previousClock,
        countdownOffset,
        motion,
        recovery: recovery.snapshot(),
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
        throw new Error('Invalid Nomad carrier clock.');
      const nextCountdown = data.countdownOffset ?? null;
      recovery.validate(data.recovery);
      if (
        nextCountdown !== null &&
        (!Number.isFinite(nextCountdown) || nextCountdown > 0)
      )
        throw new Error('Invalid Nomad countdown offset.');
      const retained = {
        clock,
        previousClock,
        countdownOffset,
        pending,
        presentationTime: track.presentationTime,
      };
      // Delegated restore may sample the private moving chart. Stage its saved
      // time first, but a rejected nested state must leave our clocks intact.
      clock = data.time;
      previousClock = data.previousTime;
      countdownOffset = nextCountdown;
      pending = false;
      syncPresentation();
      try {
        flight.restore(data.motion);
        recovery.restore(data.recovery);
      } catch (error) {
        ({ clock, previousClock, countdownOffset, pending } = retained);
        if (player) track.presentationTime = retained.presentationTime;
        throw error;
      }
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
      if (pending) throw new Error('Finish the pending Nomad step first.');
      if (
        disposed ||
        !Number.isFinite(dt) ||
        dt <= 0 ||
        dt > model.rules.step + 1e-10 ||
        !Number.isFinite(state?.time) ||
        state.time < 0
      )
        throw new Error('Nomad dynamics require a live finite fixed step.');
      if (countdownOffset !== null) runtime.stageCountdown(state, 0);
      previousClock = state.time;
      clock = state.time + dt;
      context.dynamics?.setNomadTime?.(previousClock);
      syncPresentation();
      pending = true;
      const assisted = launchAssist
        ? assistedNomadStep(track, state, input, modifiers, flight.pose(1))
        : { input, modifiers };
      flight.beginAdvance(state, assisted.input, dt, assisted.modifiers);
    };
    runtime.finishAdvance = (state) => {
      if (!pending)
        throw new Error('Stage the Nomad step before resolving it.');
      const events = resolveRecovery(state, flight.finishAdvance(state));
      pending = false;
      clock = state.time;
      syncPresentation();
      return events;
    };
  }
  return runtime;
}
