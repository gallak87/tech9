import { createFlightModel } from '../../physics/flight.js';
import { sampleVesperSurface } from './surface.js';

export const VESPER_FLIGHT = createFlightModel({
  gravity: 26,
  railHeight: { 'crown-leap': 1.2 },
});
export function vesperGroundOptions(track, state) {
  const surface = sampleVesperSurface(track, state);
  return { surface: { drag: surface.drag } };
}
export function createVesperRuntime(context) {
  const { track } = context;
  const runtime = VESPER_FLIGHT.createRuntime(context, {
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.collisionWorld),
    id: 'vesper-forest-pilot-flight',
    version: 2,
    rulesId: `vesper-rules-2:${JSON.stringify({ revision: track.revision, rules: VESPER_FLIGHT.rules, jumps: track.jumps, zones: track.sapZones })}`,
    groundOptions: ({ state }) => vesperGroundOptions(track, state),
  });
  let surface = { id: 'resin', zone: null, drag: 0 };
  function finishSurface(state, events) {
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
  }
  return {
    ...runtime,
    advance(state, input, dt, modifiers) {
      return finishSurface(state, runtime.advance(state, input, dt, modifiers));
    },
    ...(runtime.finishAdvance
      ? {
          finishAdvance(state) {
            return finishSurface(state, runtime.finishAdvance(state));
          },
        }
      : {}),
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
