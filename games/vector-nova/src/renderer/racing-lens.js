import { MathUtils, Vector2 } from 'three';

export function racingBlurStrength({
  speed,
  cruiseSpeed,
  boost = 0,
  catapulting = false,
}) {
  if (catapulting) return 0.24;
  const cruise = MathUtils.smoothstep(speed / cruiseSpeed, 0.8, 1) * (0.16 / 3);
  return MathUtils.lerp(cruise, 0.16, MathUtils.clamp(boost, 0, 1));
}

// Peripheral world streaking, with a clear road aim and a tracked sharp craft.
// One existing postprocess slot, no motion history or additional render target.
export const racingLens = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
    pressure: { value: 0 },
    time: { value: 0 },
    craftCenter: { value: new Vector2(0.5, 0.25) },
  },
  vertexShader: `
    varying vec2 racingUv;
    void main() {
      racingUv=uv;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float pressure;
    uniform float time;
    uniform vec2 craftCenter;
    varying vec2 racingUv;
    void main() {
      vec2 radial=racingUv-vec2(.5,.52);
      float edge=smoothstep(.13,.48,length(radial*vec2(1.15,1.)));
      float craft=smoothstep(.10,.23,length((racingUv-craftCenter)*vec2(1.,.82)));
      vec2 stride=radial*strength*edge*craft;
      vec4 streak=vec4(0.);
      // Spatially stagger taps instead of repeating hard silhouettes at fixed
      // offsets. A fixed screen-space phase avoids temporal noise/shimmer.
      vec3 noise=fract(vec3(gl_FragCoord.xyx)*.1031);
      noise+=dot(noise,noise.yzx+33.33);
      float jitter=fract((noise.x+noise.y)*noise.z);
      float weights=0.;
      for(int i=0;i<32;i++) {
        float amount=(float(i)+.5+(jitter-.5)*.65)/32.;
        float weight=1.-amount*.65;
        streak+=texture2D(tDiffuse,clamp(racingUv-stride*amount,vec2(0.),vec2(1.)))*weight;
        weights+=weight;
      }
      streak/=weights;
      // Sparse pressure filaments skim the very edge, never the racing line.
      float angle=atan(radial.y,radial.x);
      float strand=pow(abs(sin(angle*23.+sin(angle*7.)*1.7)),96.);
      float travel=fract(length(radial)*2.8-time*(1.8+pressure)+sin(angle*13.));
      float dash=smoothstep(.18,.45,travel)*(1.-smoothstep(.45,.8,travel));
      float rim=smoothstep(.37,.62,length(radial*vec2(1.1,1.)));
      streak.rgb+=vec3(.19,.43,.7)*strand*dash*rim*pressure*.22*craft;
      gl_FragColor=streak;
    }`,
};
