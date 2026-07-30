import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// ─────────────────────────────────────────────────────────────────────────────
// Frame graph
//
//   ScenePass ──► HDR colour + real DepthTexture
//        ├─► GodRaysPass      sun occlusion → radial blur → additive
//        ├─► DOFPass          CoC from depth, golden-angle bokeh
//        ├─► MotionBlurPass   depth reprojection against previous viewProj
//        ├─► UnrealBloomPass  HDR threshold + mip chain
//        ├─► GradePass        CA → exposure → tonemap → grade → vignette →
//        │                    grain → sRGB   (the only tonemap in the chain)
//        └─► SMAAPass         edge AA in gamma space, last
//
// Every knob lives in `post.params`, so the dev overlay and the capture
// harness can drive the look without touching shader source.
// ─────────────────────────────────────────────────────────────────────────────

const BASIC_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COPY_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

// Exposure is applied here, at the very front of the chain, so that everything
// downstream — bloom threshold, god-ray threshold, DOF — works in a normalised
// space where 1.0 means "diffuse white". Tone mapping stays at the end.
const EXPOSE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uExposure;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  gl_FragColor = vec4(c.rgb * uExposure, c.a);
}
`;

/* ── ScenePass ───────────────────────────────────────────────────────────── */
export class ScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;
    this.exposure = 1.0;

    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.FloatType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      depthTexture: depth,
      stencilBuffer: false,
    });

    this.fsQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, uExposure: { value: 1 } },
      vertexShader: BASIC_VERT,
      fragmentShader: EXPOSE_FRAG,
      depthTest: false, depthWrite: false,
    }));
  }

  get depthTexture() { return this.target.depthTexture; }
  get colorTexture() { return this.target.texture; }
  setSize(w, h) { this.target.setSize(Math.max(1, w), Math.max(1, h)); }

  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);

    this.fsQuad.material.uniforms.uExposure.value = this.exposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() { this.target.dispose(); this.fsQuad.dispose(); }
}

/* ── God rays ────────────────────────────────────────────────────────────────
   Occlusion buffer: keep scene colour only where the depth buffer says "sky",
   then radially blur it toward the sun and add it back. Cheap, and it reads as
   real atmospheric scatter because the occluders are the actual silhouettes. */
const GODRAY_OCCLUSION_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // sky (depth ~1) passes through; geometry masks the rays
  float sky = step(0.9999, d);
  float bright = smoothstep(uThreshold, uThreshold * 2.2, lum);
  gl_FragColor = vec4(c * sky * bright, 1.0);
}
`;

const GODRAY_BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uSun;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
varying vec2 vUv;
const int SAMPLES = 48;
void main() {
  vec2 uv = vUv;
  vec2 delta = (uv - uSun) * (uDensity / float(SAMPLES));
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    uv -= delta;
    acc += texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb * illum;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc * (uWeight / float(SAMPLES)), 1.0);
}
`;

const GODRAY_COMBINE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tRays;
uniform vec3 uTint;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 rays = texture2D(tRays, vUv).rgb * uTint * uIntensity;
  gl_FragColor = vec4(base + rays, 1.0);
}
`;

export class GodRaysPass extends Pass {
  constructor(depthTexture) {
    super();
    this.needsSwap = true;
    this.enabled = true;
    this.sun = new THREE.Vector2(0.5, 0.8);
    this.visible = 1;
    this.params = { density: 0.62, decay: 0.945, weight: 2.4, intensity: 0.35, threshold: 1.15, tint: new THREE.Color(0xffd9a8) };

    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    this.matOcc = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: depthTexture }, uThreshold: { value: 0.7 } },
      vertexShader: BASIC_VERT, fragmentShader: GODRAY_OCCLUSION_FRAG, depthTest: false, depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, uSun: { value: this.sun },
        uDensity: { value: 0.85 }, uDecay: { value: 0.955 }, uWeight: { value: 3.6 },
      },
      vertexShader: BASIC_VERT, fragmentShader: GODRAY_BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.matCombine = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tRays: { value: this.rtB.texture },
        uTint: { value: new THREE.Vector3(1, 0.85, 0.66) }, uIntensity: { value: 0.5 },
      },
      vertexShader: BASIC_VERT, fragmentShader: GODRAY_COMBINE_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad();
  }

  setSize(w, h) {
    const s = 0.5;
    this.rtA.setSize(Math.max(1, w * s | 0), Math.max(1, h * s | 0));
    this.rtB.setSize(Math.max(1, w * s | 0), Math.max(1, h * s | 0));
  }

  render(renderer, writeBuffer, readBuffer) {
    const p = this.params;
    // sun behind the camera or off-screen -> skip entirely
    if (this.visible <= 0.001 || p.intensity <= 0.001) {
      this.fsQuad.material = _copyMat(readBuffer.texture);
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      renderer.clear(); this.fsQuad.render(renderer);
      return;
    }

    this.matOcc.uniforms.tDiffuse.value = readBuffer.texture;
    this.matOcc.uniforms.uThreshold.value = p.threshold;
    this.fsQuad.material = this.matOcc;
    renderer.setRenderTarget(this.rtA);
    renderer.clear(); this.fsQuad.render(renderer);

    this.matBlur.uniforms.tDiffuse.value = this.rtA.texture;
    this.matBlur.uniforms.uSun.value.copy(this.sun);
    this.matBlur.uniforms.uDensity.value = p.density;
    this.matBlur.uniforms.uDecay.value = p.decay;
    this.matBlur.uniforms.uWeight.value = p.weight;
    this.fsQuad.material = this.matBlur;
    renderer.setRenderTarget(this.rtB);
    renderer.clear(); this.fsQuad.render(renderer);

    this.matCombine.uniforms.tDiffuse.value = readBuffer.texture;
    this.matCombine.uniforms.uIntensity.value = p.intensity * this.visible;
    this.matCombine.uniforms.uTint.value.set(p.tint.r, p.tint.g, p.tint.b);
    this.fsQuad.material = this.matCombine;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear(); this.fsQuad.render(renderer);
  }

  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.fsQuad.dispose(); }
}

/* ── Depth of field ─────────────────────────────────────────────────────────
   Golden-angle spiral bokeh, radius driven by circle-of-confusion. Tuned for
   a flight game: near field almost never blurs, far field falls off gently so
   the horizon reads as distance rather than as a smeared mistake.            */
const DOF_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;      // metres
uniform float uFocalRange; // metres of sharp zone
uniform float uMaxCoC;     // px
uniform float uNearScale;
varying vec2 vUv;

float linearDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

float coc(float dist) {
  float far  = smoothstep(uFocus + uFocalRange, uFocus + uFocalRange * 9.0, dist);
  float near = smoothstep(uFocus - uFocalRange, max(0.05, uFocus - uFocalRange * 3.0), dist) ;
  return clamp(far + (1.0 - near) * uNearScale, 0.0, 1.0);
}

void main() {
  float d = texture2D(tDepth, vUv).x;
  float dist = linearDepth(d);
  float c = coc(dist);
  vec3 center = texture2D(tDiffuse, vUv).rgb;
  if (c < 0.004) { gl_FragColor = vec4(center, 1.0); return; }

  float radius = c * uMaxCoC;
  vec3 acc = center;
  float wsum = 1.0;
  const int TAPS = 28;
  const float GA = 2.39996323;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i) + 1.0;
    float r = sqrt(fi / float(TAPS)) * radius;
    float a = fi * GA;
    vec2 off = vec2(cos(a), sin(a)) * r * uTexel;
    vec2 suv = clamp(vUv + off, vec2(0.0), vec2(1.0));
    float sd = linearDepth(texture2D(tDepth, suv).x);
    float sc = coc(sd);
    // reject sharp foreground bleeding into blurred background
    float w = (sd >= dist - 0.5) ? 1.0 : sc;
    acc += texture2D(tDiffuse, suv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}
`;

export class DOFPass extends Pass {
  constructor(depthTexture, camera) {
    super();
    this.needsSwap = true;
    this.camera = camera;
    this.params = { focus: 90, focalRange: 55, maxCoC: 9.0, nearScale: 0.35 };
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: depthTexture },
        uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
        uNear: { value: camera.near }, uFar: { value: camera.far },
        uFocus: { value: 90 }, uFocalRange: { value: 55 },
        uMaxCoC: { value: 9 }, uNearScale: { value: 0.35 },
      },
      vertexShader: BASIC_VERT, fragmentShader: DOF_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(w, h) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uFocus.value = this.params.focus;
    u.uFocalRange.value = this.params.focalRange;
    u.uMaxCoC.value = this.params.maxCoC;
    u.uNearScale.value = this.params.nearScale;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/* ── Motion blur ─────────────────────────────────────────────────────────────
   Reprojection against the previous frame's viewProj. Camera motion only (no
   per-object velocity buffer) which is exactly right here — the whole world
   streams past the camera, so camera velocity *is* the dominant motion.      */
const MOTION_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uStrength;
uniform float uMaxVel;
varying vec2 vUv;
const int TAPS = 10;
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  if (uStrength <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }

  vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * clip;
  world /= world.w;
  vec4 prev = uPrevViewProj * world;
  vec2 prevUv = (prev.xy / prev.w) * 0.5 + 0.5;

  vec2 vel = (vUv - prevUv) * uStrength;
  float len = length(vel);
  if (len < 0.0004) { gl_FragColor = vec4(base, 1.0); return; }
  if (len > uMaxVel) vel *= uMaxVel / len;

  vec3 acc = base;
  float w = 1.0;
  for (int i = 1; i <= TAPS; i++) {
    float t = float(i) / float(TAPS);
    vec2 uv = clamp(vUv - vel * t, 0.0, 1.0);
    float fall = 1.0 - t * 0.55;
    acc += texture2D(tDiffuse, uv).rgb * fall;
    w += fall;
  }
  gl_FragColor = vec4(acc / w, 1.0);
}
`;

export class MotionBlurPass extends Pass {
  constructor(depthTexture, camera) {
    super();
    this.needsSwap = true;
    this.camera = camera;
    this.strength = 0.55;
    this.maxVel = 0.05;
    this._prevViewProj = new THREE.Matrix4();
    this._viewProj = new THREE.Matrix4();
    this._first = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: depthTexture },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uStrength: { value: 0.55 }, uMaxVel: { value: 0.05 },
      },
      vertexShader: BASIC_VERT, fragmentShader: MOTION_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    this._viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (this._first) { this._prevViewProj.copy(this._viewProj); this._first = false; }

    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.uInvViewProj.value.copy(this._viewProj).invert();
    u.uPrevViewProj.value.copy(this._prevViewProj);
    u.uStrength.value = this.strength;
    u.uMaxVel.value = this.maxVel;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);
    this._prevViewProj.copy(this._viewProj);
  }

  /** Teleports (level load, camera cut) must not smear. */
  reset() { this._first = true; }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/* ── Grade / output ─────────────────────────────────────────────────────────
   The only place HDR becomes sRGB. Chromatic aberration happens on the HDR
   side (it's a lens effect, it precedes the sensor); grain and vignette come
   after the tone curve where they behave like film.                          */
const GRADE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2  uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uCA;
uniform float uVignette;
uniform float uVignetteSoft;
uniform float uGrain;
uniform float uSaturation;
uniform float uContrast;
uniform vec3  uLift;
uniform vec3  uGamma;
uniform vec3  uGain;
uniform vec3  uTint;
uniform float uSharpen;
uniform float uToneMode;   // 0 = ACES, 1 = AgX-ish
uniform float uFlash;      // white flash 0..1
uniform vec3  uFlashColor;
varying vec2 vUv;

// Narkowicz ACES fit
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
// Cheap AgX-flavoured curve: log encode, sigmoid, hue-preserving desat of highlights
vec3 agxish(vec3 x) {
  x = max(x, vec3(0.0));
  vec3 l = log2(x + 6.1e-5);
  l = clamp((l + 12.47393) / (12.47393 + 4.026069), 0.0, 1.0);
  vec3 v = l * l * (3.0 - 2.0 * l);            // smoothstep sigmoid
  v = pow(v, vec3(1.0 / 2.2));
  return clamp(v, 0.0, 1.0);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  // ── chromatic aberration (radial, HDR side)
  // uCA is red/blue separation in PIXELS at the frame corner, not UV units —
  // in UV a "small" value like 0.3 is ~100px of rainbow.
  vec3 hdr;
  if (uCA > 0.0001) {
    vec2 off = c * r2 * (uCA * 2.83 / uResolution.x);
    hdr.r = texture2D(tDiffuse, uv - off).r;
    hdr.g = texture2D(tDiffuse, uv).g;
    hdr.b = texture2D(tDiffuse, uv + off).b;
  } else {
    hdr = texture2D(tDiffuse, uv).rgb;
  }

  // ── unsharp mask, HDR side so it sharpens detail not grain
  if (uSharpen > 0.0001) {
    vec2 t = 1.0 / uResolution;
    vec3 blur =
      texture2D(tDiffuse, uv + vec2( t.x, 0.0)).rgb +
      texture2D(tDiffuse, uv + vec2(-t.x, 0.0)).rgb +
      texture2D(tDiffuse, uv + vec2(0.0,  t.y)).rgb +
      texture2D(tDiffuse, uv + vec2(0.0, -t.y)).rgb;
    hdr += (hdr - blur * 0.25) * uSharpen;
    hdr = max(hdr, vec3(0.0));
  }

  hdr *= uExposure * uTint;
  hdr += uFlashColor * uFlash * 6.0;

  vec3 col = (uToneMode < 0.5) ? acesFilm(hdr) : agxish(hdr);

  // ── lift / gamma / gain
  col = col * uGain + uLift * (1.0 - col);
  col = pow(max(col, vec3(0.0)), uGamma);

  // ── contrast around 0.5 pivot, then saturation
  col = (col - 0.5) * uContrast + 0.5;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);
  col = clamp(col, 0.0, 1.0);

  // ── vignette
  float vig = smoothstep(uVignetteSoft, uVignetteSoft - 0.55, r2 * uVignette);
  col *= mix(1.0, vig, 0.85);

  // ── film grain, luminance-weighted (shadows grain more, like real stock)
  if (uGrain > 0.0001) {
    float n = hash13(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
    col += n * uGrain * (1.0 - 0.65 * lum);
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

export class GradePass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1280, 720) },
        uTime: { value: 0 },
        uExposure: { value: 1.0 },
        uCA: { value: 2.2 },   // pixels at frame corner
        uVignette: { value: 1.15 },
        uVignetteSoft: { value: 0.62 },
        uGrain: { value: 0.022 },
        uSaturation: { value: 1.1 },
        uContrast: { value: 1.06 },
        uLift: { value: new THREE.Vector3(0.008, 0.012, 0.028) },
        uGamma: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uGain: { value: new THREE.Vector3(1.02, 1.0, 0.985) },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uSharpen: { value: 0.35 },
        uToneMode: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: BASIC_VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(w, h) { this.material.uniforms.uResolution.value.set(w, h); }

  render(renderer, writeBuffer, readBuffer, dt) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.uTime.value += (dt || 0.016);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/* ── HDR probe ───────────────────────────────────────────────────────────────
   Reads the linear scene buffer back to the CPU at low resolution so exposure,
   clipping and contrast can be *measured*. Eyeballing a tone curve from PNGs is
   how you end up shipping a white screen.                                     */
function halfToFloat(h) {
  const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

export class HDRProbe {
  constructor(renderer, w = 160, h = 90) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.buf = new Uint16Array(w * h * 4);
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: BASIC_VERT, fragmentShader: COPY_FRAG,
      depthTest: false, depthWrite: false,
    }));
  }

  /** @returns luminance stats of `texture` in linear light. */
  sample(texture, exposure = 1) {
    const { renderer, rt, buf } = this;
    const prev = renderer.getRenderTarget();
    this.quad.material.uniforms.tDiffuse.value = texture;
    renderer.setRenderTarget(rt);
    renderer.clear();
    this.quad.render(renderer);
    renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
    renderer.setRenderTarget(prev);

    const n = rt.width * rt.height;
    const lum = new Float64Array(n);
    let clipped = 0, black = 0, nan = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const r = halfToFloat(buf[i * 4]) * exposure;
      const g = halfToFloat(buf[i * 4 + 1]) * exposure;
      const b = halfToFloat(buf[i * 4 + 2]) * exposure;
      if (!Number.isFinite(r + g + b)) { nan++; lum[i] = 0; continue; }
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lum[i] = l;
      sum += l;
      if (l > 3.0) clipped++;        // past where ACES has anything left to give
      if (l < 0.004) black++;
    }
    lum.sort();
    const q = (p) => lum[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
    return {
      mean: sum / n,
      p05: q(0.05), median: q(0.5), p90: q(0.90), p99: q(0.99), max: lum[n - 1],
      clippedPct: (clipped / n) * 100,
      blackPct: (black / n) * 100,
      nan,
    };
  }

  dispose() { this.rt.dispose(); this.quad.dispose(); }
}

/* ── shared copy material (lazily built) ─────────────────────────────────── */
let _copyMaterial = null;
function _copyMat(tex) {
  if (!_copyMaterial) {
    _copyMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: BASIC_VERT, fragmentShader: COPY_FRAG,
      depthTest: false, depthWrite: false,
    });
  }
  _copyMaterial.uniforms.tDiffuse.value = tex;
  return _copyMaterial;
}

/* ── Composer assembly ───────────────────────────────────────────────────── */
export function buildComposer(engine, opts = {}) {
  const { renderer, scene, camera, q } = engine;

  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: false,
    stencilBuffer: false,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.renderToScreen = true;

  const scenePass = new ScenePass(scene, camera);
  composer.addPass(scenePass);

  const godRays = new GodRaysPass(scenePass.depthTexture);
  godRays.enabled = !!q.godrays;
  composer.addPass(godRays);

  const dof = new DOFPass(scenePass.depthTexture, camera);
  dof.enabled = !!q.dof;
  composer.addPass(dof);

  const motion = new MotionBlurPass(scenePass.depthTexture, camera);
  motion.enabled = !!q.motionBlur;
  composer.addPass(motion);

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.55, 1.0);
  composer.addPass(bloom);

  const grade = new GradePass();
  composer.addPass(grade);

  const smaa = new SMAAPass();
  smaa.enabled = !!q.smaa;
  composer.addPass(smaa);

  const api = {
    composer, scenePass, godRays, dof, motion, bloom, grade, smaa,
    params: {
      bloom: { strength: 0.42, radius: 0.55, threshold: 1.0 },
      exposure: 1.0,      // scene exposure, applied at the front of the chain
      trim: 1.0,          // late gain, after all HDR effects
    },
    setEnabled(name, on) {
      const p = api[name];
      if (p) p.enabled = !!on;
    },
    /** Linear-light histogram of the current frame, pre- and post-exposure. */
    probe() {
      if (!api._probe) api._probe = new HDRProbe(renderer);
      return {
        raw: api._probe.sample(scenePass.colorTexture, 1),
        exposed: api._probe.sample(scenePass.colorTexture, api.params.exposure),
        exposure: api.params.exposure,
      };
    },
    setSize(w, h, dpr) {
      const pw = Math.max(1, Math.floor(w * dpr));
      const ph = Math.max(1, Math.floor(h * dpr));
      composer.setSize(w, h);
      composer.setPixelRatio(dpr);
      scenePass.setSize(pw, ph);
      godRays.setSize(pw, ph);
      dof.setSize(pw, ph);
      grade.setSize(pw, ph);
      bloom.setSize(Math.floor(pw * (q.bloomRes || 1)), Math.floor(ph * (q.bloomRes || 1)));
    },
    render(dt) {
      bloom.strength = api.params.bloom.strength;
      bloom.radius = api.params.bloom.radius;
      bloom.threshold = api.params.bloom.threshold;
      scenePass.exposure = api.params.exposure;
      grade.material.uniforms.uExposure.value = api.params.trim;
      composer.render(dt);
    },
  };
  return api;
}
