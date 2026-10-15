import * as T from 'three';
import { createHelionCeramicMaps } from '../../helion/track/ceramic-maps.js';
import { assetURL } from '../../../assets/url.js';

// The licensed dense-mineral substrate is shared with Helion, at its recorded
// 4.4 × 2.2 m scale. Worldspire owns decoded maps and its own coating/joint finish.
export function createWorldspireFinish(renderer, ceramic, mineral) {
  const substrate = createHelionCeramicMaps(renderer, ceramic);
  let disposed = false;
  let mineralMap;
  const ready = Promise.all([
    substrate.ready,
    renderer
      ? new T.TextureLoader()
          .loadAsync(assetURL('assets/levels/worldspire/mineral-v2.png'))
          .then((texture) => {
            if (disposed) {
              texture.dispose();
              return;
            }
            mineralMap = texture;
            texture.colorSpace = T.SRGBColorSpace;
            texture.wrapS = texture.wrapT = T.RepeatWrapping;
            texture.repeat.set(1 / 8, 1 / 12);
            texture.anisotropy = Math.min(
              8,
              renderer.capabilities.getMaxAnisotropy(),
            );
            for (const m of mineral) {
              m.map = texture;
              m.bumpMap = texture;
              m.bumpScale = 0.055;
              m.needsUpdate = true;
            }
          })
      : Promise.resolve(),
  ]);
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      substrate.dispose();
      mineralMap?.dispose();
    },
  };
}
export function setMetreUV(geometry) {
  const road = geometry.getAttribute('roadCoord');
  if (!road) return;
  const uv = geometry.getAttribute('uv');
  const position = geometry.getAttribute('position');
  for (let i = 0; i < road.count; i++) {
    const first = i - (i % 2);
    const width = Math.hypot(
      position.getX(first + 1) - position.getX(first),
      position.getY(first + 1) - position.getY(first),
      position.getZ(first + 1) - position.getZ(first),
    );
    uv.setXY(i, road.getY(first) + uv.getX(i) * width, road.getX(i));
  }
  uv.needsUpdate = true;
}
export function applySlabFinish(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 roadCoord; varying vec2 roadMetres;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nroadMetres=roadCoord;',
      );
    shader.fragmentShader =
      `varying vec2 roadMetres;
      vec3 mineralReturn(vec3 n,vec3 p,float h,float signFace){
        vec3 dx=dFdx(p),dy=dFdy(p),rx=cross(dy,n),ry=cross(n,dx);
        float det=dot(dx,rx)*signFace;
        return normalize(abs(det)*n-sign(det)*(dFdx(h)*rx+dFdy(h)*ry));
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      // Long interlocked mineral plates; broad restrained tone variation is
      // separate from the fine physical substrate and shallow sealed joints.
      vec2 slab=vec2(roadMetres.y+25.,roadMetres.x);
      slab.y+=mod(floor(slab.x/10.),2.)*6.;
      vec2 bay=mod(slab,vec2(10.,18.));
      vec2 edge=min(bay,vec2(10.,18.)-bay);
      float boundary=max(0.,min(edge.x,edge.y));
      float pixel=max(fwidth(boundary),.001);
      float joint=1.-smoothstep(.013,.038+pixel,boundary);
      float lipHeight=.012*smoothstep(.014,.12+pixel,boundary)*(1.-smoothstep(.08,.35,pixel));
      float plate=sin(floor(slab.x/10.)*4.1+floor(slab.y/18.)*7.3);
      diffuseColor.rgb*=1.+plate*.026;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.10,.075,.056),joint*.38);
      float shoulder=smoothstep(21.8,22.1,abs(roadMetres.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.64,.71,.69),shoulder*.32);
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=mix(clamp(roughnessFactor+plate*.055,.3,.95),.81,joint);',
      )
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\nmaterial.clearcoatRoughness=clamp(material.clearcoatRoughness+plate*.045,.12,.32);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal=mineralReturn(normal,-vViewPosition,lipHeight,faceDirection);',
      )
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        '#include <clearcoat_normal_fragment_maps>\nclearcoatNormal=mineralReturn(clearcoatNormal,-vViewPosition,lipHeight,faceDirection);',
      );
  };
  material.customProgramCacheKey = () => 'worldspire-mineral-slabs-v3';
}
