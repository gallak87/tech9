import { islandHeight } from './islandDefinition.js';
import { createIslandWorld } from './IslandWorld.js';

export const tidebreakDefinition = {
  id: 'tidebreak',
  title: 'Tidebreak',
  bounds: { minX: -260, maxX: 260, minZ: -260, maxZ: 260, minY: 0, maxY: 80 },
  groundHeight: islandHeight,
  createWorld: createIslandWorld,
  initialView: 'jetty',
  views: { jetty: { position: [0, 10, 118], target: [25, 1, 103] } },
  environment: {
    exposure: 0.95,
    fog: { color: '#aec5c5', density: 0.0018 },
    hemisphere: { sky: '#bedbd9', ground: '#626b4f', intensity: 1.8 },
    sun: {
      color: '#ffe1ad',
      intensity: 3.5,
      position: [-130, 100, -90],
      shadowBounds: {
        left: -125,
        right: 125,
        top: 125,
        bottom: -125,
        near: 1,
        far: 500,
      },
    },
    sky: {
      turbidity: 4,
      rayleigh: 1.25,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.82,
    },
  },
};
