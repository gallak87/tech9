import { replaceShader } from '../../../renderer/shader-patch.js';

// Share the sealed mineral-glass finish with the Workshop's generated deck.
export function finishSaffronGlass(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = replaceShader(
      `varying vec3 vGlassPoint;\n${shader.vertexShader}`,
      '#include <begin_vertex>',
      `#include <begin_vertex>
vGlassPoint=position;
#ifdef USE_INSTANCING
vGlassPoint=(instanceMatrix*vec4(position,1.)).xyz;
#endif`,
    );
    shader.fragmentShader = replaceShader(
      replaceShader(
        `varying vec3 vGlassPoint;
      float gHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float gNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(gHash(i),gHash(i+vec3(1,0,0)),f.x),mix(gHash(i+vec3(0,1,0)),gHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(gHash(i+vec3(0,0,1)),gHash(i+vec3(1,0,1)),f.x),mix(gHash(i+vec3(0,1,1)),gHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      ${shader.fragmentShader}`,
        '#include <color_fragment>',
        `#include <color_fragment>
      float mineral=gNoise(vGlassPoint*vec3(.13,.015,.018));
      float warped=gNoise(vGlassPoint*.034);
      float vein=pow(1.-abs(sin(vGlassPoint.x*.17+vGlassPoint.z*.025+warped*4.)),18.);
      float folded=gNoise(vGlassPoint*.42+vec3(warped*2.));
      float skin=gNoise(vGlassPoint*5.8);
      float footprint=max(length(dFdx(vGlassPoint)),length(dFdy(vGlassPoint)));
      float grainVisible=1.-smoothstep(.018,.11,footprint);
      float etching=gNoise(vGlassPoint*34.);
      float haze=smoothstep(.42,.76,folded);
      float polish=1.-smoothstep(.34,.70,folded);
      diffuseColor.rgb*=.76+mineral*.34;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.61,.40,.13),vein*.22);
      diffuseColor.rgb*=1.-haze*.075;`,
      ),
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
roughnessFactor=clamp(roughnessFactor+haze*.18+skin*.03+vein*.025-polish*.055,.19,.64);`,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float glassRelief=folded*.014+skin*.003+etching*.0012*grainVisible;
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec3 rx=cross(dy,normal),ry=cross(normal,dx);
      float det=dot(dx,rx)*faceDirection;
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(glassRelief)*rx+dFdy(glassRelief)*ry));`,
    );
    // The sealed coat reflects broad sky shapes above the cast mineral
    // relief. Reuse the existing haze rather than sampling another layer.
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
      material.clearcoatRoughness=clamp(material.clearcoatRoughness+haze*.11-polish*.025,.14,.4);
      #endif`,
    );
    // The etched skin scatters the directional sun's idealized peak. Keep
    // low/medium highlights and all environmental reflections unchanged;
    // only the combined direct base/coat lobe receives this soft shoulder.
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <opaque_fragment>',
      `vec3 glassDirectHighlight=reflectedLight.directSpecular;
      #ifdef USE_CLEARCOAT
      glassDirectHighlight=glassDirectHighlight*(1.-material.clearcoat*Fcc)
        +clearcoatSpecularDirect*material.clearcoat;
      #endif
      float glassPeak=max(glassDirectHighlight.r,max(glassDirectHighlight.g,glassDirectHighlight.b));
      float glassExcess=max(0.,glassPeak-.45);
      float glassShoulder=.45+glassExcess/(1.+glassExcess/.40);
      float glassHighlightScale=glassPeak>.45?glassShoulder/max(glassPeak,.0001):1.;
      outgoingLight+=glassDirectHighlight*(glassHighlightScale-1.);
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => 'saffron-sealed-glass-v8';
}
