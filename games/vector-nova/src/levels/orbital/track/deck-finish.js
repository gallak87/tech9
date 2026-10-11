import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { assetURL } from '../../../assets/url.js';

// Original analytic PBR maps; source and rights: assets/levels/orbital/deck/.
// Native deck UVs cover 28 m across / 12 m along. Keep those intact for the
// lattice and distance-based neon; six columns × two rows retain cassette size.
export function createDeckFinish(renderer) {
  const materials = new Set();
  const textures = new Set();
  let disposed = false;
  let maps = null;
  let reflection = null;
  const manager = new THREE.LoadingManager();
  function apply(material) {
    if (!maps) return;
    material.map = maps[0];
    material.normalMap = maps[1];
    material.aoMap = material.roughnessMap = material.metalnessMap = maps[2];
    material.color.set(0xffffff);
    material.roughness = material.metalness = 1;
    material.needsUpdate = true;
  }
  const loader = renderer
    ? new KTX2Loader(manager)
        .setTranscoderPath(assetURL('assets/ships/decoder/'))
        .setWorkerLimit(2)
        .detectSupport(renderer)
    : null;
  // CPU geometry review has no renderer or fetches. Runtime readiness includes
  // every map, including bindings cloned before asynchronous decoding completes.
  const ready = loader
    ? Promise.allSettled(
        ['color', 'normal', 'arm'].map(async (name) => {
          const texture = await loader.loadAsync(
            assetURL(`assets/levels/orbital/deck/${name}.ktx2`),
          );
          if (disposed) {
            texture.dispose();
            return null;
          }
          texture.name = `Asterion cassette / ${name}`;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(6, 2);
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          texture.colorSpace =
            name === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          textures.add(texture);
          return texture;
        }),
      )
        .then((results) => {
          const failure = results.find(
            (result) => result.status === 'rejected',
          );
          if (failure)
            throw new Error('Asterion deck finish failed to load', {
              cause: failure.reason,
            });
          if (disposed) return;
          maps = results.map((result) => result.value);
          materials.forEach(apply);
        })
        .finally(() => loader.dispose())
    : Promise.resolve();
  return {
    ready,
    bind(material) {
      material.name = 'Asterion coated alloy / sealed induction cassettes';
      material.color.set(0x6f818e);
      material.roughness = 0.43;
      material.metalness = 0.23;
      material.aoMapIntensity = 0.65;
      material.envMapIntensity = 0.65;
      material.envMap = reflection;
      material.userData.orbitalDeck = true;
      // Stable small finish differences between installed cassettes. Use native
      // UVs rather than repeated texture coordinates, so variation does not tile.
      // Keep the neon shader on its clone; only wrap its existing compile hook.
      const compile = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, view) => {
        compile.call(material, shader, view);
        shader.vertexShader =
          `varying vec2 cassetteUv;\n${shader.vertexShader}`.replace(
            '#include <uv_vertex>',
            '#include <uv_vertex>\n cassetteUv = uv * vec2(6.0, 2.0);',
          );
        shader.fragmentShader =
          `varying vec2 cassetteUv;\n${shader.fragmentShader}`
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
            vec3 cassetteSeed = fract(vec3(floor(cassetteUv).xyx) * .1031);
            cassetteSeed += dot(cassetteSeed, cassetteSeed.yzx + 33.33);
            float cassetteBatch = fract((cassetteSeed.x + cassetteSeed.y) * cassetteSeed.z);`,
            )
            .replace(
              '#include <color_fragment>',
              `#include <color_fragment>
            diffuseColor.rgb *= .91 + .18 * cassetteBatch;`,
            )
            .replace(
              '#include <roughnessmap_fragment>',
              `#include <roughnessmap_fragment>
            roughnessFactor = clamp(roughnessFactor + .09 * (cassetteBatch - .5), .15, 1.0);`,
            );
      };
      material.customProgramCacheKey = () =>
        `${cacheKey}-asterion-cassette-batches-v1`;
      materials.add(material);
      apply(material);
    },
    setReflection(texture) {
      // Borrow the existing district probe: no new capture, pass or ownership.
      reflection = texture;
      materials.forEach((material) => {
        material.envMap = texture;
        material.needsUpdate = true;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      manager.abort();
      textures.forEach((texture) => texture.dispose());
      textures.clear();
      materials.clear();
      maps = reflection = null;
    },
  };
}
