import * as T from 'three';
import { assetURL } from '../assets/url.js';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import { bindNomadArmourFinish } from '../levels/nomad/armour-finish.js';
import { createOrielStoneMaps } from '../levels/oriel/environment/stone-maps.js';
import { finishHabitatMaterial } from '../levels/oriel/environment/habitat.js';
import { createResources } from '../levels/saffron/environment/geometry.js';
import {
  createSaffronMaterials,
  applyFossilWeathering,
  applyGeologicalWeathering,
} from '../levels/saffron/environment/materials.js';

/** The public production loaders can resolve after an editor replacement was
 * canceled. Every result still acquires exactly one, late-safe owner. */
function finishOwner() {
  const releases = [],
    textures = new Set();
  let disposed = false;
  return {
    ownedTextures: textures,
    own(value) {
      if (disposed) value.dispose();
      else {
        if (value.isTexture) textures.add(value);
        releases.push(() => value.dispose());
      }
      return value;
    },
    defer(release) {
      if (disposed) release();
      else releases.push(release);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const release of releases.reverse()) release();
      releases.length = 0;
      textures.clear();
    },
  };
}

export function createIndustrialBiomeFinish(
  { renderer, collectSolid },
  family,
) {
  if (collectSolid) return null;
  // Borrow the production shader binder, while this editor owner loads the
  // byte-identical public surfaces. Worldkit's import-relative image URLs can
  // otherwise resolve through a package symlink into another worktree.
  const finish = createIndustrialFinish(null),
    owner = finishOwner(),
    maps = {};
  owner.defer(() => finish.dispose());
  owner.ready = renderer
    ? Promise.allSettled(
        [
          ['steel', 'rolled-steel-v1.png'],
          ['shell', 'worn-enamel-v1.png'],
        ].map(async ([kind, filename]) => {
          const texture = owner.own(
            await new T.TextureLoader().loadAsync(
              assetURL('assets/editor/surfaces/' + filename),
            ),
          );
          configureStaticTexture(texture);
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          maps[kind] = texture;
        }),
      ).then((results) => {
        const failure = results.find((result) => result.status === 'rejected');
        if (failure)
          throw new Error('Industrial editor finish could not load.', {
            cause: failure.reason,
          });
      })
    : Promise.resolve();
  return {
    ready: owner.ready,
    ownedTextures: owner.ownedTextures,
    dispose: () => owner.dispose(),
    finishMaterial(material, asset) {
      if (/Power|light|window|glass/i.test(material.name)) return;
      const kind =
        asset?.industrialKind ??
        (/ivory|oxide|enamel/i.test(material.name)
          ? 'shell'
          : /navy|machinery|graphite/i.test(material.name)
            ? 'dark'
            : 'steel');
      finish.bind(material, kind, asset?.industrialCoordinates ?? 'part');
      const compile = material.onBeforeCompile,
        map = maps[kind === 'shell' ? 'shell' : 'steel'] ?? null;
      material.map = map;
      material.onBeforeCompile = function (shader, view) {
        compile.call(this, shader, view);
        shader.uniforms.industrialDetail.value = map;
      };
      if (family === 'nomad' && /ivory/i.test(material.name))
        bindNomadArmourFinish(material);
    },
  };
}

export function industrialCoordinates(geometry) {
  geometry.setAttribute(
    'industrialCoord',
    geometry.attributes.position.clone(),
  );
}

export function createOrielBiomeFinish({ renderer, collectSolid }) {
  if (collectSolid || !renderer) return null;
  const owner = finishOwner();
  let maps;
  owner.ready = createOrielStoneMaps(renderer, owner).then((value) => {
    maps = value;
  });
  owner.finishMaterial = (material) => {
    if (/limestone|cornice/i.test(material.name)) maps.apply(material);
    finishHabitatMaterial(material, { bounce: 0.25 });
  };
  owner.prepareGeometry = (geometry, asset, node) => {
    if (
      [node.material]
        .flat()
        .some((material) => /limestone|cornice/i.test(material.name))
    )
      maps.coordinates(geometry);
  };
  return owner;
}

export function createSaffronBiomeFinish({ collectSolid }) {
  if (collectSolid) return null;
  const resources = createResources(),
    textures = new Set();
  let disposed = false;
  const ownTexture = resources.texture.bind(resources);
  resources.texture = (texture) => {
    if (!disposed) textures.add(texture);
    return ownTexture(texture);
  };
  const materials = createSaffronMaterials(resources);
  return {
    ready: materials.ready,
    ownedTextures: textures,
    finishMaterial(material, asset) {
      if (['dune', 'dune-1', 'outcrop', 'outcrop-1'].includes(asset))
        applyGeologicalWeathering(material, materials.weatheringTexture);
      else
        applyFossilWeathering(
          material,
          materials.weatheringTexture,
          materials.mineralSurface,
        );
    },
    finishTerrain(material) {
      applyGeologicalWeathering(material, materials.weatheringTexture);
    },
    dispose() {
      disposed = true;
      resources.dispose();
      textures.clear();
    },
  };
}

export function configureStaticTexture(texture) {
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
}
