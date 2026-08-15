import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Procedural planet — a lit sphere, a terminator, an atmosphere limb and cloud
// bands, from one palette.
//
// Placement is angular, not metric. The body is parked on a fixed ray from the
// camera at PARK metres and scaled so its apparent radius is whatever the
// sequence asks for; the camera never gets closer, so there is no far-plane
// problem and no depth-precision problem to solve. For a sphere the apparent
// radius obeys sin(theta) = R / D, so R = D·sin(theta) — using tan() here puts
// the camera inside the body somewhere past 45°.
//
// Depth: written by nothing, tested against everything. The mesh renders in the
// backdrop band (renderOrder < 0) so terrain and hull drawn afterwards paint
// straight over it, which is the correct occlusion without asking a 9 km sphere
// to share a depth buffer with a 5 m Arwing.
//
// Detail is bounded by apparent size, not by taste. The surface fbm is 5
// octaves at 70° across and 1 octave at a 6 px dot; a dot carrying its full
// octave stack is a fizzing pixel, which is the Nyquist rule stated in the
// contract applied to a body whose screen size changes by 400× in six seconds.
// ─────────────────────────────────────────────────────────────────────────────

const PLANET_VERT = /* glsl */`
precision highp float;
varying vec3 vObj;
varying vec3 vNrm;
varying vec3 vView;
void main() {
  vObj = normalize( position );
  vNrm = normalize( mat3( modelMatrix ) * normal );
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vView = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PLANET_FRAG = /* glsl */`
precision highp float;
uniform vec3  uSun;            // world-space direction to the sun
uniform vec3  uLow;            // ocean / lowland
uniform vec3  uHigh;           // land
uniform vec3  uPole;           // cap
uniform vec3  uCloud;
uniform vec3  uAtmo;           // limb scatter
uniform float uCloudCover;
uniform float uBandStrength;   // zonal banding of the cloud field
uniform float uSeaLevel;
uniform float uPoleLat;
uniform float uSpin;
uniform float uDetail;         // 0..1, gates the high octaves by apparent size
uniform float uOpacity;
uniform float uGain;
varying vec3 vObj;
varying vec3 vNrm;
varying vec3 vView;

float hash13( vec3 p ) {
  p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float vnoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( hash13( i + vec3(0,0,0) ), hash13( i + vec3(1,0,0) ), f.x ),
                   mix( hash13( i + vec3(0,1,0) ), hash13( i + vec3(1,1,0) ), f.x ), f.y ),
              mix( mix( hash13( i + vec3(0,0,1) ), hash13( i + vec3(1,0,1) ), f.x ),
                   mix( hash13( i + vec3(0,1,1) ), hash13( i + vec3(1,1,1) ), f.x ), f.y ), f.z );
}
// Octave weights ramp in with apparent size; an octave that is not resolved is
// not detail, so it is not paid for either.
float fbm( vec3 p, float oct ) {
  float s = 0.0, a = 0.5, n = 0.0;
  for ( int i = 0; i < 5; i++ ) {
    float w = clamp( oct - float( i ), 0.0, 1.0 );
    s += a * w * vnoise( p );
    n += a * w;
    p *= 2.07;
    a *= 0.52;
  }
  return s / max( n, 1e-4 );
}

mat3 spinY( float a ) {
  float c = cos( a ), s = sin( a );
  return mat3( c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c );
}

void main() {
  vec3 n = normalize( vNrm );
  vec3 v = normalize( vView );
  float oct = 1.0 + 4.0 * uDetail;

  vec3 p = spinY( uSpin ) * vObj;
  float lat = abs( p.y );

  // ── surface
  float land = fbm( p * 2.3, oct );
  land += 0.35 * fbm( p * 6.1 + 11.0, oct - 1.0 );
  float sea = smoothstep( uSeaLevel - 0.05, uSeaLevel + 0.09, land );
  vec3 surf = mix( uLow, uHigh, sea );
  float cap = smoothstep( uPoleLat - 0.10, uPoleLat + 0.12, lat + 0.12 * ( land - 0.5 ) );
  surf = mix( surf, uPole, cap );

  // ── cloud deck. Zonal shear stretches the field along latitude lines, which
  // is what makes a band read as weather on a rotating body rather than as a
  // painted stripe.
  vec3 cp = p * vec3( 1.0, 3.4, 1.0 ) + vec3( 0.0, 0.0, 0.0 );
  float band = fbm( cp * 1.9 + 3.7, oct );
  band = mix( band, 0.5 + 0.5 * sin( p.y * 11.0 + band * 4.5 ), uBandStrength );
  float puff = fbm( p * 4.4 - 6.2, oct - 0.5 );
  float cloud = smoothstep( 1.0 - uCloudCover - 0.18, 1.0 - uCloudCover + 0.18,
                            band * 0.62 + puff * 0.38 + cap * 0.10 );

  vec3 albedo = mix( surf, uCloud, cloud * 0.92 );

  // ── light. Vacuum has no fill, so the terminator is a short ramp and the
  // night side is held up by scatter alone.
  float ndl = dot( n, uSun );
  float day = smoothstep( -0.10, 0.16, ndl );
  float twilight = smoothstep( 0.30, -0.06, ndl ) * smoothstep( -0.34, -0.04, ndl );

  vec3 col = albedo * day * ( 0.35 + 0.65 * max( ndl, 0.0 ) );
  col += uAtmo * twilight * 0.55;

  // specular off the sea, only where the deck is thin — the glint is what gives
  // the body a scale cue at any apparent size
  float spec = pow( max( dot( reflect( -uSun, n ), v ), 0.0 ), 90.0 );
  col += vec3( 1.0, 0.96, 0.90 ) * spec * ( 1.0 - sea ) * ( 1.0 - cloud ) * day * 1.6;

  // ── limb. Rayleigh piles up along a grazing path, so the rim brightens where
  // the view is tangent and only on the lit side.
  float fres = pow( 1.0 - max( dot( n, v ), 0.0 ), 3.2 );
  col += uAtmo * fres * ( 0.30 + 1.55 * smoothstep( -0.25, 0.35, ndl ) );
  col += uAtmo * 0.05 * day;

  gl_FragColor = vec4( col * uGain, uOpacity );
}
`;

const HALO_VERT = PLANET_VERT;

const HALO_FRAG = /* glsl */`
precision highp float;
uniform vec3  uSun;
uniform vec3  uAtmo;
uniform float uOpacity;
uniform float uThickness;
varying vec3 vNrm;
varying vec3 vView;
void main() {
  vec3 n = normalize( vNrm );
  vec3 v = normalize( vView );
  float g = 1.0 - max( dot( n, v ), 0.0 );
  // Shell radius is fixed, so the visible band width is set here: a high
  // exponent is a hairline, a low one is a fog ball around the planet.
  float rim = pow( g, uThickness );
  float lit = smoothstep( -0.45, 0.25, dot( n, uSun ) );
  float a = rim * lit * uOpacity;
  if ( a < 0.002 ) discard;
  gl_FragColor = vec4( uAtmo * a, 1.0 );
}
`;

/** Palettes are per world, in linear radiance. */
export const PLANET_PALETTES = {
  corneria: {
    low: [0.030, 0.085, 0.230], high: [0.135, 0.190, 0.095], pole: [0.72, 0.78, 0.86],
    cloud: [0.86, 0.90, 0.96], atmo: [0.22, 0.46, 1.00],
    cloudCover: 0.42, band: 0.10, seaLevel: 0.50, poleLat: 0.86, thickness: 3.6,
  },
  fichina: {
    low: [0.150, 0.280, 0.430], high: [0.660, 0.760, 0.850], pole: [0.94, 0.97, 1.00],
    cloud: [0.92, 0.96, 1.00], atmo: [0.42, 0.66, 1.00],
    cloudCover: 0.62, band: 0.58, seaLevel: 0.44, poleLat: 0.42, thickness: 2.8,
  },
  venom: {
    low: [0.130, 0.032, 0.026], high: [0.300, 0.120, 0.060], pole: [0.22, 0.15, 0.14],
    cloud: [0.52, 0.26, 0.18], atmo: [1.00, 0.34, 0.16],
    cloudCover: 0.50, band: 0.34, seaLevel: 0.52, poleLat: 0.80, thickness: 3.0,
  },
  sunset: {
    low: [0.180, 0.090, 0.060], high: [0.320, 0.220, 0.120], pole: [0.80, 0.76, 0.72],
    cloud: [0.90, 0.84, 0.78], atmo: [1.00, 0.52, 0.28],
    cloudCover: 0.38, band: 0.12, seaLevel: 0.52, poleLat: 0.84, thickness: 3.4,
  },
};

const PARK = 9000;

export class Planet {
  constructor(palette = 'fichina') {
    const geo = new THREE.SphereGeometry(1, 128, 72);
    // The halo's silhouette IS the effect, so it carries more segments than the
    // body: at 70° across, 96 segments faceted the limb visibly.
    const halo = new THREE.SphereGeometry(1.055, 192, 96);
    this.geometry = geo;
    this.haloGeometry = halo;

    const u = {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uLow: { value: new THREE.Vector3() },
      uHigh: { value: new THREE.Vector3() },
      uPole: { value: new THREE.Vector3() },
      uCloud: { value: new THREE.Vector3() },
      uAtmo: { value: new THREE.Vector3() },
      uCloudCover: { value: 0.5 }, uBandStrength: { value: 0.3 },
      uSeaLevel: { value: 0.5 }, uPoleLat: { value: 0.8 },
      uSpin: { value: 0 }, uDetail: { value: 1 },
      uOpacity: { value: 1 }, uGain: { value: 1 },
    };
    this.uniforms = u;

    this.material = new THREE.ShaderMaterial({
      name: 'VulpinePlanet',
      uniforms: u,
      vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      fog: false, toneMapped: false,
    });

    this.haloUniforms = {
      uSun: u.uSun,
      uAtmo: { value: new THREE.Vector3() },
      uOpacity: { value: 1 },
      uThickness: { value: 3.2 },
    };
    this.haloMaterial = new THREE.ShaderMaterial({
      name: 'VulpinePlanetHalo',
      uniforms: this.haloUniforms,
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      side: THREE.FrontSide, fog: false, toneMapped: false,
    });

    this.group = new THREE.Group();
    this.group.name = 'fx.planet';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.haloMesh = new THREE.Mesh(halo, this.haloMaterial);
    this.mesh.frustumCulled = false;
    this.haloMesh.frustumCulled = false;
    this.mesh.renderOrder = -992;
    this.haloMesh.renderOrder = -991;
    this.group.add(this.mesh, this.haloMesh);
    this.group.visible = false;

    this.dir = new THREE.Vector3(0, -0.3, -1).normalize();
    this.angRadius = 0.02;
    this.setPalette(palette);
  }

  setPalette(name) {
    const p = PLANET_PALETTES[name] || PLANET_PALETTES.fichina;
    const u = this.uniforms;
    u.uLow.value.fromArray(p.low);
    u.uHigh.value.fromArray(p.high);
    u.uPole.value.fromArray(p.pole);
    u.uCloud.value.fromArray(p.cloud);
    u.uAtmo.value.fromArray(p.atmo);
    u.uCloudCover.value = p.cloudCover;
    u.uBandStrength.value = p.band;
    u.uSeaLevel.value = p.seaLevel;
    u.uPoleLat.value = p.poleLat;
    this.haloUniforms.uAtmo.value.fromArray(p.atmo);
    this.haloUniforms.uThickness.value = p.thickness;
    return this;
  }

  /** @param dir unit world direction from the camera. */
  setDirection(x, y, z) { this.dir.set(x, y, z).normalize(); return this; }

  /** Apparent radius in radians — the only size control the sequence uses. */
  setAngularRadius(rad) { this.angRadius = Math.max(1e-4, Math.min(1.25, rad)); return this; }

  setOpacity(a) {
    this.uniforms.uOpacity.value = a;
    this.haloUniforms.uOpacity.value = a;
    this.group.visible = a > 0.002;
    return this;
  }

  setGain(g) { this.uniforms.uGain.value = g; return this; }

  /**
   * @param camera   drives placement and the apparent-size detail gate
   * @param sunDir   world direction to the sun
   * @param pxHeight framebuffer height, for the Nyquist gate
   */
  update(dt, camera, sunDir, pxHeight) {
    if (!this.group.visible) return;
    const r = PARK * Math.sin(this.angRadius);
    this.group.position.copy(camera.position).addScaledVector(this.dir, PARK);
    this.group.scale.setScalar(r);
    this.uniforms.uSun.value.copy(sunDir);
    this.uniforms.uSpin.value += dt * 0.012;

    // apparent radius in pixels: theta / (fov/2) × half the frame
    const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    const px = (this.angRadius / halfFov) * pxHeight * 0.5;
    this.uniforms.uDetail.value = THREE.MathUtils.clamp((px - 14) / 260, 0, 1);
  }

  dispose() {
    this.geometry.dispose(); this.haloGeometry.dispose();
    this.material.dispose(); this.haloMaterial.dispose();
  }
}
