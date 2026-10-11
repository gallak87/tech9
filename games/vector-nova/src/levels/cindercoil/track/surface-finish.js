import * as THREE from 'three';

// Texture coordinates only: the road's contact positions, shared stations and
// roadCoord stay untouched. Swept faces use their measured cross-section width;
// formed boxes use local face projection, so long kiln shelves are not stretched.
export function setCeramicCoordinates(geometry, panel = false) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const original = geometry.getAttribute('uv');
  const route = geometry.getAttribute('roadCoord');
  if (panel) geometry.setAttribute('ceramicPanel', original.clone());
  const coordinates = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    if (route) {
      const first = i - (i % 2);
      const width = Math.hypot(
        position.getX(first + 1) - position.getX(first),
        position.getY(first + 1) - position.getY(first),
        position.getZ(first + 1) - position.getZ(first),
      );
      coordinates[i * 2] = original.getX(i) * width;
      coordinates[i * 2 + 1] = route.getX(i);
    } else {
      const nx = Math.abs(normal.getX(i)),
        ny = Math.abs(normal.getY(i)),
        nz = Math.abs(normal.getZ(i));
      coordinates[i * 2] =
        nx > ny && nx > nz ? position.getZ(i) : position.getX(i);
      coordinates[i * 2 + 1] =
        ny >= nx && ny >= nz ? position.getZ(i) : position.getY(i);
    }
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
}

// The former map baked seams and broad grain into the same low-resolution tile.
// Keep construction at cassette scale and mineral detail at its own metre scale.
// Filter the sealed joint/rounded return in screen space; no raised overlay.
export function applyCeramicPanelFinish(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `attribute vec2 ceramicPanel; varying vec2 vCeramicPanel;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vCeramicPanel = ceramicPanel;',
      );
    shader.fragmentShader = `
      varying vec2 vCeramicPanel;
      vec3 ceramicEdgeNormal(vec3 n, vec3 p, float height, float faceSign) {
        vec3 dx = dFdx(p), dy = dFdy(p);
        vec3 rx = cross(dy, n), ry = cross(n, dx);
        float det = dot(dx, rx) * faceSign;
        return normalize(abs(det) * n - sign(det) * (dFdx(height) * rx + dFdy(height) * ry));
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       vec2 edges = min(vCeramicPanel, 1. - vCeramicPanel) * vec2(6., 12.);
       float edge = max(0., min(edges.x, edges.y));
       float pixel = max(fwidth(edge), .001);
       float joint = 1. - smoothstep(.007, .024 + pixel, edge);
       float returnHeight = .010 * smoothstep(.012, .085 + pixel, edge)
         * (1. - smoothstep(.06, .24, pixel));
       diffuseColor.rgb *= 1. - .48 * joint;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .83, joint);',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n normal = ceramicEdgeNormal(normal, -vViewPosition, returnHeight, faceDirection);',
    );
    if (material.isMeshPhysicalMaterial)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clearcoat_normal_fragment_maps>',
        '#include <clearcoat_normal_fragment_maps>\n clearcoatNormal = ceramicEdgeNormal(clearcoatNormal, -vViewPosition, returnHeight, faceDirection);',
      );
  };
  material.customProgramCacheKey = () => 'cindercoil-fitted-ceramic-v1';
}
