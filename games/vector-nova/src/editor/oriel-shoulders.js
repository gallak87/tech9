import * as T from 'three';
import { appendShaderPatch, replaceShader } from '../renderer/shader-patch.js';
import { orielShellLayout } from './oriel-backdrop.js';

const { lerp, smoothstep } = T.MathUtils;

/** Draw the two upward-curving banks outside the authored route. Their upper
 * edge follows the same cylinder as the sky, with a soft transition at the rim. */
export function createOrielShoulders(track, plan) {
  const { center, radius, alongX, across, length } = orielShellLayout(
    track.bounds,
  );
  const innerBank = across * 0.5 + 170;
  const outerBank = radius * 0.985;
  const meadowRise = Math.min(420, radius * 0.14);
  const halfLength = Math.max(length * 0.5 + radius * 3.8, radius * 4.6);
  const strips = 18;
  const rows = 96;
  const stride = strips + 1;
  const positions = [];
  const opacity = [];
  const indices = [];
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    const reverse = side < 0 !== alongX;
    for (let row = 0; row <= rows; row++) {
      const u = (2 * row) / rows - 1;
      const axis = halfLength * u;
      const coast =
        Math.sin(axis * 0.004 + plan.seed * 0.001 + side) * 54 +
        Math.sin(axis * 0.011 - side * 2) * 16;
      for (let strip = 0; strip <= strips; strip++) {
        const t = strip / strips;
        const lateral = lerp(innerBank, outerBank, t);
        const x = center.x + (alongX ? axis : side * lateral);
        const z = center.z + (alongX ? side * lateral : axis);
        const ground = plan.surfaceHeight(x, z) - 5;
        const shell = center.y - Math.sqrt(radius ** 2 - lateral ** 2);
        const meadow = ground + (meadowRise + coast) * t ** 2;
        const height = lerp(
          meadow,
          Math.max(meadow, shell),
          smoothstep(t, 0.64, 1),
        );
        positions.push(x, height, z);
        opacity.push(
          smoothstep(t, 0.03, 0.22) *
            (1 - smoothstep(t, 0.59, 1)) *
            (1 - smoothstep(Math.abs(u), 0.8, 1)),
        );
        if (row === rows || strip === strips) continue;
        const a = start + row * stride + strip;
        const b = a + stride;
        const c = a + 1;
        const d = b + 1;
        if (reverse) indices.push(a, c, b, c, d, b);
        else indices.push(a, b, c, c, b, d);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'shoulderOpacity',
    new T.Float32BufferAttribute(opacity, 1),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function finishOrielShoulders(material) {
  appendShaderPatch(material, ':editor-oriel-shoulders', (shader) => {
    const varying = 'varying float orielShoulderOpacity;\n';
    shader.vertexShader =
      'attribute float shoulderOpacity;\n' +
      varying +
      replaceShader(
        shader.vertexShader,
        '#include <begin_vertex>',
        '#include <begin_vertex>\norielShoulderOpacity = shoulderOpacity;',
      );
    shader.fragmentShader =
      varying +
      replaceShader(
        shader.fragmentShader,
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a *= orielShoulderOpacity;',
      );
  });
}
