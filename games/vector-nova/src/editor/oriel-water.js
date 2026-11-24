import { Float32BufferAttribute, Vector4 } from 'three';
import { createOceanNormals } from '@worldkit/environment/ocean';
import { appendShaderPatch, replaceShader } from '../renderer/shader-patch.js';

// The survey supplies the shoreline and changing water elevations. A single
// Worldkit normal field lets those existing meshes share the same finish.
export function buildOrielWater({ owner, materials, plan, collectSolid }) {
  if (collectSolid) return;
  const meshes = owner.group.children.filter(
    (mesh) => mesh.userData.regionWater,
  );
  if (!meshes.length) return;

  for (const { geometry } of meshes) {
    const positions = geometry.getAttribute('position');
    const depths = new Float32Array(positions.count);
    for (let i = 0; i < depths.length; i++)
      depths[i] =
        positions.getY(i) -
        plan.surfaceHeight(positions.getX(i), positions.getZ(i));
    geometry.setAttribute(
      'orielWaterDepth',
      new Float32BufferAttribute(depths, 1),
    );
  }

  const normals = createOceanNormals(128);
  normals.repeat.setScalar(0.42);
  owner.textures.add(normals);
  const water = materials.water;
  water.normalMap = normals;
  water.normalScale.setScalar(0.27);
  water.roughness = 0.19;
  water.metalness = 0.14;
  // Soft edges reveal the underlying bank and ease water into distant terrain.
  water.transparent = true;
  water.depthWrite = false;

  const { min, max } = plan.bounds;
  const bounds = { value: new Vector4(min.x, min.z, max.x, max.z) };
  appendShaderPatch(water, ':editor-oriel-surveyed-water', (shader) => {
    const varyings =
      'varying vec3 orielWaterPoint; varying float orielDepth;\n';
    shader.uniforms.orielWaterBounds = bounds;
    shader.vertexShader =
      'attribute float orielWaterDepth;\n' +
      varyings +
      replaceShader(
        shader.vertexShader,
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        orielWaterPoint = (modelMatrix * vec4(transformed, 1.)).xyz;
        orielDepth = orielWaterDepth;`,
      );
    shader.fragmentShader =
      'uniform vec4 orielWaterBounds;\n' +
      varyings +
      replaceShader(
        replaceShader(
          shader.fragmentShader,
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 fromEdge = min(orielWaterPoint.xz - orielWaterBounds.xy,
            orielWaterBounds.zw - orielWaterPoint.xz);
          float borderFade = smoothstep(4., 245., min(fromEdge.x, fromEdge.y));
          diffuseColor.a *= borderFade * smoothstep(-.02, .9, orielDepth);
          float deep = smoothstep(1., 39., orielDepth);
          diffuseColor.rgb = mix(vec3(.075,.28,.21), vec3(.022,.13,.16), deep);`,
        ),
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float viewAngle = max(dot(normal, normalize(vViewPosition)), 0.);
        float grazing = pow(1. - viewAngle, 4.);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.35,.49,.44), grazing * .48);`,
      );
  });

  return {
    update({ time, settings }) {
      if (Number.isFinite(time) && !settings?.reducedMotion)
        normals.offset.set((time * 0.012) % 1, (time * -0.007) % 1);
    },
  };
}
