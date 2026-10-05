// Original procedural surface response. Authored geometry supplies seams/bevels;
// world-space grain and wear keep merged and instanced assemblies consistent.
export function finishThermalMaterial(material, kind = 'ceramic') {
  if (
    !material.isMeshStandardMaterial ||
    (material.emissiveIntensity > 0.8 && material.emissive.getHex() !== 0)
  )
    return;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader =
      `varying vec3 helionSurface;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
      vec4 helionWorld=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      helionWorld=instanceMatrix*helionWorld;
      #endif
      helionSurface=(modelMatrix*helionWorld).xyz;`,
      );
    shader.fragmentShader = `varying vec3 helionSurface;
      float helionHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float helionNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(helionHash(i),helionHash(i+vec3(1,0,0)),f.x),mix(helionHash(i+vec3(0,1,0)),helionHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(helionHash(i+vec3(0,0,1)),helionHash(i+vec3(1,0,1)),f.x),mix(helionHash(i+vec3(0,1,1)),helionHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      ${shader.fragmentShader}`;
    const graphite = kind === 'graphite',
      copper = kind === 'copper';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float hLarge=helionNoise(helionSurface*.19);
      float hWear=helionNoise(helionSurface*1.1+vec3(4.1));
      float hFootprint=max(length(dFdx(helionSurface)),length(dFdy(helionSurface)))*13.7;
      float hGrain=mix(helionNoise(helionSurface*13.7),.5,smoothstep(.2,1.8,hFootprint));
      float hDetail=hLarge*.5+hWear*.34+hGrain*.16;
      diffuseColor.rgb*= ${graphite ? '.84+hDetail*.12' : copper ? '.67+hDetail*.6' : '.50+hDetail*.78'};
      ${copper ? 'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.08,.16,.14),smoothstep(.65,.82,hLarge)*.36);' : ''}
      ${graphite ? 'float hHeat=helionNoise(helionSurface*vec3(.027,.011,.019));float hStreak=helionNoise(helionSurface*vec3(.15,.006,.11)+vec3(23.));diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.22,.76,.54),smoothstep(.48,.73,hHeat)*(.18+hStreak*.48));' : ''}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+(hWear-.5)*.32,.18,.96);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float hRelief=helionNoise(helionSurface*5.7)*${graphite ? '.006' : copper ? '.014' : '.017'};
      vec3 hDx=dFdx(-vViewPosition),hDy=dFdy(-vViewPosition);
      vec3 hR1=cross(hDy,normal),hR2=cross(normal,hDx);
      float hDet=dot(hDx,hR1);
      normal=normalize(abs(hDet)*normal-sign(hDet)*(dFdx(hRelief)*hR1+dFdy(hRelief)*hR2));`,
    );
  };
  material.customProgramCacheKey = () => `helion-surface-v4:${kind}`;
  material.needsUpdate = true;
}
