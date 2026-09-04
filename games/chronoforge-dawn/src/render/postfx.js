import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ditherTile } from './textures.js';
import { HDRProbe } from './probe.js';

// ─────────────────────────────────────────────────────────────────────────────
// The post chain.
//
//   scene ──► sceneRT (RGBA16F, 4× MSAA)
//        ├──► BloomPyramid   threshold → 5 down → 5 tent-up
//        └──► GradePass      exposure → +bloom → highlight desat → filmic →
//                            lift/gamma/gain → saturation → vignette →
//                            dither → sRGB → screen
//
// Order is not negotiable: exposure sits at the FRONT so that bloom threshold,
// grading and every later decision work in a normalised space where 1.0 means
// diffuse white. Tone mapping is the LAST colour operation, once and only once —
// `renderer.toneMapping` is deliberately NoToneMapping so this is the only one.
//
// UNITS: every screen-space distance in these shaders is in PIXELS, divided by
// resolution at the point of use. A "small" UV offset like 0.05 is 96 px at
// 1920 wide. That mistake is free to make and expensive to find.
//
// Antialiasing is 4× MSAA on the scene target rather than a post AA pass. It is
// cheaper here (this game's frame is geometry-light and fill-heavy), it is
// correct in HDR, and it does not smear the pixel-snapped character pass that
// the art lane will add downstream.
//
// DEFERRED, with a seam left for it: depth-of-field. It needs a DepthTexture on
// the scene target, which cannot share an MSAA attachment — the render lane
// adds a resolved depth prepass when DOF lands in Tier 1. Do not bolt DOF onto
// this target.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PREFILTER = /* glsl */`
uniform sampler2D tScene;
uniform float uExposure, uThreshold, uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  float br = max(c.r, max(c.g, c.b));
  // Soft knee: a hard threshold makes bloom pop on and off as a highlight
  // drifts across it, which reads as flicker in motion.
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const DOWN = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;      // PIXELS → uv, computed on the CPU
varying vec2 vUv;
void main() {
  // 13-tap Jimenez downsample: no aliasing crawl on moving highlights.
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + t * vec2( 0.0, 2.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + t * vec2( 2.0, 2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + t * vec2( 2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0,-2.0)).rgb;
  vec3 h = texture2D(tSrc, vUv + t * vec2( 0.0,-2.0)).rgb;
  vec3 i = texture2D(tSrc, vUv + t * vec2( 2.0,-2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture2D(tSrc, vUv + t * vec2( 1.0, 1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0,-1.0)).rgb;
  vec3 m = texture2D(tSrc, vUv + t * vec2( 1.0,-1.0)).rgb;
  vec3 o = e * 0.125;
  o += (a + c + g + i) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + k + l + m) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}
`;

const UP = /* glsl */`
uniform sampler2D tSrc, tPrev;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv + vec2(-t.x,  t.y)).rgb
         + texture2D(tSrc, vUv + vec2( 0.0,  t.y)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2( t.x,  t.y)).rgb
         + texture2D(tSrc, vUv + vec2(-t.x,  0.0)).rgb * 2.0
         + texture2D(tSrc, vUv).rgb * 4.0
         + texture2D(tSrc, vUv + vec2( t.x,  0.0)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb
         + texture2D(tSrc, vUv + vec2( 0.0, -t.y)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2( t.x, -t.y)).rgb;
  gl_FragColor = vec4(s / 16.0 + texture2D(tPrev, vUv).rgb, 1.0);
}
`;

const GRADE = /* glsl */`
uniform sampler2D tScene, tBloom, tDither;
uniform float uExposure, uBloom, uContrast, uSaturation, uVignette, uGrain, uTime, uSplit;
uniform vec3 uLift, uGain, uShadowTint, uHighlightTint;
uniform vec2 uResolution;
varying vec2 vUv;

// Narkowicz ACES fit. One tonemap, at the end, and nowhere else.
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  c += texture2D(tBloom, vUv).rgb * uBloom;

  // Highlight desaturation BEFORE the curve. Without it a hot sunrise clips to
  // a flat white hole; with it the hottest pixels keep their hue as they roll
  // off, which is what film does and what the eye expects.
  float pk = max(c.r, max(c.g, c.b));
  float t = 1.0 - exp(-max(0.0, pk - 0.85) * 0.55);
  c = mix(c, vec3(pk), t * 0.6);

  c = aces(c);

  c = (c - 0.5) * uContrast + 0.5;
  c = c * uGain + uLift;

  // Split tone. "Warm rim light, cold shadow" is the whole brief for this hour,
  // and physical lighting alone will not deliver it: sky ambient fills shadows
  // with the same colour it fills everything else. Pushing the shadow end cool
  // and the highlight end warm is what separates the two ranges — and it costs
  // one mix, where a second light would cost a second shadow pass.
  float sl = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.12, 0.72, sl));
  c = mix(c, c * tint, uSplit);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);

  // Vignette in PIXELS-normalised space, aspect-corrected, or it turns into an
  // oval on an ultrawide.
  vec2 q = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.34, 1.05, length(q));

  c = max(c, 0.0);
  // sRGB encode. Explicit, because a ShaderMaterial gets no automatic
  // colour-space conversion on the way to the canvas.
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));

  // Dither AFTER the encode, at ±0.5 LSB. Banding in a dawn sky gradient is
  // the most visible 8-bit artefact there is and this is what removes it.
  float d = texture2D(tDither, gl_FragCoord.xy / 64.0).r - 0.5;
  c += d * (uGrain / 255.0);

  gl_FragColor = vec4(c, 1.0);
}
`;

function quad(uniforms, fragmentShader) {
  return new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader,
    depthTest: false, depthWrite: false,
  }));
}

const rt = (w, h, extra = {}) => new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
  type: THREE.HalfFloatType,
  format: THREE.RGBAFormat,
  colorSpace: THREE.LinearSRGBColorSpace,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
  stencilBuffer: false,
  ...extra,
});

const LEVELS = 5;

export function buildComposer(engine, opts = {}) {
  const renderer = engine.renderer;
  const dither = ditherTile();

  const scene = rt(1, 1, { depthBuffer: true, samples: 4 });
  const down = [], up = [];
  for (let i = 0; i < LEVELS; i++) { down.push(rt(1, 1)); up.push(rt(1, 1)); }

  const uPre = {
    tScene: { value: scene.texture }, uExposure: { value: 1 },
    uThreshold: { value: 1.05 }, uKnee: { value: 0.55 },
  };
  const uDown = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } };
  const uUp = { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } };
  const uGrade = {
    tScene: { value: scene.texture }, tBloom: { value: null }, tDither: { value: dither },
    uExposure: { value: 1 }, uBloom: { value: 0.055 }, uContrast: { value: 1.045 },
    uSaturation: { value: 1.06 }, uVignette: { value: 0.28 }, uGrain: { value: 1.0 },
    uTime: { value: 0 }, uLift: { value: new THREE.Vector3(0.002, 0.004, 0.014) },
    uGain: { value: new THREE.Vector3(1.0, 0.995, 0.985) },
    uSplit: { value: 0.85 },
    uShadowTint: { value: new THREE.Vector3(0.80, 0.90, 1.16) },
    uHighlightTint: { value: new THREE.Vector3(1.10, 1.01, 0.88) },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  const qPre = quad(uPre, PREFILTER);
  const qDown = quad(uDown, DOWN);
  const qUp = quad(uUp, UP);
  const qGrade = quad(uGrade, GRADE);

  const api = {
    /** Every knob the dev overlay and the capture harness drive. */
    params: {
      // Fixed exposure, no auto-exposure: an art-directed hour must not drift
      // as the player turns. Set against tools/probe.mjs, not by eye — the
      // target is a dawn ground median near 0.10-0.14 linear with the sky's hot
      // side under ~1.5% blown white.
      exposure: 1.05,
      bloom: { strength: 0.055, threshold: 1.05, knee: 0.55, radius: 1.0 },
      contrast: 1.06, saturation: 1.10, vignette: 0.30, grain: 1.0, split: 0.85,
    },
    enabled: { bloom: engine.q.bloom, grade: true },
    scene, composer: null,
    /** The linear scene tap, for probes and for anything that needs the HDR
     *  frame before grading. Read it; do not write to it. */
    get sceneTexture() { return scene.texture; },

    setEnabled(name, v) { if (name in api.enabled) api.enabled[name] = !!v; },

    setSize(w, h, dpr) {
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      scene.setSize(W, H);
      uGrade.uResolution.value.set(W, H);
      const br = engine.q.bloomRes;
      for (let i = 0; i < LEVELS; i++) {
        const s = Math.pow(2, i + 1);
        const bw = Math.max(1, Math.round(W * br / s)), bh = Math.max(1, Math.round(H * br / s));
        down[i].setSize(bw, bh);
        up[i].setSize(bw, bh);
      }
    },

    render(dt) {
      const p = api.params;
      uPre.uExposure.value = p.exposure;
      uPre.uThreshold.value = p.bloom.threshold;
      uPre.uKnee.value = p.bloom.knee;
      uGrade.uExposure.value = p.exposure;
      uGrade.uBloom.value = api.enabled.bloom ? p.bloom.strength : 0;
      uGrade.uContrast.value = p.contrast;
      uGrade.uSaturation.value = p.saturation;
      uGrade.uVignette.value = p.vignette;
      uGrade.uGrain.value = p.grain;
      uGrade.uSplit.value = p.split;
      uGrade.uTime.value += dt;

      renderer.setRenderTarget(scene);
      renderer.clear(true, true, false);
      renderer.render(engine.scene, engine.camera);

      if (api.enabled.bloom) {
        renderer.setRenderTarget(down[0]);
        qPre.render(renderer);
        for (let i = 1; i < LEVELS; i++) {
          uDown.tSrc.value = down[i - 1].texture;
          uDown.uTexel.value.set(1 / down[i - 1].width, 1 / down[i - 1].height);
          renderer.setRenderTarget(down[i]);
          qDown.render(renderer);
        }
        // Upsample from the smallest level, accumulating as we go.
        let prev = down[LEVELS - 1];
        for (let i = LEVELS - 2; i >= 0; i--) {
          uUp.tSrc.value = prev.texture;
          uUp.tPrev.value = down[i].texture;
          uUp.uTexel.value.set(1 / prev.width, 1 / prev.height);
          uUp.uRadius.value = p.bloom.radius;
          renderer.setRenderTarget(up[i]);
          qUp.render(renderer);
          prev = up[i];
        }
        uGrade.tBloom.value = prev.texture;
      } else {
        uGrade.tBloom.value = down[LEVELS - 1].texture;
      }

      renderer.setRenderTarget(null);
      renderer.clear(true, true, false);
      qGrade.render(renderer);
    },

    /** Linear-light histogram of the frame. See probe.js for what it means. */
    probe(opts2 = {}) {
      if (!api._probe) api._probe = new HDRProbe(renderer);
      const whiteAt = opts2.whiteAt ?? 1.6;
      return {
        exposure: api.params.exposure,
        whiteAt,
        raw: api._probe.sample(scene.texture, 1, whiteAt),
        exposed: api._probe.sample(scene.texture, api.params.exposure, whiteAt),
      };
    },

    dispose() {
      scene.dispose();
      for (const t of down) t.dispose();
      for (const t of up) t.dispose();
      qPre.dispose(); qDown.dispose(); qUp.dispose(); qGrade.dispose();
      dither.dispose();
      api._probe?.dispose();
    },
  };

  Object.assign(api.params, opts.params || {});
  return api;
}
