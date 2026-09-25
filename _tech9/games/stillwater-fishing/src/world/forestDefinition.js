import { createForestWorld, getForestColliders } from './ForestWorld.js';
import { terrainHeight } from './terrain.js';

/** The forest's authored content contract; renderer and camera code stay generic. */
export const forestDefinition = Object.freeze({
  id: 'stillwater-fishing',
  title: 'Stillwater',
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
      label: 'South bank',
      position: [0, terrainHeight(0, 24) + 1.68, 24],
      target: [0, 0, -5],
    },
    grove: {
      label: 'West shore',
      position: [-20, terrainHeight(-20, 0) + 1.68, 0],
      target: [0, 0, -8],
    },
    ridge: {
      label: 'Pond overlook',
      position: [22, terrainHeight(22, 18) + 1.68, 18],
      target: [0, 0, -8],
    },
    boundary: {
      hidden: true,
      position: [75.9, terrainHeight(75.9, 0) + 3, 0],
      target: [100, 3, 0],
    },
  },
  environment: {
    exposure: 0.9,
    fog: { color: '#a9b8b1', density: 0.006 },
    hemisphere: { sky: '#c4d3d2', ground: '#5c6146', intensity: 1.65 },
    sun: {
      color: '#ffe2af',
      intensity: 3.9,
      position: [-32, 22, -48],
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
    controls: 'WASD walk · right-drag look · Space cast / hook / reel',
    lockedControls: 'WASD walk · Mouse look · Space fish · Esc pause',
  },
});
