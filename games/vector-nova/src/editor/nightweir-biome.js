import * as T from 'three';
import metadata from './kits/nightweir-assets.json' with { type: 'json' };
import { assetURL } from '../assets/url.js';
import { buildNightweirDistricts } from './nightweir-districts.js';
import { instanceFinish } from './world-owner.js';
import { createHelionCeramicMaps } from '../levels/helion/track/ceramic-maps.js';
import {
  finishNightweirConcrete,
  finishNightweirMetal,
  finishNightweirBrick,
  finishNightweirRoof,
  finishNightweirRock,
  finishNightweirSkyVisibility,
} from '../levels/nightweir/environment/materials.js';
import { finishNightweirWindows } from '../levels/nightweir/environment/blackstart.js';
import { createNightweirBasinMaterial } from '../levels/nightweir/environment/basin-material.js';
import { createNacreOceanNormals } from '../levels/nacre/environment/ocean-normals.js';
import { fillStaticRoadside } from './static-biome-plans.js';

const assets = Object.fromEntries(
  Object.entries(metadata).map(([id, asset]) => [
    id,
    { ...asset, url: assetURL(asset.url) },
  ]),
);
function createFinish(context) {
  if (context.collectSolid) return null;
  const substrate = new T.MeshStandardMaterial();
  const maps = createHelionCeramicMaps(context.renderer, [substrate]);
  const ripple = createNacreOceanNormals(128);
  const clock = { value: 0 };
  context.nightweirWater = { ripple, clock };
  return {
    ready: maps.ready,
    get ownedTextures() {
      return new Set(
        [
          ripple,
          substrate.map,
          substrate.normalMap,
          substrate.roughnessMap,
        ].filter(Boolean),
      );
    },
    finishMaterial(material) {
      if (
        /precast|retaining|limestone|service stone/i.test(material.name) &&
        !/roof/i.test(material.name)
      ) {
        for (const key of ['map', 'normalMap', 'roughnessMap'])
          material[key] = substrate[key];
        material.normalScale.set(0.48, 0.48);
      }
    },
    update(frame) {
      clock.value = frame.time ?? 0;
    },
    dispose() {
      maps.dispose();
      ripple.dispose();
      substrate.dispose();
    },
  };
}

export const nightweirBiomeDescriptor = {
  name: 'Nightweir occupied waterfront',
  id: 'nightweir-civic-production-v1',
  assets,
  limit: 640,
  grounded: true,
  waterEnabled: true,
  textures: {
    brick: assetURL('assets/levels/nightweir/fired-brick-v1.png'),
    roof: assetURL('assets/levels/nightweir/zinc-roof-v1.png'),
    limestone: assetURL('assets/levels/shatterline/limestone-v1.png'),
    strata: assetURL('assets/levels/nightweir/gorge-strata-v1.png'),
    scree: assetURL('assets/levels/nightweir/damp-scree-v1.png'),
  },
  configureTexture(texture, key) {
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 8;
    if (key === 'brick') texture.repeat.setScalar(1 / 1.25);
    if (key === 'roof') texture.repeat.setScalar(1 / 8);
  },
  createFinish,
  materials(owner, context) {
    if (!context.nightweirWater) return {};
    const water = createNightweirBasinMaterial(
      context.nightweirWater.clock,
      context.nightweirWater.ripple,
    );
    owner.materials.add(water);
    return { water };
  },
  finishMaterial(material, asset, textures) {
    const name = material.name;
    if (/fired brick/i.test(name))
      finishNightweirBrick(material, textures.brick);
    else if (/zinc roofing/i.test(name))
      finishNightweirRoof(material, textures.roof);
    else if (
      /occupied amber rooms|occupied pale rooms|recessed blue glass/i.test(name)
    ) {
      finishNightweirWindows(material, { front: { value: 1e9 } });
      const finish = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        finish(shader, renderer);
        shader.vertexShader = shader.vertexShader.replace(
          'nwWindowNormal=normalize(mat3(modelMatrix)*normal);',
          `vec3 nwN=normal;
#ifdef USE_INSTANCING
nwN=mat3(instanceMatrix)*nwN;
#endif
nwWindowNormal=normalize(mat3(modelMatrix)*nwN);`,
        );
      };
    } else if (/oxide|ironwork|enamel|steel/i.test(name))
      finishNightweirMetal(material);
    else if (/precast|retaining|limestone|service stone/i.test(name))
      finishNightweirConcrete(material);
    finishNightweirSkyVisibility(material);
    instanceFinish(material);
  },
  finishTerrain(materials, textures) {
    finishNightweirRock(
      materials.soil,
      textures.limestone,
      textures.strata,
      textures.scree,
    );
  },
  build(context) {
    const town = buildNightweirDistricts(context);
    const { doc, track, plan, placement } = context;
    fillStaticRoadside(doc, track, plan, placement, assets, {
      grounded: true,
      waterEnabled: true,
    });
    return town;
  },
};
