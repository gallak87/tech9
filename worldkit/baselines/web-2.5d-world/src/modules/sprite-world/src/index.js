export { createSpriteWorld } from './world.js';
export { AssetCache, loadImage } from './assets.js';
export {
  createViewport,
  clampCamera,
  followCamera,
  clientToWorld,
  worldToClient,
} from './viewport.js';
export {
  moveActor,
  isWalkable,
  clearSegment,
  insidePolygon,
  nearestInteraction,
} from './exploration.js';
export { frameBounds, actorFrame, actorFrames, isOccluding } from './frames.js';
export { TouchMovement, stickVector } from './touch-input.js';
// Optional authored sample data. The core world module does not import this preset.
export {
  COASTAL_ASSETS,
  COASTAL_FRAMES,
  COASTAL_ACTOR,
  createCoastalPatterns,
  drawCoastalGround,
} from './coastal.js';
