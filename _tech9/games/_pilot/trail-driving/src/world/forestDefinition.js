import { createForestWorld, getForestColliders } from './ForestWorld.js';
import { pathCenter, terrainHeight } from './terrain.js';

/** The forest's authored content contract; renderer and camera code stay generic. */
export const forestDefinition = Object.freeze({
  id: 'tech9-baseline',
  title: 'Tech9 Baseline',
  bounds: Object.freeze({
    minX: -76,
    maxX: 76,
    minZ: -76,
    maxZ: 76,
    minY: 0,
    maxY: 36,
  }),
  groundHeight: terrainHeight,
  initialView: 'trail',
  views: {
    trail: {
      label: 'Pinewood trail',
      position: [
        pathCenter(23) - 0.6,
        terrainHeight(pathCenter(23), 23) + 2.25,
        23,
      ],
      target: [
        pathCenter(-18) + 0.6,
        terrainHeight(pathCenter(-18), -18) - 0.8,
        -18,
      ],
    },
    grove: {
      label: 'Deep grove',
      position: [
        pathCenter(-7) + 0.2,
        terrainHeight(pathCenter(-7) + 0.2, -7) + 1.8,
        -7,
      ],
      target: [
        pathCenter(-34) + 0.5,
        terrainHeight(pathCenter(-34), -34) + 0.6,
        -34,
      ],
    },
    ridge: {
      label: 'Forest ridge',
      position: [-22, terrainHeight(-22, 8) + 6, 8],
      target: [10, 5, -28],
    },
    boundary: {
      hidden: true,
      position: [75.9, terrainHeight(75.9, 0) + 3, 0],
      target: [100, terrainHeight(75.9, 0) + 3, 0],
    },
  },
  environment: {
    exposure: 0.96,
    fog: { color: '#b9c3b9', density: 0.0075 },
    hemisphere: { sky: '#c4d3d2', ground: '#5c6146', intensity: 1.65 },
    sun: {
      color: '#ffe2af',
      intensity: 4.7,
      position: [34, 28, -48],
      shadowBounds: {
        left: -58,
        right: 58,
        top: 58,
        bottom: -58,
        near: 1,
        far: 180,
      },
    },
    sky: {
      turbidity: 8,
      rayleigh: 0.9,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.85,
    },
  },
  createWorld: createForestWorld,
  getColliders: getForestColliders,
  presentation: {
    subtitle: 'A FOREST STUDY',
    edition: '001',
    coordinates: 'N 46° 52′',
    category: 'FOREST CONCEPT',
    location: 'Pinewood trail',
    condition: 'Early light',
    area: '160 × 160 m',
    enterLabel: 'Explore the grove',
    resetLabel: 'Reset to morning',
    boundaryNotice: 'Edge of the study · fly back toward the grove',
    controls: 'Drag to look · WASD to fly · E / Q rise & fall',
    lockedControls:
      'WASD fly · Shift boost · E / Q rise & fall · Esc release · H hide UI',
  },
});
