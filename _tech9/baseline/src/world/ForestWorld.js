import { createComposedLandscape } from '../modules/landscape/src/Landscape.js';
import {
  createForestComposition,
  getForestColliders,
} from './forestComposition.js';
export {
  getForestPlacements,
  getForestColliders,
} from './forestComposition.js';

/** Scene-owned composition adapter; shared rendering/assets live in landscape. */
export function createForestWorld() {
  const { terrain, placements } = createForestComposition();
  const landscape = createComposedLandscape({
    id: 'forest-world',
    terrain,
    placements,
  });
  return { ...landscape, getColliders: getForestColliders };
}
