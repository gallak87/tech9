import { MathUtils } from 'three';
import { createGlideWake } from '../renderer/glide-wake.js';
import { RACER_COLORS } from './roster.js';

export function createRivalWake(scene, ship, specification) {
  const accent = specification.color ?? RACER_COLORS[specification.id];
  const { bounds } = ship.userData;
  if (!bounds || !accent) return null;

  const wake = createGlideWake({
    strengthScale: 0.65,
    reach: 30,
    duration: 0.6,
  });
  wake.mesh.name = `${specification.name} / glide wake`;
  scene.add(wake.mesh);

  let visible = false;

  function reset() {
    wake.reset();
    visible = false;
  }

  return {
    reset,
    update({
      opponent,
      quaternion,
      recovering,
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
      wake.update({
        active: !recovering,
        time: MathUtils.lerp(prev.time, state.time, blend),
        resetCount: state.resetCount,
        position: ship.position,
        quaternion,
        bounds,
        accent,
        speed,
        boost,
        visibility,
      });
    },
    dispose: wake.dispose,
  };
}
