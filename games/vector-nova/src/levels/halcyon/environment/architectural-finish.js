import * as THREE from 'three';
import { assetURL } from '../../../assets/url.js';
import { createHelionCeramicMaps } from '../../helion/track/ceramic-maps.js';

// Borrow the same licensed concrete and project-authored brick/zinc as Nightweir.
// World-metre coordinates survive merged city batches and instanced bridge piers.
export function finishArchitecture(material, kind = 'concrete') {
  const scale =
    kind === 'brick' ? [1.25, 1.25] : kind === 'roof' ? [8, 8] : [4.4, 2.2];
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 hcPoint;\n' +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
      vec4 hp=vec4(position,1.); vec3 hn=normal;
      #ifdef USE_INSTANCING
      hp=instanceMatrix*hp; hn=mat3(instanceMatrix)*hn;
      #endif
      hcPoint=(modelMatrix*hp).xyz;
      vec3 an=abs(normalize(mat3(modelMatrix)*hn));
      vec2 metric=an.y>.65?hcPoint.xz:(an.x>an.z?hcPoint.zy:hcPoint.xy);
      metric/=vec2(${scale[0].toFixed(2)},${scale[1].toFixed(2)});
      #ifdef USE_MAP
      vMapUv=metric;
      #endif
      #ifdef USE_NORMALMAP
      vNormalMapUv=metric;
      #endif
      #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv=metric;
      #endif`,
      );
    shader.fragmentShader =
      'varying vec3 hcPoint;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float streak=pow(.5+.5*sin(hcPoint.x*.77+hcPoint.z*.61+sin(hcPoint.x*.12+hcPoint.z*.15)),6.);
      float age=.5+.5*sin(hcPoint.y*.055+sin(hcPoint.x*.03+hcPoint.z*.04));
      diffuseColor.rgb*=1.-streak*age*.14;
      ${
        kind === 'concrete'
          ? `float joint=1.-smoothstep(.018,.05+fwidth(hcPoint.y),abs(mod(hcPoint.y+1.5,3.)-1.5));
      diffuseColor.rgb*=1.-joint*.13;`
          : ''
      }`,
      );
  };
  material.customProgramCacheKey = () => `halcyon-metric-${kind}-v1`;
}

export function createArchitectureMaps(
  renderer,
  { concrete = [], brick = [], roof = [] },
) {
  for (const material of concrete) {
    finishArchitecture(material);
    material.normalScale.set(0.38, 0.38);
  }
  for (const material of brick) finishArchitecture(material, 'brick');
  for (const material of roof) finishArchitecture(material, 'roof');
  const ceramic = createHelionCeramicMaps(renderer, concrete);
  const textures = new Set();
  let disposed = false;
  const manager = new THREE.LoadingManager();
  const loader = new THREE.TextureLoader(manager);
  const load = async (path, materials) => {
    if (!materials.length || !renderer) return;
    const texture = await loader.loadAsync(
      assetURL(`assets/levels/nightweir/${path}`),
    );
    if (disposed) {
      texture.dispose();
      return;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.add(texture);
    for (const material of materials) {
      material.map = texture;
      material.needsUpdate = true;
    }
  };
  const ready = Promise.allSettled([
    ceramic.ready,
    load('fired-brick-v1.png', brick),
    load('zinc-roof-v1.png', roof),
  ]).then((results) => {
    const failure = results.find((r) => r.status === 'rejected');
    if (failure)
      throw new Error('Halcyon architectural finish failed to load', {
        cause: failure.reason,
      });
  });
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      manager.abort();
      ceramic.dispose();
      textures.forEach((t) => t.dispose());
      textures.clear();
    },
  };
}
