import { createMagneticRuntime } from '../core/session-runtime.js';

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
    version: 3,
    rulesId: `${motion.rulesId}:courier-facing-v3-driving-axis:self-contact-100:other-contact-180`,
    beginAdvance(state, input, dt, modifiers) {
      return motion.beginAdvance(state, input, dt, facing(modifiers));
    },
    advance(state, input, dt, modifiers) {
      return motion.advance(state, input, dt, facing(modifiers));
    },
  };
}
