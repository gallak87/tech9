import { replaceShader } from '../../../renderer/shader-patch.js';

// Road metres, not stretched mesh UVs, keep the same fitted construction
// through banks and dives. This finishes the existing skin without moving it.
export function finishSkywellDeck(material, { receiver = false } = {}) {
  material.color.set(receiver ? '#466e69' : '#566369');
  material.metalness = 0.12;
  material.roughness = receiver ? 0.72 : 0.76;
  material.emissive.set(receiver ? '#112d29' : '#000000');
  material.emissiveIntensity = receiver ? 0.055 : 0;
  material.normalScale.set(0.45, 0.45);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute vec2 roadCoord; varying vec2 skywellRoad;\n' +
      replaceShader(
        shader.vertexShader,
        '#include <begin_vertex>',
        '#include <begin_vertex>\nskywellRoad=roadCoord;',
      );
    shader.fragmentShader =
      'varying vec2 skywellRoad;\n' +
      replaceShader(
        shader.fragmentShader,
        '#include <color_fragment>',
        `#include <color_fragment>
      // Six broad cassette lanes with staggered joints and fitted edge lands.
      vec2 rm=vec2(skywellRoad.y+22.,skywellRoad.x);
      float lane=floor(rm.x/7.333333);
      vec2 panel=vec2(rm.x,rm.y+mod(lane,2.)*7.)/vec2(7.333333,14.);
      vec2 seam=min(fract(panel),1.-fract(panel))*vec2(7.333333,14.);
      vec2 aa=max(fwidth(rm),vec2(.012));
      vec2 joint=1.-smoothstep(vec2(.018),vec2(.045)+aa,seam);
      float seamMask=max(joint.x,joint.y);
      vec2 cell=floor(panel);
      float cassette=fract(sin(dot(cell,vec2(17.13,43.71)))*1537.77);
      float coarseVisibility=1.-smoothstep(.5,2.5,max(aa.x,aa.y));
      float repair=mix(1.,.94+cassette*.11,coarseVisibility);
      diffuseColor.rgb*=repair*(1.-seamMask*.24*coarseVisibility);
      // Worn satin lands flank the dark seals; no painted lane or fake relief.
      float land=(1.-smoothstep(.10,.22+max(aa.x,aa.y),min(seam.x,seam.y)))*(1.-seamMask);
      diffuseColor.rgb+=vec3(.011,.013,.013)*land*coarseVisibility;
      float edge=smoothstep(17.8,20.,abs(skywellRoad.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.68,.77,.77),edge*.25);
      `,
      );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=clamp(.72+roughnessFactor*.18,.72,.90);',
    );
  };
  material.customProgramCacheKey = () => `skywell-fitted-deck-v2:${receiver}`;
  material.needsUpdate = true;
  return material;
}

// The receiving throat is a constructed limestone aqueduct, with road-space
// fitted panels and thin bronze joints. The original curved contact skin stays
// untouched; the canonical stone map is borrowed from the environment owner.
export function finishSkywellThroat(material) {
  material.name = 'Skywell / fitted limestone induction throat';
  material.color.set('#9ba9a4');
  material.roughness = 0.8;
  material.metalness = 0.08;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute vec2 roadCoord;varying vec2 skywellTube;\n' +
      replaceShader(
        shader.vertexShader,
        '#include <begin_vertex>',
        '#include <begin_vertex>\nskywellTube=roadCoord;',
      );
    shader.fragmentShader =
      'varying vec2 skywellTube;\n' + shader.fragmentShader;
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <map_fragment>',
      `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor=texture2D(map,skywellTube/9.);
        diffuseColor*=sampledDiffuseColor;
      #endif
    `,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec2 tubeAA=max(fwidth(skywellTube),vec2(.02));
      vec2 tubePanel=vec2(skywellTube.x/9.,skywellTube.y/4.4);
      vec2 tubeSeam=min(fract(tubePanel),1.-fract(tubePanel))*vec2(9.,4.4);
      float tubeJoint=max(1.-smoothstep(.025,.065+tubeAA.x,tubeSeam.x),1.-smoothstep(.025,.065+tubeAA.y,tubeSeam.y));
      float tubePanelShade=fract(sin(dot(floor(tubePanel),vec2(18.77,43.21)))*1973.3);
      float tubeVisible=1.-smoothstep(.5,2.5,max(tubeAA.x,tubeAA.y));
      diffuseColor.rgb*=mix(1.,.9+tubePanelShade*.13,tubeVisible)*(1.-tubeJoint*.22*tubeVisible);
      float tubeRib=1.-smoothstep(.09,.18+tubeAA.x,abs(fract((skywellTube.x+4.)/18.)-.5)*18.);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.12,.07),tubeRib*.7*tubeVisible);
      float tubeDamp=1.-smoothstep(8.,18.,abs(skywellTube.y));
      diffuseColor.rgb*=mix(vec3(1.),vec3(.75,.86,.85),tubeDamp*.28);
    `,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor,0.62,0.94);',
    );
  };
  material.customProgramCacheKey = () => 'skywell-fitted-throat-v1';
  material.needsUpdate = true;
  return material;
}
