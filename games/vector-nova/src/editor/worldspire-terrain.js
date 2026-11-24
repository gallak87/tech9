import { appendShaderPatch, replaceShader } from '../renderer/shader-patch.js';

export function finishWorldspireUndercast({ soil }, _textures, { plan }) {
  appendShaderPatch(soil, ':editor-worldspire-undercast', (shader) => {
    shader.uniforms.cloudLevel = { value: plan.seaLevel - 28 };
    shader.vertexShader = replaceShader(
      'varying vec3 cloudPosition;\n' + shader.vertexShader,
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\ncloudPosition = (modelMatrix * vec4(transformed, 1.)).xyz;',
    );
    shader.fragmentShader =
      `varying vec3 cloudPosition;
      uniform float cloudLevel;
      float cloudHash(vec2 cell) {
        vec3 p = fract(vec3(cell.xyx) * vec3(.1031,.103,.0973));
        p += dot(p,p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float cloudNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p);
        f=f*f*(3.-2.*f);
        return mix(mix(cloudHash(i),cloudHash(i+vec2(1.,0.)),f.x),
          mix(cloudHash(i+vec2(0.,1.)),cloudHash(i+1.),f.x),f.y);
      }
      float cloudDensity(vec2 p) {
        return .55 * cloudNoise(p) + .27 * cloudNoise(p*2.04 + 16.1)
          + .12 * cloudNoise(p*4.21 - 9.3) + .06 * cloudNoise(p*8.17 + 21.4);
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <opaque_fragment>',
      `vec3 eyeRay = cloudPosition - cameraPosition;
      // Use a continuous cloud field across local terrain and its distant
      // extension, even when the underlying terrain changes slope abruptly.
      float plane = (cloudLevel - cameraPosition.y) / min(-.015*length(eyeRay),eyeRay.y);
      float project = mix(1.,clamp(plane,.3,2.8),smoothstep(.01,.10,-normalize(eyeRay).y));
      vec2 cloudCoord = (cameraPosition.xz + eyeRay.xz*project)*vec2(.0017,.0023);
      cloudCoord += vec2(cloudNoise(cloudCoord*.47),cloudNoise(cloudCoord*.54+15.)) * 1.4;
      float cloud = cloudDensity(cloudCoord);
      float lit = cloudNoise(cloudCoord + vec2(-.12,.10)) - cloudNoise(cloudCoord);
      float bank = smoothstep(.25,.72,cloud + lit*.5);
      vec3 base = mix(vec3(.23,.36,.41),vec3(.50,.60,.66),smoothstep(.13,.48,cloud));
      vec3 surface = mix(base,vec3(1.16,.79,.59),pow(bank,1.5));
      outgoingLight = surface;
      #include <opaque_fragment>`,
    );
  });
}

export function settleWorldspireInClouds(material, cloudLevel) {
  appendShaderPatch(material, ':editor-cloud-root-haze', (shader) => {
    shader.uniforms.cloudLevel = { value: cloudLevel };
    shader.vertexShader =
      'varying vec3 cloudPoint;\n' +
      replaceShader(
        shader.vertexShader,
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 cloudBase = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          cloudBase = instanceMatrix * cloudBase;
        #endif
        cloudPoint = (modelMatrix * cloudBase).xyz;`,
      );
    shader.fragmentShader =
      'varying vec3 cloudPoint; uniform float cloudLevel;\n' +
      replaceShader(
        shader.fragmentShader,
        '#include <opaque_fragment>',
        `float fogBank = sin(cloudPoint.x*.004+sin(cloudPoint.z*.005))*55.;
        float cloudSkirt = 1.-smoothstep(-55.,340.,cloudPoint.y-cloudLevel+fogBank);
        outgoingLight = mix(outgoingLight,vec3(.76,.70,.62),cloudSkirt*.93);
        #include <opaque_fragment>`,
      );
  });
}
