import { ShaderChunk } from 'three';

const finished = new WeakSet();
const lights = ShaderChunk.lights_fragment_begin;
const start = lights.indexOf('#if ( NUM_POINT_LIGHTS');
const end = lights.indexOf('#if ( NUM_SPOT_LIGHTS');
const boundedLights =
  lights.slice(0, start) +
  lights
    .slice(start, end)
    .replace(
      'RE_Direct( directLight,',
      'if ( directLight.visible ) RE_Direct( directLight,',
    ) +
  lights.slice(end);

// Three computes finite light attenuation before evaluating the material BRDF.
// Outside a lamp's reach that contribution is exactly zero. Skip only that
// lighting work; retain every fixture, its original reach and every lit pixel.
// Keep this local to Zephyr and preserve its existing material shader hooks.
export function finishZephyrLighting(group) {
  group.traverse((object) => {
    for (const material of [object.material].flat().filter(Boolean)) {
      if (!material.isMeshStandardMaterial || finished.has(material)) continue;
      finished.add(material);
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_begin>',
          boundedLights,
        );
      };
      material.customProgramCacheKey = () => `${key}:zephyr-bounded-lights-v1`;
      material.needsUpdate = true;
    }
  });
}
