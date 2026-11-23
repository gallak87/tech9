import { assetURL } from '../assets/url.js';
import zephyrAssets from './kits/zephyr-assets.json' with { type: 'json' };
import glasswakeAssets from './kits/glasswake-assets.json' with { type: 'json' };
import saffronAssets from './kits/saffron-assets.json' with { type: 'json' };
import helionAssets from './kits/helion-assets.json' with { type: 'json' };
import umbraAssets from './kits/umbra-assets.json' with { type: 'json' };
import ravelAssets from './kits/ravel-assets.json' with { type: 'json' };
import nomadAssets from './kits/nomad-assets.json' with { type: 'json' };
import orielAssets from './kits/oriel-assets.json' with { type: 'json' };
import worldspireAssets from './kits/worldspire-assets.json' with { type: 'json' };
import { finishZephyrMaterial } from '../levels/zephyr/environment/materials.js';
import { finishIceMaterial } from '../levels/glasswake/environment/materials.js';
import { finishThermalMaterial } from '../levels/helion/environment/materials.js';
import { finishUmbraMaterial } from '../levels/umbra/environment/materials.js';
import { finishWorldspireMineral } from '../levels/worldspire/environment/mineral-materials.js';
import { finishNomadSalt } from '../levels/nomad/salt-material.js';
import { buildRavelSails } from './ravel-sails.js';
import {
  createIndustrialBiomeFinish,
  industrialCoordinates,
  createOrielBiomeFinish,
  createSaffronBiomeFinish,
  configureStaticTexture,
} from './static-biome-finishes.js';
import {
  planZephyr,
  planGlasswake,
  planSaffron,
  planHelion,
  planUmbra,
  planRavel,
  planNomad,
  planOriel,
  planWorldspire,
  applyStaticContactPolicy,
  fillStaticRoadside,
  staticContactStats,
} from './static-biome-plans.js';

function descriptor(id, metadata, plan, options = {}) {
  const assets = Object.freeze(
    Object.fromEntries(
      Object.entries(metadata).map(([key, asset]) => [
        key,
        Object.freeze({ ...asset, url: assetURL(asset.url) }),
      ]),
    ),
  );
  return Object.freeze({
    id,
    assets,
    configureTexture: configureStaticTexture,
    plan(doc, track, region, placement) {
      plan(doc, track, region, placement, assets);
      applyStaticContactPolicy(doc, region, placement, assets);
      fillStaticRoadside(doc, track, region, placement, assets, options);
    },
    build: ({ placement }) => ({
      stats: staticContactStats(placement),
      dispose() {},
    }),
    ...options,
  });
}

const descriptors = Object.freeze({
  zephyr: descriptor('zephyr', zephyrAssets, planZephyr, {
    name: 'Zephyr / sacred archipelago',
    grounded: false,
    waterEnabled: false,
    limit: 48,
    textures: {
      stone: assetURL('assets/levels/zephyr/zephyr-limestone-v1.png'),
    },
    finishMaterial: (material, asset, textures) =>
      finishZephyrMaterial(material, { stoneTexture: textures.stone }),
  }),
  glasswake: descriptor('glasswake', glasswakeAssets, planGlasswake, {
    name: 'Glasswake / fractured glacier',
    grounded: true,
    waterEnabled: false,
    limit: 120,
    textures: { ice: assetURL('assets/levels/glasswake/ice-surface-v1.png') },
    finishMaterial: (material, asset, textures) =>
      finishIceMaterial(material, textures.ice),
    finishTerrain(materials, textures) {
      materials.soil.name = 'Glasswake / frost terrain';
      finishIceMaterial(materials.soil, textures.ice);
    },
  }),
  saffron: descriptor('saffron', saffronAssets, planSaffron, {
    name: 'Saffron / fossil desert',
    grounded: true,
    waterEnabled: false,
    limit: 140,
    createFinish(context) {
      const finish = createSaffronBiomeFinish(context);
      context.staticFinish = finish;
      return finish;
    },
    finishTerrain(materials, textures, context) {
      context.staticFinish?.finishTerrain(materials.soil);
    },
  }),
  helion: descriptor('helion', helionAssets, planHelion, {
    name: 'Helion / thermal observatories',
    grounded: false,
    waterEnabled: false,
    limit: 48,
    finishMaterial(material) {
      finishThermalMaterial(
        material,
        /graphite|carbon/i.test(material.name)
          ? 'graphite'
          : /copper|bronze/i.test(material.name)
            ? 'copper'
            : 'ceramic',
      );
    },
  }),
  umbra: descriptor('umbra', umbraAssets, planUmbra, {
    name: 'Umbra / observatory ruins',
    grounded: false,
    waterEnabled: false,
    limit: 48,
    textures: {
      surface: assetURL('assets/levels/umbra/umbra-surfaces-v1.png'),
    },
    finishMaterial(material, asset, textures) {
      const kind = /fractures/i.test(material.name)
        ? 'fresh'
        : /aged/i.test(material.name)
          ? 'aged'
          : /ivory/i.test(material.name)
            ? 'stone'
            : /titanium|instrument/i.test(material.name)
              ? 'metal'
              : /graphite/i.test(material.name)
                ? 'graphite'
                : null;
      if (kind) finishUmbraMaterial(material, kind, textures.surface, true);
    },
  }),
  ravel: descriptor('ravel', ravelAssets, planRavel, {
    name: 'Ravel / anchor fleet',
    grounded: false,
    waterEnabled: false,
    limit: 60,
    createFinish: (context) => createIndustrialBiomeFinish(context, 'ravel'),
    prepareGeometry: industrialCoordinates,
    build(context) {
      const sails = buildRavelSails(context);
      const stats = staticContactStats(context.placement);
      if (!sails) return { stats, dispose() {} };
      sails.stats = {
        ...stats,
        collectorSails: sails.group.children.filter(
          (node) => !node.isBatchedMesh,
        ).length,
      };
      return sails;
    },
  }),
  nomad: descriptor('nomad', nomadAssets, planNomad, {
    name: 'Nomad / parked salt convoy',
    grounded: true,
    waterEnabled: false,
    limit: 180,
    createFinish: (context) => createIndustrialBiomeFinish(context, 'nomad'),
    prepareGeometry: industrialCoordinates,
    finishTerrain({ soil }) {
      soil.color.set('#d7d9d3');
      finishNomadSalt(soil);
      soil.needsUpdate = true;
    },
  }),
  oriel: descriptor('oriel', orielAssets, planOriel, {
    name: 'Oriel / inhabited civic gardens',
    grounded: true,
    waterEnabled: true,
    limit: 140,
    createFinish: createOrielBiomeFinish,
  }),
  worldspire: descriptor('worldspire', worldspireAssets, planWorldspire, {
    name: 'Worldspire / solitary mineral monolith',
    grounded: true,
    waterEnabled: false,
    limit: 1,
    textures: {
      exposure: assetURL('assets/levels/worldspire/mineral-v2.png'),
      mineral: assetURL('assets/levels/worldspire/fractured-obsidian-v1.png'),
    },
    finishMaterial(material, asset, textures) {
      if (/bronze|pale portal/i.test(material.name))
        finishZephyrMaterial(material);
      if (
        /mineral light inclusions|amber core inclusions/i.test(material.name)
      ) {
        const warm = /amber core/i.test(material.name);
        material.map = material.emissiveMap = textures.exposure;
        material.emissiveIntensity = warm ? 4.2 : 4.8;
        material.color.set(warm ? '#e8b780' : '#9cd0c7');
        material.roughness = 0.62;
        material.metalness = 0.06;
      }
      if (
        /obsidian|fracture|calm exposed|calm cavity|rough root|weathered mineral/i.test(
          material.name,
        )
      )
        finishWorldspireMineral(material, textures.mineral, textures.exposure);
    },
  }),
});

export function staticBiomeDescriptor(id) {
  return descriptors[id] ?? null;
}
