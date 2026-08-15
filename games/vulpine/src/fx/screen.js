import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Screen-space feel: boost speed lines and the transonic vapour cone.
//
// The speed lines never enter world space at all — the vertex shader writes
// gl_Position directly in NDC, so there is no camera matrix, no projection, no
// depth, and no chance of the effect drifting when the chase camera lags. Radii
// are expressed in *screen heights* and divided by aspect on the way out, which
// is what keeps the streaks radial instead of elliptical on a wide monitor.
// ─────────────────────────────────────────────────────────────────────────────

const LINES_VERT = /* glsl */`
precision highp float;
attribute vec4 iA;    // angle, phase offset, length scale, width
attribute vec2 iB;    // speed, brightness
uniform float uTime;
uniform float uAspect;
uniform float uAmount;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float phase = fract(iB.x * uTime + iA.y);
  vec2 dir = vec2(cos(iA.x), sin(iA.x));
  vec2 perp = vec2(-dir.y, dir.x);

  // accelerating outward — a streak covers more screen the further out it is
  float rad = mix(0.10, 2.30, phase * phase);
  float len = iA.z * (0.06 + phase * 0.42);
  float wid = iA.w * (0.35 + phase * 0.9);

  vec2 q = dir * rad + dir * (position.x * len) + perp * (position.y * wid);
  gl_Position = vec4(q.x / uAspect, q.y, 0.0, 1.0);

  vAlpha = uAmount * iB.y
         * smoothstep(0.0, 0.18, phase) * (1.0 - smoothstep(0.55, 1.0, phase));
  vUv = uv;
}
`;

const LINES_FRAG = /* glsl */`
precision highp float;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float across = pow(max(0.0, 1.0 - abs(vUv.y * 2.0 - 1.0)), 2.2);
  float along = pow(max(0.0, sin(vUv.x * 3.14159)), 0.7);
  float a = across * along * vAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vec3(0.80, 0.90, 1.0) * a, a);
}
`;

export class SpeedLines {
  constructor(count = 220, rand = Math.random) {
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    quad.setIndex([0, 1, 2, 0, 2, 3]);

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));

    const a = new Float32Array(count * 4);
    const b = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      a[i * 4] = rand() * Math.PI * 2;
      a[i * 4 + 1] = rand();
      a[i * 4 + 2] = 0.10 + rand() * 0.26;
      a[i * 4 + 3] = 0.0016 + rand() * 0.0042;
      b[i * 2] = 0.75 + rand() * 0.85;
      b[i * 2 + 1] = 0.35 + rand() * 0.85;
    }
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(a, 4));
    geo.setAttribute('iB', new THREE.InstancedBufferAttribute(b, 2));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAspect: { value: 16 / 9 }, uAmount: { value: 0 },
      },
      vertexShader: LINES_VERT, fragmentShader: LINES_FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, toneMapped: false, fog: false,
    });
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4000;
    this.mesh.name = 'fx.speedlines';
    this.mesh.visible = false;
  }

  update(dt, amount, aspect) {
    const u = this.material.uniforms;
    u.uTime.value += dt;
    u.uAmount.value = amount;
    u.uAspect.value = aspect;
    this.mesh.visible = amount > 0.004;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* ── transonic vapour cone ────────────────────────────────────────────────── */

const CONE_VERT = /* glsl */`
precision highp float;
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vAlong = uv.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CONE_FRAG = /* glsl */`
precision highp float;
uniform float uAmount;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  // the sheet is densest at the shock front and dissolves rearward
  float band = smoothstep(0.0, 0.22, vAlong) * (1.0 - smoothstep(0.35, 1.0, vAlong));
  float boil = 0.82 + 0.18 * sin(vAlong * 34.0 - uTime * 22.0);
  float a = fres * band * boil * uAmount * 0.62;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.93, 0.96, 1.0), a);
}
`;

export class VapourCone {
  constructor() {
    const geo = new THREE.ConeGeometry(3.4, 7.0, 40, 6, true);
    geo.translate(0, -3.5, 0);
    geo.rotateX(-Math.PI / 2);     // apex forward along -Z
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAmount: { value: 0 }, uTime: { value: 0 } },
      vertexShader: CONE_VERT, fragmentShader: CONE_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending, side: THREE.DoubleSide,
      toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'fx.vapourcone';
    this.mesh.visible = false;
  }

  update(dt, amount, pos, quat) {
    this.material.uniforms.uTime.value += dt;
    this.material.uniforms.uAmount.value = amount;
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(quat);
    const s = 0.72 + amount * 0.5;
    this.mesh.scale.set(s, s, 0.85 + amount * 0.6);
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* ── re-entry heat wash ───────────────────────────────────────────────────────
   The shock layer wraps the whole canopy, so this is a full-frame term, not a
   glow around the nose. Like the speed lines it is written straight in NDC and
   never enters world space.

   It emits linear scene radiance into the HDR buffer ahead of the grade rather
   than lifting the graded frame, so the tone curve still gets to roll the peak
   off — a wash added after the curve is a flat white rectangle with no shoulder
   left to spend. Radiance is capped: the veil is what the frame is looking
   through, and a value that drives every channel past white takes the ship with
   it.                                                                         */

const WASH_VERT = /* glsl */`
precision highp float;
varying vec2 vNdc;
void main() {
  vNdc = position.xy * 2.0;
  gl_Position = vec4( position.xy * 2.0, 0.0, 1.0 );
}
`;

const WASH_FRAG = /* glsl */`
precision highp float;
uniform float uAmount;
uniform float uTime;
uniform float uAspect;
uniform vec3  uHot;
uniform vec3  uVeil;
varying vec2 vNdc;

float hash12( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * 0.1031 );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash12( i ), hash12( i + vec2(1,0) ), f.x ),
              mix( hash12( i + vec2(0,1) ), hash12( i + vec2(1,1) ), f.x ), f.y );
}

void main() {
  vec2 q = vec2( vNdc.x * uAspect, vNdc.y );
  float r = length( q );
  float a = clamp( uAmount, 0.0, 1.0 );

  // Plasma stands off the hull and is brightest where the shock is thickest —
  // at the edge of the field of view, not in the middle of it.
  float edge = smoothstep( 0.18, 1.35, r );

  // streaks: angular noise scrolling outward, so the ablation reads as moving
  float ang = atan( q.y, q.x );
  float streak = vnoise( vec2( ang * 9.0, r * 3.0 - uTime * 2.6 ) )
               * vnoise( vec2( ang * 23.0 + 5.0, r * 6.5 - uTime * 4.1 ) );
  streak = pow( streak, 1.6 );

  float veil = a * a;
  vec3 col = uVeil * veil * ( 0.30 + 0.70 * edge )
           + uHot * a * edge * ( 0.35 + 1.30 * streak );

  gl_FragColor = vec4( col, 1.0 );
}
`;

export class HeatWash {
  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAmount: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 16 / 9 },
        // Linear scene radiance at the exposure the re-entry blend passes
        // through (~0.2). Authored in display units the whole term lands two
        // stops under the frame and reads as fog.
        uHot: { value: new THREE.Vector3(7.2, 2.05, 0.30) },
        uVeil: { value: new THREE.Vector3(3.2, 1.75, 0.95) },
      },
      vertexShader: WASH_VERT, fragmentShader: WASH_FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3900;      // under the speed lines, over everything else
    this.mesh.name = 'fx.heatwash';
    this.mesh.visible = false;
  }

  update(dt, amount, aspect) {
    const u = this.material.uniforms;
    u.uTime.value += dt;
    u.uAmount.value = amount;
    u.uAspect.value = aspect;
    this.mesh.visible = amount > 0.003;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
