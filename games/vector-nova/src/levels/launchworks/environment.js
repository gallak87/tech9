import * as T from 'three';
import { drydock, solarGarden } from '../orbital/environment/models.js';
import { compileSite } from '../orbital/environment/geometry.js';
import { createOrbitalMaterials } from '../orbital/environment/materials.js';
import { disposeGroup } from '../../pickups/geometry.js';

// Reuse Asterion's actual manufactured kit. The arrays sit well outside the
// full launch envelope; no gates or hoops occupy the ballistic corridors.
export function createLaunchworksEnvironment({ track }) {
  const group = new T.Group();
  group.name = 'Asterion / transfer testing district';
  const materials = createOrbitalMaterials();
  const borrowed = new Set();
  for (const [i, jump] of track.jumps.entries()) {
    const frame = track.sample(jump.takeoff),
      side = i % 2 ? 1 : -1;
    const parts =
      i % 2
        ? solarGarden({ wings: 3, radiator: true })
        : drydock({ unfinished: i === 2, scale: 1 });
    const matrix = new T.Matrix4().compose(
      frame.position.clone().add(new T.Vector3(side * 390, -170, 100)),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), side * 0.18),
      new T.Vector3(1.6, 1.6, 1.6),
    );
    group.add(
      compileSite(
        parts,
        materials,
        matrix,
        `Transfer ${i + 1} / orbital assembly`,
      ).group,
    );
    parts.dispose();
  }
  const beamMaterial = materials.dark;
  const beamGeometry = new T.BoxGeometry(1, 1, 1);
  const beams = new T.InstancedMesh(beamGeometry, beamMaterial, 200);
  const matrix = new T.Matrix4(),
    scale = new T.Vector3(),
    p = new T.Vector3();
  let count = 0;
  for (let z = 0; z < 5100; z += 100) {
    const distance = track.distanceAt(z);
    if (track.isGap(distance)) continue;
    const frame = track.sample(distance);
    // Suspended box trusses actually connect below each solid deck. Gaps stay
    // completely open instead of a forest of disconnected vertical pillars.
    p.copy(frame.position).addScaledVector(frame.up, -10);
    scale.set(260, 7, 14);
    matrix.compose(p, frame.quaternion, scale);
    beams.setMatrixAt(count++, matrix);
    for (const side of [-1, 1]) {
      p.copy(frame.position)
        .addScaledVector(frame.right, side * 125)
        .addScaledVector(frame.up, -39);
      scale.set(7, 64, 12);
      matrix.compose(p, frame.quaternion, scale);
      beams.setMatrixAt(count++, matrix);
    }
  }
  beams.count = count;
  beams.instanceMatrix.needsUpdate = true;
  group.add(beams);
  return {
    group,
    setReflection(texture) {
      borrowed.add(texture);
      for (const material of Object.values(materials)) {
        if (material?.isMaterial) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
      }
    },
    dispose() {
      const textures = new Set();
      for (const material of Object.values(materials))
        for (const value of Object.values(material))
          if (value?.isTexture && !borrowed.has(value)) textures.add(value);
      disposeGroup(group);
      for (const material of Object.values(materials)) material?.dispose?.();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
