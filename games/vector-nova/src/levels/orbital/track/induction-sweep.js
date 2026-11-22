import { MathUtils, Vector3 } from 'three';
import { createAmbientClock } from '../../../presentation/ambient-clock.js';
import {
  appendShaderPatch,
  replaceShader,
} from '../../../renderer/shader-patch.js';

export function createInductionSweep(trackLength) {
  const clock = createAmbientClock();
  // Whole numbers of crests and transverse bars meet across the lap seam.
  const sweep = {
    value: new Vector3(
      0.15,
      Math.max(1, Math.round(trackLength / 112)) / trackLength,
      Math.max(1, Math.round(trackLength / 32)) / trackLength,
    ),
  };
  let previousTime;

  return {
    bind(material, { deck, uvScale }) {
      appendShaderPatch(
        material,
        `-orbital-induction-sweep-v1-${uvScale}`,
        (shader) => {
          shader.uniforms.orbitalSweep = sweep;
          shader.vertexShader = replaceShader(
            `${deck ? 'attribute vec2 roadCoord;' : ''}
          varying vec2 vInductionCoord;
          ${shader.vertexShader}`,
            '#include <begin_vertex>',
            `#include <begin_vertex>
          vInductionCoord = ${deck ? 'roadCoord' : `vec2(uv.y * ${uvScale.toFixed(1)}, 0.0)`};`,
          );
          shader.fragmentShader = replaceShader(
            `uniform vec3 orbitalSweep;
          varying vec2 vInductionCoord;
          ${shader.fragmentShader}`,
            '#include <lights_physical_fragment>',
            `float station = vInductionCoord.x;
          float phase = station * orbitalSweep.y - orbitalSweep.x;
            float wave = smoothstep(0.31, 0.97, 0.5 + 0.5 * cos(6.2831853 * phase));
          float zone = vRoadNeon.a;
          ${
            deck
              ? `
          // A lattice pattern on the solid plates gives way to the actual cut
          // runners and crossbars. Both use the same travelling light phase.
          float across = abs(vInductionCoord.y);
          float fromRunner = min(abs(across - 4.8), abs(across - 12.9));
          float runnerAA = max(0.035, fwidth(across) * 0.55);
          float runners = 1.0 - smoothstep(0.2 - runnerAA, 0.2 + runnerAA, fromRunner);
          float barMetres = abs(fract(station * orbitalSweep.z + 0.5) - 0.5) / orbitalSweep.z;
          float barAA = max(0.04, fwidth(station) * 0.55);
          float bars = 1.0 - smoothstep(0.52 - barAA, 0.52 + barAA, barMetres);
          // Fade only subpixel detail so an approaching bar stays crisp.
          float grid = max(runners * (1.0 - smoothstep(0.25, 0.85, runnerAA)),
                           bars * (1.0 - smoothstep(0.52, 1.8, barAA)));
          float printed = grid * (1.0 - zone) * (0.29 + 0.82 * wave);
          totalEmissiveRadiance += vec3(0.09, 0.42, 0.62) * printed * cassetteFinish;
            totalEmissiveRadiance += vRoadNeon.rgb * zone * wave * (1.28 * cassetteFinish);`
              : `totalEmissiveRadiance += vRoadNeon.rgb * zone * wave * 0.95;`
          }
          #include <lights_physical_fragment>`,
          );
        },
      );
    },
    update(frame, now) {
      const time = clock(frame, now);
      if (
        previousTime !== undefined &&
        !frame.reset &&
        !frame.settings?.reducedMotion &&
        ['title', 'countdown', 'racing'].includes(frame.mode)
      ) {
        const elapsed = MathUtils.clamp(time - previousTime, 0, 0.1);
        sweep.value.x = (sweep.value.x + elapsed * 1.25) % 1;
      }
      previousTime = time;
    },
  };
}
