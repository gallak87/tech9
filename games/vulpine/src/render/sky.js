import * as THREE from 'three';
import { bakeCloudSheet, cached } from './textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sky dome — Preetham analytic scattering plus two lit cloud decks.
//
// The scattering half is the Preetham/Bruneton formulation from three's
// examples (MIT), with two deliberate changes:
//
//   1. The solar disc radiance is a uniform, not a hard-coded 19000. The stock
//      value puts ~65,000 linear units in a handful of texels; any bloom or
//      radial-blur pass downstream then paints the whole frame white. Here the
//      disc is bounded and given limb darkening plus an explicit Mie aureole,
//      so "bright" comes from a believable falloff instead of one nuclear texel.
//
//   2. Clouds. An empty analytic dome reads as a gradient, not as weather.
//
// Cloud model: each deck is a flat plane at a fixed altitude, intersected
// against the view ray. That single trick buys real parallax (you fly past
// them), correct horizon compression (the deck piles into a band instead of a
// fog wall) and per-pixel cost of a handful of texture fetches. Density comes
// from one baked, tiling sheet (render/textures.js `bakeCloudSheet`) sampled at
// two scales to hide the repeat. Lighting marches three taps along the sun
// vector *through the deck* for transmittance, so the decks self-shadow and
// pick up a silver lining from the Henyey-Greenstein forward lobe.
// ─────────────────────────────────────────────────────────────────────────────

const SKY_VERT = /* glsl */`
uniform vec3 sunPosition;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;
uniform vec3 up;

varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

const float e = 2.71828182845904523536028747135266249775724709369995957;
const float pi = 3.141592653589793238462643383279502884197169;

const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity( float zenithAngleCos ) {
  zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
}
vec3 totalMie( float T ) {
  float c = ( 0.2 * T ) * 10E-18;
  return 0.434 * c * MieConst;
}

void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldPosition = worldPosition.xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position.z = gl_Position.w;                 // pin to the far plane

  vSunDirection = normalize( sunPosition );
  vSunE = sunIntensity( dot( vSunDirection, up ) );
  vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

  float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie( turbidity ) * mieCoefficient;
}
`;

const SKY_FRAG = /* glsl */`
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

uniform float mieDirectionalG;
uniform vec3 up;

uniform float uSunDisc;        // peak solar radiance, bounded on purpose
uniform float uAureole;        // Mie aureole strength around the disc
uniform float uAureoleTight;   // exponent: bigger = smaller glow
uniform float uSkyGain;

uniform sampler2D tCloud;
uniform float uTime;
uniform float uCloudAmount;    // master: 0 disables both decks
uniform float uCoverage;
uniform float uCloudHeight;
uniform float uCloudScale;
uniform vec2  uCloudWind;
uniform float uCloudThickness;
uniform float uAbsorb;
uniform float uErode;
uniform vec3  uCloudSun;       // sunlit cloud colour  (linear, ~1..3)
uniform vec3  uCloudShade;     // shadowed cloud colour (linear, ~0.1..0.6)
uniform float uCirrusAmount;
uniform float uCirrusCoverage;
uniform float uCirrusHeight;
uniform float uCirrusScale;
uniform vec2  uCirrusWind;

const float pi = 3.141592653589793238462643383279502884197169;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase( float cosTheta ) {
  return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
}
float hgPhase( float cosTheta, float g ) {
  float g2 = pow( g, 2.0 );
  float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
  return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}

/* ── cloud density from the packed sheet ─────────────────────────────────── */
float deckDensity( vec2 uv, float cov ) {
  vec4 a = texture2D( tCloud, uv );
  vec4 b = texture2D( tCloud, uv * 0.413 + vec2( 0.37, 0.19 ) );
  float base = a.r * 0.62 + b.r * 0.38;
  float bill = a.g * 0.58 + b.g * 0.42;
  float d = base * 0.60 + bill * 0.40;
  d -= ( 1.0 - cov );
  d -= ( 1.0 - a.b ) * uErode;              // fine erosion frays the edges
  return clamp( d * 3.4, 0.0, 1.0 );
}

void main() {
  vec3 direction = normalize( vWorldPosition - cameraPosition );

  // ── optical length; cutoff at 90° avoids the singularity below
  float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
  float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

  float cosTheta = dot( direction, vSunDirection );

  float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase( cosTheta, mieDirectionalG );
  vec3 betaMTheta = vBetaM * mPhase;

  vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ),
              pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ),
              clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

  vec3 L0 = vec3( 0.1 ) * Fex;

  // ── solar disc: bounded radiance, soft limb, plus a real aureole so the
  // brightness around the sun comes from scattering rather than from bloom
  float disc = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.000025, cosTheta );
  float limb = sqrt( max( 0.0, 1.0 - pow( max( 0.0, ( 1.0 - cosTheta ) / ( 1.0 - sunAngularDiameterCos ) ), 2.0 ) ) );
  L0 += ( vSunE * uSunDisc * Fex ) * disc * mix( 0.62, 1.0, limb );
  L0 += ( vSunE * uAureole * Fex ) * pow( max( 0.0, cosTheta ), uAureoleTight );

  vec3 sky = ( ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 ) ) * uSkyGain;

  /* ── clouds ─────────────────────────────────────────────────────────────
     Both decks are planes; the ray-plane hit gives parallax and packs the deck
     into a band at the horizon instead of a flat fog wall.                   */
  if ( uCloudAmount > 0.001 && direction.y > 0.0 ) {
    float dy = max( direction.y, 0.010 );
    float sunUp = max( 0.10, vSunDirection.y );
    float horizon = smoothstep( 0.0, 0.030, direction.y );
    // Distant deck bleeds toward the sky: aerial perspective, not a hard edge.
    float aerial = smoothstep( 0.34, 0.02, direction.y );
    vec3 hazeCol = sky * 1.05;

    // ── cirrus, high and thin, painted first so cumulus sits in front
    if ( uCirrusAmount > 0.001 ) {
      float t = ( uCirrusHeight - cameraPosition.y ) / dy;
      vec2 uv = ( cameraPosition.xz + direction.xz * t ) * uCirrusScale + uCirrusWind * uTime;
      float c = texture2D( tCloud, uv ).a * 0.72 + texture2D( tCloud, uv * 1.93 + 0.31 ).a * 0.28;
      float cir = clamp( ( c - ( 1.0 - uCirrusCoverage ) ) * 3.6, 0.0, 1.0 );
      float fwd = pow( max( 0.0, cosTheta ), 6.0 );
      vec3 col = mix( uCloudShade * 1.9, uCloudSun * 1.05, 0.72 + 0.28 * fwd );
      col = mix( col, hazeCol, aerial * 0.85 );
      sky = mix( sky, col, cir * uCirrusAmount * horizon );
    }

    // ── cumulus deck
    float t = ( uCloudHeight - cameraPosition.y ) / dy;
    vec2 uv = ( cameraPosition.xz + direction.xz * t ) * uCloudScale + uCloudWind * uTime;
    float dens = deckDensity( uv, uCoverage );
    if ( dens > 0.002 ) {
      // march toward the sun through the slab: xz drift per unit altitude is
      // sunDir.xz / sunDir.y, so this is a real (if short) shadow ray
      vec2 sunStep = ( vSunDirection.xz / sunUp ) * uCloudThickness * uCloudScale;
      float occ = deckDensity( uv + sunStep * 0.30, uCoverage )
                + deckDensity( uv + sunStep * 0.68, uCoverage ) * 0.8
                + deckDensity( uv + sunStep * 1.20, uCoverage ) * 0.55;
      float trans = exp( -occ * uAbsorb );

      float fwd = hgPhase( cosTheta, 0.74 ) * 12.566;          // silver lining
      vec3 lit = uCloudSun * ( 0.68 + 1.15 * fwd * ( 1.0 - dens * 0.55 ) );
      vec3 col = mix( uCloudShade, lit, trans );
      // rim: thin edges of the deck scatter forward hard
      col += uCloudSun * pow( 1.0 - dens, 3.0 ) * fwd * 0.45;
      col = mix( col, hazeCol, aerial * 0.80 );
      sky = mix( sky, col, dens * uCloudAmount * horizon );
    }
  }

  gl_FragColor = vec4( max( sky, vec3( 0.0 ) ), 1.0 );
}
`;

/** Defaults tuned for a bright day; presets override through `set()`. */
export const SKY_DEFAULTS = {
  turbidity: 3.4, rayleigh: 1.35, mieCoefficient: 0.0042, mieDirectionalG: 0.86,
  sunDisc: 42, aureole: 2.6, aureoleTight: 700, skyGain: 1.0,
  cloudAmount: 1.0, coverage: 0.46, cloudHeight: 2200, cloudScale: 0.00019,
  cloudWind: [0.0022, 0.0009], cloudThickness: 620, absorb: 2.6, erode: 0.20,
  cloudSun: [1.75, 1.72, 1.66], cloudShade: [0.30, 0.36, 0.48],
  cirrusAmount: 0.55, cirrusCoverage: 0.42, cirrusHeight: 8200,
  cirrusScale: 0.000052, cirrusWind: [0.0011, 0.0004],
};

function cloudSheet() {
  return cached('tex.cloudSheet', () => {
    const t = bakeCloudSheet({ seed: 'lylat.clouds', size: 512 });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    name: 'VulpineSky',
    uniforms: {
      turbidity: { value: SKY_DEFAULTS.turbidity },
      rayleigh: { value: SKY_DEFAULTS.rayleigh },
      mieCoefficient: { value: SKY_DEFAULTS.mieCoefficient },
      mieDirectionalG: { value: SKY_DEFAULTS.mieDirectionalG },
      sunPosition: { value: new THREE.Vector3(0, 1, 0) },
      up: { value: new THREE.Vector3(0, 1, 0) },

      uSunDisc: { value: SKY_DEFAULTS.sunDisc },
      uAureole: { value: SKY_DEFAULTS.aureole },
      uAureoleTight: { value: SKY_DEFAULTS.aureoleTight },
      uSkyGain: { value: SKY_DEFAULTS.skyGain },

      tCloud: { value: cloudSheet() },
      uTime: { value: 0 },
      uCloudAmount: { value: SKY_DEFAULTS.cloudAmount },
      uCoverage: { value: SKY_DEFAULTS.coverage },
      uCloudHeight: { value: SKY_DEFAULTS.cloudHeight },
      uCloudScale: { value: SKY_DEFAULTS.cloudScale },
      uCloudWind: { value: new THREE.Vector2(...SKY_DEFAULTS.cloudWind) },
      uCloudThickness: { value: SKY_DEFAULTS.cloudThickness },
      uAbsorb: { value: SKY_DEFAULTS.absorb },
      uErode: { value: SKY_DEFAULTS.erode },
      uCloudSun: { value: new THREE.Vector3(...SKY_DEFAULTS.cloudSun) },
      uCloudShade: { value: new THREE.Vector3(...SKY_DEFAULTS.cloudShade) },
      uCirrusAmount: { value: SKY_DEFAULTS.cirrusAmount },
      uCirrusCoverage: { value: SKY_DEFAULTS.cirrusCoverage },
      uCirrusHeight: { value: SKY_DEFAULTS.cirrusHeight },
      uCirrusScale: { value: SKY_DEFAULTS.cirrusScale },
      uCirrusWind: { value: new THREE.Vector2(...SKY_DEFAULTS.cirrusWind) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
}

/** Inverted box dome. Cheap, and the shader only cares about the view ray. */
export class SkyDome extends THREE.Mesh {
  constructor() {
    super(new THREE.BoxGeometry(1, 1, 1), makeSkyMaterial());
    this.name = 'sky';
    this.scale.setScalar(20000);
    this.renderOrder = -1000;
    this.frustumCulled = false;
  }

  /** Bulk-apply a plain-object patch onto the uniforms. */
  set(p = {}) {
    const u = this.material.uniforms;
    const num = (k, uni) => { if (p[k] != null) u[uni].value = p[k]; };
    const vec2 = (k, uni) => { if (p[k] != null) u[uni].value.set(p[k][0], p[k][1]); };
    const vec3 = (k, uni) => { if (p[k] != null) u[uni].value.set(p[k][0], p[k][1], p[k][2]); };
    num('turbidity', 'turbidity');
    num('rayleigh', 'rayleigh');
    num('mieCoefficient', 'mieCoefficient');
    num('mieDirectionalG', 'mieDirectionalG');
    num('sunDisc', 'uSunDisc');
    num('aureole', 'uAureole');
    num('aureoleTight', 'uAureoleTight');
    num('skyGain', 'uSkyGain');
    num('cloudAmount', 'uCloudAmount');
    num('coverage', 'uCoverage');
    num('cloudHeight', 'uCloudHeight');
    num('cloudScale', 'uCloudScale');
    num('cloudThickness', 'uCloudThickness');
    num('absorb', 'uAbsorb');
    num('erode', 'uErode');
    num('cirrusAmount', 'uCirrusAmount');
    num('cirrusCoverage', 'uCirrusCoverage');
    num('cirrusHeight', 'uCirrusHeight');
    num('cirrusScale', 'uCirrusScale');
    vec2('cloudWind', 'uCloudWind');
    vec2('cirrusWind', 'uCirrusWind');
    vec3('cloudSun', 'uCloudSun');
    vec3('cloudShade', 'uCloudShade');
    return this;
  }

  setSun(dir) { this.material.uniforms.sunPosition.value.copy(dir); return this; }
  setTime(t) { this.material.uniforms.uTime.value = t; return this; }

  /**
   * A small copy for the PMREM probe, so image-based lighting sees the same
   * sky — including the clouds — that the camera does.
   */
  makeProbeMesh(scale = 1000) {
    const mat = makeSkyMaterial();
    const src = this.material.uniforms;
    for (const k of Object.keys(mat.uniforms)) {
      const a = mat.uniforms[k].value, b = src[k].value;
      if (a && a.copy && b && b.copy) a.copy(b); else mat.uniforms[k].value = b;
    }
    // The probe camera sits at the origin; the disc would burn a hole in the
    // irradiance, so the probe sees sky + clouds without the solar disc.
    mat.uniforms.uSunDisc.value = 0;
    mat.uniforms.uAureole.value = src.uAureole.value * 0.5;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    m.scale.setScalar(scale);
    m.frustumCulled = false;
    return m;
  }
}
