import { DoubleSide, Vector4 } from 'three';
import { zephyrNoiseGLSL } from '../../zephyr/environment/materials.js';
// Broad cast-panel construction and rain staining supplement the licensed
// metre-scale concrete scan; neither is baked lighting or a repeated facade.
export function finishNightweirConcrete(material, basins = []) {
  const plaster = /limestone plaster/.test(material.name);
  const levels = Array.from({ length: 8 }, (_, i) => {
    const b = basins[i];
    return b
      ? new Vector4(b.start, b.end, b.y + 4, 0)
      : new Vector4(0, 0, -45, 0);
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nwBasinLevels = { value: levels };
    shader.vertexShader =
      'varying vec3 castPosition;varying vec2 castUV;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncastPosition=(modelMatrix*vec4(position,1.)).xyz;castUV=uv;',
      );
    shader.fragmentShader =
      'varying vec3 castPosition;varying vec2 castUV;uniform vec4 nwBasinLevels[8];\n' +
      zephyrNoiseGLSL +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
   float column=castPosition.x*.13+castPosition.z*.17;
   float rain=pow(.5+.5*sin(column+sin(column*2.1)*.7),5.);
   float patina=rain*(.45+.55*sin(castPosition.y*.007)*sin(castPosition.y*.007));
   float row=floor(castUV.y/2.4);
   float panel=abs(fract(castUV.y/2.4)-.5)*2.4;
   float vertical=abs(fract(castUV.x/6.+mod(row,2.)*.5)-.5)*6.;
   float tie=exp(-pow((fract(column*.52)-.5)*25.,2.))*exp(-pow((fract(castPosition.y/7.5)-.27)*30.,2.));
   float formJoint=1.-smoothstep(.025,.055+fwidth(panel),panel);
   diffuseColor.rgb*=mix(vec3(1.),vec3(.66,.72,.66),patina*.65);
   float joint=max(formJoint,1.-smoothstep(.02,.05+fwidth(vertical),vertical));
   float wash=zephyrNoise(castPosition*vec3(.055,.009,.055));
   float basin=-45.;
   for(int bi=0;bi<8;bi++){if(castPosition.z>=nwBasinLevels[bi].x&&castPosition.z<nwBasinLevels[bi].y)basin=nwBasinLevels[bi].z;}
   float tidal=(1.-smoothstep(basin+3.,basin+38.,castPosition.y))*smoothstep(.3,.65,zephyrNoise(castPosition*.12));
   diffuseColor.rgb*=mix(vec3(1.),vec3(.47,.57,.46),tidal*.55);
   diffuseColor.rgb*=mix(vec3(.91,.94,.91),vec3(1.08,1.055,1.),wash);
   diffuseColor.rgb*=1.-joint*${plaster ? '0.' : '.14'}-tie*${plaster ? '0.' : '.16'};
  `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+.12*patina,.62,.96);',
        );
  };
  material.customProgramCacheKey = () => 'nightweir-cast-rain-v5-' + plaster;
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

export function finishNightweirRock(
  material,
  texture,
  cliffTexture = texture,
  groundTexture = cliffTexture,
) {
  material.roughness = 0.88;
  material.metalness = 0;
  material.envMapIntensity = 0.35;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nwRock = { value: texture };
    shader.uniforms.nwCliff = { value: cliffTexture };
    shader.uniforms.nwGround = { value: groundTexture };
    shader.vertexShader =
      'varying vec3 nwStonePoint;varying vec3 nwStoneNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nnwStonePoint=(modelMatrix*vec4(position,1.)).xyz;nwStoneNormal=normalize(mat3(modelMatrix)*normal);',
      );
    shader.fragmentShader =
      'varying vec3 nwStonePoint;varying vec3 nwStoneNormal;uniform sampler2D nwRock;uniform sampler2D nwCliff;uniform sampler2D nwGround;\n' +
      zephyrNoiseGLSL +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec3 rockNormal=normalize(cross(dFdx(nwStonePoint),dFdy(nwStonePoint)));
        vec3 rockWeight=pow(abs(rockNormal),vec3(4.));rockWeight/=max(dot(rockWeight,vec3(1.)),.0001);
        vec3 mineral=texture2D(nwRock,nwStonePoint.yz*.12).rgb*rockWeight.x
          +texture2D(nwRock,nwStonePoint.xz*.12).rgb*rockWeight.y
          +texture2D(nwRock,nwStonePoint.xy*.12).rgb*rockWeight.z;
        float mineralValue=dot(mineral,vec3(.2126,.7152,.0722));
        // Vertical cliff projections keep geological courses horizontal in
        // world Y; the upper faces use the same mineral beds in plan.
        vec3 cliff=texture2D(nwCliff,nwStonePoint.zy*.025).rgb*rockWeight.x
          +texture2D(nwCliff,nwStonePoint.xz*.025).rgb*rockWeight.y
          +texture2D(nwCliff,nwStonePoint.xy*.025).rgb*rockWeight.z;
        // Incommensurate strata scales prevent a single repeated photograph
        // from becoming a regular grid across kilometre-long exposed banks.
        vec3 broadCliff=texture2D(nwCliff,nwStonePoint.zy*vec2(.0093,.0141)+vec2(.31,.57)).rgb*rockWeight.x
          +texture2D(nwCliff,nwStonePoint.xz*vec2(.0093,.0141)+vec2(.31,.57)).rgb*rockWeight.y
          +texture2D(nwCliff,nwStonePoint.xy*vec2(.0093,.0141)+vec2(.31,.57)).rgb*rockWeight.z;
        cliff=mix(cliff,broadCliff,.36);
        float cliffValue=dot(cliff,vec3(.2126,.7152,.0722));
        float geology=zephyrNoise(nwStonePoint*.006);
        float damp=zephyrNoise(nwStonePoint*vec3(.08,.006,.08));
        // Deposited scree and moss occupy gentler exposed slopes. The actual
        // geometric face slope keeps vertical scarps mineral and readable.
        vec3 scree=texture2D(nwGround,nwStonePoint.xz/6.).rgb;
        vec3 screeBroad=texture2D(nwGround,nwStonePoint.xz/17.+vec2(.31,.61)).rgb;
        scree=mix(scree,screeBroad,.3);
        float soil=smoothstep(.40,.90,max(normalize(nwStoneNormal).y,0.));
        soil*=smoothstep(.18,.55,zephyrNoise(nwStonePoint*vec3(.017,.008,.017)));
        vec3 surface=mix(mix(vec3(.27),cliff*2.5,.86),scree*4.5,soil*.65);
        diffuseColor.rgb*=surface*mix(.71,1.24,geology);
        diffuseColor.rgb*=mix(.86,1.16,mineralValue);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.72,.79,.75),smoothstep(.46,.73,damp)*.24);
        float rockRelief=((mineralValue-.5)*.08+(cliffValue-.3)*.7)*(1.-smoothstep(1100.,4500.,length(vViewPosition)));
      `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),rx=cross(sy,normal),ry=cross(normal,sx);
        float det=dot(sx,rx);
        normal=normalize(normal-sign(det)*(dFdx(rockRelief)*rx+dFdy(rockRelief)*ry)/max(abs(det),.00001));
      `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=mix(.96,.86,smoothstep(.5,.8,damp));',
        );
  };
  material.customProgramCacheKey = () => 'nightweir-wet-gorge-stone-v6';
}

// Fired clay gives occupied and generating buildings their own material family.
// The metre-authored UVs preserve small brick scale; derivative relief fades
// before mortar can shimmer in distant facades.
export function finishNightweirBrick(material, texture) {
  material.map = texture;
  material.roughness = 0.88;
  material.metalness = 0;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 nwBrickPoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nnwBrickPoint=(modelMatrix*vec4(position,1.)).xyz;',
      );
    shader.fragmentShader =
      'varying vec3 nwBrickPoint;\n' +
      zephyrNoiseGLSL +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        float mortarValue=dot(texture2D(map,vMapUv).rgb,vec3(.2126,.7152,.0722));
        float age=zephyrNoise(nwBrickPoint*vec3(.19,.017,.19));
        float mineral=zephyrNoise(nwBrickPoint*vec3(.055,.008,.055));
        diffuseColor.rgb*=mix(.79,1.06,age);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.71,.78,.70),smoothstep(.56,.81,mineral)*.38);
        float relief=mortarValue*.006*(1.-smoothstep(.04,.3,length(fwidth(nwBrickPoint))));
      `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),rx=cross(sy,normal),ry=cross(normal,sx);
        float det=dot(sx,rx);
        normal=normalize(normal-sign(det)*(dFdx(relief)*rx+dFdy(relief)*ry)/max(abs(det),.00001));
      `,
        );
  };
  material.customProgramCacheKey = () => 'nightweir-fired-clay-v1';
  material.needsUpdate = true;
}

// Metre-authored roof UVs keep the sheet pans and overlaps at construction scale.
// A separate roof family avoids painting the same sheet pattern on machinery.
export function finishNightweirRoof(material, texture) {
  material.map = texture;
  material.roughness = 0.65;
  material.metalness = 0.32;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 nwRoofPoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nnwRoofPoint=(modelMatrix*vec4(position,1.)).xyz;',
      );
    shader.fragmentShader =
      'varying vec3 nwRoofPoint;\n' +
      zephyrNoiseGLSL +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        float age=zephyrNoise(nwRoofPoint*vec3(.032,.08,.041));
        diffuseColor.rgb*=mix(.80,1.13,age);
        float zinc=dot(texture2D(map,vMapUv).rgb,vec3(.2126,.7152,.0722));
        float roofRelief=zinc*.014*(1.-smoothstep(.08,.7,length(fwidth(nwRoofPoint))));
      `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),rx=cross(sy,normal),ry=cross(normal,sx);
        float det=dot(sx,rx);
        normal=normalize(normal-sign(det)*(dFdx(roofRelief)*rx+dFdy(roofRelief)*ry)/max(abs(det),.00001));
      `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=.56+.22*(1.-age);',
        );
  };
  material.customProgramCacheKey = () => 'nightweir-weathered-zinc-v1';
  material.needsUpdate = true;
}

// Vertex alpha is authored sky visibility, not transparency. Keep moving sun,
// headlights and emissive rooms unattenuated while distant courts retain depth.
export function finishNightweirSkyVisibility(material) {
  const finish = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  const previousKey = key();
  material.onBeforeCompile = (shader, renderer) => {
    finish(shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `
        #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
          diffuseColor.rgb *= vColor.rgb;
        #endif
      `,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        #ifdef USE_COLOR_ALPHA
          reflectedLight.indirectDiffuse *= vColor.a;
          reflectedLight.indirectSpecular *= mix(.6,1.,vColor.a);
        #endif
      `,
      );
  };
  material.customProgramCacheKey = () => previousKey + '-sky-visibility-v1';
  material.needsUpdate = true;
}
