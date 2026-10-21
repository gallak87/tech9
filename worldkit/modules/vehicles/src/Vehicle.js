import { VehicleMotion } from './VehicleMotion.js';
import { VEHICLE_PRESETS } from './VehiclePresets.js';
import { createVehicleModel } from './VehicleModel.js';

const TUNABLE = new Set([
  'topSpeed',
  'reverseSpeed',
  'acceleration',
  'braking',
  'steering',
  'steeringResponse',
  'grip',
  'suspensionResponse',
  'weightTransfer',
]);

/** Owns one matching model and simulation; the consumer owns scene and frame loop. */
export function createVehicle({
  type = 'jeep',
  world,
  spawn,
  handling = {},
  lighting,
} = {}) {
  if (typeof type !== 'string' || !Object.hasOwn(VEHICLE_PRESETS, type))
    throw new TypeError('Vehicle type must be jeep, atv or bike.');
  if (
    !handling ||
    typeof handling !== 'object' ||
    Array.isArray(handling) ||
    Object.keys(handling).some((key) => !TUNABLE.has(key))
  )
    throw new TypeError(
      'handling accepts driving tuning only; model dimensions and suspension travel are fixed.',
    );
  if (lighting !== undefined && typeof lighting?.apply !== 'function')
    throw new TypeError('lighting must provide apply(group).');
  const motion = new VehicleMotion({
    config: { ...VEHICLE_PRESETS[type], ...handling },
    world,
    spawn,
  });
  const model = createVehicleModel(type);
  let disposed = false;
  let state;
  const alive = () => {
    if (disposed) throw new Error('Vehicle has been disposed.');
  };
  const present = (snapshot, dt = 0, reset = false) => {
    state = Object.freeze({ ...snapshot, vehicle: type });
    if (reset) model.reset(state);
    else model.update(state, dt);
    return state;
  };
  try {
    lighting?.apply(model.group);
    present(motion.snapshot());
  } catch (error) {
    model.dispose();
    throw error;
  }
  return Object.freeze({
    type,
    group: model.group,
    update(dt, controls = {}) {
      alive();
      if (!Number.isFinite(dt) || dt < 0)
        throw new RangeError(
          'dt must be a finite nonnegative number of seconds.',
        );
      if (!controls || typeof controls !== 'object' || Array.isArray(controls))
        throw new TypeError('controls must be an object.');
      const step = Math.min(dt, 0.1);
      return present(motion.update(step, controls), step);
    },
    snapshot() {
      return state;
    },
    reset(pose) {
      alive();
      return present(motion.reset(pose), 0, true);
    },
    recover() {
      alive();
      return present(motion.recover(), 0, true);
    },
    mountedPose() {
      alive();
      return model.mountedPose();
    },
    setDriverView(value) {
      alive();
      model.setDriverView(value);
      model.update(state, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      model.dispose();
    },
  });
}
