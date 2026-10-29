import { createMagneticRuntime } from '../core/session-runtime.js';
import { getBossHull } from '../ships/boss-hulls.js';
import { VEHICLE_HULL } from '../physics/hull.js';

// Keep each course's physical motion and hazards while turning the contact
// hull to fire backwards independently of its driving direction.
export function createInterceptorMotion(
  context,
  { getYaw = () => 0, createMotion = createMagneticRuntime } = {},
) {
  if (
    !context?.dynamics ||
    typeof getYaw !== 'function' ||
    typeof createMotion !== 'function'
  )
    throw new Error(
      'Interceptor motion needs shared dynamics, a motion factory and a yaw reader',
    );
  const dynamics = {
    ...context.dynamics,
    createActor: (options = {}) =>
      context.dynamics.createActor({
        ...options,
        selfContactSpeedLimit: 100,
        contactSpeedLimit: 180,
      }),
  };
  function supportHull(state) {
    if (!state) return;
    const { bounds } = getBossHull(state.chassisId);
    // Clearance and owned-road queries must cover the actual long chassis,
    // including its nose/tail while the supported road twists beneath it.
    // The convex contact proxy and ordinary actor defaults stay unchanged.
    dynamics.supportHull = {
      halfWidth: Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])),
      halfLength: Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])),
      hover: VEHICLE_HULL.hover,
    };
  }
  const motion = createMotion({
    ...context,
    dynamics,
    equipment: false,
  });
  const facing = (modifiers = {}) => {
    const headingOffset = getYaw();
    if (
      !Number.isFinite(headingOffset) ||
      Math.abs(headingOffset) > Math.PI * 2
    )
      throw new Error('Interceptor facing must be a finite yaw');
    return { ...modifiers, headingOffset };
  };
  return {
    ...motion,
    id: `interceptor-${motion.id}`,
    version: 4,
    rulesId: `${motion.rulesId}:courier-facing-v3-driving-axis:self-contact-100:other-contact-180:boss-support-footprint-v1`,
    reset(setup = {}) {
      supportHull(setup.state);
      return motion.reset(setup);
    },
    beginAdvance(state, input, dt, modifiers) {
      supportHull(state);
      return motion.beginAdvance(state, input, dt, facing(modifiers));
    },
    advance(state, input, dt, modifiers) {
      supportHull(state);
      return motion.advance(state, input, dt, facing(modifiers));
    },
  };
}
