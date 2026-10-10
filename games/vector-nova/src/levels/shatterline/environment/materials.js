const noise = `float slHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}float slNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(slHash(i),slHash(i+vec3(1,0,0)),f.x),mix(slHash(i+vec3(0,1,0)),slHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(slHash(i+vec3(0,0,1)),slHash(i+vec3(1,0,1)),f.x),mix(slHash(i+vec3(0,1,1)),slHash(i+vec3(1,1,1)),f.x),f.y),f.z);}\n`;
/** True world-space triplanar mineral finish; geometry carries the large landforms. */
export function finishShatterlineMaterial(
  material,
  { rockTexture = null } = {},
) {
  const rock = /limestone|chalk/i.test(material.name),
    ceramic = /ceramic|ivory/i.test(material.name);
  if (!rock && !ceramic && !/titanium|graphite/i.test(material.name)) return;
  material.onBeforeCompile = (shader) => {
    if (rockTexture && rock) shader.uniforms.slRock = { value: rockTexture };
    shader.vertexShader =
      'varying vec3 slLocal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec4 slWorld=vec4(transformed,1.);
#ifdef USE_INSTANCING
slWorld=instanceMatrix*slWorld;
#endif
slLocal=(modelMatrix*slWorld).xyz;`,
      );
    shader.fragmentShader =
      'varying vec3 slLocal;\n' +
      (rock && rockTexture ? 'uniform sampler2D slRock;\n' : '') +
      noise +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      float slBroad=slNoise(slLocal*.004),slGrain=slNoise(slLocal*.15);float slHeight=slGrain*.03;float slDetailFade=1.-smoothstep(1800.,7600.,length(vViewPosition));
      ${
        rock
          ? `vec3 slN=normalize(cross(dFdx(slLocal),dFdy(slLocal)));vec3 slWeights=pow(abs(slN),vec3(4.));slWeights/=max(.0001,slWeights.x+slWeights.y+slWeights.z);
      ${rockTexture ? 'vec3 slStone=texture2D(slRock,slLocal.yz*.016).rgb*slWeights.x+texture2D(slRock,slLocal.xz*.016).rgb*slWeights.y+texture2D(slRock,slLocal.xy*.016).rgb*slWeights.z;diffuseColor.rgb*=mix(vec3(.85),mix(vec3(.50),slStone,slDetailFade)*2.0,.85);slHeight=dot(slStone,vec3(.333))*.32*slDetailFade;' : ''}
      float slBeds=sin(slLocal.y*.038+slLocal.x*.016+slLocal.z*.011+slNoise(slLocal*.006)*2.);diffuseColor.rgb*=.79+slBroad*.29;diffuseColor.rgb*=1.-smoothstep(.5,.91,slBeds)*.17*slDetailFade;`
          : ceramic
            ? 'float slStain=slNoise(slLocal*vec3(.07,.009,.07));diffuseColor.rgb*=.82+slBroad*.17+slGrain*.06;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.66,.63,.56),smoothstep(.50,.77,slStain)*.36);slHeight=slGrain*.012;'
            : 'diffuseColor.rgb*=.84+slBroad*.14+slGrain*.06;slHeight=slGrain*.008;'
      }
    `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
      vec3 slSx=dFdx(-vViewPosition),slSy=dFdy(-vViewPosition);vec3 slRx=cross(slSy,normal),slRy=cross(normal,slSx);float slDet=dot(slSx,slRx);normal=normalize(normal-sign(slDet)*(dFdx(slHeight)*slRx+dFdy(slHeight)*slRy)/max(abs(slDet),.00001));
    `,
        );
  };
  material.customProgramCacheKey = () =>
    `shatterline-finish-v7-${rock ? 'rock' : ceramic ? 'ceramic' : 'metal'}-${Boolean(rockTexture)}`;
  material.needsUpdate = true;
}
