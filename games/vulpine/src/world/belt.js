import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { WORLD, centrelineX, centrelineY } from './profile.js';

// ─────────────────────────────────────────────────────────────────────────────
// The `field` backend — a world made of discrete bodies instead of a
// heightfield.
//
// This exists because the corridor generator has exactly one composition in it:
// ground below, walls either side, sky above. Every parameter in a DNA changes
// the *size* of that composition and none of them change the composition, which
// is why two levels built from it read as the same place no matter how far
// apart their numbers are. A belt is the cheapest thing that is genuinely not
// that — the frame is rock, gap, stars, rock, in every direction including
// overhead, and the single-valued heightfield can never produce an overhead.
//
// ── What it has to provide ───────────────────────────────────────────────────
// Nothing outside src/world/ knows what a world is made of. It asks for a rail
// (`centrelineX`/`centrelineY`, unchanged here) and a floor (`groundAt`, which
// is -Infinity in a belt because there is no floor). That is the entire
// contract, which is why this backend needs no changes in flight, combat, ai,
// the camera, the HUD or the campaign.
//
// ── Why merged chunks and not InstancedMesh ──────────────────────────────────
// Two reasons, and the first is measured. Draw count is 7% of frame time
// (PLAN-PERF.md), so instancing buys nothing on the axis that matters. The
// second is correctness: `rockPropMaterial` is triplanar in *world* space, and
// its `vWPos` comes from `modelMatrix * transformed` with no `instanceMatrix`
// term — under instancing every rock would sample the same patch of texture in
// the same orientation, and the grain would swim as the rock tumbled. Baking
// each rock's transform into a merged chunk makes `vWPos` a genuine world
// position and the triplanar mapping correct for free.
//
// ── The clear tube ───────────────────────────────────────────────────────────
// There is no collision here: with no heightfield there is nothing for the
// ground clamp to clamp against, and a per-tick nearest-body query on a few
// thousand rocks is not something the flight model should be paying for. So the
// belt is authored around a tube the player cannot leave anyway — the offset
// box is ±105 lateral and +78/−46 vertical — and no body is placed inside it.
// You thread the gaps because the gaps are where you already are.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Icosahedron subdivision per size tier: 80 / 320 / 1280 triangles. Subdiv 0 is
 * 20 faces and its limb is visibly a polygon from anywhere in the corridor,
 * which is the one artefact that reads as "unfinished" rather than as "distant".
 */
const LODS = [1, 2, 3];

/**
 * Value noise on R³. `textures.js` only offers 2D, and displacing a sphere from
 * a 2D field means parameterising it — which puts a seam down one meridian and
 * a pinch at both poles, on the one shape where the silhouette is the product.
 * A 256-entry permutation is enough for a body whose features are a tenth of
 * its radius, and it costs one table per belt rather than one per rock.
 */
function noise3D(rng, octaves = 4, gain = 0.52) {
  const P = new Uint8Array(512);
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const t = P[i]; P[i] = P[j]; P[j] = t;
  }
  for (let i = 0; i < 256; i++) P[256 + i] = P[i];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const val = (x, y, z) => (P[(P[(P[x & 255] + y) & 255] + z) & 255]) * (1 / 255);

  const one = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    let a = 0;
    for (let k = 0; k < 2; k++) {
      const wz = k ? w : 1 - w;
      for (let j = 0; j < 2; j++) {
        const wy = j ? v : 1 - v;
        for (let i = 0; i < 2; i++) a += val(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * wy * wz;
      }
    }
    return a;
  };

  return (x, y, z) => {
    let s = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      s += one(x * f, y * f, z * f) * amp;
      norm += amp; amp *= gain; f *= 2;
    }
    return s / norm;
  };
}

/**
 * One asteroid, as a unit-radius displaced icosahedron.
 *
 * Real asteroids are not spheres with noise on them — they are angular, with
 * flat conchoidal faces and one or two craters that are a large fraction of the
 * body. A pure fbm displacement gives a potato, and a field of potatoes reads
 * as a field of clouds. So the radius is fbm *plus* a few spherical-cap bites,
 * which is what puts hard shadowed edges in the silhouette.
 */
function bodyGeo(rng, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const noise = noise3D(rng);

  // Craters: a direction, an angular radius and a depth.
  const nc = 2 + (rng.next() * 3 | 0);
  const craters = [];
  for (let i = 0; i < nc; i++) {
    const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
    if (d.lengthSq() < 1e-6) d.set(1, 0, 0);
    craters.push({ d: d.normalize(), c: Math.cos(rng.range(0.30, 0.72)), k: rng.range(0.16, 0.34) });
  }
  // Anisotropy: bodies this size are not round, they are lumps with a long axis.
  const ax = new THREE.Vector3(rng.range(0.70, 1.0), rng.range(0.58, 0.92), rng.range(0.74, 1.0));

  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 0.80 + noise(v.x * 1.7 + 3.1, v.y * 1.7 + 7.4, v.z * 1.7 + 1.9) * 0.46;
    for (const c of craters) {
      const dot = v.dot(c.d);
      if (dot > c.c) {
        // Smooth rim, flat floor: a crater is a cap removed, not a dent.
        const t = (dot - c.c) / (1 - c.c);
        r -= c.k * t * t * (3 - 2 * t);
      }
    }
    pos.setXYZ(i, v.x * r * ax.x, v.y * r * ax.y, v.z * r * ax.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A belt around the rail.
 *
 * Constructing this meshes nothing — like `Terrain`, it plans its chunks and
 * hands back a job queue, so the whole build cost is known before the first
 * frame of a swap and the campaign hop can spend a per-frame budget on it.
 */
export class Belt {
  constructor(root, material) {
    this.root = new THREE.Group();
    this.root.name = 'belt';
    root.add(this.root);
    this.material = material;
    this.jobs = [];
    this._chunks = [];

    const B = { ...DEFAULT_BELT, ...(WORLD.belt || {}) };
    this.cfg = B;

    // Shape library, shared by every chunk and every tier. Built once here
    // because a fresh displaced icosahedron per rock would be most of the build.
    // Each shape gets its own stream so a tier can be re-cut without moving the
    // others, the way the island draw order is part of the seed contract.
    this._shapes = LODS.map(d => {
      const set = [];
      for (let i = 0; i < B.shapes; i++) set.push(bodyGeo(new RNG(`${WORLD.id}:shape-${i}`), d));
      return set;
    });

    const n = Math.max(1, Math.ceil((WORLD.zStart - WORLD.zEnd) / B.chunkLen));
    for (let c = 0; c < n; c++) this.jobs.push(() => this._chunk(c));
  }

  /**
   * One slab of belt. Bodies are drawn in a fixed order from a per-chunk stream
   * so the field is identical run to run — the same seed contract the islands
   * are under (`profile.js:buildIslands`).
   */
  _chunk(ci) {
    const B = this.cfg;
    const z0 = WORLD.zStart - ci * B.chunkLen;
    const z1 = Math.max(WORLD.zEnd, z0 - B.chunkLen);
    const r = new RNG(`${WORLD.id}:belt-${ci}`);

    const near = [], far = [];
    for (let i = 0; i < B.perChunk; i++) {
      const z = r.range(z0, z1);
      // Direction around the tube. Uniform in angle, so the belt has a ceiling
      // as reliably as it has a floor — the whole point of the backend.
      const a = r.range(0, Math.PI * 2);
      // Radius: biased outward so the near wall is sparse and the mass is
      // beyond it. `Math.sqrt` would give uniform area density; the extra power
      // opens the flight tube out without emptying the distance.
      const q = Math.pow(r.next(), 0.62);
      const d = B.clear + q * (B.radius - B.clear);
      const rad = r.range(B.size[0], B.size[1]) * (0.55 + 0.85 * q);

      const m = new THREE.Matrix4();
      const rot = new THREE.Euler(r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28));
      m.compose(
        new THREE.Vector3(centrelineX(z) + Math.cos(a) * d, centrelineY(z) + Math.sin(a) * d * B.flatten, z),
        new THREE.Quaternion().setFromEuler(rot),
        new THREE.Vector3(rad, rad, rad),
      );
      // Detail follows body size, not camera distance: a 12 m pebble at detail 2
      // is 320 triangles nobody can resolve, and a 90 m body at detail 0 has a
      // visibly faceted limb from anywhere in the corridor.
      const lod = rad > B.size[1] * 0.50 ? 2 : rad > B.size[1] * 0.24 ? 1 : 0;
      (d < B.nearHalf ? near : far).push({ m, g: this._shapes[lod][i % B.shapes] });
    }

    if (near.length) this._chunks.push(this._merge(near, z0, true));
    if (far.length) this._chunks.push(this._merge(far, z0, false));
  }

  /** Bake a list of transformed bodies into one geometry and one draw call. */
  _merge(list, z0, isNear) {
    let nv = 0, ni = 0;
    for (const b of list) {
      nv += b.g.attributes.position.count;
      ni += b.g.index ? b.g.index.count : b.g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3);
    const nrm = new Float32Array(nv * 3);
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();

    for (const b of list) {
      const bp = b.g.attributes.position, bn = b.g.attributes.normal;
      const bi = b.g.index;
      nm.getNormalMatrix(b.m);
      for (let i = 0; i < bp.count; i++) {
        v.fromBufferAttribute(bp, i).applyMatrix4(b.m);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(bn, i).applyMatrix3(nm).normalize();
        nrm[(vo + i) * 3] = v.x; nrm[(vo + i) * 3 + 1] = v.y; nrm[(vo + i) * 3 + 2] = v.z;
      }
      if (bi) for (let i = 0; i < bi.count; i++) idx[io + i] = bi.getX(i) + vo;
      else for (let i = 0; i < bp.count; i++) idx[io + i] = i + vo;
      vo += bp.count;
      io += bi ? bi.count : bp.count;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();

    const mesh = new THREE.Mesh(g, this.material);
    mesh.castShadow = isNear;
    mesh.receiveShadow = isNear;
    mesh.userData.z = z0;
    mesh.userData.near = isNear;
    this.root.add(mesh);
    return mesh;
  }

  /**
   * Distance culling. The far slabs are the skyline of this world, so they are
   * kept much longer than the near ones — dropping them punches holes in the
   * starfield that read as missing geometry rather than as distance.
   */
  updateLOD(camPos) {
    const B = this.cfg;
    for (const m of this._chunks) {
      const d = Math.abs(m.userData.z - camPos.z);
      m.visible = d < (m.userData.near ? B.nearFade : B.farFade);
    }
  }

  dispose() {
    for (const m of this._chunks) m.geometry.dispose();
    this._chunks.length = 0;
    for (const set of this._shapes) for (const g of set) g.dispose();
    this._shapes.length = 0;
    this.root.parent?.remove(this.root);
    this.jobs = [];
  }
}

/** Belt shape, overridable per DNA via `belt: {…}`. */
const DEFAULT_BELT = {
  chunkLen: 620,
  perChunk: 46,
  /** No body inside this radius of the rail: the flight box is ±105 / +78−46. */
  clear: 150,
  radius: 1500,
  /** Bodies closer than this are the near tier — shadowed, and culled sooner. */
  nearHalf: 520,
  /** Squash the tube vertically so the belt reads as a plane you fly through. */
  flatten: 0.62,
  size: [14, 105],
  shapes: 7,
  nearFade: 3200,
  farFade: 7000,
};
