import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Ribbon trails — engine plumes, wingtip vortices, water wake.
//
// A whole bank of ribbons lives in ONE BufferGeometry with a static index
// buffer, so N trails cost one draw call. Each ribbon keeps a ring of world
// points; every frame the strip is re-ruled against the camera so the ribbon
// always presents its face (a trail built from a fixed world-space normal
// disappears edge-on, which is exactly when you are looking down the barrel of
// the thing that is trailing).
//
// Dead ribbons collapse their vertices to a point rather than being removed —
// no index rebuilds, no re-upload of topology.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
precision highp float;
attribute float aAlong;   // 0 at head, 1 at tail
attribute float aFade;    // per-vertex master alpha
attribute vec3  aCol;
varying float vAlong;
varying float vAcross;
varying float vFade;
varying vec3  vCol;
varying float vDepth;
void main() {
  vAlong = aAlong;
  vAcross = uv.y;
  vFade = aFade;
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
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

const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _toEye = new THREE.Vector3();

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
    this.uv = new Float32Array(total * 2);
    this.along = new Float32Array(total);
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

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setAttribute('aAlong', new THREE.BufferAttribute(this.along, 1));
    g.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    // static per-vertex uv / along
    for (let r = 0; r < count; r++) {
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        for (let e = 0; e < 2; e++) {
          const v = r * vpr + s * 2 + e;
          this.uv[v * 2] = t; this.uv[v * 2 + 1] = e;
          this.along[v] = t;
        }
      }
    }

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

  /** Rebuild every active ribbon's strip against the camera. */
  build(camPos) {
    const { segs, vpr } = this;
    for (let r = 0; r < this.count; r++) {
      const rb = this.ribbons[r];
      const base = r * vpr;
      if (!rb.active || rb.n === 0) {
        for (let v = base; v < base + vpr; v++) this.fade[v] = 0;
        continue;
      }
      const p = rb.pts;
      for (let s = 0; s <= segs; s++) {
        const i3 = s * 3;
        const x = p[i3], y = p[i3 + 1], z = p[i3 + 2];
        // tangent from the neighbouring samples
        const a3 = Math.max(0, s - 1) * 3;
        const b3 = Math.min(segs, s + 1) * 3;
        _dir.set(p[a3] - p[b3], p[a3 + 1] - p[b3 + 1], p[a3 + 2] - p[b3 + 2]);
        if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
        _dir.normalize();
        _toEye.set(camPos.x - x, camPos.y - y, camPos.z - z).normalize();
        _side.crossVectors(_dir, _toEye);
        if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0); else _side.normalize();

        const t = s / segs;
        const w = THREE.MathUtils.lerp(rb.width0, rb.width1, t) * (1 - t * t * t * t) * 0.5;
        const cr = THREE.MathUtils.lerp(rb.col.r, rb.colTail.r, t);
        const cg = THREE.MathUtils.lerp(rb.col.g, rb.colTail.g, t);
        const cb = THREE.MathUtils.lerp(rb.col.b, rb.colTail.b, t);

        for (let e = 0; e < 2; e++) {
          const v = base + s * 2 + e;
          const sgn = e === 0 ? -1 : 1;
          this.pos[v * 3] = x + _side.x * w * sgn;
          this.pos[v * 3 + 1] = y + _side.y * w * sgn;
          this.pos[v * 3 + 2] = z + _side.z * w * sgn;
          this.fade[v] = rb.alpha;
          this.col[v * 3] = cr; this.col[v * 3 + 1] = cg; this.col[v * 3 + 2] = cb;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aFade.needsUpdate = true;
    this.geometry.attributes.aCol.needsUpdate = true;
  }

  setFog(color, density) {
    this.material.uniforms.uFogColor.value.copy(color);
    this.material.uniforms.uFogDensity.value = density;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
