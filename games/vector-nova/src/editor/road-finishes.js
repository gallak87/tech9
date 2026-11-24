import * as T from 'three';
import { assetURL } from '../assets/url.js';
import { appendShaderPatch, replaceShader } from '../renderer/shader-patch.js';
import { editorBiome } from './biomes.js';

const empty = () => ({ ready: Promise.resolve(), dispose() {} });
function repeatMaps(material, width, length, tile) {
  const maps = new Set(
    [
      material.map,
      material.normalMap,
      material.roughnessMap,
      material.aoMap,
      material.metalnessMap,
      material.bumpMap,
    ].filter(Boolean),
  );
  for (const map of maps) map.repeat.set(width / tile[0], length / tile[1]);
}
function metricCoating(material, kind) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader =
      'varying vec3 editorFinishPoint;\n' +
      replaceShader(
        shader.vertexShader,
        '#include <begin_vertex>',
        '#include <begin_vertex>\neditorFinishPoint=position;',
      );
    shader.fragmentShader =
      `varying vec3 editorFinishPoint;
      float editorGrain(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      ` + shader.fragmentShader;
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      float editorVisibility=1.-smoothstep(.12,.8,max(length(dFdx(editorFinishPoint)),length(dFdy(editorFinishPoint))));
      float editorFine=mix(.5,editorGrain(floor(editorFinishPoint*${kind === 'resin' ? '2.8' : '7.0'})),editorVisibility);
      float editorBroad=sin(editorFinishPoint.x*.27+sin(editorFinishPoint.z*.13));
      diffuseColor.rgb*=.96+editorFine*.07+editorBroad*${kind === 'resin' ? '.035' : '.012'};
      roughnessFactor=clamp(roughnessFactor+(editorFine-.5)*.06,.15,.95);`,
    );
  };
  material.customProgramCacheKey = () => `${key}:editor-${kind}-metric-v1`;
  return empty();
}
async function createFinish(
  material,
  { id, renderer, width, uvLength, alive },
) {
  const kind = editorBiome(id).road.kind;
  if (kind === 'asphalt') return empty(); // The road owner retains its asphalt factory.
  if (kind === 'alloy') {
    const { createDeckFinish } =
      await import('../levels/orbital/track/deck-finish.js');
    if (!alive()) return null;
    const owner = createDeckFinish(renderer);
    owner.bind(material);
    return {
      ...owner,
      ready: owner.ready.then(() => {
        if (alive()) repeatMaps(material, width, uvLength, [28 / 6, 6]);
      }),
    };
  }
  if (kind === 'pearl') {
    const { createCeramicMaps } =
      await import('../levels/nacre/track/ceramic-maps.js');
    if (!alive()) return null;
    const owner = createCeramicMaps(renderer, material);
    // Campaign nacrePanel attributes are deliberately not required by the editor.
    return {
      ...owner,
      ready: owner.ready.then(() => {
        if (alive()) repeatMaps(material, width, uvLength, [1.2, 1.2]);
      }),
    };
  }
  if (kind === 'crystal') {
    const { finishIceMaterial } =
      await import('../levels/glasswake/environment/materials.js');
    if (!alive()) return null;
    const texture = await new T.TextureLoader().loadAsync(
      assetURL('assets/levels/glasswake/ice-surface-v1.png'),
    );
    if (!alive()) {
      texture.dispose();
      return null;
    }
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    material.name = 'Glasswake / Fresh fracture editor deck';
    finishIceMaterial(material, texture);
    // Frosted travel bands give the chase view a continuous deck reference.
    // Leave the centre and margins transparent so supports read through them.
    appendShaderPatch(material, ':editor-glasswake-travel-bands', (shader) => {
      const anchor = '#include <begin_vertex>';
      shader.vertexShader =
        'varying float glasswakeDeckAcross;\n' +
        replaceShader(
          shader.vertexShader,
          anchor,
          anchor + '\nglasswakeDeckAcross = uv.x;',
        );
      const roughness = '#include <metalnessmap_fragment>';
      shader.fragmentShader =
        'varying float glasswakeDeckAcross;\n' +
        replaceShader(
          shader.fragmentShader,
          roughness,
          `${roughness}
          float across = abs(glasswakeDeckAcross - .5);
          float frostBand = smoothstep(.105,.13,across)
            * (1. - smoothstep(.285,.31,across));
          vec3 windpack = vec3(.48,.57,.63) * (.77 + iceLuma*.34 + grain*.08);
          diffuseColor.rgb = mix(diffuseColor.rgb, windpack, frostBand*.82);
          diffuseColor.a = mix(diffuseColor.a, .99, frostBand);
          roughnessFactor = mix(roughnessFactor, .88, frostBand);
          `,
        );
    });
    return {
      ready: Promise.resolve(),
      dispose() {
        texture.dispose();
      },
    };
  }
  if (id === 'saffron') {
    const { finishSaffronGlass } =
      await import('../levels/saffron/track/glass-finish.js');
    if (!alive()) return null;
    finishSaffronGlass(material);
    return empty();
  }
  if (kind === 'ceramic') {
    const [{ finishThermalMaterial }, maps] = await Promise.all([
      import('../levels/helion/environment/materials.js'),
      id === 'cindercoil'
        ? import('../levels/cindercoil/track/ceramic-maps.js')
        : import('../levels/helion/track/ceramic-maps.js'),
    ]);
    if (!alive()) return null;
    let owner;
    if (id === 'cindercoil')
      owner = maps.createCindercoilCeramicMaps(renderer, [material]);
    else owner = maps.createHelionCeramicMaps(renderer, [material]);
    finishThermalMaterial(material, 'ceramic');
    return {
      ...owner,
      ready: owner.ready.then(() => {
        if (alive())
          repeatMaps(
            material,
            width,
            uvLength,
            id === 'cindercoil' ? [3, 3] : [4.4, 2.2],
          );
      }),
    };
  }
  if (kind === 'weave') {
    const { finishZephyrMaterial } =
      await import('../levels/zephyr/environment/materials.js');
    if (!alive()) return null;
    finishZephyrMaterial(material);
    return empty();
  }
  if (kind === 'masonry') {
    const [{ finishUmbraMaterial }, { loadUmbraSurface }] = await Promise.all([
      import('../levels/umbra/environment/materials.js'),
      import('../levels/umbra/environment/surfaces.js'),
    ]);
    if (!alive()) return null;
    const texture = await loadUmbraSurface();
    if (!alive()) {
      texture.dispose();
      return null;
    }
    // Stone mode needs no campaign umbraCassette/_umbralight attributes.
    finishUmbraMaterial(material, 'stone', texture);
    return {
      ready: Promise.resolve(),
      dispose() {
        texture.dispose();
      },
    };
  }
  if (kind === 'steel') {
    const { createIndustrialFinish } =
      await import('../../../../worldkit/src/industrial.js');
    if (!alive()) return null;
    const owner = createIndustrialFinish(renderer);
    // World coordinates avoid the campaign-only steelCoord shader varying.
    owner.bind(material, 'steel', 'world');
    return owner;
  }
  if (kind === 'membrane') {
    const { createRavelFoilFinish } = await import('../levels/ravel/foil.js');
    if (!alive()) return null;
    const owner = createRavelFoilFinish(renderer);
    owner.bind(material);
    return {
      ...owner,
      ready: owner.ready.then(() => {
        if (alive()) repeatMaps(material, width, uvLength, [6, 6]);
      }),
    };
  }
  return metricCoating(material, kind);
}

/** Parent owns the material; this owner leases only finish resources. CPU builders
 * return without imports or texture requests. Dispose is safe before ready. */
export function attachRoadFinish(
  material,
  {
    id = 'nightweir',
    renderer = null,
    width = 40,
    uvLength = 16,
    signal,
    loadFinish = createFinish,
  } = {},
) {
  editorBiome(id);
  let disposed = false,
    owner = null,
    reflection;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    owner?.dispose();
    owner = null;
  };
  const alive = () => !disposed && !signal?.aborted;
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose();
  const ready =
    !renderer || !alive()
      ? Promise.resolve()
      : Promise.resolve()
          .then(async () => {
            if (!alive()) return;
            const result = await loadFinish(material, {
              id,
              renderer,
              width,
              uvLength,
              alive,
            });
            if (!result) return;
            if (!alive()) {
              result.dispose();
              return;
            }
            owner = result;
            if (reflection !== undefined) owner.setReflection?.(reflection);
            await owner.ready;
          })
          .catch((cause) => {
            if (!alive()) return;
            owner?.dispose();
            owner = null;
            throw new Error(
              `${editorBiome(id).label} road finish could not load.`,
              { cause },
            );
          });
  return {
    ready,
    dispose,
    get ownedTextures() {
      return owner?.ownedTextures ?? [];
    },
    setReflection(texture) {
      reflection = texture;
      if (!disposed) owner?.setReflection?.(texture);
    },
  };
}
