import { createForestWorld, getForestColliders } from './ForestWorld.js';
import { terrainHeight } from './terrain.js';

/** The forest's authored content contract; renderer and camera code stay generic. */
export const forestDefinition = Object.freeze({
  id: 'stillwater-pond',
  title: 'Stillwater Pond',
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
    fog: { color: '#a9b8b1', density: 0.009 },
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
    subtitle: 'POND EXPLORATION',
    edition: '001',
    coordinates: 'N 46° 52′',
    category: 'SCENE BUILDING BLOCK',
    location: 'South bank',
    condition: 'Early light',
    area: '160 × 160 m',
    enterLabel: 'Walk the shore',
    resetLabel: 'Reset to morning',
    boundaryNotice: 'Edge of the study · return to the pond',
    controls: 'WASD walk · Shift jog · right-drag / IJKL look · P pause',
    lockedControls: 'WASD walk · Shift jog · Mouse look · Esc pause',
  },
});
