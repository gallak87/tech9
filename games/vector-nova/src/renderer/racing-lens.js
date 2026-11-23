import { MathUtils, Vector2 } from 'three';

const foregroundOnset = 80 / 3.6;
const foregroundPeak = 145 / 3.6;

export function racingBlurStrength({
  speed,
  cruiseSpeed,
  boost = 0,
  catapulting = false,
}) {
  if (catapulting) return 0.24;
  const foreground =
    MathUtils.smoothstep(speed, foregroundOnset, foregroundPeak) * 0.026;
  const cruise =
    MathUtils.smoothstep(
      speed,
      foregroundPeak,
      Math.max(foregroundPeak + 1, cruiseSpeed),
    ) * 0.064;
  return MathUtils.lerp(foreground + cruise, 0.2, MathUtils.clamp(boost, 0, 1));
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
    craftRadius: { value: 0.1 },
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
    uniform float craftRadius;
    varying vec2 racingUv;
    void main() {
      vec2 radial=racingUv-vec2(.5,.52);
      float edge=smoothstep(.13,.48,length(radial*vec2(1.15,1.)));
      vec2 hullMetric=vec2(1.,.82);
      float fromCraft=length((racingUv-craftCenter)*hullMetric);
      float craft=smoothstep(craftRadius,craftRadius+.13,fromCraft);
      // Bring the bottom corners in first, then widen the rush at race speed.
      float foreground=1.-smoothstep(.30,.66,racingUv.y);
      float shoulder=smoothstep(.27,.50,abs(radial.x))*.63;
      float spread=smoothstep(.026,.09,strength);
      float sector=mix(mix(.22,1.,max(foreground,shoulder)),1.,spread);
      vec2 stride=radial*strength*edge*craft*sector;
      // A long tap near the silhouette must not collect the craft's image.
      stride*=min(1.,max(0.,fromCraft-craftRadius)/max(length(stride*hullMetric),.00001));
      if(dot(stride,stride)<.00000001) {
        gl_FragColor=texture2D(tDiffuse,racingUv);
        return;
      }
      vec4 streak=vec4(0.);
      // Spatially stagger taps instead of repeating hard silhouettes at fixed
      // offsets. A fixed screen-space phase avoids temporal noise/shimmer.
      vec3 noise=fract(vec3(gl_FragCoord.xyx)*.1031);
      noise+=dot(noise,noise.yzx+33.33);
      float jitter=fract((noise.x+noise.y)*noise.z);
      // Shorter strides need fewer taps. Fade in each extra tap as the
      // sample budget grows to keep the transition smooth.
      float samples=mix(12.,24.,smoothstep(.026,.14,strength));
      float weights=0.;
      for(int i=0;i<24;i++) {
        float share=clamp(samples-float(i),0.,1.);
        if(share<=0.) break;
        float amount=min((float(i)+.5+(jitter-.5)*.65)/samples,1.);
        float weight=(1.-amount*.65)*share;
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
