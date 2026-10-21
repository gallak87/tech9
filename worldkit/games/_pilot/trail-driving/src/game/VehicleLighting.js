import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** One shared reflection target for vehicle materials; models only borrow it. */
export function createVehicleLighting(renderer) {
  const environment = new RoomEnvironment();
  const generator = new PMREMGenerator(renderer);
  let target;
  try {
    target = generator.fromScene(environment, 0.025, 0.1, 100, { size: 256 });
  } finally {
    environment.dispose();
    generator.dispose();
  }
  let disposed = false;
  return {
    apply(group) {
      if (disposed) return;
      group.traverse((object) => {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (!material?.isMeshStandardMaterial) continue;
          material.envMap = target.texture;
          material.envMapIntensity = 0.65;
          material.needsUpdate = true;
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      target.dispose();
    },
  };
}
