import * as T from 'three';
const industrialEnamelURL = new URL(
  '../assets/worn-enamel-v1.png',
  import.meta.url,
).href;
export const industrialSteelURL = new URL(
  '../assets/rolled-steel-v1.png',
  import.meta.url,
).href;

/** Shared metre-scaled material detail. The finish owns its map; bound materials borrow it. */
export function createIndustrialFinish(renderer = null) {
  const manager = new T.LoadingManager(),
    materials = new Map(),
    textures = new Set();
  let disposed = false;
  const maps = {};
  const ready = renderer
    ? Promise.all(
        [
          ['steel', industrialSteelURL],
          ['shell', industrialEnamelURL],
        ].map(async ([kind, url]) => {
          const map = await new T.TextureLoader(manager).loadAsync(url);
          if (disposed) {
            map.dispose();
            return;
          }
          maps[kind] = map;
          map.colorSpace = T.SRGBColorSpace;
          map.wrapS = map.wrapT = T.RepeatWrapping;
          map.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          textures.add(map);
          for (const [material, boundKind] of materials) {
            material.map =
              maps[boundKind === 'shell' ? 'shell' : 'steel'] ?? null;
            material.needsUpdate = true;
          }
        }),
      )
    : Promise.resolve();
  return {
    ready,
    ownedTextures: textures,
    bind(material, kind = 'steel', coordinates = 'world') {
      materials.set(material, kind);
      const mapKind = kind === 'shell' ? 'shell' : 'steel';
      if (maps[mapKind]) material.map = maps[mapKind];
      const compile = material.onBeforeCompile,
        key = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, view) => {
        compile.call(material, shader, view);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          '',
        );
        shader.uniforms.industrialDetail = { value: maps[mapKind] ?? null };
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 industrialPoint;' +
              (coordinates === 'part'
                ? '\nattribute vec3 industrialCoord; varying vec3 industrialLocal;'
                : ''),
          )
          .replace(
            '#include <project_vertex>',
            `#include <project_vertex>
          vec4 industrialWorld=vec4(transformed,1.);
          #ifdef USE_BATCHING
          industrialWorld=batchingMatrix*industrialWorld;
          #endif
          #ifdef USE_INSTANCING
          industrialWorld=instanceMatrix*industrialWorld;
          #endif
          industrialPoint=(modelMatrix*industrialWorld).xyz;
          ${coordinates === 'part' ? 'industrialLocal=industrialCoord;' : ''}`,
          );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D industrialDetail; varying vec3 industrialPoint;\nfloat industrialHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }\nfloat industrialNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(industrialHash(i),industrialHash(i+vec2(1,0)),f.x),mix(industrialHash(i+vec2(0,1)),industrialHash(i+vec2(1,1)),f.x),f.y);}',
        );
        if (coordinates === 'part')
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            '#include <common>\nvarying vec3 industrialLocal;',
          );
        const sample =
          coordinates === 'part'
            ? 'texture2D(industrialDetail,vec2(industrialLocal.y,length(industrialLocal.xz))/3.).rgb'
            : coordinates === 'road'
              ? 'texture2D(industrialDetail,steelCoord/9.).rgb'
              : `(
          texture2D(industrialDetail,industrialPoint.yz/7.).rgb*iw.x+
          texture2D(industrialDetail,industrialPoint.xz/7.).rgb*iw.y+
          texture2D(industrialDetail,industrialPoint.xy/7.).rgb*iw.z)`;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          vec3 iw=pow(abs(normalize(cross(dFdx(industrialPoint),dFdy(industrialPoint)))),vec3(4.));iw/=max(.001,iw.x+iw.y+iw.z);
          vec3 detailColor=${sample};float detailLuma=dot(detailColor,vec3(.299,.587,.114));
          diffuseColor.rgb*=mix(vec3(1.),detailColor*${kind === 'shell' ? '1.4' : '3.6'},${coordinates === 'road' ? '.16' : kind === 'shell' ? '(.04+.09*smoothstep(.55,.8,industrialNoise(industrialPoint.xz*.015)))' : kind === 'dark' ? '.3' : kind === 'machined' ? '.18' : kind === 'cast' ? '.42' : '.63'});
          ${kind === 'machined' && coordinates === 'part' ? `vec3 partNormal=normalize(cross(dFdx(industrialLocal),dFdy(industrialLocal)));float turning=mix(industrialLocal.y,length(industrialLocal.xz),step(.75,abs(partNormal.y)))*9.;float toolMark=sin(turning*6.28318)*(1.-smoothstep(.4,1.5,fwidth(turning)));roughnessFactor+=toolMark*.045;diffuseColor.rgb*=.96+toolMark*.025;` : ''}
          roughnessFactor=clamp(roughnessFactor+${kind === 'shell' ? '(.7-detailLuma)*.10' : '(detailLuma-.18)*.24'},.24,.92);`,
        );
        // A small surface gradient breaks perfectly flat reflections while the
        // authored metre scale keeps the finish from becoming coarse concrete.
        if (coordinates !== 'road')
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
          vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
          vec3 rx=cross(sy,normal),ry=cross(normal,sx);
          float det=dot(sx,rx);
          vec2 slope=vec2(dFdx(detailLuma),dFdy(detailLuma))*${kind === 'shell' ? '.003' : kind === 'cast' ? '.045' : kind === 'machined' ? '.002' : '.008'};
          normal=normalize(abs(det)*normal-sign(det)*(slope.x*rx+slope.y*ry));`,
          );
      };
      material.customProgramCacheKey = () =>
        key + '-industrial-map-v6-' + kind + '-' + coordinates;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      manager.abort();
      textures.forEach((t) => t.dispose());
      textures.clear();
      materials.clear();
    },
  };
}
