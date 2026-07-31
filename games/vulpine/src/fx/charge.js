import * as THREE from 'three';
import { RibbonBank } from './ribbons.js';

// ─────────────────────────────────────────────────────────────────────────────
// Charge orb — the plasma ball that grows at the muzzle before a lock-on shot.
//
// Three layers do the work:
//   · a hot inner core whose surface boils (three interfering noise bands),
//   · an outer shell that darkens at grazing angles and brightens dead-on,
//     which reads as light bending around a dense body,
//   · arcing electricity, written straight into a ribbon bank as jagged
//     polylines that re-roll at ~24 Hz. A trail-shaped ribbon looks like smoke;
//     an arc has to be redrawn from scratch every few frames to crackle.
//
// The arc paths come from an integer hash, not an RNG object, so the pattern is
// a pure function of (arc index, tick) and replays identically on any seek.
// ─────────────────────────────────────────────────────────────────────────────

function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return (n >>> 0) / 4294967296;
}

const ORB_VERT = /* glsl */`
precision highp float;
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vL = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ORB_FRAG = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uLevel;
uniform vec3  uColor;
uniform float uShell;     // 0 = core, 1 = outer shell
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main() {
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float fres = pow(1.0 - ndv, 3.0);

  // boiling surface: three interfering bands, faster and tighter as it charges
  float sp = 2.0 + uLevel * 7.0;
  float b = sin(vL.x * 7.0 + uTime * sp)
          + sin(vL.y * 9.3 - uTime * sp * 1.31)
          + sin((vL.z + vL.x) * 11.7 + uTime * sp * 0.77);
  float boil = 0.5 + 0.5 * (b / 3.0);

  float a, k;
  if (uShell > 0.5) {
    // shell: bright limb, and a lensing-ish dark ring just inside it
    float limb = pow(1.0 - ndv, 5.0);
    float dark = smoothstep(0.30, 0.62, ndv) * (1.0 - smoothstep(0.62, 0.95, ndv));
    a = (limb * 1.5 + boil * 0.28 * fres) * uLevel;
    k = 1.0 - dark * 0.55;
  } else {
    a = (0.55 + boil * 0.65) * (0.35 + ndv * 0.85) * uLevel;
    k = 1.0;
  }
  if (a < 0.004) discard;
  vec3 col = mix(uColor, vec3(1.0), pow(clamp(a, 0.0, 1.0), 1.6)) * k;
  gl_FragColor = vec4(col * a, a);
}
`;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();

export class ChargeOrb {
  constructor({ color = 0xffc94a, arcs = 5, arcSegs = 12 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'fx.charge';
    this.group.visible = false;

    const geo = new THREE.IcosahedronGeometry(1, 3);
    this.geometry = geo;

    const mk = (shell) => new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uLevel: { value: 0 },
        uColor: { value: new THREE.Color(color) }, uShell: { value: shell },
      },
      vertexShader: ORB_VERT, fragmentShader: ORB_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    });

    this.coreMat = mk(0);
    this.shellMat = mk(1);
    this.core = new THREE.Mesh(geo, this.coreMat);
    this.shell = new THREE.Mesh(geo, this.shellMat);
    this.core.renderOrder = 13;
    this.shell.renderOrder = 14;
    this.core.frustumCulled = false;
    this.shell.frustumCulled = false;
    this.group.add(this.core, this.shell);

    this.arcs = new RibbonBank(arcs, arcSegs, { blend: 'add', renderOrder: 15, fadePow: 0.25 });
    this.arcs.mesh.visible = false;
    this.nArcs = arcs;
    this.arcSegs = arcSegs;
    this.color = new THREE.Color(color);

    this.level = 0;
    this.time = 0;
    this._tick = 0;
    this.pos = new THREE.Vector3();
    this.radius = 0;
  }

  get meshes() { return [this.group, this.arcs.mesh]; }

  /** @param level 0..1 charge, 0 hides everything. */
  update(dt, pos, level, radius) {
    this.time += dt;
    this.level = level;
    this.pos.copy(pos);
    this.radius = radius;

    const on = level > 0.01;
    this.group.visible = on;
    this.arcs.mesh.visible = on;
    if (!on) {
      for (const rb of this.arcs.ribbons) rb.active = false;
      return;
    }

    this.coreMat.uniforms.uTime.value = this.time;
    this.shellMat.uniforms.uTime.value = this.time;
    this.coreMat.uniforms.uLevel.value = level;
    this.shellMat.uniforms.uLevel.value = level;

    this.group.position.copy(pos);
    this.core.scale.setScalar(radius * (0.72 + 0.06 * Math.sin(this.time * 34)));
    this.shell.scale.setScalar(radius * (1.0 + 0.05 * Math.sin(this.time * 21 + 1.3)));

    // arcs re-roll on a coarse tick so they crackle instead of shimmering
    this._tick = Math.floor(this.time * 24);
    const segs = this.arcSegs;
    for (let j = 0; j < this.nArcs; j++) {
      const rb = this.arcs.ribbons[j];
      rb.active = true;
      rb.width0 = radius * 0.16;
      rb.width1 = radius * 0.05;
      rb.alpha = level * (0.55 + 0.45 * hash(this._tick * 71 + j * 13));
      rb.col.copy(this.color).multiplyScalar(2.4);
      rb.colTail.setRGB(1, 1, 1).multiplyScalar(1.4);

      const s = this._tick * 977 + j * 131;
      const th0 = hash(s) * Math.PI * 2, ph0 = Math.acos(hash(s + 1) * 2 - 1);
      const th1 = hash(s + 2) * Math.PI * 2, ph1 = Math.acos(hash(s + 3) * 2 - 1);
      _a.set(Math.sin(ph0) * Math.cos(th0), Math.sin(ph0) * Math.sin(th0), Math.cos(ph0));
      _b.set(Math.sin(ph1) * Math.cos(th1), Math.sin(ph1) * Math.sin(th1), Math.cos(ph1));

      rb.n = segs + 1;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        _t.copy(_a).lerp(_b, t);
        if (_t.lengthSq() < 1e-6) _t.copy(_a);
        _t.normalize();
        // jagged displacement, zero at both anchors so the arc stays attached
        const w = Math.sin(Math.PI * t);
        const h1 = hash(s + 17 + k * 7) - 0.5;
        const h2 = hash(s + 53 + k * 11) - 0.5;
        const h3 = hash(s + 91 + k * 5) - 0.5;
        _n.set(h1, h2, h3).multiplyScalar(w * 0.55);
        _t.add(_n).multiplyScalar(radius * (1.06 + w * 0.30 * hash(s + 200 + k)));
        rb.pts[k * 3] = pos.x + _t.x;
        rb.pts[k * 3 + 1] = pos.y + _t.y;
        rb.pts[k * 3 + 2] = pos.z + _t.z;
      }
    }
    this.arcs.commit();
  }

  setFog(color, density) { this.arcs.setFog(color, density); }

  dispose() {
    this.geometry.dispose();
    this.coreMat.dispose();
    this.shellMat.dispose();
    this.arcs.dispose();
  }
}
