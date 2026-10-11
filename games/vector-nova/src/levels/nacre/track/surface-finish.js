// Metric finish on the existing ceramic/glazing panels. No displacement: the
// approved collision triangles and gap lips remain exactly where they are.
// A smooth top coat covers fine, distance-filtered ceramic grain; fitted
// perimeter relief follows the existing panel dimensions in metres.
export function applyNacreSurfaceFinish(material, kind) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader =
      `attribute vec4 nacrePanel; varying vec4 vNacrePanel;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vNacrePanel = nacrePanel;',
      );
    shader.fragmentShader = `
      varying vec4 vNacrePanel;
      float nacreFinishHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * .1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float nacreFinishNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(nacreFinishHash(i), nacreFinishHash(i+vec2(1,0)), f.x),
                   mix(nacreFinishHash(i+vec2(0,1)), nacreFinishHash(i+vec2(1,1)), f.x), f.y);
      }
      vec3 nacreFinishNormal(vec3 surfaceNormal, vec3 surfacePosition, float height, float faceSign) {
        vec3 dx = dFdx(surfacePosition), dy = dFdy(surfacePosition);
        vec3 rx = cross(dy, surfaceNormal), ry = cross(surfaceNormal, dx);
        float det = dot(dx, rx) * faceSign;
        return normalize(abs(det) * surfaceNormal
          - sign(det) * (dFdx(height) * rx + dFdy(height) * ry));
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 panelEdges = min(vNacrePanel.xy, vNacrePanel.zw - vNacrePanel.xy);
      float panelEdge = max(0., min(panelEdges.x, panelEdges.y));
      float edgePixel = max(fwidth(panelEdge), .001);
      float panelRim = 1. - smoothstep(.018, .095 + edgePixel, panelEdge);
      float registerLine = 1. - smoothstep(.004, .004 + edgePixel, abs(panelEdge - .19));
      // Local rim relief and submillimetre grain avoid broad correlated lobes.
      // Evaluate continuously per fragment, never at triangle vertices.
      float rimHeight = .012 * smoothstep(0., .07 + edgePixel, panelEdge);
      vec2 finishMetres = vNacrePanel.xy;
      float grainFilter = 1. - smoothstep(.4, 1.5, length(fwidth(finishMetres * 145.)));
      float ceramicGrain = (nacreFinishNoise(finishMetres * 145.) - .5) * grainFilter;
      diffuseColor.rgb *= (1. - .24 * panelRim - .14 * registerLine)
        * (1. + ceramicGrain * ${kind === 'ceramic' ? '.035' : '.012'});`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor + ceramicGrain * .045, .27, panelRim);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      normal = nacreFinishNormal(normal, -vViewPosition,
        rimHeight ${kind === 'ceramic' ? '+ .00045 * ceramicGrain' : ''}, faceDirection);
      ${
        kind === 'ceramic'
          ? ''
          : `
      // Clear centres retain visible under-ribs; compression seals stay denser.
      float grazing = pow(1. - clamp(abs(dot(normal, normalize(vViewPosition))), 0., 1.), 3.);
      diffuseColor.a = mix(diffuseColor.a * .72, .90,
        clamp(panelRim * .88 + grazing * .58, 0., 1.));`
      }`,
    );
    if (material.isMeshPhysicalMaterial)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clearcoat_normal_fragment_maps>',
        `#include <clearcoat_normal_fragment_maps>
        clearcoatNormal = nacreFinishNormal(clearcoatNormal, -vViewPosition, rimHeight, faceDirection);`,
      );
  };
  material.customProgramCacheKey = () => `${key}-nacre-fitted-${kind}-v1`;
}
