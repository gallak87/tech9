import * as T from 'three';
import { createResources, countResources, routePosition } from './geometry.js';
import { createSaffronMaterials } from './materials.js';
import { createLandformSurvey, createTerrain } from './terrain.js';
import { createFossils } from './fossils.js';
import { createSurveyStation } from './station.js';
import { createDesertEffects } from './effects.js';

export function createSaffronEnvironment(
  { track, settings = {} },
  { shape = false, loadAsset } = {},
) {
  const group = new T.Group();
  group.name = shape
    ? 'Saffron / route-clearance terrain study'
    : 'Saffron / archaeological fossil desert';
  const resources = createResources();
  const materials = createSaffronMaterials(resources, shape);
  const survey = createLandformSurvey(track);
  const terrain = createTerrain(track, survey, materials, resources, shape);
  const fossils = createFossils(track, survey, resources, { shape, loadAsset });
  const station = createSurveyStation(track, survey, materials, resources);
  const effects = createDesertEffects(
    track,
    survey,
    materials,
    resources,
    fossils.burrower,
  );
  group.add(terrain.group, fossils.group, station, effects.group);
  station.visible = !shape;
  effects.group.visible = !shape;
  const lightAnchors = [
    [track.landmarks.skullStart + 44, -22, 18, '#f7cb80', 1750],
    [track.landmarks.skullCenter, 25, 24, '#ffe0a4', 2100],
    [track.landmarks.skullEnd - 28, -20, 20, '#edbe73', 1800],
    [track.landmarks.sandfall + 22, -32, 18, '#f4c779', 1250],
  ];
  const lights = lightAnchors.map(([s, lateral, height, color, intensity]) => {
    const light = new T.PointLight(color, shape ? 0 : intensity, 140, 2);
    light.name = 'Saffron / warm sand reflected into sheltered bone';
    light.position.copy(routePosition(track, s, lateral, height));
    light.castShadow = false;
    group.add(light);
    return light;
  });
  let disposed = false;
  let quality = settings.quality ?? 'high';
  let reducedMotion = Boolean(settings.reducedMotion);
  let overview = false;
  const metrics = {
    ...countResources(group),
    localLights: lights.length,
    modelLoaded: false,
    ownedTextures: 0,
    nearPropCount: terrain.nearPropCount,
    source:
      'Original scene-guided Blender kit with route-aware procedural geological terrain',
  };
  group.userData.metrics = metrics;
  group.userData.getLeviathanPresentation = () => ({
    ...fossils.getPresentation(),
    ...effects.getPresentation(),
    quality,
    reducedMotion,
  });
  group.userData.getWorldPresentation = group.userData.getLeviathanPresentation;
  function dispose() {
    if (disposed) return;
    disposed = true;
    fossils.dispose();
    effects.dispose();
    resources.dispose();
    group.clear();
  }
  const ready = fossils.ready
    .then((loaded) => {
      if (disposed) return false;
      Object.assign(metrics, countResources(group), { modelLoaded: loaded });
      return loaded;
    })
    .catch((error) => {
      dispose();
      throw error;
    });
  return {
    group,
    ready,
    update(frame) {
      if (disposed) return;
      quality = frame.settings?.quality ?? quality;
      reducedMotion = Boolean(frame.settings?.reducedMotion);
      overview = Boolean(frame.reviewing);
      terrain.group.visible = !overview;
      fossils.group.visible = !overview;
      station.visible = !overview && !shape;
      for (let i = 0; i < lights.length; i++)
        lights[i].intensity = overview || shape ? 0 : lightAnchors[i][5];
      if (!shape) effects.update(frame);
    },
    reset() {
      if (!disposed && !shape)
        effects.update({
          time: 0,
          settings: { quality, reducedMotion },
          reviewing: overview,
        });
    },
    dispose,
  };
}
