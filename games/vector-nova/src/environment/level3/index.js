import * as T from 'three';
import {
  NACRE_AIR_COLOR,
  NACRE_WATER_COLOR,
  sampleNacreWater,
  nacreWaterCrossingBlend,
} from './atmosphere.js';
import { createNacreEnvironment as createShapeEnvironment } from './shape.js';
import { createNacreClearance, seededRandom } from './geometry.js';
import { createNacreMaterials } from './materials.js';
import {
  nacreSeabedBaseY,
  nacreSeabedHeight,
  NACRE_SEABED_SIZE,
  NACRE_SEABED_SEGMENTS,
} from './seabed.js';
import { createNacreWorld } from './world.js';
import { createNacreWater, createNacreParticles } from './water.js';
import { createNacreWaterCrossingEffects } from './water-crossings.js';
import { createNacreLeviathan } from './leviathan/index.js';

export function createNacreEnvironment(
  track,
  { blockout = false, skyTexture = null } = {},
) {
  if (blockout) return createShapeEnvironment(track);
  const group = new T.Group();
  group.name = 'Nacre / ocean planet and living reef canyon';
  const waterY = track.waterY ?? 0;
  const bounds = track.bounds.clone();
  const center = bounds.getCenter(new T.Vector3());
  const span = bounds.getSize(new T.Vector3());
  const oceanSize = Math.max(span.x, span.z, 1600) + 12000;
  const seabedY = nacreSeabedBaseY(track);
  const random = seededRandom();
  const timeUniform = { value: 0 };
  const materials = createNacreMaterials(timeUniform, waterY);
  const clearance = createNacreClearance(track);
  const water = createNacreWater(oceanSize, waterY, { skyTexture, track });
  water.position.x = center.x;
  water.position.z = center.z;
  const world = createNacreWorld(track, materials, clearance, random, seabedY);
  const particles = createNacreParticles(track, random);
  const waterCrossings = createNacreWaterCrossingEffects(track);
  const leviathan = createNacreLeviathan(track);
  const reefLights = Array.from({ length: 3 }, () => {
    const light = new T.PointLight('#51cbb8', 0, 165, 2);
    light.name = 'Nacre / local living-reef radiance';
    light.castShadow = false;
    group.add(light);
    return light;
  });
  const groundGeometry = new T.PlaneGeometry(
    NACRE_SEABED_SIZE,
    NACRE_SEABED_SIZE,
    NACRE_SEABED_SEGMENTS,
    NACRE_SEABED_SEGMENTS,
  ).rotateX(-Math.PI / 2);
  const vertices = groundGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i += 1) {
    const x = vertices.getX(i),
      z = vertices.getZ(i);
    vertices.setY(i, nacreSeabedHeight(track, x + center.x, z + center.z));
  }
  groundGeometry.computeVertexNormals();
  const seabed = new T.Mesh(groundGeometry, materials.sediment);
  seabed.name = 'Nacre / sculpted deepwater sediment basin';
  seabed.position.x = center.x;
  seabed.position.z = center.z;
  const seaLevelGrid = new T.GridHelper(
    Math.max(span.x, span.z) + 400,
    16,
    '#82a4a9',
    '#6a8990',
  );
  seaLevelGrid.name = 'Nacre / overview sea level';
  seaLevelGrid.position.set(center.x, waterY, center.z);
  seaLevelGrid.material.transparent = true;
  seaLevelGrid.material.opacity = 0.22;
  seaLevelGrid.material.depthWrite = false;
  seaLevelGrid.visible = false;
  group.add(
    water,
    seabed,
    world.group,
    particles,
    waterCrossings.group,
    leviathan.group,
    seaLevelGrid,
  );
  let overview = false;
  let disposed = false;
  let reducedMotion = false;
  let quality = 'high';
  let ownedScene, previousFog, previousBackground;
  const fog = new T.FogExp2(NACRE_AIR_COLOR, 0.00026);
  const background = NACRE_AIR_COLOR.clone();
  group.userData.waterY = waterY;
  group.userData.seabedY = seabedY;
  group.userData.stage = 'production';
  group.userData.clearanceReport = {
    collisions: 0,
    sampleCount: clearance.route.sampleCount,
    halfWidth: clearance.route.halfWidth,
    flightCorridors: clearance.flights.map((box) => ({
      min: box.min.toArray(),
      max: box.max.toArray(),
    })),
    placements: world.placements,
  };
  group.userData.setOverview = (active) => {
    overview = Boolean(active);
    for (const object of [
      water,
      seabed,
      world.group,
      particles,
      waterCrossings.group,
      leviathan.group,
    ])
      object.visible = !overview;
    seaLevelGrid.visible = overview;
  };
  group.userData.updateVehicle = (vehicle) => {
    if (!disposed) {
      waterCrossings.updateVehicle(vehicle);
      leviathan.updateVehicle(vehicle);
    }
  };
  group.userData.ready = leviathan.ready;
  group.userData.getLeviathanPresentation = () => leviathan.getPresentation();
  group.userData.getWaterPresentation = () => waterCrossings.getPresentation();
  group.userData.getOceanPresentation = () => water.userData.getPresentation();
  group.userData.update = (cameraPosition, time = 0) => {
    if (disposed) return;
    waterCrossings.update(time, reducedMotion, quality);
    leviathan.update(time, { reducedMotion, quality, overview });
    const state = sampleNacreWater(cameraPosition.y, waterY);
    const motionTime = reducedMotion ? 0 : time;
    timeUniform.value = motionTime;
    water.material.uniforms.time.value = motionTime;
    water.material.uniforms.wetness.value = state.submerged;
    water.material.uniforms.nearSurface.value = nacreWaterCrossingBlend(
      cameraPosition.y,
      waterY,
    );
    particles.material.uniforms.time.value = motionTime;
    particles.material.uniforms.wetness.value = state.submerged;
    const nearest = world.lightAnchors
      .map((anchor) => ({
        ...anchor,
        distance: cameraPosition.distanceTo(anchor.position),
      }))
      .sort((a, b) => a.distance - b.distance);
    for (const [index, light] of reefLights.entries()) {
      const anchor = nearest[index];
      light.intensity =
        anchor && !overview
          ? 620 *
            (1 - T.MathUtils.smoothstep(anchor.distance, 180, 320)) *
            state.submerged
          : 0;
      if (anchor) {
        light.position.copy(anchor.position);
        light.color.set(anchor.color);
      }
    }
    group.userData.waterState = state;
  };
  group.userData.updateScene = (
    scene,
    cameraPosition,
    time = 0,
    settings = {},
  ) => {
    if (!ownedScene) {
      ownedScene = scene;
      previousFog = scene.fog;
      previousBackground = scene.background;
      scene.fog = fog;
      scene.background = background;
    }
    reducedMotion = Boolean(settings.reducedMotion);
    quality = settings.quality === 'low' ? 'low' : 'high';
    water.userData.setQuality(quality);
    group.userData.update(cameraPosition, time);
    const state = group.userData.waterState;
    background
      .copy(NACRE_AIR_COLOR)
      .lerp(NACRE_WATER_COLOR, overview ? 0 : state.submerged);
    fog.color.copy(background);
    fog.density = overview ? 0.000025 : state.fogDensity;
    particles.geometry.setDrawRange(0, settings.quality === 'low' ? 800 : 1600);
  };
  group.userData.metrics = {
    ...world.group.userData.metrics,
    meshCount:
      world.group.userData.metrics.meshCount +
      2 +
      waterCrossings.metrics.meshCount +
      leviathan.metrics.meshCount,
    triangleCount:
      world.group.userData.metrics.triangleCount +
      groundGeometry.index.count / 3 +
      water.userData.getPresentation().highTriangles +
      waterCrossings.metrics.triangleCount +
      leviathan.metrics.triangleCount,
    points:
      1600 +
      waterCrossings.metrics.splashPointsHigh +
      leviathan.metrics.sprayPointsHigh,
    animalCount: leviathan.metrics.animalCount,
    creatureTriangles: leviathan.metrics.modelTriangles,
    maxCreatureDraws: leviathan.metrics.meshCount,
    creatureAssetBytes: leviathan.metrics.assetBytes,
    crossingWaterDraws: 1,
    splashPoolSlots: waterCrossings.metrics.splashSlots,
    maxSplashDraws: waterCrossings.metrics.splashSlots * 2,
    crossingTriangles: waterCrossings.metrics.triangleCount,
    localLights: 3,
    additionalShadowPasses: 0,
    lowPoints:
      800 +
      waterCrossings.metrics.splashPointsLow +
      leviathan.metrics.sprayPointsLow,
    textures: 0,
    borrowedSkyTextures: skyTexture ? 1 : 0,
    additionalRenderPasses: 0,
    waterPasses: 1,
    reflectionPasses: 0,
    stage: 'production',
    rendering:
      'Instanced geometry, single two-sided ocean draw, material caustics, no screen-space water or new shadow lights',
  };
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    waterCrossings.clear();
    leviathan.dispose();
    if (ownedScene?.fog === fog) ownedScene.fog = previousFog;
    if (ownedScene?.background === background)
      ownedScene.background = previousBackground;
    const geometries = new Set(water.userData.geometries),
      ownedMaterials = new Set(Object.values(materials));
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) ownedMaterials.add(object.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    group.clear();
  };
  return group;
}
