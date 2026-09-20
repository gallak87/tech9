import { buildWorld } from './world-construction.js';

export {
  distanceToRoad,
  insidePolygon,
  terrainAt,
  isWalkable,
  safeArrival,
  meetsWorldRequirement,
  nearby,
  nearbyBuildings,
} from './world-geometry.js';

export const { REGIONS, ALL_SCENES } = buildWorld();

export function getScene(id) {
  const scene = ALL_SCENES[id];
  if (!scene) throw new Error(`Unknown scene: ${id}`);
  return scene;
}
