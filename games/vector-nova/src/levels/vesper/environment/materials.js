/** Original 3D material grain. Local-position noise survives instancing and cell batching. */
export function finishVesperMaterial(material) {
  const name = material.name.toLowerCase();
  const bark = /bark|cambium|structural living root/.test(name);
  const leaf = /blue teal leaves/.test(name);
  const fungus = /fungal moon/.test(name);
  const walker = /walker/.test(name);
  if (!bark && !leaf && !fungus && !walker) return;
  material.roughness = bark ? 0.94 : leaf ? 0.78 : walker ? 0.76 : 0.79;
  material.envMapIntensity = bark ? 0.18 : 0.22;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vVesperSurface;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvVesperSurface = position;',
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vVesperSurface;
      float vesperHash(vec3 p) { p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z); }
      float vesperNoise(vec3 p) {
        vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(vesperHash(i),vesperHash(i+vec3(1,0,0)),f.x),mix(vesperHash(i+vec3(0,1,0)),vesperHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(vesperHash(i+vec3(0,0,1)),vesperHash(i+vec3(1,0,1)),f.x),mix(vesperHash(i+vec3(0,1,1)),vesperHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`,
    );
    const treatment = bark
      ? `vec3 vp=vVesperSurface;
         float broad=vesperNoise(vp*vec3(.075,.021,.075));
         float fibre=vesperNoise(vp*vec3(.28,.032,.28));
         float fine=vesperNoise(vp*vec3(.95,.15,.95));
         float crack=smoothstep(.26,.55,fibre*.72+fine*.28);
         diffuseColor.rgb*=mix(.76,1.25,crack)*mix(.87,1.12,broad);
         diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.74,1.18,.83),smoothstep(.61,.8,broad)*.48);
         float vesperHeight=(fibre*.7+fine*.3)*.095;`
      : leaf
        ? `float broad=vesperNoise(vVesperSurface*.17); float fine=vesperNoise(vVesperSurface*1.7);
           diffuseColor.rgb*=mix(.62,1.26,broad); diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.2,1.06,.72),smoothstep(.6,.86,broad)*.35);
           float vesperHeight=fine*.024;`
        : walker
          ? `float broad=vesperNoise(vVesperSurface*.18); float pore=vesperNoise(vVesperSurface*1.6);
             diffuseColor.rgb*=mix(.76,1.23,broad); diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.79,1.13,1.04),smoothstep(.55,.8,broad)*.35);
             float vesperHeight=pore*.048;`
          : `float broad=vesperNoise(vVesperSurface*.12); float fine=sin(length(vVesperSurface.xz)*2.4+vesperNoise(vVesperSurface*.6)*3.);
           diffuseColor.rgb*=mix(.76,1.17,broad)*(1.+fine*.055); float vesperHeight=fine*.035;`;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n${treatment}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec3 vsx=dFdx(-vViewPosition),vsy=dFdy(-vViewPosition);
        vec3 vr1=cross(vsy,normal),vr2=cross(normal,vsx);
        float vdet=dot(vsx,vr1);
        normal=normalize(max(abs(vdet),.000001)*normal-sign(vdet)*(dFdx(vesperHeight)*vr1+dFdy(vesperHeight)*vr2));`,
      );
  };
  material.customProgramCacheKey = () =>
    `vesper-organic-r3-${bark ? 'bark' : leaf ? 'leaf' : walker ? 'walker' : 'fungus'}`;
}
