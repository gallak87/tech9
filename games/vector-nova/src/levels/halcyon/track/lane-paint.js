import * as THREE from 'three';
import { createSurfaceProjector } from '../../../pickups/surface-projector.js';

// A rigid tangent-frame dash clips the broad road triangles on climbs and
// bank transitions. Clip the original paint footprints to that exact skin.
export function createLanePaintGeometry(track, surface) {
  const projector = createSurfaceProjector(track, [
    { geometry: surface, matrixWorld: new THREE.Matrix4() },
  ]);
  const footprints = [];
  for (let distance = 12; distance < 420; distance += 21)
    for (const lateral of [-4.7, 4.7])
      footprints.push([
        [lateral - 0.06, distance - 3.1],
        [lateral + 0.06, distance - 3.1],
        [lateral + 0.06, distance + 3.1],
        [lateral - 0.06, distance + 3.1],
      ]);
  try {
    // Expansion seals sit at 8 mm; paint must clear them at dash crossings.
    return projector.geometry(footprints, 0.012);
  } finally {
    projector.dispose();
  }
}
