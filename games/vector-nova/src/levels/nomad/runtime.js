import { createFlightModel } from '../../physics/flight.js';
import { installNomadMotion, NOMAD_MOTION_RULES } from './motion.js';
import { nomadLaunchTarget, NOMAD_PILOT_RULES } from './pilot.js';

export const NOMAD_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  timeout: 7,
  missBelow: 80,
  missBeyond: 100,
  missLateral: 110,
  airAcceleration: 4,
  airYaw: 0.22,
  pitchTolerance: 0.95,
});
const model = createFlightModel(NOMAD_FLIGHT_RULES);

/** Each racer borrows the same pure carrier motion with its own replay clock. */
export function createNomadRuntime(context) {
  const track = context.track;
  if (!track.frameAtTime) installNomadMotion(track);
  track.aiLaunchTarget ??= (state, jump) =>
    nomadLaunchTarget(track, state, jump);
  const player = context.presentation !== false;
  let clock = 0,
    previousClock = 0,
    pending = false,
    disposed = false;
  const privateTrack = Object.create(track);
  privateTrack.sample = (distance) => track.frameAtTime(distance, clock);
  privateTrack.sampleSurface = (distance, lateral = 0) =>
    track.surfaceAtTime(distance, lateral, clock);
  const syncPresentation = (time = clock) => {
    if (player) track.presentationTime = time;
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
  const runtime = {
    ...flight,
    advance(state, input, dt, modifiers) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
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
          events.push(...flight.advance(state, input, step, modifiers));
          clock = state.time;
          syncPresentation();
        }
      }
      return events;
    },
    reset(args = {}) {
      pending = false;
      previousClock = clock = args.state?.time ?? 0;
      context.dynamics?.setNomadTime?.(clock);
      syncPresentation();
      flight.reset(args);
    },
    snapshot() {
      const motion = flight.snapshot();
      return {
        time: clock,
        previousTime: previousClock,
        motion,
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
      clock = data.time;
      previousClock = data.previousTime;
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
      previousClock = state.time;
      clock = state.time + dt;
      context.dynamics?.setNomadTime?.(previousClock);
      syncPresentation();
      pending = true;
      flight.beginAdvance(state, input, dt, modifiers);
    };
    runtime.finishAdvance = (state) => {
      if (!pending)
        throw new Error('Stage the Nomad step before resolving it.');
      const events = flight.finishAdvance(state);
      pending = false;
      clock = state.time;
      syncPresentation();
      return events;
    };
  }
  return runtime;
}
