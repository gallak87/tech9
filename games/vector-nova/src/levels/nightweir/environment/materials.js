import { DoubleSide } from 'three';
import { zephyrNoiseGLSL } from '../../zephyr/environment/materials.js';
// Broad cast-panel construction and rain staining supplement the licensed
// metre-scale concrete scan; neither is baked lighting or a repeated facade.
export function finishNightweirConcrete(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 castPosition;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncastPosition=(modelMatrix*vec4(position,1.)).xyz;',
      );
    shader.fragmentShader =
      'varying vec3 castPosition;\n' +
      zephyrNoiseGLSL +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
   float column=castPosition.x*.13+castPosition.z*.17;
   float rain=pow(.5+.5*sin(column+sin(column*2.1)*.7),5.);
   float patina=rain*(.45+.55*sin(castPosition.y*.007)*sin(castPosition.y*.007));
   float row=floor(castPosition.y/7.5);
   float panel=abs(fract(castPosition.y/7.5)-.5)*7.5;
   float vertical=abs(fract((castPosition.x+castPosition.z)/18.+mod(row,2.)*.5)-.5)*18.;
   float tie=exp(-pow((fract(column*.52)-.5)*25.,2.))*exp(-pow((fract(castPosition.y/7.5)-.27)*30.,2.));
   float formJoint=1.-smoothstep(.025,.055+fwidth(panel),panel);
   diffuseColor.rgb*=mix(vec3(1.),vec3(.66,.72,.66),patina*.65);
   float joint=max(formJoint,1.-smoothstep(.02,.05+fwidth(vertical),vertical));
   float wash=zephyrNoise(castPosition*vec3(.055,.009,.055));
   float basin=max(-45.,floor((2750.-.55*(castPosition.z+350.))/360.)*360.)+4.;
   float tidal=(1.-smoothstep(basin+3.,basin+38.,castPosition.y))*smoothstep(.3,.65,zephyrNoise(castPosition*.12));
   diffuseColor.rgb*=mix(vec3(1.),vec3(.47,.57,.46),tidal*.55);
   diffuseColor.rgb*=mix(vec3(.91,.94,.91),vec3(1.08,1.055,1.),wash);
   diffuseColor.rgb*=1.-joint*.14-tie*.16;
  `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+.12*patina,.62,.96);',
        );
  };
  material.customProgramCacheKey = () => 'nightweir-cast-rain-v3';
}

// Coated hydraulic metal keeps broad reflections. Fine relief fades with pixel
// footprint instead of turning distant roofs and machinery into glitter.
export function finishNightweirMetal(material) {
  if (material.userData.nightweirMetal) return;
  material.userData.nightweirMetal = true;
  material.roughness = Math.max(0.48, material.roughness);
  material.metalness = Math.min(0.48, material.metalness);
  const leaf = /lifting floodgate/.test(material.name);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 hydraulicLocal;varying vec3 hydraulicPoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
   vec4 hp=vec4(position,1.);
   #ifdef USE_INSTANCING
    hp=instanceMatrix*hp;
   #endif
   hydraulicPoint=(modelMatrix*hp).xyz;hydraulicLocal=position;
  `,
      );
    shader.fragmentShader =
      'varying vec3 hydraulicLocal;varying vec3 hydraulicPoint;\n' +
      zephyrNoiseGLSL +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
    float age=zephyrNoise(hydraulicPoint*.055);
    float worn=zephyrNoise(hydraulicPoint*.4);
    diffuseColor.rgb*=.89+age*.15+worn*.06;
    float runoff=${leaf ? 'pow(max(0.,cos(hydraulicLocal.x*.523599)),18.)*(.35+.65*(1.-smoothstep(-8.,8.,hydraulicLocal.y)))' : '0.'};
    diffuseColor.rgb*=1.-runoff*.22;
   `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
    roughnessFactor=clamp(roughnessFactor+(worn-.5)*.1-runoff*.08,.42,.82);
   `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
    float footprint=length(fwidth(hydraulicPoint));
    float relief=zephyrNoise(hydraulicPoint*1.4)*.018*(1.-smoothstep(.18,1.2,footprint));
    vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),rx=cross(sy,normal),ry=cross(normal,sx);
    float det=dot(sx,rx);
    normal=normalize(normal-sign(det)*(dFdx(relief)*rx+dFdy(relief)*ry)/max(abs(det),.00001));
   `,
        );
  };
  material.customProgramCacheKey = () => 'nightweir-hydraulic-metal-v2-' + leaf;
}

// Thin deposits stay anchored to each return wall's actual piers and bearing
// courses. Local UVs are authored by Blender; this is not world-wide striping.
export function finishNightweirDeposits(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.side = DoubleSide;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  material.roughness = 1;
  material.metalness = 0;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec2 contactUV;varying vec3 contactPoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncontactUV=vec2(uv.x,1.-uv.y);contactPoint=(modelMatrix*vec4(position,1.)).xyz;',
      );
    shader.fragmentShader =
      'varying vec2 contactUV;varying vec3 contactPoint;\n' +
      zephyrNoiseGLSL +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
   float pier=abs(fract(contactUV.x+.5)-.5);
   float below=mod(32.-contactUV.y+44.,44.);
   float contact=(1.-smoothstep(0.,.13,pier))*.23+(1.-smoothstep(0.,8.,below))*.25;
   float breakup=zephyrNoise(contactPoint*vec3(.09,.022,.09));
   float plume=pow(max(0.,sin(contactUV.x*5.3+floor(contactUV.y/44.)*1.7)),6.);
   plume*=smoothstep(1.,5.,below)*(1.-smoothstep(10.,32.,below))*smoothstep(.25,.72,breakup);
   float mineral=plume*smoothstep(.61,.68,breakup)*(1.-smoothstep(.68,.76,breakup));
   diffuseColor.rgb=mix(vec3(.035,.048,.043),vec3(.28,.29,.25),mineral*.6);
   diffuseColor.a=clamp(contact+plume*.34,0.,.52);
  `,
      );
  };
  material.customProgramCacheKey = () => 'nightweir-anchored-contact-v1';
}
