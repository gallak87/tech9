import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Ribbon trails — engine plumes, wingtip vortices, water wake, arc electricity.
//
// A whole bank of ribbons lives in ONE BufferGeometry with a static index
// buffer, so N trails cost one draw call.
//
// The strip is ruled **in the vertex shader**, not on the CPU: each vertex
// carries the centreline point, the path tangent and a ±1 side flag, and the
// shader offsets it along `cross(tangent, toEye)`. That matters for two
// reasons. A ribbon built from a fixed world-space normal vanishes edge-on —
// which is exactly when you are looking down the barrel of the thing that is
// trailing. And a ribbon ruled on the CPU is only correct for the camera it was
// ruled against, so it goes wrong the moment a review shot freezes the sim and
// flies the camera somewhere else.
//
// Dead ribbons collapse their vertices to a point rather than being removed —
// no index rebuilds, no re-upload of topology.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
precision highp float;
attribute vec3  aTan;
attribute float aSide;    // -1 / +1
attribute float aAlong;   // 0 at head, 1 at tail
attribute float aWidth;
attribute float aFade;
attribute vec3  aCol;
varying float vAlong;
varying float vAcross;
varying float vFade;
varying vec3  vCol;
varying float vDepth;
void main() {
  vec3 toEye = cameraPosition - position;
  float el = length(toEye);
  toEye = el > 1e-5 ? toEye / el : vec3(0.0, 0.0, 1.0);
  vec3 t = aTan;
  float tl = length(t);
  t = tl > 1e-5 ? t / tl : vec3(0.0, 0.0, 1.0);
  vec3 side = cross(t, toEye);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);

  vec3 p = position + side * (aSide * aWidth);
  vAlong = aAlong;
  vAcross = aSide * 0.5 + 0.5;
  vFade = aFade;
  vCol = aCol;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform float uFadePow;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uAlphaBlend;   // 1 = normal blending (needs fog tint)
varying float vAlong;
varying float vAcross;
varying float vFade;
varying vec3  vCol;
varying float vDepth;
void main() {
  float across = pow(max(0.0, 1.0 - abs(vAcross * 2.0 - 1.0)), 1.55);
  float along = pow(max(0.0, 1.0 - vAlong), uFadePow);
  float a = across * along * vFade;
  if (a < 0.003) discard;
  float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  vec3 c = mix(uFogColor, vCol, mix(1.0, clamp(fog, 0.0, 1.0), uAlphaBlend));
  gl_FragColor = vec4(c * mix(fog, 1.0, uAlphaBlend), a);
}
`;

class Ribbon {
  constructor(bank, index, segs) {
    this.bank = bank;
    this.index = index;
    this.segs = segs;
    this.pts = new Float32Array((segs + 1) * 3);
    this.n = 0;
    this.active = false;
    this.width0 = 0.5;
    this.width1 = 0.15;
    this.alpha = 1;
    this.taper = 4;             // exponent on the tail width falloff
    this.col = new THREE.Color(1, 1, 1);
    this.colTail = new THREE.Color(1, 1, 1);
  }

  reset(x, y, z) {
    for (let i = 0; i <= this.segs; i++) {
      this.pts[i * 3] = x; this.pts[i * 3 + 1] = y; this.pts[i * 3 + 2] = z;
    }
    this.n = this.segs + 1;
  }

  /** Push a new head point; the tail falls off the end. */
  push(x, y, z) {
    const p = this.pts;
    if (this.n === 0) { this.reset(x, y, z); return; }
    p.copyWithin(3, 0, this.segs * 3);
    p[0] = x; p[1] = y; p[2] = z;
  }

  /** Decay a parked ribbon toward its head so it retracts instead of popping. */
  collapse() {
    const p = this.pts;
    p.copyWithin(3, 0, this.segs * 3);
  }
}

export class RibbonBank {
  constructor(count, segs, { blend = 'add', renderOrder = 9, fadePow = 1.4 } = {}) {
    this.count = count;
    this.segs = segs;
    this.ribbons = [];
    const vpr = (segs + 1) * 2;            // vertices per ribbon
    this.vpr = vpr;
    const total = count * vpr;

    this.pos = new Float32Array(total * 3);
    this.tan = new Float32Array(total * 3);
    this.sideA = new Float32Array(total);
    this.along = new Float32Array(total);
    this.wid = new Float32Array(total);
    this.fade = new Float32Array(total);
    this.col = new Float32Array(total * 3);

    const idx = new Uint32Array(count * segs * 6);
    let o = 0;
    for (let r = 0; r < count; r++) {
      const base = r * vpr;
      for (let s = 0; s < segs; s++) {
        const a = base + s * 2, b = a + 1, c = a + 2, d = a + 3;
        idx[o++] = a; idx[o++] = b; idx[o++] = c;
        idx[o++] = b; idx[o++] = d; idx[o++] = c;
      }
      this.ribbons.push(new Ribbon(this, r, segs));
    }

    // static per-vertex side / along
    for (let r = 0; r < count; r++) {
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        for (let e = 0; e < 2; e++) {
          const v = r * vpr + s * 2 + e;
          this.sideA[v] = e === 0 ? -1 : 1;
          this.along[v] = t;
        }
      }
    }

    const g = new THREE.BufferGeometry();
    const dyn = (arr, size) => new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(this.pos, 3));
    g.setAttribute('aTan', dyn(this.tan, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(this.sideA, 1));
    g.setAttribute('aAlong', new THREE.BufferAttribute(this.along, 1));
    g.setAttribute('aWidth', dyn(this.wid, 1));
    g.setAttribute('aFade', dyn(this.fade, 1));
    g.setAttribute('aCol', dyn(this.col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uFadePow: { value: fadePow },
        uFogColor: { value: new THREE.Color(0x93b7dc) },
        uFogDensity: { value: 0.00042 },
        uAlphaBlend: { value: blend === 'add' ? 0 : 1 },
      },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    });

    this.geometry = g;
    this.material = mat;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fx.ribbons.' + blend;
  }

  /** Push every active ribbon's centreline into the buffers. Camera-agnostic. */
  commit() {
    const { segs, vpr } = this;
    for (let r = 0; r < this.count; r++) {
      const rb = this.ribbons[r];
      const base = r * vpr;
      if (!rb.active || rb.n === 0 || rb.alpha <= 0) {
        for (let v = base; v < base + vpr; v++) this.fade[v] = 0;
        continue;
      }
      const p = rb.pts;
      for (let s = 0; s <= segs; s++) {
        const i3 = s * 3;
        const x = p[i3], y = p[i3 + 1], z = p[i3 + 2];
        const a3 = Math.max(0, s - 1) * 3;
        const b3 = Math.min(segs, s + 1) * 3;
        let tx = p[a3] - p[b3], ty = p[a3 + 1] - p[b3 + 1], tz = p[a3 + 2] - p[b3 + 2];
        if (tx * tx + ty * ty + tz * tz < 1e-10) { tx = 0; ty = 0; tz = 1; }

        const t = s / segs;
        const w = THREE.MathUtils.lerp(rb.width0, rb.width1, t) * (1 - Math.pow(t, rb.taper)) * 0.5;
        const cr = THREE.MathUtils.lerp(rb.col.r, rb.colTail.r, t);
        const cg = THREE.MathUtils.lerp(rb.col.g, rb.colTail.g, t);
        const cb = THREE.MathUtils.lerp(rb.col.b, rb.colTail.b, t);

        for (let e = 0; e < 2; e++) {
          const v = base + s * 2 + e;
          this.pos[v * 3] = x; this.pos[v * 3 + 1] = y; this.pos[v * 3 + 2] = z;
          this.tan[v * 3] = tx; this.tan[v * 3 + 1] = ty; this.tan[v * 3 + 2] = tz;
          this.wid[v] = w;
          this.fade[v] = rb.alpha;
          this.col[v * 3] = cr; this.col[v * 3 + 1] = cg; this.col[v * 3 + 2] = cb;
        }
      }
    }
    const at = this.geometry.attributes;
    at.position.needsUpdate = true;
    at.aTan.needsUpdate = true;
    at.aWidth.needsUpdate = true;
    at.aFade.needsUpdate = true;
    at.aCol.needsUpdate = true;
  }

  clear() {
    for (const rb of this.ribbons) { rb.active = false; rb.n = 0; }
    this.fade.fill(0);
    this.geometry.attributes.aFade.needsUpdate = true;
  }

  setFog(color, density) {
    this.material.uniforms.uFogColor.value.copy(color);
    this.material.uniforms.uFogDensity.value = density;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
