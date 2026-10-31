// Metric finish on the flush ceramic/glazing panels. Fitted rim and seal relief
// affects shading only, leaving the actual running skin smooth across seams.
// A smooth top coat covers the ceramic PBR maps; fitted perimeter relief
// follows the existing panel dimensions in metres. Glazing stays distinct.
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
      // Local rim relief stays separate from the ceramic PBR normal map.
      // Evaluate continuously per fragment, never at triangle vertices.
      float rimHeight = .012 * smoothstep(0., .07 + edgePixel, panelEdge);
      diffuseColor.rgb *= (1. - .24 * panelRim - .14 * registerLine);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .27, panelRim);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      normal = nacreFinishNormal(normal, -vViewPosition,
        rimHeight, faceDirection);
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
