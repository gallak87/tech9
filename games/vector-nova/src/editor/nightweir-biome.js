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
import { roadsideScenerySites } from './roadside-scenery.js';

const assets = Object.fromEntries(
  Object.entries(metadata).map(([id, asset]) => [
    id,
    { ...asset, url: assetURL(asset.url) },
  ]),
);
const basinHorizon = {
  offsets: [400, 900, 1700, 3100, 5200, 8200, 13500],
  heightAt(x, z, offset, plan) {
    const phase = (plan.seed % 853) * 0.035;
    const ridge = 0.48 + 0.52 * Math.sin(x * 0.0011 - z * 0.00066 + phase) ** 2;
    const front = (offset - 1660) / 1210;
    const rear = (offset - 4900) / 2700;
    return (
      ridge * (430 * Math.exp(-front * front) + 590 * Math.exp(-rear * rear))
    );
  },
};

function buildBankWorks({ doc, track, plan, placement, owner, materials }) {
  const sites = roadsideScenerySites(track, doc.settings.density, 11);
  const factories = ['generating-house', 'brick-pressureworks'];
  const civic = ['municipal-wing', 'residential-court', 'public-gallery'];
  const up = new T.Vector3(0, 1, 0);
  const industrial = doc.settings.sceneryPreset === 'industrial';
  let count = 0;
  for (const site of sites) {
    const family = industrial || site.id % 3 === 0 ? factories : civic;
    const asset = family[Math.floor(placement.random() * family.length)];
    const [lo, hi] = assets[asset].bounds;
    const scale = new T.Vector3(
      1.32 + placement.random() * 0.38,
      1.22 + placement.random() * 0.48,
      1.18 + placement.random() * 0.3,
    );
    const halfWidth = ((hi[0] - lo[0]) * scale.x) / 2 + 13;
    const halfDepth = ((hi[2] - lo[2]) * scale.z) / 2 + 9;
    const height = (hi[1] - lo[1]) * scale.y;
    const side = placement.random() < 0.5 ? -1 : 1;
    const yaw = site.yaw + (side * Math.PI) / 2;
    const rotation = new T.Quaternion().setFromAxisAngle(up, yaw);
    for (const offset of [95, -95, 155, -155, 230, -230, 315, -315]) {
      const center = site.position
        .clone()
        .addScaledVector(site.right, side * offset);
      const transform = new T.Matrix4()
        .makeRotationY(yaw)
        .setPosition(center.x, 0, center.z);
      let top = -Infinity;
      let bottom = Infinity;
      for (const u of [-halfWidth, 0, halfWidth]) {
        for (const v of [-halfDepth, 0, halfDepth]) {
          const p = new T.Vector3(u, 0, v).applyMatrix4(transform);
          const ground = plan.surfaceHeight(p.x, p.z);
          bottom = Math.min(bottom, ground - 1.25);
          top = Math.max(top, ground + 0.7, plan.waterHeight(p.x, p.z) + 2);
        }
      }
      if (top - bottom > 32 || site.position.y - top > height + 65) continue;
      const foundation = new T.Box3(
        new T.Vector3(-halfWidth, bottom, -halfDepth),
        new T.Vector3(halfWidth, top, halfDepth),
      ).applyMatrix4(transform);
      if (!placement.clears(foundation)) continue;
      if (
        !placement.place(asset, {
          id: `bank-works-${site.id}`,
          x: center.x,
          y: top - 0.1,
          z: center.z,
          yaw,
          scale,
          embed: 0,
          solid: false,
        })
      )
        continue;
      owner.block(
        'Nightweir / bank works foundation',
        materials.concrete,
        center.setY((top + bottom) / 2),
        new T.Vector3(halfWidth * 2, top - bottom, halfDepth * 2),
        rotation,
      );
      count++;
      break;
    }
  }
  return count;
}

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
  farGround: true,
  exteriorRelief: basinHorizon,
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
    const bankWorks = buildBankWorks(context);
    const town = buildNightweirDistricts(context);
    town.stats.bankWorks = bankWorks;
    return town;
  },
};
