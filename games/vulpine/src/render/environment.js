import * as THREE from 'three';
import { SkyDome } from './sky.js';
import { bakeStarfield } from './textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment — sky, sun, shadow rig, image-based lighting, atmosphere and the
// per-preset grade, driven by a single named preset. The sun direction is the
// one source of truth: the sky shader, the key light, the IBL probe, the fog
// inscattering, the god-ray origin and the lens flare all read it, so changing
// `elevation` re-lights the entire game coherently.
//
// A preset is not just "where is the sun". It carries its own tone curve,
// split-tone, bloom energy, flare character and atmospheric model, because
// that is the difference between three times of day and three *places*.
// ─────────────────────────────────────────────────────────────────────────────

export const PRESETS = {
  corneria: {
    kind: 'atmosphere',
    turbidity: 2.7, rayleigh: 1.85, mieCoefficient: 0.0032, mieDirectionalG: 0.80,
    elevation: 27, azimuth: 148,
    sunColor: 0xfff0d2, sunIntensity: 5.6,
    // Ambient is two-sided on purpose: cool sky from above, warm bounce off the
    // ground. That split is the only thing separating a shadow's hue from a
    // shadow's value, and without it every unlit face collapses to one navy.
    hemiSky: 0xaed2fb, hemiGround: 0x7a6746, hemiIntensity: 0.62,
    fillColor: 0x8ab0dd, fillIntensity: 0.30,
    rimColor: 0xffdcb4, rimIntensity: 0.55,
    // Density is the single biggest control on whether this level reads as a
    // place or as a blue wash. The haze colour is ~3x brighter than lit rock,
    // so at 0.00050 a ridge 2 km out was 63% haze and every surface past the
    // near bank collapsed to one flat blue — no aerial layering, no material
    // response, no rock colour. 0.00022 keeps ~2 km of honest colour and still
    // separates the far ridgelines.
    fog: { color: 0xa6c6e6, density: 0.00022 },
    exposure: 0.20,
    godray: { intensity: 0.24, tint: 0xffd9a8, clamp: 2.4, density: 0.60, decay: 0.947, weight: 2.2, threshold: 1.7 },
    envIntensity: 0.95,

    sky: {
      sunDisc: 62, aureole: 1.20, aureoleTight: 1500, aureoleWide: 0.22, skyGain: 1.0,
      // Haze values are pre-exposure linear, same units as the dome itself: the
      // clear zenith sits near 1.2, so a horizon at ~2.0–3.0 reads as bright air
      // with three stops of headroom left instead of a blown band.
      hazeColor: [1.42, 1.86, 2.42], hazeSunColor: [2.90, 2.72, 2.42],
      hazeAmount: 0.88, hazeHeight: 0.27, hazeFalloff: 1.7, hazeSunPow: 3.0,
      zenithTint: [0.84, 0.92, 1.07],
      cloudAmount: 1.0, coverage: 0.47, cloudHeight: 2100, cloudScale: 0.00020,
      cloudWind: [0.0020, 0.0008], cloudThickness: 640, absorb: 2.7, erode: 0.20,
      cloudSun: [1.95, 1.92, 1.84], cloudShade: [0.34, 0.41, 0.55],
      cirrusAmount: 0.55, cirrusCoverage: 0.44, cirrusHeight: 8200,
      cirrusScale: 0.000050, cirrusWind: [0.0010, 0.0004],
    },
    atmos: {
      heightFalloff: 0.0016, baseHeight: -20,
      highTint: [0.70, 0.83, 1.02], lowTint: [1.06, 1.02, 0.96],
      sunTint: [0.40, 0.29, 0.16], sunPow: 6.0,
    },
    bloom: { strength: 0.055, radius: 1.05, threshold: 1.1, knee: 0.55, clamp: 4.0, anamorphic: 1.0, dirt: 0.04 },
    flare: { intensity: 0.30, ghosts: 0.8, streak: 0.26, tint: 0xfff0d8 },
    ao: { radius: 2.6, intensity: 1.05, strength: 0.60, tint: 0x22364c },
    grade: {
      toneMode: 2, shoulder: 0.74, linStart: 0.18, linLen: 0.22, toe: 1.12, white: 1.0,
      highlightDesat: 0.14, highlightKnee: 1.6,
      saturation: 1.16, contrast: 1.10, ca: 1.4, vignette: 1.02, grain: 0.010,
      lift: [0.004, 0.012, 0.030], gain: [1.0, 1.0, 1.0], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.88, 0.97, 1.17], highlightTint: [1.05, 1.015, 0.955],
      sharpen: 0.26,
    },
  },

  sunset: {
    kind: 'atmosphere',
    turbidity: 8.0, rayleigh: 2.4, mieCoefficient: 0.0090, mieDirectionalG: 0.90,
    elevation: 4.2, azimuth: 190,
    sunColor: 0xffb066, sunIntensity: 5.2,
    hemiSky: 0xc09ad0, hemiGround: 0x30202a, hemiIntensity: 0.7,
    fillColor: 0x7060a0, fillIntensity: 0.5,
    rimColor: 0xff8a4a, rimIntensity: 1.3,
    fog: { color: 0xe0a184, density: 0.00075 },
    exposure: 0.42,
    godray: { intensity: 0.60, tint: 0xffb373, clamp: 3.0, density: 0.68, decay: 0.952, weight: 2.6, threshold: 1.1 },
    envIntensity: 1.0,

    sky: {
      sunDisc: 34, aureole: 2.6, aureoleTight: 420, aureoleWide: 0.30, skyGain: 1.0,
      // A low sun sits *inside* the aerosol layer, so the haze is thin and its
      // sunward colour is the sunset itself rather than a correction to it.
      hazeColor: [1.55, 1.30, 1.48], hazeSunColor: [4.20, 2.30, 1.05],
      hazeAmount: 0.55, hazeHeight: 0.16, hazeFalloff: 1.5, hazeSunPow: 2.2,
      zenithTint: [0.90, 0.90, 1.05],
      cloudAmount: 1.0, coverage: 0.56, cloudHeight: 2600, cloudScale: 0.00016,
      cloudWind: [0.0016, 0.0006], cloudThickness: 900, absorb: 3.4, erode: 0.24,
      cloudSun: [2.60, 1.42, 0.72], cloudShade: [0.26, 0.21, 0.32],
      cirrusAmount: 0.80, cirrusCoverage: 0.50, cirrusHeight: 9000,
      cirrusScale: 0.000044, cirrusWind: [0.0008, 0.0003],
    },
    atmos: {
      heightFalloff: 0.0011, baseHeight: -20,
      highTint: [0.60, 0.62, 0.92], lowTint: [1.10, 0.92, 0.80],
      sunTint: [1.40, 0.66, 0.26], sunPow: 4.5,
    },
    bloom: { strength: 0.105, radius: 1.05, threshold: 0.95, knee: 0.65, clamp: 7.0, anamorphic: 1.15, dirt: 0.10 },
    flare: { intensity: 0.85, ghosts: 1.1, streak: 0.45, tint: 0xffc98a },
    ao: { radius: 2.8, intensity: 1.1, strength: 0.62, tint: 0x2a1c22 },
    grade: {
      toneMode: 2, shoulder: 0.80, linStart: 0.18, linLen: 0.24, toe: 1.20, white: 1.0,
      highlightDesat: 0.20, highlightKnee: 1.3,
      saturation: 1.20, contrast: 1.12, ca: 2.0, vignette: 1.20, grain: 0.015,
      lift: [0.014, 0.008, 0.022], gain: [1.03, 0.995, 0.965], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.84, 0.92, 1.18], highlightTint: [1.09, 1.00, 0.89],
      sharpen: 0.26,
    },
  },

  space: {
    kind: 'space',
    sunColor: 0xfff4e2, sunIntensity: 5.0,
    sunDir: [0.42, 0.34, -0.84],
    hemiSky: 0x223052, hemiGround: 0x0a0a12, hemiIntensity: 0.28,
    fillColor: 0x3a4a86, fillIntensity: 0.35,
    rimColor: 0x88bbff, rimIntensity: 0.85,
    fog: { color: 0x05070f, density: 0.00012 },
    exposure: 0.95,
    godray: { intensity: 0.16, tint: 0xbdd6ff, clamp: 2.5, density: 0.55, decay: 0.94, weight: 2.0, threshold: 1.6 },
    nebula: [0x2a3f7a, 0x6b2a6a, 0x123048],
    envIntensity: 0.8,

    atmos: {
      heightFalloff: 0.0002, baseHeight: -200,
      highTint: [0.30, 0.42, 0.86], lowTint: [0.80, 0.86, 1.05],
      sunTint: [0.24, 0.34, 0.62], sunPow: 9.0,
    },
    bloom: { strength: 0.115, radius: 1.15, threshold: 0.85, knee: 0.5, clamp: 10.0, anamorphic: 1.35, dirt: 0.14 },
    flare: { intensity: 0.55, ghosts: 1.2, streak: 0.75, tint: 0xcfe4ff },
    ao: { radius: 3.0, intensity: 1.2, strength: 0.70, tint: 0x0b1120 },
    grade: {
      toneMode: 2, shoulder: 0.82, linStart: 0.16, linLen: 0.22, toe: 1.30, white: 1.0,
      highlightDesat: 0.12, highlightKnee: 1.5,
      saturation: 1.14, contrast: 1.14, ca: 2.4, vignette: 1.32, grain: 0.018,
      lift: [0.002, 0.004, 0.014], gain: [0.98, 0.995, 1.045], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.82, 0.90, 1.22], highlightTint: [0.98, 1.00, 1.06],
      sharpen: 0.32,
    },
  },
};

/* ── Atmosphere: height fog + aerial perspective + sun inscattering ──────────
   three's FogExp2 is a single flat colour multiplied in by view depth, which is
   why distance reads as a wall rather than as air. These replacement chunks
   integrate an exponential *height* falloff along the ray, tint the haze toward
   the sky above and the ground haze below, and add a forward-scatter lobe so
   looking toward the sun through 3 km of air actually glows.

   Per-preset values are baked in as literals rather than uniforms, because
   three composes built-in material uniforms at import time and there is no seam
   to add new ones. Presets change roughly never, so the recompile is free; the
   cache-key hook below is what stops three handing back a stale program.     */
let _atmVersion = 0;
let _cacheKeyPatched = false;

function f(v) {
  const s = Number(v).toFixed(6);
  return s.includes('.') ? s : s + '.0';
}

function installAtmosphere(preset, sunDir) {
  const a = preset.atmos || {};
  const hi = a.highTint || [0.75, 0.85, 1.0];
  const lo = a.lowTint || [1.0, 1.0, 1.0];
  const st = a.sunTint || [0.4, 0.3, 0.2];

  if (!_cacheKeyPatched) {
    // Built-in materials key their compiled program off parameters, not off
    // chunk text — without this, re-patching a chunk silently reuses the old
    // program. This is the documented extension point for exactly that.
    const base = THREE.Material.prototype.customProgramCacheKey;
    THREE.Material.prototype.customProgramCacheKey = function () {
      return base.call(this) + '|atm' + _atmVersion;
    };
    _cacheKeyPatched = true;
  }
  _atmVersion++;

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
  varying float vFogSunCos;
#endif
`;

  // World height and the view/sun angle are derived from the view-space
  // position and the view matrix basis, so this stays correct for instanced
  // and skinned geometry where modelMatrix alone would not be.
  THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec3 fogUpV  = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 fogSunV = mat3( viewMatrix ) * vec3( ${f(sunDir.x)}, ${f(sunDir.y)}, ${f(sunDir.z)} );
  vFogHeight = cameraPosition.y + dot( mvPosition.xyz, fogUpV );
  vFogSunCos = dot( normalize( mvPosition.xyz + vec3( 1e-5 ) ), fogSunV );
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  varying float vFogSunCos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  {
    const float ATM_K  = ${f(a.heightFalloff ?? 0.0015)};
    const float ATM_H0 = ${f(a.baseHeight ?? 0.0)};
    const vec3  ATM_HI = vec3( ${f(hi[0])}, ${f(hi[1])}, ${f(hi[2])} );
    const vec3  ATM_LO = vec3( ${f(lo[0])}, ${f(lo[1])}, ${f(lo[2])} );
    const vec3  ATM_SUN = vec3( ${f(st[0])}, ${f(st[1])}, ${f(st[2])} );
    const float ATM_SUNPOW = ${f(a.sunPow ?? 6.0)};

    #ifdef FOG_EXP2
      float atmDens = fogDensity;
    #else
      float atmDens = 1.0 / max( 1.0, fogFar - fogNear );
    #endif

    // analytic integral of exp(-k*h) along the view ray
    float dh = vFogHeight - cameraPosition.y;
    float baseD = exp( -ATM_K * ( cameraPosition.y - ATM_H0 ) );
    float kh = ATM_K * dh;
    float ramp = ( abs( kh ) < 0.02 ) ? 1.0 : ( 1.0 - exp( -kh ) ) / kh;
    float od = atmDens * vFogDepth * baseD * ramp;
    float fogFactor = 1.0 - exp( -max( 0.0, od ) );

    // aerial perspective: haze takes the colour of the sky it is standing in
    float dirY = clamp( dh / max( vFogDepth, 1.0 ), -1.0, 1.0 );
    vec3 atmCol = fogColor * mix( ATM_LO, ATM_HI, smoothstep( -0.12, 0.42, dirY ) );
    atmCol += ATM_SUN * pow( max( 0.0, vFogSunCos ), ATM_SUNPOW );

    gl_FragColor.rgb = mix( gl_FragColor.rgb, atmCol, clamp( fogFactor, 0.0, 1.0 ) );
  }
#endif
`;
}

export class Environment {
  constructor(engine, presetName = 'corneria') {
    this.engine = engine;
    this.scene = engine.scene;
    this.root = new THREE.Group();
    this.root.name = 'environment';
    this.scene.add(this.root);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunWorld = new THREE.Vector3();
    this.sunScreen = new THREE.Vector2(0.5, 0.5);
    this.sunVisible = 0;
    this.cameraRoll = 0;
    this.time = 0;
    this._sunFirst = true;

    this._pmrem = new THREE.PMREMGenerator(engine.renderer);
    this._pmrem.compileEquirectangularShader();
    this._envRT = null;

    // ── sky dome (Preetham scattering + lit cloud decks)
    this.sky = new SkyDome();
    this.root.add(this.sky);

    // ── starfield backdrop (space presets)
    this.starMesh = null;

    // ── lights
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = engine.q.shadows;
    this.sun.shadow.mapSize.set(engine.q.shadowMap, engine.q.shadowMap);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1200;
    // A heightfield this large self-shadows into pure acne unless the normal
    // bias is on the order of a shadow texel in world units.
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.8;
    this.sun.shadow.blurSamples = 16;
    this._shadowSpan = 190;
    this._setShadowSpan(this._shadowSpan);
    this.root.add(this.sun);
    this.root.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.root.add(this.hemi);

    this.fill = new THREE.DirectionalLight(0xffffff, 0.4);
    this.root.add(this.fill);

    this.rim = new THREE.DirectionalLight(0xffffff, 0.7);
    this.root.add(this.rim);

    this.preset = null;
    this.apply(presetName);
  }

  _setShadowSpan(s) {
    const c = this.sun.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s;
    c.updateProjectionMatrix();
  }

  apply(name) {
    const p = PRESETS[name];
    if (!p) throw new Error(`unknown environment preset: ${name}`);
    this.presetName = name;
    this.preset = p;

    if (p.kind === 'atmosphere') {
      this.sky.visible = true;
      const phi = THREE.MathUtils.degToRad(90 - p.elevation);
      const theta = THREE.MathUtils.degToRad(p.azimuth);
      this.sunDir.setFromSphericalCoords(1, phi, theta);
      this.sky.set({
        turbidity: p.turbidity, rayleigh: p.rayleigh,
        mieCoefficient: p.mieCoefficient, mieDirectionalG: p.mieDirectionalG,
        ...(p.sky || {}),
      });
      this.sky.setSun(this.sunDir);
      if (this.starMesh) this.starMesh.visible = false;
      if (this.nebulaMesh) this.nebulaMesh.visible = false;
    } else {
      this.sky.visible = false;
      this.sunDir.fromArray(p.sunDir).normalize();
      this._ensureStars();
      this.starMesh.visible = true;
      this._tintNebula(p.nebula);
    }

    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.fill.color.setHex(p.fillColor);
    this.fill.intensity = p.fillIntensity;
    this.rim.color.setHex(p.rimColor);
    this.rim.intensity = p.rimIntensity;

    this.scene.fog = new THREE.FogExp2(p.fog.color, p.fog.density);
    installAtmosphere(p, this.sunDir);
    this._dirtyMaterials();

    this._applyPost(p);
    this._sunFirst = true;
    this.refreshEnvMap();
    return this;
  }

  /** Push the preset's post-process character into the composer. */
  _applyPost(p) {
    const post = this.engine.post;
    if (!post) return;

    post.params.exposure = p.exposure;

    const gr = post.godRays.params;
    const g = p.godray || {};
    if (g.intensity != null) gr.intensity = g.intensity;
    if (g.tint != null) gr.tint.setHex(g.tint);
    if (g.clamp != null) gr.clamp = g.clamp;
    if (g.density != null) gr.density = g.density;
    if (g.decay != null) gr.decay = g.decay;
    if (g.weight != null) gr.weight = g.weight;
    if (g.threshold != null) gr.threshold = g.threshold;

    if (p.bloom) Object.assign(post.params.bloom, p.bloom);

    if (p.flare && post.flare) {
      const fp = post.flare.params;
      for (const [k, v] of Object.entries(p.flare)) {
        if (k === 'tint') fp.tint.setHex(v); else fp[k] = v;
      }
    }

    if (p.ao && post.ao) {
      const ap = post.ao.params;
      for (const [k, v] of Object.entries(p.ao)) {
        if (k === 'tint') ap.tint.setHex(v); else ap[k] = v;
      }
    }

    if (p.grade && post.grade) {
      const u = post.grade.material.uniforms;
      for (const [k, v] of Object.entries(p.grade)) {
        const key = 'u' + k[0].toUpperCase() + k.slice(1);
        const uni = u[key];
        if (!uni) continue;
        if (Array.isArray(v) && uni.value?.set) uni.value.set(...v);
        else uni.value = v;
      }
    }
  }

  /** Force a rebuild of every material's program after an atmosphere swap. */
  _dirtyMaterials() {
    this.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) { for (const mm of m) mm.needsUpdate = true; }
      else m.needsUpdate = true;
    });
  }

  _ensureStars() {
    if (this.starMesh) return;
    const tex = bakeStarfield({ seed: 'lylat', size: 2048, count: 6000 });
    const geo = new THREE.SphereGeometry(16000, 48, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    });
    tex.repeat.set(3, 2);
    this.starMesh = new THREE.Mesh(geo, mat);
    this.starMesh.renderOrder = -1000;
    this.starMesh.frustumCulled = false;
    this.root.add(this.starMesh);
  }

  _tintNebula(colors) {
    if (!colors) return;
    // Nebula haze rendered as an additive inner shell so stars show through it.
    if (!this.nebulaMesh) {
      const geo = new THREE.SphereGeometry(15600, 48, 32);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, transparent: true, fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          cA: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, cC: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */`
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 cA, cB, cC;
          varying vec3 vDir;
          float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
          float noise(vec3 x){
            vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
            return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                           mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                           mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }
          float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p*=2.03; a*=0.52; } return s; }
          void main() {
            vec3 d = vDir;
            float n1 = fbm(d * 2.4);
            float n2 = fbm(d * 5.1 + 13.0);
            float n3 = fbm(d * 1.1 - 7.0);
            vec3 col = cA * pow(n1, 2.6) * 1.5 + cB * pow(n2, 3.4) * 0.9 + cC * pow(n3, 2.0) * 0.7;
            float band = smoothstep(-0.55, 0.45, d.y * 0.5 + fbm(d*0.9));
            gl_FragColor = vec4(col * band * 0.55, 1.0);
          }`,
      });
      this.nebulaMesh = new THREE.Mesh(geo, mat);
      this.nebulaMesh.renderOrder = -999;
      this.nebulaMesh.frustumCulled = false;
      this.root.add(this.nebulaMesh);
    }
    const u = this.nebulaMesh.material.uniforms;
    u.cA.value.setHex(colors[0]);
    u.cB.value.setHex(colors[1]);
    u.cC.value.setHex(colors[2]);
    this.nebulaMesh.visible = true;
  }

  /** Bake the sky (and its clouds) into a PMREM probe used by every PBR material. */
  refreshEnvMap() {
    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;

    // isolate: only the dome contributes to the probe
    const capture = new THREE.Scene();
    if (this.preset.kind === 'atmosphere') {
      const proxy = this.sky.makeProbeMesh(1000);
      capture.add(proxy);
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(capture, 0.02, 0.1, 2000);
      proxy.geometry.dispose(); proxy.material.dispose();
    } else {
      capture.background = new THREE.Color(this.preset.fog.color).multiplyScalar(2.4);
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(capture, 0.04, 0.1, 100);
    }

    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = this.preset.envIntensity ?? 1;
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
  }

  /**
   * Keeps the shadow frustum tight around the action, advances the weather and
   * recomputes the sun's screen-space position for god rays and the flare.
   */
  update(dt, focus, camera) {
    this.time += dt;
    const dist = 420;
    this.sunWorld.copy(this.sunDir).multiplyScalar(dist).add(focus);
    this.sun.position.copy(this.sunWorld);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.hemi.position.copy(focus).addScaledVector(_up, 50);
    this.fill.position.copy(focus).add(_v2.set(-this.sunDir.x, 0.35, -this.sunDir.z).multiplyScalar(200));
    this.rim.position.copy(focus).add(_v3.set(-this.sunDir.x, -0.12, -this.sunDir.z).multiplyScalar(-260));

    if (this.starMesh) this.starMesh.position.copy(camera.position);
    if (this.nebulaMesh) this.nebulaMesh.position.copy(camera.position);
    this.sky.position.copy(camera.position);
    this.sky.setTime(this.time);

    // sun in screen space, for god rays and the flare
    const p = _v.copy(this.sunDir).multiplyScalar(9000).add(camera.position);
    p.project(camera);
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const behind = p.z > 1;
    const off = Math.max(
      Math.abs(this.sunScreen.x - 0.5) - 0.5,
      Math.abs(this.sunScreen.y - 0.5) - 0.5,
    );
    const target = behind ? 0 : THREE.MathUtils.clamp(1 - off / 0.35, 0, 1);
    if (this._sunFirst) { this.sunVisible = target; this._sunFirst = false; }
    else this.sunVisible += (target - this.sunVisible) * Math.min(1, dt * 9);

    // screen-space roll, so the flare's starburst stays welded to the lens
    const e = camera.matrixWorld.elements;
    this.cameraRoll = Math.atan2(e[1], e[5]);

    const post = this.engine.post;
    if (post) {
      post.godRays.sun.copy(this.sunScreen);
      post.godRays.visible = this.sunVisible;
      if (post.flare) {
        post.flare.sun.copy(this.sunScreen);
        post.flare.visible = this.sunVisible;
        post.flare.roll = this.cameraRoll;
      }
    }
  }

  dispose() {
    if (this._envRT) this._envRT.dispose();
    this._pmrem.dispose();
  }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
