import * as T from 'three';
import {
  createOpalineMassGeometry,
  createOpalineArchGeometry,
} from './geometry.js';
import { createOpalineMaterials } from './materials.js';

/** Focused mineral sculpture kit. Owns each geometry/material; maps are borrowed. */
export function createOpalineKit({
  detail = 'high',
  seed = 7319,
  textures = {},
} = {}) {
  if (!Number.isFinite(seed))
    throw new RangeError('Opaline seed must be finite');
  const palette = createOpalineMaterials({ detail, textures }),
    owned = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    owned.forEach((geometry) => geometry.dispose());
    palette.dispose();
  };
  try {
    const specs = [
      {
        name: 'cutbank',
        width: 116,
        height: 92,
        depth: 87,
        profile: 'terrace',
      },
      {
        name: 'folded-bastion',
        width: 138,
        height: 121,
        depth: 112,
        profile: 'terrace',
      },
      {
        name: 'eroded-bowl',
        width: 155,
        height: 67,
        depth: 126,
        profile: 'terrace',
      },
      { name: 'needle', width: 52, height: 132, depth: 58, profile: 'spire' },
      {
        name: 'split-pinnacle',
        width: 78,
        height: 174,
        depth: 72,
        profile: 'spire',
      },
      {
        name: 'cantilever',
        width: 156,
        height: 52,
        depth: 104,
        profile: 'shelf',
      },
    ];
    const prototypes = specs.map((spec, index) => {
      const geometry = createOpalineMassGeometry({
        ...spec,
        seed: seed + index * 149,
        detail,
      });
      owned.push(geometry);
      return {
        name: spec.name,
        geometry,
        material: palette.stone,
        bounds: geometry.boundingBox.clone(),
        height: geometry.boundingBox.getSize(new T.Vector3()).y,
      };
    });
    const arch = createOpalineArchGeometry({ seed: seed + 1709, detail });
    owned.push(arch);
    const archParts = [
      {
        name: 'eroded-arch',
        geometry: arch,
        material: palette.stone,
        bounds: arch.boundingBox.clone(),
      },
    ];
    return {
      prototypes,
      archParts,
      materials: palette.materials,
      materialList: palette.materialList,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export {
  createOpalineMassGeometry,
  createOpalineArchGeometry,
  createOpalineMaterials,
};
