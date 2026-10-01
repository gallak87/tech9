/** Metre-scaled ice detail complements the retained Blender fracture geometry.
 * No image textures, animated glitter, extra render pass or simulation state.
 */
export function finishIceMaterial(material) {
  if (
    !material.isMeshStandardMaterial ||
    /Titanium|Warm navigation/.test(material.name)
  )
    return;
  const dark = /buried|meteoric/.test(material.name);
  const crust = /frost/.test(material.name);
  material.roughness = crust ? 0.88 : dark ? 0.65 : 0.46;
  material.metalness = dark ? 0.15 : 0.025;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vIcePoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 icePoint = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        icePoint = instanceMatrix * icePoint;
      #endif
      vIcePoint = (modelMatrix * icePoint).xyz;
    `,
    );
    shader.fragmentShader =
      `varying vec3 vIcePoint;
      float iceHash(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      float iceNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(iceHash(i),iceHash(i+vec3(1,0,0)),f.x),mix(iceHash(i+vec3(0,1,0)),iceHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(iceHash(i+vec3(0,0,1)),iceHash(i+vec3(1,0,1)),f.x),mix(iceHash(i+vec3(0,1,1)),iceHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float iceRelief(vec3 p) {
        return iceNoise(p*.27)*.35 + iceNoise(p*1.3)*.055;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 p = vIcePoint;
      float drift = iceNoise(p*.021);
      float layering = sin(p.y*.42 + drift*6. + sin(p.z*.035)*1.4);
      float fissureField = p.x*.12 + p.y*.024 + p.z*.055 + drift*3.;
      float line = abs(sin(fissureField));
      float width = max(fwidth(fissureField)*1.25, .025);
      float fracture = 1.-smoothstep(width, width*2.4, line);
      float small = iceNoise(p*.8);
      diffuseColor.rgb *= ${dark ? '(.84 + drift*.30 + layering*.045)' : '(.83 + drift*.34 + layering*.08)'};
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.55,.76,.87), fracture * ${crust ? '.20' : '.38'});
      diffuseColor.rgb += vec3(.016,.026,.032) * smoothstep(.73,.9,small) * ${dark ? '.2' : '.6'};
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (iceNoise(vIcePoint*.13)-.5)*.22, .3, .94);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      // Derivative-filtered relief retains broad planes without triangle glints.
      float height = iceRelief(vIcePoint);
      vec3 sigmaX = dFdx(-vViewPosition), sigmaY = dFdy(-vViewPosition);
      vec3 r1=cross(sigmaY,normal), r2=cross(normal,sigmaX);
      float det=dot(sigmaX,r1);
      vec3 grad=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
      normal=normalize(abs(det)*normal-grad*.32);
    `,
    );
  };
  material.customProgramCacheKey = () =>
    `glasswake-ice-relief-v1:${dark}:${crust}`;
}
