import { ShaderChunk } from 'three';

// Three r186 uses five randomly rotated PCF taps. More deterministic samples
// keep fine foliage penumbras from looking like screen-space stippled noise.
const shadowChunk = ShaderChunk.shadowmap_pars_fragment.replace(
  /float phi = interleavedGradientNoise\( gl_FragCoord.xy \) \* PI2;[\s\S]*?\) \* 0\.2;/,
  `float phi = 0.0;
   shadow = 0.0;
   for (int tap = 0; tap < 12; tap++) {
     shadow += texture(shadowMap, vec3(shadowCoord.xy + vogelDiskSample(tap, 12, phi) * radius, shadowCoord.z));
   }
   shadow /= 12.0;`,
);

/** Preserve material-specific terrain, transmission and wind shader hooks. */
export function softenShadowSampling(material) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <shadowmap_pars_fragment>',
      shadowChunk,
    );
  };
  material.customProgramCacheKey = () => `${previousKey}:soft-shadow-12`;
}
