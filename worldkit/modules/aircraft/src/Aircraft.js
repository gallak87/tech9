import { Vector3, Quaternion } from 'three';
import { AircraftVisual } from './AircraftVisual.js';
import {
  FlightSimulation,
  FLIGHT_PROFILES,
} from '../../flight-motion/src/FlightSimulation.js';
import { FlightInput } from '../../flight-motion/src/FlightInput.js';
export { AircraftVisual, FlightSimulation, FlightInput, FLIGHT_PROFILES };
export const AIRCRAFT_PRESETS = Object.freeze({
  trainer: Object.freeze({
    name: 'Cedar T-1',
    role: 'High-wing trainer',
    profile: 'trainer',
    cockpitPosition: Object.freeze([0, 0.62, -0.55]),
  }),
  sport: Object.freeze({
    name: 'Swift S-2',
    role: 'Low-wing sport',
    profile: 'sport',
    cockpitPosition: Object.freeze([0, 0.62, -0.55]),
  }),
});

/** Complete model/motion binding. Caller owns scene, camera, input and game rules. */
export function createAircraft({
  profile = 'trainer',
  appearance,
  ...motion
} = {}) {
  const simulation = new FlightSimulation({ profile, ...motion });
  const visual = new AircraftVisual(profile, appearance);
  const group = visual.group;
  const point = new Vector3(),
    forward = new Vector3(),
    up = new Vector3(),
    rotation = new Quaternion();
  let disposed = false;
  function apply(state, dt) {
    group.position.set(state.x, state.y, state.z);
    group.rotation.set(state.pitch, -state.heading, -state.roll, 'YXZ');
    visual.update(state, dt);
    group.updateMatrixWorld(true);
    return state;
  }
  apply(simulation.snapshot(), 0);
  return {
    group,
    visual,
    simulation,
    preset: AIRCRAFT_PRESETS[profile],
    step(dt, input) {
      return disposed
        ? simulation.snapshot()
        : apply(simulation.step(dt, input), dt);
    },
    reset(spawn) {
      if (disposed) throw new Error('Aircraft is disposed.');
      return apply(simulation.reset(spawn), 0);
    },
    snapshot: () => simulation.snapshot(),
    setStabilization: (enabled) => simulation.setStabilization(enabled),
    setCockpitMode: (enabled) => visual.setCockpitMode(enabled),
    getCockpitPose() {
      group.updateWorldMatrix(true, false);
      point
        .fromArray(visual.group.userData.cockpitPosition)
        .applyMatrix4(group.matrixWorld);
      group.getWorldQuaternion(rotation);
      forward.set(0, 0, -35).applyQuaternion(rotation).add(point);
      up.set(0, 1, 0).applyQuaternion(rotation);
      return {
        position: point.toArray(),
        target: forward.toArray(),
        up: up.toArray(),
      };
    },
    getWeatherTargets() {
      const seen = new Set(),
        targets = [];
      // Exclude interior instruments, translucent glass and propeller decals.
      visual.exterior.traverse((o) => {
        const m = o.material;
        if (m?.isMeshStandardMaterial && !m.transparent && !seen.has(m)) {
          seen.add(m);
          targets.push({ material: m, snow: 0, wind: 0, wet: 0.7 });
        }
      });
      return targets;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      visual.dispose();
    },
  };
}

/** F toggles assistance; Space remains temporary recovery. Other actions are caller-owned. */
export function createAircraftControls(
  aircraft,
  { actions = {}, onAction = () => {}, ...options } = {},
) {
  return new FlightInput({
    ...options,
    actions: { KeyF: 'stabilization', ...actions },
    onAction(action) {
      if (action === 'stabilization')
        aircraft.setStabilization(!aircraft.snapshot().stabilization);
      else onAction(action);
    },
  });
}
