import * as T from 'three';
import { NOMAD_MOTION_RULES } from './motion.js';
import kit from '../../../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const SOURCE_RADIUS = kit.prototypes
  .find((part) => part.name === 'nomad_wheel')
  .anchors.find((anchor) => anchor.kind === 'axis').rollingRadius;

/** A shutter-averaged finish for the exact rolling Blender wheels. It filters
 * high-frequency stud/tread shading, not their geometry or physical rotation.
 * Wheel-only clones are essential: the retained hull borrows these materials.
 */
export function createNomadWheelSpeedFinish({
  track,
  settings = {},
  sourceRadius = SOURCE_RADIUS,
}) {
  if (!Number.isFinite(sourceRadius) || sourceRadius <= 0)
    throw new Error(
      'Nomad wheel finish needs a positive retained rolling radius.',
    );
  const materials = new Map();
  const blur = { value: 0 },
    streak = { value: 0 };
  const hubColor = { value: new T.Color('#c4bba2') };
  let disposed = false;
  function update(frame = {}) {
    if (disposed) return;
    const current = { ...settings, ...frame.settings };
    const radius = sourceRadius * (track.carriers[0]?.scale.x ?? 1);
    const angularExposure =
      (Math.abs(NOMAD_MOTION_RULES.convoySpeed) *
        Math.hypot(1, track.saltPlane.grade)) /
      radius /
      30;
    blur.value = T.MathUtils.smoothstep(angularExposure, 0.14, 0.45);
    // The broad, single-lobe wear mark follows the real matrix rotation. Reduced
    // motion keeps the anti-aliasing but suppresses this decorative contrast.
    streak.value = current.reducedMotion === true ? 0 : blur.value * 0.075;
  }
  function bindMaterial(source) {
    if (disposed) throw new Error('Nomad wheel speed finish is disposed.');
    if (materials.has(source)) return materials.get(source);
    const material = source.clone();
    const compile = source.onBeforeCompile;
    const key = source.customProgramCacheKey();
    material.name = `${source.name} / shutter-filtered rolling finish`;
    material.userData.nomadWheelSpeedFinish = true;
    material.userData.nomadSourceMaterialUUID = source.uuid;
    const rubber = { value: /rubber/i.test(source.name) ? 1 : 0 };
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      Object.assign(shader.uniforms, {
        nomadWheelBlur: blur,
        nomadWheelStreak: streak,
        nomadWheelRubber: rubber,
        nomadWheelHubColor: hubColor,
        nomadWheelSourceRadius: { value: sourceRadius },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
         uniform float nomadWheelBlur;
         varying vec3 nomadWheelLocal;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
         nomadWheelLocal=position;
         vec2 wheelRadial=position.yz/max(length(position.yz),.001);
         vec3 wheelAverageNormal=normalize(vec3(objectNormal.x,
           wheelRadial*length(objectNormal.yz)));
         objectNormal=normalize(mix(objectNormal,wheelAverageNormal,nomadWheelBlur));`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
         uniform float nomadWheelBlur,nomadWheelStreak,nomadWheelRubber,nomadWheelSourceRadius;
         uniform vec3 nomadWheelHubColor;
         varying vec3 nomadWheelLocal;`,
        )
        .replace(
          '#include <lights_physical_fragment>',
          `float wheelRawRadius=length(nomadWheelLocal.yz);
         float wheelRadius=wheelRawRadius/nomadWheelSourceRadius;
         vec2 wheelDirection=nomadWheelLocal.yz/max(wheelRawRadius,.001);
         float wheelHub=smoothstep(.25,.291666667,wheelRadius)*
           (1.-smoothstep(.529166667,.583333333,wheelRadius))*(1.-nomadWheelRubber);
         float wheelRing=.97+.03*sin(wheelRadius*67.2);
         vec3 wheelAverageColor=mix(diffuseColor.rgb,nomadWheelHubColor,wheelHub*.78)*wheelRing;
         diffuseColor.rgb=mix(diffuseColor.rgb,wheelAverageColor,nomadWheelBlur*.90);
         roughnessFactor=mix(roughnessFactor,mix(.62,.82,nomadWheelRubber),nomadWheelBlur*.70);
         metalnessFactor=mix(metalnessFactor,.38,nomadWheelBlur*wheelHub*.75);
         float wheelWear=max(0.,dot(wheelDirection,vec2(.7071,.7071)));
         wheelWear*=wheelWear;wheelWear*=wheelWear;
         diffuseColor.rgb*=1.+nomadWheelStreak*wheelWear*smoothstep(.583333333,.75,wheelRadius);
         #include <lights_physical_fragment>`,
        );
    };
    material.customProgramCacheKey = () => `${key}-nomad-wheel-shutter-v2`;
    materials.set(source, material);
    return material;
  }
  update();
  return {
    bindMaterial,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const material of materials.values()) material.dispose();
      materials.clear();
    },
  };
}
