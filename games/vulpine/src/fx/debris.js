import * as THREE from 'three';
import { Mat } from '../render/materials.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tumbling debris.
//
// The one place in this subsystem where per-object CPU work is the right call:
// a chunk of hull needs a real orientation integrated over time (a billboard
// cannot tumble), it needs to catch the scene's key light so it reads as solid
// matter rather than as another additive smear, and it needs to leave a trail
// behind its actual path. Counts stay in the dozens, so it costs microseconds.
//
// One InstancedMesh, one draw call, one shadow-free PBR material. Dead slots
// are scaled to zero rather than removed.
// ─────────────────────────────────────────────────────────────────────────────

/** An angular hull fragment — flat facets, no smooth shading, sharp silhouette. */
function chunkGeometry(rand) {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let d = seen.get(key);
    if (!d) {
      d = [rand() * 0.9 + 0.35, rand() * 0.9 + 0.35, rand() * 0.9 + 0.35];
      seen.set(key, d);
    }
    p.setXYZ(i, p.getX(i) * d[0], p.getY(i) * d[1] * 1.35, p.getZ(i) * d[2] * 0.7);
  }
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class DebrisField {
  /**
   * @param {number} capacity
   * @param {(x,y,z,vx,vy,vz,heat,seed)=>void} onTrail called at a fixed cadence
   *        along each chunk's path — the owner decides what the trail looks like.
   */
  constructor(capacity = 56, rand = Math.random, onTrail = null) {
    this.capacity = capacity;
    this.onTrail = onTrail;
    this._next = 0;
    this.live = 0;

    const geo = chunkGeometry(rand);
    const src = Mat.hullDark;
    const mat = new THREE.MeshStandardMaterial({
      map: src?.map || null,
      normalMap: src?.normalMap || null,
      roughnessMap: src?.roughnessMap || null,
      color: 0x6a6862,
      roughness: 0.72, metalness: 0.85,
      emissive: new THREE.Color(0xff5a1c),
      emissiveIntensity: 0.55,
      envMapIntensity: 0.9,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = 'fx.debris';
    this.geometry = geo;
    this.material = mat;

    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity * 3);   // axis * rate
    this.quat = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.trailT = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
    this.clear();
  }

  clear() {
    this.life.fill(0);
    this.live = 0;
    this._next = 0;
    for (let i = 0; i < this.capacity; i++) {
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x, y, z, vx, vy, vz, opts = {}) {
    const i = this._next;
    this._next = (this._next + 1) % this.capacity;
    const {
      life = 2.4, sx = 0.4, sy = 0.4, sz = 0.4,
      spinX = 4, spinY = 6, spinZ = 3, drag = 0.55, seed = 0,
    } = opts;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.spin[i * 3] = spinX; this.spin[i * 3 + 1] = spinY; this.spin[i * 3 + 2] = spinZ;
    this.size[i * 3] = sx; this.size[i * 3 + 1] = sy; this.size[i * 3 + 2] = sz;
    this.quat[i * 4] = 0; this.quat[i * 4 + 1] = 0; this.quat[i * 4 + 2] = 0; this.quat[i * 4 + 3] = 1;
    this.life[i] = life;
    this.age[i] = 0;
    this.drag[i] = drag;
    this.trailT[i] = 0;
    this.seed[i] = seed;
    return i;
  }

  update(dt, gravity = 22, trailStep = 0.028) {
    let live = 0;
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      const L = this.life[i];
      if (L <= 0) continue;
      const t = (this.age[i] += dt);
      if (t >= L) {
        this.life[i] = 0;
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        dirty = true;
        continue;
      }
      live++;
      const u = t / L;
      const i3 = i * 3;

      // exponential drag + gravity, integrated semi-implicitly
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - gravity * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      // tumble: integrate the body quaternion by the spin vector
      const wx = this.spin[i3] * dt, wy = this.spin[i3 + 1] * dt, wz = this.spin[i3 + 2] * dt;
      const wl = Math.hypot(wx, wy, wz);
      if (wl > 1e-6) {
        _dq.setFromAxisAngle(_p.set(wx / wl, wy / wl, wz / wl), wl);
        _q.set(this.quat[i * 4], this.quat[i * 4 + 1], this.quat[i * 4 + 2], this.quat[i * 4 + 3]);
        _q.premultiply(_dq).normalize();
        this.quat[i * 4] = _q.x; this.quat[i * 4 + 1] = _q.y;
        this.quat[i * 4 + 2] = _q.z; this.quat[i * 4 + 3] = _q.w;
      } else {
        _q.set(this.quat[i * 4], this.quat[i * 4 + 1], this.quat[i * 4 + 2], this.quat[i * 4 + 3]);
      }

      const shrink = 1 - Math.pow(Math.max(0, (u - 0.72) / 0.28), 2);
      _p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      _s.set(this.size[i3], this.size[i3 + 1], this.size[i3 + 2]).multiplyScalar(Math.max(0, shrink));
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      dirty = true;

      if (this.onTrail) {
        this.trailT[i] += dt;
        if (this.trailT[i] >= trailStep) {
          this.trailT[i] = 0;
          this.onTrail(
            this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2],
            this.vel[i3], this.vel[i3 + 1], this.vel[i3 + 2],
            Math.max(0, 1 - u * 1.35), this.seed[i],
          );
        }
      }
    }
    this.live = live;
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); this.mesh.dispose(); }
}
