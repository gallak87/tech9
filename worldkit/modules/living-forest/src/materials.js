import * as T from 'three';

/** Authored surface images are borrowed. The empty leaf placeholder is owned. */
export function createLivingForestMaterials({ textures = {} } = {}) {
  const owned = [];
  let leafMap = textures.leaf?.map;
  if (!leafMap) {
    // No opaque card rectangles while an asynchronous consumer loads the spray.
    leafMap = new T.DataTexture(
      new Uint8Array([255, 255, 255, 0]),
      1,
      1,
      T.RGBAFormat,
    );
    leafMap.needsUpdate = true;
    owned.push(leafMap);
  }
  const wood = new T.MeshStandardMaterial({
    name: 'Living Forest / silver weathered fluted bark',
    map: textures.wood?.map ?? null,
    bumpMap: textures.wood?.bumpMap ?? null,
    bumpScale: 0.28,
    normalMap: textures.wood?.normalMap ?? null,
    normalScale: new T.Vector2(0.65, 0.65),
    roughnessMap: textures.wood?.roughnessMap ?? null,
    color: '#a8b3a9',
    roughness: 0.91,
    vertexColors: true,
  });
  const leaf = new T.MeshStandardMaterial({
    name: 'Living Forest / dense attached jade leaf sprays',
    map: leafMap,
    color: '#d5e0d0',
    roughness: 0.8,
    side: T.DoubleSide,
    vertexColors: true,
    alphaTest: 0.5,
    alphaToCoverage: true,
    transparent: false,
    depthWrite: true,
  });
  const rock = new T.MeshStandardMaterial({
    name: 'Living Forest / weathered graphite slate and moss',
    color: '#687879',
    roughness: 0.95,
    vertexColors: true,
  });
  rock.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 slateP;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nslateP=transformed;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 slateP;
      float slateHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float slateNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(slateHash(i),slateHash(i+vec3(1,0,0)),f.x),mix(slateHash(i+vec3(0,1,0)),slateHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(slateHash(i+vec3(0,0,1)),slateHash(i+vec3(1,0,1)),f.x),mix(slateHash(i+vec3(0,1,1)),slateHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float broad=slateNoise(slateP*.65);
      float grain=slateNoise(slateP*7.);
      float bed=slateP.y*.87+slateP.x*.21+slateP.z*.13+broad*.65;
      float seam=abs(fract(bed)-.5);
      float edge=max(fwidth(bed),.015);
      float fissure=1.-smoothstep(.025,.025+edge,seam);
      diffuseColor.rgb *= (.72+broad*.4)*(1.-fissure*.24);
      diffuseColor.rgb *= mix(1.,.91+grain*.18,1.-smoothstep(.08,.45,fwidth(slateP.x*7.)));
      float lichen=smoothstep(.55,.78,slateNoise(slateP*1.5))*smoothstep(1.7,4.8,slateP.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.82,1.15,.68),lichen*.65);`,
      );
  };
  rock.customProgramCacheKey = () => 'living-forest-weathered-slate-v1';
  const materials = [wood, leaf, rock];
  let disposed = false;
  return {
    wood,
    leaf,
    rock,
    textures: owned,
    materials,
    dispose() {
      if (disposed) return;
      disposed = true;
      materials.forEach((m) => m.dispose());
      owned.forEach((t) => t.dispose());
    },
  };
}
