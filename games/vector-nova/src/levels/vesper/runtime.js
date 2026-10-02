import { createFlightModel } from '../../physics/flight.js';
import { sampleVesperSurface } from './surface.js';

export const VESPER_FLIGHT = createFlightModel({
  gravity: 26,
  railHeight: { 'crown-leap': 1.2, 'branch-bypass': 1.2 },
});
export function vesperGroundOptions(track, state) {
  const surface = sampleVesperSurface(track, state);
  const s = ((state.distance % track.length) + track.length) % track.length;
  const split = track.jumps.find(
    (j) => j.optional && s >= j.takeoff && s < j.landingStart,
  );
  return {
    surface: { drag: surface.drag },
    ...(split ? { roadBounds: { min: -14, max: 5.5 } } : {}),
  };
}
export function createVesperRuntime(context) {
  const { track } = context;
  const runtime = VESPER_FLIGHT.createRuntime(context, {
    id: 'vesper-forest-flight',
    version: 1,
    rulesId: `vesper-rules-1:${JSON.stringify({ revision: track.revision, rules: VESPER_FLIGHT.rules, jumps: track.jumps, zones: track.sapZones, optionalLane: 5.5 })}`,
    groundOptions: ({ state }) => vesperGroundOptions(track, state),
    shouldLaunch: ({ state }) => state.lateral > 5.5,
    edgeSource: 'vesper-branch-edge',
  });
  let surface = { id: 'resin', zone: null, drag: 0 };
  return {
    ...runtime,
    advance(state, input, dt, modifiers) {
      const events = runtime.advance(state, input, dt, modifiers);
      const motion = runtime.snapshot();
      const next =
        motion.mode === 'magnetic'
          ? sampleVesperSurface(track, state)
          : { id: 'air', zone: null, drag: 0 };
      if (next.id !== surface.id || next.zone !== surface.zone)
        events.push({
          type: 'surface-change',
          payload: {
            from: surface.id,
            to: next.id,
            zone: next.zone,
            drag: next.drag,
          },
        });
      surface = next;
      return events;
    },
    reset(args) {
      runtime.reset(args);
      surface = sampleVesperSurface(track, args.state);
    },
    snapshot() {
      return { ...runtime.snapshot(), surface: { ...surface } };
    },
    restore(data) {
      runtime.restore(data);
      surface = { ...(data.surface ?? { id: 'resin', zone: null, drag: 0 }) };
    },
  };
}
