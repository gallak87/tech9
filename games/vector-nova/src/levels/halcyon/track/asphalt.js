import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { assetURL } from '../../../assets/url.js';

// Poly Haven Asphalt 03, CC0. Source files, authors and the deterministic KTX2
// build live in assets/levels/halcyon/asphalt. One repeat is 2.05 metres square.
const REPEAT_METRES = 2.05;
export function createAsphalt(renderer, width) {
  const manager = new THREE.LoadingManager();
  const loader = new KTX2Loader(manager)
    .setTranscoderPath(assetURL('assets/ships/decoder/'))
    .setWorkerLimit(2)
    .detectSupport(renderer);
  const textures = new Set();
  let disposed = false;
  const moisture = { value: 0.8 };
  const material = new THREE.MeshStandardMaterial({
    name: 'Halcyon fine asphalt / metre-scaled aggregate',
    color: 0xffffff,
    metalness: 0.02,
    roughness: 1,
    normalScale: new THREE.Vector2(1.6, 1.6),
    aoMapIntensity: 0.4,
    envMapIntensity: 1.4,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roadMoisture = moisture;
    shader.vertexShader =
      'varying vec2 roadMetres;\n' +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\nroadMetres = uv * vec2(${width.toFixed(1)}, 16.0);`,
      );
    shader.fragmentShader =
      `varying vec2 roadMetres;
      uniform float roadMoisture;
      float asphaltHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * .1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float asphaltNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(asphaltHash(i),asphaltHash(i+vec2(1,0)),f.x),
          mix(asphaltHash(i+vec2(0,1)),asphaltHash(i+vec2(1,1)),f.x),f.y);
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      // Broad moisture is independent of the 2 m aggregate repeat. No large
      // repeating stains, painted specular highlights, or stretched grain.
      float asphaltMacro = asphaltNoise(roadMetres * vec2(.14,.11)) * .65
        + asphaltNoise(roadMetres * .43 + vec2(17.2,4.8)) * .35;
      float asphaltWet = clamp(roadMoisture * (.38 + .85 * smoothstep(.25,.75,asphaltMacro)),0.,1.);
      diffuseColor.rgb *= mix(1., .68, asphaltWet) * (.94 + .12 * asphaltMacro);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(mix(.5,.035,asphaltWet) + (roughnessFactor-.8)*.5,.07,.85);`,
    );
  };
  material.customProgramCacheKey = () => 'halcyon-asphalt-metres-v1';
  const ready = Promise.allSettled(
    ['color', 'normal', 'arm'].map(async (name) => {
      const texture = await loader.loadAsync(
        assetURL(`assets/levels/halcyon/asphalt/${name}.ktx2`),
      );
      if (disposed) {
        texture.dispose();
        return null;
      }
      texture.name = `Halcyon asphalt / ${name}`;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(width / REPEAT_METRES, 16 / REPEAT_METRES);
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
      const failure = results.find((result) => result.status === 'rejected');
      if (failure)
        throw new Error('Halcyon asphalt failed to load', {
          cause: failure.reason,
        });
      if (disposed) return;
      const [color, normal, arm] = results.map((result) => result.value);
      material.map = color;
      material.normalMap = normal;
      material.roughnessMap = material.aoMap = arm;
      material.needsUpdate = true;
    })
    .finally(() => loader.dispose());
  return {
    material,
    ready,
    update(sheen) {
      moisture.value = sheen;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      manager.abort();
      textures.forEach((texture) => texture.dispose());
      textures.clear();
      material.dispose();
    },
  };
}
