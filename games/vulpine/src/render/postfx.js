import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// ─────────────────────────────────────────────────────────────────────────────
// Frame graph
//
//   ScenePass ──► HDR colour + real DepthTexture
//        ├─► TAAPass          jittered projection + reprojected history
//        ├─► AOPass           half-res horizon AO from depth, bilateral upsample
//        ├─► GodRaysPass      sun occlusion → radial blur → additive (clamped)
//        ├─► DOFPass          CoC from depth, golden-angle bokeh
//        ├─► MotionBlurPass   depth reprojection against previous viewProj
//        ├─► BloomPass        progressive down/upsample pyramid (Jimenez style)
//        ├─► LensFlarePass    depth-occluded starburst + ghosts anchored to sun
//        ├─► GradePass        CA → exposure → filmic → grade → vignette →
//        │                    dither/grain → sRGB  (the only tonemap in the chain)
//        └─► SMAAPass         edge AA in gamma space, last
//
// Every knob lives in `post.params`, so the dev overlay and the capture
// harness can drive the look without touching shader source.
//
// UNITS: every screen-space distance in these shaders is in PIXELS and is
// divided by the resolution at use. A "small" UV offset like 0.05 is 96 px at
// 1920 wide — that mistake already shipped here once.
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

    // sub-pixel jitter for TAA; set by TAAPass, applied around the scene draw
    this.jitter = new THREE.Vector2(0, 0);
    this._jitterProj = new THREE.Matrix4();

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
  setSize(w, h) {
    this.width = Math.max(1, w); this.height = Math.max(1, h);
    this.target.setSize(this.width, this.height);
  }

  render(renderer, writeBuffer) {
    const cam = this.camera;
    const jx = this.jitter.x, jy = this.jitter.y;
    let restored = false;
    if (jx !== 0 || jy !== 0) {
      // Jitter is a post-projection NDC shift: 2*px/width. Applying it to the
      // projection matrix (not the viewport) keeps depth and reprojection exact.
      this._jitterProj.copy(cam.projectionMatrix);
      cam.projectionMatrix.elements[8] += (2 * jx) / (this.width || 1);
      cam.projectionMatrix.elements[9] += (2 * jy) / (this.height || 1);
      restored = true;
    }

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);

    if (restored) cam.projectionMatrix.copy(this._jitterProj);

    this.fsQuad.material.uniforms.uExposure.value = this.exposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() { this.target.dispose(); this.fsQuad.dispose(); }
}

/* ── Temporal AA ─────────────────────────────────────────────────────────────
   SMAA alone cannot hold specular on water or panel seams at 200 m/s. This is
   a standard reprojecting TAA: the scene is rasterised with a Halton jitter,
   the previous resolve is fetched through the depth-reprojected UV, and the
   history is clipped to the neighbourhood colour AABB so disocclusions and
   independently-moving objects can't smear.                                   */
const TAA_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tHistory;
uniform sampler2D tDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform float uFeedback;
uniform float uFirst;
varying vec2 vUv;

vec3 rgb2ycocg(vec3 c) {
  return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
              0.5 * c.r - 0.5 * c.b,
             -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
vec3 ycocg2rgb(vec3 c) {
  float t = c.x - c.z;
  return vec3(t + c.y, c.x + c.z, t - c.y);
}

void main() {
  vec3 cur = texture2D(tDiffuse, vUv).rgb;
  if (uFirst > 0.5) { gl_FragColor = vec4(cur, 1.0); return; }

  // ── reproject through the depth buffer
  float d = texture2D(tDepth, vUv).x;
  vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * clip;
  world /= world.w;
  vec4 prev = uPrevViewProj * world;
  vec2 prevUv = (prev.xy / prev.w) * 0.5 + 0.5;

  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    gl_FragColor = vec4(cur, 1.0); return;
  }

  // ── neighbourhood AABB in YCoCg (variance clipping)
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec3 c = rgb2ycocg(texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * uTexel).rgb);
      m1 += c; m2 += c * c;
    }
  }
  const float N = 9.0;
  vec3 mu = m1 / N;
  vec3 sigma = sqrt(max(vec3(0.0), m2 / N - mu * mu));
  vec3 lo = mu - 1.25 * sigma;
  vec3 hi = mu + 1.25 * sigma;

  vec3 hist = rgb2ycocg(texture2D(tHistory, prevUv).rgb);
  vec3 clipped = clamp(hist, lo, hi);
  float rejected = length(hist - clipped) / max(1e-4, length(sigma) + 0.05);

  vec3 outc = ycocg2rgb(mix(rgb2ycocg(cur), clipped, uFeedback * (1.0 - clamp(rejected * 0.35, 0.0, 1.0))));
  gl_FragColor = vec4(max(outc, vec3(0.0)), 1.0);
}
`;

// Halton(2,3) — the standard low-discrepancy jitter sequence.
function halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
const TAA_OFFSETS = [];
for (let i = 1; i <= 8; i++) TAA_OFFSETS.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);

export class TAAPass extends Pass {
  constructor(scenePass, camera) {
    super();
    this.needsSwap = true;
    this.scenePass = scenePass;
    this.camera = camera;
    this.feedback = 0.90;
    this.jitterScale = 1.0;
    this._frame = 0;
    this._first = true;
    this._prevViewProj = new THREE.Matrix4();
    this._viewProj = new THREE.Matrix4();

    const o = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.history = new THREE.WebGLRenderTarget(1, 1, o);
    this.resolved = new THREE.WebGLRenderTarget(1, 1, o);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tHistory: { value: this.history.texture },
        tDepth: { value: scenePass.depthTexture },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
        uFeedback: { value: 0.9 }, uFirst: { value: 1 },
      },
      vertexShader: BASIC_VERT, fragmentShader: TAA_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.copyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: BASIC_VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false,
    }));
  }

  setSize(w, h) {
    this.history.setSize(Math.max(1, w), Math.max(1, h));
    this.resolved.setSize(Math.max(1, w), Math.max(1, h));
    this.material.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    this._first = true;
  }

  /** Advance the jitter sequence and hand the offset to the scene pass. */
  prepare() {
    if (!this.enabled) { this.scenePass.jitter.set(0, 0); return; }
    const [jx, jy] = TAA_OFFSETS[this._frame % TAA_OFFSETS.length];
    this.scenePass.jitter.set(jx * this.jitterScale, jy * this.jitterScale);
    this._frame++;
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    this._viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.uInvViewProj.value.copy(this._viewProj).invert();
    u.uPrevViewProj.value.copy(this._prevViewProj);
    u.uFeedback.value = this.feedback;
    u.uFirst.value = this._first ? 1 : 0;

    renderer.setRenderTarget(this.resolved);
    renderer.clear();
    this.fsQuad.render(renderer);

    // resolved → history, and resolved → downstream
    this.copyQuad.material.uniforms.tDiffuse.value = this.resolved.texture;
    renderer.setRenderTarget(this.history);
    renderer.clear();
    this.copyQuad.render(renderer);

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear();
    this.copyQuad.render(renderer);

    this._prevViewProj.copy(this._viewProj);
    this._first = false;
  }

  reset() { this._first = true; }
  dispose() { this.history.dispose(); this.resolved.dispose(); this.material.dispose(); this.fsQuad.dispose(); this.copyQuad.dispose(); }
}

/* ── Ambient occlusion ───────────────────────────────────────────────────────
   Half-res horizon-based AO straight off the depth texture the scene pass
   already owns. Contact darkening is most of why a real-time frame reads as
   solid geometry rather than floating cards.                                  */
const AO_FRAG = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform vec2 uTexel;         // half-res texel
uniform float uRadius;       // metres
uniform float uIntensity;
uniform float uBias;
uniform float uProj00;
uniform float uNear;
uniform float uFar;
uniform float uFadeStart;
uniform float uFadeEnd;
varying vec2 vUv;

vec3 viewPos(vec2 uv, out float rawDepth) {
  float d = texture2D(tDepth, uv).x;
  rawDepth = d;
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uProjInv * clip;
  return v.xyz / v.w;
}

// Interleaved gradient noise — deterministic, no RNG, good spatial decorrelation.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float d0;
  vec3 P = viewPos(vUv, d0);
  if (d0 > 0.99995) { gl_FragColor = vec4(1.0); return; }

  // normal from the least-degenerate depth difference on each axis
  float dl, dr, du, dd;
  vec3 pl = viewPos(vUv - vec2(uTexel.x, 0.0), dl);
  vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0), dr);
  vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y), du);
  vec3 pdn = viewPos(vUv - vec2(0.0, uTexel.y), dd);
  vec3 dx = (abs(pr.z - P.z) < abs(P.z - pl.z)) ? (pr - P) : (P - pl);
  vec3 dy = (abs(pu.z - P.z) < abs(P.z - pdn.z)) ? (pu - P) : (P - pdn);
  vec3 N = normalize(cross(dx, dy));
  if (N.z < 0.0) N = -N;

  float dist = -P.z;
  float radiusUv = uRadius * uProj00 * 0.5 / max(0.5, dist);
  radiusUv = min(radiusUv, 0.08);              // cap the screen footprint
  if (radiusUv < uTexel.x) { gl_FragColor = vec4(1.0); return; }

  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  const int DIRS = 4;
  const int STEPS = 5;
  float occ = 0.0;
  for (int i = 0; i < DIRS; i++) {
    float a = rot + float(i) * (3.14159265 / float(DIRS));
    vec2 dir = vec2(cos(a), sin(a));
    float best = uBias;
    for (int s = 1; s <= STEPS; s++) {
      float t = (float(s) - 0.5 + ign(gl_FragCoord.xy + float(s) * 7.13)) / float(STEPS);
      float ds;
      vec3 S = viewPos(vUv + dir * t * radiusUv, ds);
      if (ds > 0.99995) continue;
      vec3 V = S - P;
      float len = length(V);
      if (len < 1e-4) continue;
      float falloff = clamp(1.0 - (len * len) / (uRadius * uRadius), 0.0, 1.0);
      best = max(best, dot(V / len, N) * falloff);
    }
    occ += max(0.0, best - uBias);
  }
  occ = occ / float(DIRS);

  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
  float ao = clamp(1.0 - occ * uIntensity * fade, 0.0, 1.0);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}
`;

const AO_BLUR_FRAG = /* glsl */`
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 uDir;           // pixels
uniform vec2 uTexel;
uniform float uSharpness;
varying vec2 vUv;
void main() {
  float c = texture2D(tDepth, vUv).x;
  float sum = texture2D(tAO, vUv).r;
  float wsum = 1.0;
  for (int i = 1; i <= 4; i++) {
    vec2 o = uDir * float(i) * uTexel;
    for (int s = 0; s < 2; s++) {
      vec2 uv = vUv + (s == 0 ? o : -o);
      float dz = texture2D(tDepth, uv).x - c;
      float w = exp(-float(i * i) * 0.16 - dz * dz * uSharpness);
      sum += texture2D(tAO, uv).r * w;
      wsum += w;
    }
  }
  float v = sum / wsum;
  gl_FragColor = vec4(v, v, v, 1.0);
}
`;

const AO_APPLY_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tAO;
uniform float uStrength;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  float ao = texture2D(tAO, vUv).r;
  float k = mix(1.0, ao, uStrength);
  // AO tints toward the ambient colour rather than pure black — occlusion
  // removes sky light, it does not remove the bounce.
  gl_FragColor = vec4(base * mix(uTint, vec3(1.0), k), 1.0);
}
`;

export class AOPass extends Pass {
  constructor(depthTexture, camera) {
    super();
    this.needsSwap = true;
    this.camera = camera;
    this.params = { radius: 2.6, intensity: 1.05, bias: 0.12, strength: 0.62, fadeStart: 120, fadeEnd: 340, tint: new THREE.Color(0x1a2430) };
    this.scale = 0.5;

    const o = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, o);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, o);

    this.matAO = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / 960, 1 / 540) },
        uRadius: { value: 2.6 }, uIntensity: { value: 1.05 }, uBias: { value: 0.12 },
        uProj00: { value: 1.5 }, uNear: { value: 0.35 }, uFar: { value: 22000 },
        uFadeStart: { value: 120 }, uFadeEnd: { value: 340 },
      },
      vertexShader: BASIC_VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      uniforms: {
        tAO: { value: null }, tDepth: { value: depthTexture },
        uDir: { value: new THREE.Vector2(1, 0) },
        uTexel: { value: new THREE.Vector2(1 / 960, 1 / 540) },
        uSharpness: { value: 4000.0 },
      },
      vertexShader: BASIC_VERT, fragmentShader: AO_BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.matApply = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tAO: { value: this.rtA.texture },
        uStrength: { value: 0.62 }, uTint: { value: new THREE.Vector3(0.10, 0.14, 0.19) },
      },
      vertexShader: BASIC_VERT, fragmentShader: AO_APPLY_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad();
  }

  setSize(w, h) {
    const sw = Math.max(1, Math.floor(w * this.scale));
    const sh = Math.max(1, Math.floor(h * this.scale));
    this.rtA.setSize(sw, sh);
    this.rtB.setSize(sw, sh);
    this.matAO.uniforms.uTexel.value.set(1 / sw, 1 / sh);
    this.matBlur.uniforms.uTexel.value.set(1 / sw, 1 / sh);
  }

  render(renderer, writeBuffer, readBuffer) {
    const p = this.params;
    const u = this.matAO.uniforms;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uProj00.value = this.camera.projectionMatrix.elements[0];
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uRadius.value = p.radius;
    u.uIntensity.value = p.intensity;
    u.uBias.value = p.bias;
    u.uFadeStart.value = p.fadeStart;
    u.uFadeEnd.value = p.fadeEnd;

    this.fsQuad.material = this.matAO;
    renderer.setRenderTarget(this.rtA);
    renderer.clear(); this.fsQuad.render(renderer);

    // separable depth-aware blur, half-res
    this.fsQuad.material = this.matBlur;
    this.matBlur.uniforms.tAO.value = this.rtA.texture;
    this.matBlur.uniforms.uDir.value.set(1, 0);
    renderer.setRenderTarget(this.rtB);
    renderer.clear(); this.fsQuad.render(renderer);

    this.matBlur.uniforms.tAO.value = this.rtB.texture;
    this.matBlur.uniforms.uDir.value.set(0, 1);
    renderer.setRenderTarget(this.rtA);
    renderer.clear(); this.fsQuad.render(renderer);

    this.matApply.uniforms.tDiffuse.value = readBuffer.texture;
    this.matApply.uniforms.uStrength.value = p.strength;
    this.matApply.uniforms.uTint.value.set(p.tint.r, p.tint.g, p.tint.b);
    this.fsQuad.material = this.matApply;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear(); this.fsQuad.render(renderer);
  }

  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.matAO.dispose(); this.matBlur.dispose(); this.matApply.dispose(); this.fsQuad.dispose(); }
}

/* ── God rays ────────────────────────────────────────────────────────────────
   Occlusion buffer: keep scene colour only where the depth buffer says "sky",
   then radially blur it toward the sun and add it back. Cheap, and it reads as
   real atmospheric scatter because the occluders are the actual silhouettes.

   The occlusion buffer is CLAMPED. Without it the sun disc (hundreds of units
   of linear radiance) is smeared down every ray and the frame turns white. */
const GODRAY_OCCLUSION_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uThreshold;
uniform float uClamp;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // sky (depth ~1) passes through; geometry masks the rays
  float sky = step(0.9999, d);
  float bright = smoothstep(uThreshold, uThreshold * 2.2, lum);
  vec3 src = c * sky * bright;
  // energy cap: the sun disc must not be able to paint the whole frame
  float m = max(src.r, max(src.g, src.b));
  if (m > uClamp) src *= uClamp / m;
  gl_FragColor = vec4(src, 1.0);
}
`;

const GODRAY_BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uSun;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
varying vec2 vUv;
const int SAMPLES = 40;
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
uniform vec2 uSun;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 rays = texture2D(tRays, vUv).rgb * uTint * uIntensity;
  // rays are scattered light: they should read strongest away from the source,
  // not stack another blob on top of the disc that already blooms
  float r = length(vUv - uSun);
  rays *= smoothstep(0.0, 0.10, r);
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
    this.params = { density: 0.62, decay: 0.945, weight: 2.4, intensity: 0.35, threshold: 1.15, clamp: 4.0, tint: new THREE.Color(0xffd9a8) };

    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    this.matOcc = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: depthTexture }, uThreshold: { value: 0.7 }, uClamp: { value: 4.0 } },
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
        uSun: { value: this.sun },
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
    this.matOcc.uniforms.uClamp.value = p.clamp;
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
    this.matCombine.uniforms.uSun.value.copy(this.sun);
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

/* ── Bloom ───────────────────────────────────────────────────────────────────
   Progressive down/upsample pyramid (the Call of Duty: Advanced Warfare /
   Jimenez presentation). Six 13-tap downsamples with a Karis average on the
   first level to kill fireflies, then 9-tap tent upsamples accumulating back up
   the chain. Compared to a fixed 5-mip gaussian this gives a far softer, wider
   falloff for the same bandwidth — and crucially the source is CLAMPED, so a
   200-unit sun disc contributes a wide glow instead of a white disc the size of
   the screen.                                                                 */
const BLOOM_PREFILTER_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uClamp;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 prefilter(vec3 c) {
  c = min(c, vec3(uClamp));
  float br = max(c.r, max(c.g, c.b));
  float soft = br - uThreshold + uKnee;
  soft = clamp(soft, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  return c * max(soft, br - uThreshold) / max(br, 1e-4);
}
vec3 fetch(vec2 uv) { return prefilter(max(texture2D(tSrc, uv).rgb, vec3(0.0))); }
float kw(vec3 c) { return 1.0 / (1.0 + luma(c)); }

void main() {
  vec2 t = uTexel;
  vec3 a = fetch(vUv + vec2(-2.0 * t.x,  2.0 * t.y));
  vec3 b = fetch(vUv + vec2( 0.0,        2.0 * t.y));
  vec3 c = fetch(vUv + vec2( 2.0 * t.x,  2.0 * t.y));
  vec3 d = fetch(vUv + vec2(-2.0 * t.x,  0.0));
  vec3 e = fetch(vUv);
  vec3 f = fetch(vUv + vec2( 2.0 * t.x,  0.0));
  vec3 g = fetch(vUv + vec2(-2.0 * t.x, -2.0 * t.y));
  vec3 h = fetch(vUv + vec2( 0.0,       -2.0 * t.y));
  vec3 i = fetch(vUv + vec2( 2.0 * t.x, -2.0 * t.y));
  vec3 j = fetch(vUv + vec2(-t.x,  t.y));
  vec3 k = fetch(vUv + vec2( t.x,  t.y));
  vec3 l = fetch(vUv + vec2(-t.x, -t.y));
  vec3 m = fetch(vUv + vec2( t.x, -t.y));

  // Karis average per 2x2 group — one hot texel can otherwise strobe the pyramid
  vec3 g0 = (j + k + l + m) * 0.25;
  vec3 g1 = (a + b + d + e) * 0.25;
  vec3 g2 = (b + c + e + f) * 0.25;
  vec3 g3 = (d + e + g + h) * 0.25;
  vec3 g4 = (e + f + h + i) * 0.25;
  float w0 = kw(g0) * 0.5, w1 = kw(g1) * 0.125, w2 = kw(g2) * 0.125;
  float w3 = kw(g3) * 0.125, w4 = kw(g4) * 0.125;
  float ws = w0 + w1 + w2 + w3 + w4;
  gl_FragColor = vec4((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / max(ws, 1e-5), 1.0);
}
`;

const BLOOM_DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uAniso;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * vec2(uAniso, 1.0);
  vec3 a = texture2D(tSrc, vUv + vec2(-2.0 * t.x,  2.0 * t.y)).rgb;
  vec3 b = texture2D(tSrc, vUv + vec2( 0.0,        2.0 * t.y)).rgb;
  vec3 c = texture2D(tSrc, vUv + vec2( 2.0 * t.x,  2.0 * t.y)).rgb;
  vec3 d = texture2D(tSrc, vUv + vec2(-2.0 * t.x,  0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + vec2( 2.0 * t.x,  0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + vec2(-2.0 * t.x, -2.0 * t.y)).rgb;
  vec3 h = texture2D(tSrc, vUv + vec2( 0.0,       -2.0 * t.y)).rgb;
  vec3 i = texture2D(tSrc, vUv + vec2( 2.0 * t.x, -2.0 * t.y)).rgb;
  vec3 j = texture2D(tSrc, vUv + vec2(-t.x,  t.y)).rgb;
  vec3 k = texture2D(tSrc, vUv + vec2( t.x,  t.y)).rgb;
  vec3 l = texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb;
  vec3 m = texture2D(tSrc, vUv + vec2( t.x, -t.y)).rgb;
  vec3 res = e * 0.125
           + (a + c + g + i) * 0.03125
           + (b + d + f + h) * 0.0625
           + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(res, 1.0);
}
`;

const BLOOM_UP_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;      // texel of the SOURCE (smaller) level
uniform float uRadius;
uniform float uAniso;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius * vec2(uAniso, 1.0);
  vec3 s =
      texture2D(tSrc, vUv + vec2(-t.x,  t.y)).rgb * 1.0
    + texture2D(tSrc, vUv + vec2( 0.0,  t.y)).rgb * 2.0
    + texture2D(tSrc, vUv + vec2( t.x,  t.y)).rgb * 1.0
    + texture2D(tSrc, vUv + vec2(-t.x,  0.0)).rgb * 2.0
    + texture2D(tSrc, vUv).rgb                    * 4.0
    + texture2D(tSrc, vUv + vec2( t.x,  0.0)).rgb * 2.0
    + texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb * 1.0
    + texture2D(tSrc, vUv + vec2( 0.0, -t.y)).rgb * 2.0
    + texture2D(tSrc, vUv + vec2( t.x, -t.y)).rgb * 1.0;
  gl_FragColor = vec4(s / 16.0, 1.0);
}
`;

const BLOOM_COMBINE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tDirt;
uniform float uStrength;
uniform float uDirt;
uniform float uHasDirt;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  // energy-conserving blend: the scene loses exactly what the glow gains
  vec3 col = mix(base, bloom, uStrength);
  if (uHasDirt > 0.5) {
    vec3 dirt = texture2D(tDirt, vUv).rgb;
    col += bloom * dirt * uDirt;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class BloomPass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.strength = 0.085;   // mix amount, NOT an additive gain
    this.radius = 1.0;       // upsample tent radius, in source texels
    this.threshold = 1.0;
    this.knee = 0.6;
    this.clamp = 9.0;        // hard cap on bloom source radiance
    this.anamorphic = 1.0;
    this.dirt = 0.0;
    this.dirtTexture = null;
    this.maxLevels = 6;
    this._mips = [];

    const o = () => new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader: BASIC_VERT });
    this.matPre = Object.assign(o(), {
      fragmentShader: BLOOM_PREFILTER_FRAG,
      uniforms: {
        tSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: 1.0 }, uKnee: { value: 0.6 }, uClamp: { value: 9.0 },
      },
    });
    this.matDown = Object.assign(o(), {
      fragmentShader: BLOOM_DOWN_FRAG,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uAniso: { value: 1.0 } },
    });
    this.matUp = Object.assign(o(), {
      fragmentShader: BLOOM_UP_FRAG,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 }, uAniso: { value: 1.0 } },
      blending: THREE.AdditiveBlending, transparent: true,
    });
    this.matCombine = Object.assign(o(), {
      fragmentShader: BLOOM_COMBINE_FRAG,
      uniforms: {
        tDiffuse: { value: null }, tBloom: { value: null }, tDirt: { value: null },
        uStrength: { value: 0.085 }, uDirt: { value: 0.0 }, uHasDirt: { value: 0.0 },
      },
    });
    this.fsQuad = new FullScreenQuad();
  }

  setSize(w, h) {
    w = Math.max(4, Math.floor(w)); h = Math.max(4, Math.floor(h));
    const want = Math.min(this.maxLevels, Math.max(3, Math.floor(Math.log2(Math.min(w, h))) - 3));
    if (this._mips.length !== want) {
      for (const m of this._mips) m.dispose();
      this._mips = [];
      for (let i = 0; i < want; i++) {
        this._mips.push(new THREE.WebGLRenderTarget(1, 1, {
          type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
        }));
      }
    }
    let mw = w, mh = h;
    for (const m of this._mips) {
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      m.setSize(mw, mh);
    }
    this._srcTexel = new THREE.Vector2(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const mips = this._mips;
    if (!mips.length) { this.setSize(1280, 720); }

    // ── prefilter + downsample to mip0
    this.matPre.uniforms.tSrc.value = readBuffer.texture;
    this.matPre.uniforms.uTexel.value.copy(this._srcTexel);
    this.matPre.uniforms.uThreshold.value = this.threshold;
    this.matPre.uniforms.uKnee.value = Math.max(1e-3, this.knee);
    this.matPre.uniforms.uClamp.value = this.clamp;
    this.fsQuad.material = this.matPre;
    renderer.setRenderTarget(mips[0]);
    renderer.clear(); this.fsQuad.render(renderer);

    // ── progressive downsample
    this.matDown.uniforms.uAniso.value = this.anamorphic;
    this.fsQuad.material = this.matDown;
    for (let i = 1; i < mips.length; i++) {
      const src = mips[i - 1];
      this.matDown.uniforms.tSrc.value = src.texture;
      this.matDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      renderer.setRenderTarget(mips[i]);
      renderer.clear(); this.fsQuad.render(renderer);
    }

    // ── progressive upsample, additive into the next larger level
    this.matUp.uniforms.uRadius.value = this.radius;
    this.matUp.uniforms.uAniso.value = this.anamorphic;
    this.fsQuad.material = this.matUp;
    for (let i = mips.length - 1; i > 0; i--) {
      const src = mips[i];
      this.matUp.uniforms.tSrc.value = src.texture;
      this.matUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      renderer.setRenderTarget(mips[i - 1]);
      this.fsQuad.render(renderer);          // no clear: accumulate
    }

    // ── composite
    const c = this.matCombine.uniforms;
    c.tDiffuse.value = readBuffer.texture;
    c.tBloom.value = mips[0].texture;
    c.uStrength.value = this.strength;
    c.uDirt.value = this.dirt;
    c.tDirt.value = this.dirtTexture;
    c.uHasDirt.value = (this.dirtTexture && this.dirt > 0.001) ? 1 : 0;
    this.fsQuad.material = this.matCombine;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear(); this.fsQuad.render(renderer);
  }

  dispose() {
    for (const m of this._mips) m.dispose();
    this.matPre.dispose(); this.matDown.dispose(); this.matUp.dispose(); this.matCombine.dispose();
    this.fsQuad.dispose();
  }
}

/* ── Lens flare ──────────────────────────────────────────────────────────────
   Anchored to the sun's screen position, occlusion-tested against the depth
   buffer (24 taps resolved into a 1×1 target, so the flare shader itself pays
   one fetch). Starburst + anamorphic streak + a short ghost train. Every
   distance below is in PIXELS, converted with uTexel at use.                 */
const FLARE_OCC_FRAG = /* glsl */`
uniform sampler2D tDepth;
uniform vec2 uSun;
uniform vec2 uTexel;
uniform float uProbePx;
void main() {
  const int N = 24;
  float sum = 0.0;
  for (int i = 0; i < N; i++) {
    float a = float(i) * 2.39996323;
    float r = sqrt((float(i) + 0.5) / float(N)) * uProbePx;
    vec2 uv = uSun + vec2(cos(a), sin(a)) * r * uTexel;
    float inside = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? 1.0 : 0.0;
    sum += step(0.9999, texture2D(tDepth, clamp(uv, 0.0, 1.0)).x) * inside;
  }
  float v = sum / float(N);
  gl_FragColor = vec4(v, v, v, 1.0);
}
`;

const FLARE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tOcc;
uniform vec2 uSun;
uniform float uAspect;
uniform float uIntensity;
uniform float uVisible;
uniform float uRoll;
uniform vec3 uTint;
uniform float uGhosts;
uniform float uStreak;
varying vec2 vUv;

void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  float occ = texture2D(tOcc, vec2(0.5)).r;
  float amt = uIntensity * uVisible * occ;
  if (amt < 0.0005) { gl_FragColor = vec4(base, 1.0); return; }

  vec2 asp = vec2(uAspect, 1.0);
  vec2 d = (vUv - uSun) * asp;
  float r = length(d);

  vec3 f = vec3(0.0);

  // ── starburst: two rotated 4-arm sets so it reads as an aperture, not a plus
  float ang = atan(d.y, d.x) + uRoll;
  float s1 = pow(abs(cos(ang * 3.0)), 24.0);
  float s2 = pow(abs(cos(ang * 3.0 + 0.5236)), 34.0);
  float spikes = (s1 * 0.62 + s2 * 0.3) * exp(-r * 5.5);
  f += uTint * spikes * 0.55;

  // ── tight core glare
  f += uTint * exp(-r * 26.0) * 0.9;

  // ── anamorphic streak (horizontal, cool)
  float streak = exp(-abs(d.y) * 190.0) * exp(-abs(d.x) * 2.6);
  f += vec3(0.42, 0.66, 1.0) * streak * uStreak;

  // ── halo ring
  f += vec3(0.85, 0.72, 1.0) * exp(-pow((r - 0.30) * 11.0, 2.0)) * 0.045;

  // ── ghost train along sun → screen centre
  vec2 v = (vec2(0.5) - uSun) * asp;
  float gk = uGhosts * clamp(1.0 - length(v) * 0.55, 0.25, 1.0);
  f += vec3(0.55, 0.80, 1.00) * exp(-pow(length(d - v * 0.42) * 21.0, 2.0)) * 0.09 * gk;
  f += vec3(1.00, 0.72, 0.45) * exp(-pow(length(d - v * 0.78) * 34.0, 2.0)) * 0.07 * gk;
  f += vec3(0.70, 1.00, 0.75) * exp(-pow(length(d - v * 1.25) * 15.0, 2.0)) * 0.05 * gk;
  f += vec3(1.00, 0.55, 0.62) * exp(-pow(length(d - v * 1.70) * 26.0, 2.0)) * 0.06 * gk;
  // one soft ring ghost — the giveaway that an aperture, not a blob, made this
  float rg = length(d - v * 2.15);
  f += vec3(0.62, 0.78, 1.00) * exp(-pow((rg - 0.055) * 42.0, 2.0)) * 0.05 * gk;

  gl_FragColor = vec4(base + f * amt, 1.0);
}
`;

export class LensFlarePass extends Pass {
  constructor(depthTexture) {
    super();
    this.needsSwap = true;
    this.sun = new THREE.Vector2(0.5, 0.5);
    this.visible = 0;
    this.roll = 0;
    this.params = { intensity: 0.55, ghosts: 1.0, streak: 0.35, probePx: 26, tint: new THREE.Color(0xfff0d8) };

    this.occRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.matOcc = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: depthTexture }, uSun: { value: this.sun },
        uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uProbePx: { value: 26 },
      },
      vertexShader: BASIC_VERT, fragmentShader: FLARE_OCC_FRAG, depthTest: false, depthWrite: false,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tOcc: { value: this.occRT.texture },
        uSun: { value: this.sun }, uAspect: { value: 16 / 9 },
        uIntensity: { value: 0.55 }, uVisible: { value: 0 }, uRoll: { value: 0 },
        uTint: { value: new THREE.Vector3(1, 0.94, 0.85) },
        uGhosts: { value: 1.0 }, uStreak: { value: 0.35 },
      },
      vertexShader: BASIC_VERT, fragmentShader: FLARE_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad();
  }

  setSize(w, h) {
    this.matOcc.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    this.material.uniforms.uAspect.value = w / Math.max(1, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const p = this.params;
    if (this.visible > 0.001 && p.intensity > 0.001) {
      this.matOcc.uniforms.uSun.value.copy(this.sun);
      this.matOcc.uniforms.uProbePx.value = p.probePx;
      this.fsQuad.material = this.matOcc;
      renderer.setRenderTarget(this.occRT);
      renderer.clear(); this.fsQuad.render(renderer);
    }

    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.uSun.value.copy(this.sun);
    u.uVisible.value = this.visible;
    u.uIntensity.value = p.intensity;
    u.uGhosts.value = p.ghosts;
    u.uStreak.value = p.streak;
    u.uRoll.value = this.roll;
    u.uTint.value.set(p.tint.r, p.tint.g, p.tint.b);
    this.fsQuad.material = this.material;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    renderer.clear(); this.fsQuad.render(renderer);
  }

  dispose() { this.occRT.dispose(); this.matOcc.dispose(); this.material.dispose(); this.fsQuad.dispose(); }
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
uniform float uDither;
uniform float uSaturation;
uniform float uContrast;
uniform vec3  uLift;
uniform vec3  uGamma;
uniform vec3  uGain;
uniform vec3  uTint;
uniform vec3  uShadowTint;
uniform vec3  uHighlightTint;
uniform float uSharpen;
uniform float uToneMode;     // 0 = ACES, 1 = AgX-ish, 2 = filmic GT
uniform float uShoulder;     // GT: highlight compression
uniform float uToe;          // GT: shadow crush
uniform float uWhite;        // GT: white point
uniform float uHighlightDesat;
uniform float uFlash;
uniform vec3  uFlashColor;
varying vec2 vUv;

// Narkowicz ACES fit
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
// Cheap AgX-flavoured curve: log encode, sigmoid
vec3 agxish(vec3 x) {
  x = max(x, vec3(0.0));
  vec3 l = log2(x + 6.1e-5);
  l = clamp((l + 12.47393) / (12.47393 + 4.026069), 0.0, 1.0);
  vec3 v = l * l * (3.0 - 2.0 * l);
  v = pow(v, vec3(1.0 / 2.2));
  return clamp(v, 0.0, 1.0);
}
// Uchimura "Gran Turismo" curve — a true filmic with an explicit linear
// section and a controllable shoulder. This is the one that lets the sun be a
// bright disc instead of a white continent.
vec3 uchimura(vec3 x, float P, float a, float m, float l, float c, float b) {
  float l0 = ((P - m) * l) / a;
  float S0 = m + l0;
  float S1 = m + a * l0;
  float C2 = (a * P) / max(1e-4, P - S1);
  float CP = -C2 / P;
  vec3 w0 = vec3(1.0) - smoothstep(vec3(0.0), vec3(m), x);
  vec3 w2 = step(vec3(m + l0), x);
  vec3 w1 = vec3(1.0) - w0 - w2;
  vec3 T = m * pow(max(x / m, vec3(1e-5)), vec3(c)) + b;
  vec3 S = P - (P - S1) * exp(CP * (x - S0));
  vec3 L = m + a * (x - m);
  return T * w0 + L * w1 + S * w2;
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// Ordered dither — kills the banding a 20-stop sky gradient shows on 8-bit out.
float bayer(vec2 c) {
  vec2 p = floor(mod(c, 4.0));
  const vec4 r0 = vec4( 0.0,  8.0,  2.0, 10.0);
  const vec4 r1 = vec4(12.0,  4.0, 14.0,  6.0);
  const vec4 r2 = vec4( 3.0, 11.0,  1.0,  9.0);
  const vec4 r3 = vec4(15.0,  7.0, 13.0,  5.0);
  vec4 row = p.y < 1.0 ? r0 : (p.y < 2.0 ? r1 : (p.y < 3.0 ? r2 : r3));
  float v = p.x < 1.0 ? row.x : (p.x < 2.0 ? row.y : (p.x < 3.0 ? row.z : row.w));
  return (v + 0.5) / 16.0 - 0.5;
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
  hdr = max(hdr, vec3(0.0));

  // ── highlight desaturation before the curve: real film and real sensors
  // bleach toward white long before they clip, and this is what stops a hot
  // sun from tone-mapping to a coloured plate.
  if (uHighlightDesat > 0.0001) {
    float pk = max(hdr.r, max(hdr.g, hdr.b));
    float t = 1.0 - exp(-max(0.0, pk - 0.8) * uHighlightDesat);
    hdr = mix(hdr, vec3(pk), t * 0.85);
  }

  vec3 col;
  if (uToneMode < 0.5)      col = acesFilm(hdr);
  else if (uToneMode < 1.5) col = agxish(hdr);
  else                      col = clamp(uchimura(hdr, uWhite, uShoulder, 0.22, 0.36, uToe, 0.0), 0.0, 1.0);

  // ── split-tone, then lift / gamma / gain
  float pre = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(uShadowTint, uHighlightTint, smoothstep(0.15, 0.75, pre));
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
  col = pow(col, vec3(1.0 / 2.2));
  col += bayer(gl_FragCoord.xy) * uDither;
  gl_FragColor = vec4(col, 1.0);
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
        uCA: { value: 1.6 },   // pixels at frame corner
        uVignette: { value: 1.10 },
        uVignetteSoft: { value: 0.64 },
        uGrain: { value: 0.014 },
        uDither: { value: 1.6 / 255 },
        uSaturation: { value: 1.06 },
        uContrast: { value: 1.04 },
        uLift: { value: new THREE.Vector3(0.006, 0.010, 0.024) },
        uGamma: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uShadowTint: { value: new THREE.Vector3(0.94, 0.98, 1.08) },
        uHighlightTint: { value: new THREE.Vector3(1.05, 1.01, 0.95) },
        uSharpen: { value: 0.28 },
        uToneMode: { value: 2 },
        uShoulder: { value: 1.0 },
        uToe: { value: 1.22 },
        uWhite: { value: 1.0 },
        uHighlightDesat: { value: 0.16 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: BASIC_VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.inputTexture = null;
  }

  setSize(w, h) { this.material.uniforms.uResolution.value.set(w, h); }

  render(renderer, writeBuffer, readBuffer, dt) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.inputTexture = readBuffer.texture;   // probe tap: fully-composited HDR
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
   how you end up shipping a white screen.

   A whole-frame histogram is necessary but NOT sufficient: a frame that is half
   dark rock and half blown sky has a perfectly healthy median. So the probe also
   reports `whitePct` — the share of pixels whose *dimmest* channel is already
   past the point where the tone curve has nothing left to give, i.e. pixels that
   land on flat achromatic white — and a coarse tile map saying WHERE they are.
   That pair is what actually catches "looking sunward washes out".            */
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

  /**
   * @param texture   HDR source to read back
   * @param exposure  gain applied before measuring
   * @param whiteAt   linear value at which the tone curve is visually white.
   *                  A pixel whose *minimum* channel is past this has no colour
   *                  and no gradient left — it is a hole in the picture.
   * @returns luminance stats of `texture` in linear light, plus a tile map.
   */
  sample(texture, exposure = 1, whiteAt = 2.0) {
    const { renderer, rt, buf } = this;
    const prev = renderer.getRenderTarget();
    this.quad.material.uniforms.tDiffuse.value = texture;
    renderer.setRenderTarget(rt);
    renderer.clear();
    this.quad.render(renderer);
    renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
    renderer.setRenderTarget(prev);

    const W = rt.width, H = rt.height, n = W * H;
    const lum = new Float64Array(n);
    const TC = 16, TR = 9;                       // tile grid
    const tSum = new Float64Array(TC * TR);
    const tWhite = new Float64Array(TC * TR);
    const tN = new Float64Array(TC * TR);
    let clipped = 0, black = 0, nan = 0, sum = 0, white = 0;

    for (let i = 0; i < n; i++) {
      const r = halfToFloat(buf[i * 4]) * exposure;
      const g = halfToFloat(buf[i * 4 + 1]) * exposure;
      const b = halfToFloat(buf[i * 4 + 2]) * exposure;
      if (!Number.isFinite(r + g + b)) { nan++; lum[i] = 0; continue; }
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lum[i] = l;
      sum += l;
      if (l > 3.0) clipped++;        // past where the curve has anything left to give
      if (l < 0.004) black++;
      // "white" means every channel is gone, not just luminance — a hot orange
      // sunset pixel still carries information, a 1,1,1 pixel does not.
      const isWhite = Math.min(r, g, b) >= whiteAt ? 1 : 0;
      white += isWhite;

      // readback is bottom-up; flip so tile row 0 is the TOP of the frame
      const px = i % W, py = H - 1 - ((i / W) | 0);
      const ti = ((py * TR / H) | 0) * TC + ((px * TC / W) | 0);
      tSum[ti] += l; tWhite[ti] += isWhite; tN[ti]++;
    }

    lum.sort();
    const q = (p) => lum[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
    const tiles = { cols: TC, rows: TR, mean: new Float64Array(TC * TR), whitePct: new Float64Array(TC * TR) };
    for (let t = 0; t < TC * TR; t++) {
      const c = Math.max(1, tN[t]);
      tiles.mean[t] = tSum[t] / c;
      tiles.whitePct[t] = (tWhite[t] / c) * 100;
    }

    return {
      mean: sum / n,
      p05: q(0.05), median: q(0.5), p90: q(0.90), p99: q(0.99), max: lum[n - 1],
      clippedPct: (clipped / n) * 100,
      blackPct: (black / n) * 100,
      // The headline number for blowout. Anything above ~1% is a visible hole;
      // above ~5% the frame has a dead region a reviewer will name.
      whitePct: (white / n) * 100,
      whiteAt,
      tiles,
      nan,
    };
  }

  dispose() { this.rt.dispose(); this.quad.dispose(); }
}

/* ── tone curve, mirrored on the CPU ─────────────────────────────────────────
   The probe needs to know where the *live* curve gives up, not where some
   constant says it gives up — otherwise retuning the shoulder silently
   invalidates every measurement taken before it.                             */
export function uchimuraJS(x, P, a, m, l, c, b) {
  const l0 = ((P - m) * l) / a;
  const S0 = m + l0;
  const S1 = m + a * l0;
  const C2 = (a * P) / Math.max(1e-4, P - S1);
  const CP = -C2 / P;
  if (x < m) return m * Math.pow(Math.max(x / m, 1e-5), c) + b;
  if (x < S0) return m + a * (x - m);
  return P - (P - S1) * Math.exp(CP * (x - S0));
}

function acesJS(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.min(1, Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

/**
 * The colour path of GRADE_FRAG, on the CPU. Spatial terms (CA, sharpen,
 * vignette, grain) are skipped — they do not decide whether a pixel is white.
 *
 * This exists so `whitePct` measures the pixels the player actually sees go
 * flat, not the pixels the tone curve alone would have flattened. The split
 * tone and the contrast expansion downstream of the curve are worth ~0.5 stop
 * of apparent white point, which is the difference between "0.6% blown" and
 * the third of the frame that is visibly gone.
 */
export function gradeJS(rgb, u) {
  const out = [0, 0, 0];
  let c0 = rgb;

  if (u.uHighlightDesat.value > 1e-4) {
    const pk = Math.max(c0[0], c0[1], c0[2]);
    const t = 1 - Math.exp(-Math.max(0, pk - 0.8) * u.uHighlightDesat.value);
    const k = t * 0.85;
    c0 = [c0[0] + (pk - c0[0]) * k, c0[1] + (pk - c0[1]) * k, c0[2] + (pk - c0[2]) * k];
  }

  const tm = u.uToneMode.value;
  for (let i = 0; i < 3; i++) {
    const x = Math.max(0, c0[i]);
    let v;
    if (tm < 0.5) v = acesJS(x);
    else if (tm < 1.5) {
      let l = (Math.log2(x + 6.1e-5) + 12.47393) / (12.47393 + 4.026069);
      l = Math.min(1, Math.max(0, l));
      v = Math.pow(l * l * (3 - 2 * l), 1 / 2.2);
    } else {
      v = uchimuraJS(x, u.uWhite.value, u.uShoulder.value, 0.22, 0.36, u.uToe.value, 0);
    }
    out[i] = Math.min(1, Math.max(0, v));
  }

  const pre = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  let s = (pre - 0.15) / 0.6;
  s = Math.min(1, Math.max(0, s)); s = s * s * (3 - 2 * s);
  const st = u.uShadowTint.value, ht = u.uHighlightTint.value;
  const gain = u.uGain.value, lift = u.uLift.value, gam = u.uGamma.value;
  const comp = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const k = st[comp[i]] + (ht[comp[i]] - st[comp[i]]) * s;
    let v = out[i] * k;
    v = v * gain[comp[i]] + lift[comp[i]] * (1 - v);
    v = Math.pow(Math.max(0, v), gam[comp[i]]);
    out[i] = v;
  }

  const contrast = u.uContrast.value, sat = u.uSaturation.value;
  for (let i = 0; i < 3; i++) out[i] = (out[i] - 0.5) * contrast + 0.5;
  const lum = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  for (let i = 0; i < 3; i++) out[i] = Math.min(1, Math.max(0, lum + (out[i] - lum) * sat));
  return out;
}

/**
 * Where the response goes flat.
 *
 * "Is the pixel 1.0?" is the wrong question — this grade's split tone means the
 * frame asymptotes to a warm off-white and literally never reaches 1.0, so a
 * threshold test reports 0% blown for a frame with a third of it visibly dead.
 * What the eye actually reads as blown is *loss of gradient*: the region where
 * doubling scene radiance no longer changes the displayed value.
 *
 * So: the smallest linear input at which one more stop of light buys less than
 * `minStep` of encoded output (default ≈2/255). Past that point the picture has
 * no information left regardless of what number the channel holds.
 */
function whiteThreshold(u, minStep = 0.008) {
  const enc = (x) => {
    const c = gradeJS([x, x, x], u);
    return Math.pow(Math.max(0, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]), 1 / 2.2);
  };
  const flat = (x) => (enc(x * 2) - enc(x)) < minStep;
  let lo = 0.02, hi = 256;
  if (!flat(hi)) return hi;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) * 0.5;
    if (flat(mid)) hi = mid; else lo = mid;
  }
  return hi;
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

  // TAA is the only thing that actually holds specular on water at 200 m/s.
  // It rides with the AO tier (high/ultra) because both want the depth buffer
  // and both are what "high" is paying for.
  const taa = new TAAPass(scenePass, camera);
  taa.enabled = q.taa !== undefined ? !!q.taa : !!q.ao;
  composer.addPass(taa);

  const ao = new AOPass(scenePass.depthTexture, camera);
  ao.enabled = !!q.ao;
  composer.addPass(ao);

  const godRays = new GodRaysPass(scenePass.depthTexture);
  godRays.enabled = !!q.godrays;
  composer.addPass(godRays);

  const dof = new DOFPass(scenePass.depthTexture, camera);
  dof.enabled = !!q.dof;
  composer.addPass(dof);

  const motion = new MotionBlurPass(scenePass.depthTexture, camera);
  motion.enabled = !!q.motionBlur;
  composer.addPass(motion);

  const bloom = new BloomPass();
  composer.addPass(bloom);

  const flare = new LensFlarePass(scenePass.depthTexture);
  composer.addPass(flare);

  const grade = new GradePass();
  composer.addPass(grade);

  const smaa = new SMAAPass();
  smaa.enabled = !!q.smaa;
  composer.addPass(smaa);

  const api = {
    composer, scenePass, taa, ao, godRays, dof, motion, bloom, flare, grade, smaa,
    params: {
      bloom: { strength: 0.085, radius: 1.0, threshold: 1.0, knee: 0.6, clamp: 9.0, anamorphic: 1.0, dirt: 0.0 },
      exposure: 1.0,      // scene exposure, applied at the front of the chain
      trim: 1.0,          // late gain, after all HDR effects
    },
    setEnabled(name, on) {
      const p = api[name];
      if (p) p.enabled = !!on;
      if (name === 'taa' && !on) scenePass.jitter.set(0, 0);
    },
    /** Linear-light histogram of the current frame, pre- and post-exposure. */
    probe() {
      if (!api._probe) api._probe = new HDRProbe(renderer);
      const wa = whiteThreshold(grade.material.uniforms);
      const out = {
        raw: api._probe.sample(scenePass.colorTexture, 1, wa),
        exposed: api._probe.sample(scenePass.colorTexture, api.params.exposure, wa),
        exposure: api.params.exposure,
        whiteAt: wa,
      };
      // The composited tap is what actually judges blowout: it includes bloom,
      // god rays and the flare, which the scene buffer knows nothing about.
      if (grade.inputTexture) out.composited = api._probe.sample(grade.inputTexture, api.params.trim, wa);
      return out;
    },
    setSize(w, h, dpr) {
      const pw = Math.max(1, Math.floor(w * dpr));
      const ph = Math.max(1, Math.floor(h * dpr));
      composer.setSize(w, h);
      composer.setPixelRatio(dpr);
      scenePass.setSize(pw, ph);
      taa.setSize(pw, ph);
      ao.setSize(pw, ph);
      godRays.setSize(pw, ph);
      dof.setSize(pw, ph);
      flare.setSize(pw, ph);
      grade.setSize(pw, ph);
      bloom.setSize(Math.floor(pw * (q.bloomRes || 1)), Math.floor(ph * (q.bloomRes || 1)));
    },
    render(dt) {
      const b = api.params.bloom;
      bloom.strength = b.strength;
      bloom.radius = b.radius;
      bloom.threshold = b.threshold;
      if (b.knee != null) bloom.knee = b.knee;
      if (b.clamp != null) bloom.clamp = b.clamp;
      if (b.anamorphic != null) bloom.anamorphic = b.anamorphic;
      if (b.dirt != null) bloom.dirt = b.dirt;
      scenePass.exposure = api.params.exposure;
      grade.material.uniforms.uExposure.value = api.params.trim;
      taa.prepare();
      composer.render(dt);
    },
  };
  return api;
}
