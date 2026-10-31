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
import { createNacreMineralSurface } from './mineral-surface.js';
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
import { createNacreMarineWeather } from './marine-weather.js';

function selectReefLightAnchors(anchors, cameraPosition) {
  return anchors
    .map((anchor) => {
      const distance = cameraPosition.distanceTo(anchor.position);
      const priority = T.MathUtils.clamp(anchor.priority ?? 1, 0, 3);
      const intensity = T.MathUtils.clamp(anchor.intensity ?? 1500, 0, 8000);
      // Outboard hero terraces need camera visibility beyond the old gardens.
      // This extends selection only: each physical light still reaches 165m.
      const visibility =
        1 -
        T.MathUtils.smoothstep(
          distance,
          priority > 1 ? 300 : 180,
          priority > 1 ? 560 : 320,
        );
      return {
        anchor,
        distance,
        visibility,
        intensity,
        score: priority * visibility,
      };
    })
    .filter((candidate) => candidate.score > 0 && candidate.intensity > 0)
    .sort((a, b) => b.score - a.score || a.distance - b.distance)
    .slice(0, 3);
}

export function createNacreEnvironment(
  track,
  { blockout = false, skyTexture = null, loadMineralTexture } = {},
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
  const mineralSurface = createNacreMineralSurface({
    loadTexture: loadMineralTexture,
  });
  const materials = createNacreMaterials(timeUniform, waterY, {
    mineralSurface,
  });
  const clearance = createNacreClearance(track);
  const water = createNacreWater(oceanSize, waterY, { skyTexture, track });
  water.position.x = center.x;
  water.position.z = center.z;
  const world = createNacreWorld(track, materials, clearance, random, seabedY);
  const weather = createNacreMarineWeather(track, world.placements);
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
    weather.group,
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
  const fog = new T.FogExp2(NACRE_AIR_COLOR, 0.00034);
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
      weather.group,
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
  group.userData.getLeviathanPresentation = () => leviathan.getPresentation();
  group.userData.getWaterPresentation = () => waterCrossings.getPresentation();
  group.userData.getOceanPresentation = () => water.userData.getPresentation();
  group.userData.getWeatherPresentation = () => weather.getPresentation();
  group.userData.update = (cameraPosition, time = 0, oceanTime = time) => {
    if (disposed) return;
    waterCrossings.update(time, reducedMotion, quality);
    leviathan.update(time, { reducedMotion, quality, overview });
    weather.update(cameraPosition, time, { reducedMotion, quality, overview });
    const state = sampleNacreWater(cameraPosition.y, waterY);
    const motionTime = reducedMotion ? 0 : time;
    timeUniform.value = motionTime;
    water.material.uniforms.time.value = reducedMotion ? 0 : oceanTime;
    water.material.uniforms.wetness.value = state.submerged;
    water.material.uniforms.nearSurface.value = nacreWaterCrossingBlend(
      cameraPosition.y,
      waterY,
    );
    particles.material.uniforms.time.value = motionTime;
    particles.material.uniforms.wetness.value = state.submerged;
    const selectedLights = selectReefLightAnchors(
      world.lightAnchors,
      cameraPosition,
    );
    for (const [index, light] of reefLights.entries()) {
      const candidate = selectedLights[index];
      light.intensity =
        candidate && !overview
          ? candidate.intensity * candidate.visibility * state.submerged
          : 0;
      if (candidate) {
        light.position.copy(candidate.anchor.position);
        light.color.set(candidate.anchor.color);
      }
    }
    group.userData.waterState = state;
  };
  group.userData.updateScene = (
    scene,
    cameraPosition,
    time = 0,
    settings = {},
    oceanTime = time,
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
    group.userData.update(cameraPosition, time, oceanTime);
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
      weather.metrics.meshCount +
      leviathan.metrics.meshCount,
    triangleCount:
      world.group.userData.metrics.triangleCount +
      groundGeometry.index.count / 3 +
      water.userData.getPresentation().highTriangles +
      waterCrossings.metrics.triangleCount +
      weather.metrics.triangleCount +
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
    bubblePoolSlots: waterCrossings.metrics.bubbleSlots,
    maxBubbleDraws: waterCrossings.metrics.bubbleSlots,
    maxSplashDraws: waterCrossings.metrics.splashSlots * 2,
    crossingTriangles: waterCrossings.metrics.triangleCount,
    localLights: 3,
    additionalShadowPasses: 0,
    lowPoints:
      800 +
      waterCrossings.metrics.splashPointsLow +
      leviathan.metrics.sprayPointsLow,
    weatherDraws: weather.metrics.meshCount,
    weatherTrianglesHigh: weather.metrics.triangleCount,
    weatherTrianglesLow: weather.metrics.lowTriangleCount,
    textures: 1,
    borrowedSkyTextures: skyTexture ? 1 : 0,
    additionalRenderPasses: 1,
    waterPasses: 1,
    reflectionPasses: 1,
    stage: 'production',
    rendering:
      'Instanced scenery, two-sided ocean, bounded high-quality planar reflection, local sea mist and sparse rain, no new shadow lights',
  };
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    waterCrossings.clear();
    weather.clear();
    mineralSurface.dispose();
    water.userData.dispose?.();
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
  group.userData.ready = Promise.all([leviathan.ready, mineralSurface.ready])
    .then(([, mineralReady]) => {
      if (!disposed) group.userData.metrics.textures = mineralReady ? 3 : 1;
    })
    .catch((error) => {
      group.userData.dispose();
      throw error;
    });
  return group;
}
