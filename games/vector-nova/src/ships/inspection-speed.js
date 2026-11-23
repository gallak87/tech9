import { MathUtils } from 'three';
import { createGlideTrail } from '../renderer/glide-trail.js';
import { racingBlurStrength } from '../renderer/racing-lens.js';
import { createEngineResponse } from './engine-response.js';

export const INSPECTION_DRIVING_SPEED = 400 / 3.6;
const imprintRelease = 0.25;

export function createInspectionSpeedPreview(stage) {
  const trail = createGlideTrail();
  const respond = createEngineResponse();
  const lens = { strength: 0, pressure: 0, time: 0 };
  const imprint = { active: false, fadeScale: 0 };
  const floorHeight =
    stage.floor.position.y + stage.floor.geometry.parameters.height / 2;
  trail.mesh.name = 'Inspector / road glide trail';
  trail.mesh.position.y = floorHeight + 0.025;
  stage.scene.add(trail.mesh);
  let shipRoot;
  let speed = 0;
  let imprintExpires = 0;
  let disposed = false;

  return {
    lens,
    attach(root) {
      shipRoot = root;
      imprintExpires = 0;
    },
    update({ active, driving, boost, time, dt, heading, accent, settings }) {
      if (disposed) return;
      const visible = Boolean(active && shipRoot && !settings.reducedMotion);
      const high = settings.quality !== 'low';
      const moving = visible && (driving || boost);
      speed = visible
        ? MathUtils.lerp(
            speed,
            moving ? INSPECTION_DRIVING_SPEED : 0,
            1 - Math.exp(-dt * (moving ? 4.5 : 13)),
          )
        : 0;
      const { pressure } = respond({
        time,
        boosting: visible && boost,
        reducedMotion: settings.reducedMotion,
      });
      const surge = visible && pressure >= 0.001 ? pressure : 0;
      if (!visible) imprintExpires = 0;
      if (moving) {
        const { min, max } = shipRoot.userData.bounds;
        imprint.speed = speed;
        imprint.boost = surge;
        imprint.accent = accent;
        imprint.tail = min[2];
        imprint.hullWidth = max[0] - min[0];
        trail.mesh.quaternion.copy(heading);
        imprintExpires = time + imprintRelease;
      }
      // When the preview stops emitting, the impression keeps its last pose
      // while it fades. Rotating the ship cannot drag that mark on the floor.
      imprint.fadeScale = MathUtils.smoothstep(
        imprintExpires - time,
        0,
        imprintRelease,
      );
      imprint.active = imprint.fadeScale > 0;
      trail.preview(imprint);
      lens.strength =
        visible && high
          ? racingBlurStrength({
              speed,
              cruiseSpeed: INSPECTION_DRIVING_SPEED,
              boost: surge,
            })
          : 0;
      lens.pressure = surge;
      lens.time = time;
    },
    getSnapshot: () => ({
      speed,
      blur: lens.strength,
      trail: trail.mesh.visible,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      trail.dispose();
    },
  };
}
