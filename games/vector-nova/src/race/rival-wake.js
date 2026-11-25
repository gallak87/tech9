import { MathUtils } from 'three';
import { createAirborneWake } from '../renderer/airborne-wake.js';
import { createGlideTrail } from '../renderer/glide-trail.js';
import { interpolateSurfaceLateral } from '../track/surface.js';
import { RACER_COLORS } from './roster.js';

const rivalWakeReach = 30;

export function createRivalWake(scene, track, surface, ship, specification) {
  const accent = specification.color ?? RACER_COLORS[specification.id];
  const { bounds } = ship.userData;
  if (!surface || !bounds || !accent) return null;

  const ground = createGlideTrail({
    track,
    ...surface,
    strengthScale: 0.55,
    reach: rivalWakeReach,
  });
  const air = createAirborneWake({
    strengthScale: 0.65,
    reach: rivalWakeReach,
    duration: 0.6,
  });
  ground.mesh.name = `${specification.name} / ground glide trail`;
  air.mesh.name = `${specification.name} / airborne glide wake`;
  scene.add(ground.mesh, air.mesh);

  const hullWidth = bounds.max[0] - bounds.min[0];
  const deposited = {};
  let visible = false;

  function reset() {
    ground.reset();
    air.reset();
    visible = false;
  }

  return {
    reset,
    update({
      opponent,
      pose,
      blend,
      speed,
      boost,
      mode,
      reducedMotion,
      cameraPosition,
    }) {
      const paused = mode === 'paused';
      const distance = cameraPosition?.distanceTo(ship.position) ?? 0;
      const visibility = 1 - MathUtils.smoothstep(distance, 85, 135);
      if (reducedMotion || visibility === 0 || (!paused && mode !== 'racing')) {
        if (visible) reset();
        return;
      }
      if (paused) return;

      visible = true;
      const { state, prev = state } = opponent;
      const time = MathUtils.lerp(prev.time, state.time, blend);
      const grounded = pose?.grounded !== false;
      deposited.time = state.time;
      deposited.resetCount = state.resetCount;
      if (grounded) {
        deposited.distance = MathUtils.lerp(
          prev.distance,
          state.distance,
          blend,
        );
        deposited.lateral = interpolateSurfaceLateral(
          track,
          prev,
          state,
          blend,
        );
        deposited.heading = MathUtils.lerp(prev.heading, state.heading, blend);
      }
      ground.update({
        active: true,
        grounded,
        state: deposited,
        time,
        speed,
        boost,
        accent,
        tail: bounds.min[2],
        hullWidth,
        visibility,
      });
      air.update({
        active: !pose?.recovering,
        airborne: !grounded,
        time,
        resetCount: state.resetCount,
        position: ship.position,
        quaternion: ship.quaternion,
        bounds,
        accent,
        speed,
        visibility,
      });
    },
    dispose() {
      ground.dispose();
      air.dispose();
    },
  };
}
