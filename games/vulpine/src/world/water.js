import * as THREE from 'three';
import { WORLD, centrelineX } from './profile.js';

// ─────────────────────────────────────────────────────────────────────────────
// The river and the sea are one surface at y = 0.
//
// Like the terrain, the mesh is rail-aligned and graded: nine-metre quads down
// the channel where the player can see individual waves, hundreds of metres out
// at sea. That keeps detail where the camera is without the surface having to
// chase it — a camera-following grid was the first attempt and it put the
// waterline in the wrong place the moment anything but the chase camera was
// live. Under everything sits one enormous flat apron so the horizon is never
// a hole.
//
// The mesh only carries swell (73 m and up). Chop shorter than four quads is
// aliasing, so it lives in the scrolling normal maps instead.
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK = 480;
const ROW = 12;
const LOD_STEPS = [1, 2, 4];
const LOD_DIST = [900, 2400];

function wSpacing(d) { return 9 * (1 + d / 220); }

function columns() {
  const half = [0];
  let d = 0;
  while (d < 4200) { d += wSpacing(d); half.push(d); }
  while ((half.length - 1) % 4 !== 0) half.push(half[half.length - 1] + 900);
  const us = [];
  for (let i = half.length - 1; i > 0; i--) us.push(-half[i]);
  for (const v of half) us.push(v);
  return us;
}

export class Water {
  constructor(root, material, deepMaterial) {
    this.group = new THREE.Group();
    this.group.name = 'water';
    root.add(this.group);
    this.chunks = [];

    const us = columns();
    const rows = CHUNK / ROW + 1;
    const n = Math.ceil((WORLD.zStart - WORLD.zEnd) / CHUNK);

    for (let c = 0; c < n; c++) {
      const z0 = WORLD.zStart - c * CHUNK;
      const { geos, origin } = this._strip(us, z0, rows);
      const meshes = geos.map((g, li) => {
        const m = new THREE.Mesh(g, material);
        m.position.copy(origin);
        m.receiveShadow = false;
        m.castShadow = false;
        m.visible = li === 0;
        m.name = `water-${c}-lod${li}`;
        this.group.add(m);
        return m;
      });
      this.chunks.push({ meshes, zMid: z0 - CHUNK * 0.5, xMid: origin.x, lod: 0 });
    }

    // Open ocean under the whole level. Sits slightly below the detailed
    // surface so the two never fight for the depth buffer where they overlap.
    const apron = new THREE.CircleGeometry(42000, 72);
    apron.rotateX(-Math.PI / 2);
    this.apron = new THREE.Mesh(apron, deepMaterial);
    this.apron.position.set(0, WORLD.waterLevel - 2.5, (WORLD.zStart + WORLD.zEnd) * 0.5);
    this.apron.frustumCulled = false;
    this.apron.renderOrder = -5;
    this.group.add(this.apron);
  }

  _strip(us, z0, rows) {
    const cols = us.length;
    const pos = new Float32Array(cols * rows * 3);
    const nrm = new Float32Array(cols * rows * 3);
    const uv = new Float32Array(cols * rows * 2);
    const cxMid = centrelineX(z0 - (rows - 1) * ROW * 0.5);
    let minX = Infinity, maxX = -Infinity;

    for (let j = 0; j < rows; j++) {
      const z = z0 - j * ROW;
      const cx = centrelineX(z);
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const lx = cx + us[i] - cxMid;
        pos[k * 3] = lx; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = z - z0;
        nrm[k * 3 + 1] = 1;
        uv[k * 2] = us[i] * 0.01; uv[k * 2 + 1] = z * 0.01;
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
      }
    }

    const posAttr = new THREE.BufferAttribute(pos, 3);
    const nrmAttr = new THREE.BufferAttribute(nrm, 3);
    const uvAttr = new THREE.BufferAttribute(uv, 2);
    const last = rows - 1;
    const geos = [];

    for (const s of LOD_STEPS) {
      const idx = [];
      const j0 = s === 1 ? 0 : s;
      const j1 = s === 1 ? last : last - s;
      for (let j = j0; j + s <= j1; j += s) {
        for (let i = 0; i + s <= cols - 1; i += s) {
          const a = j * cols + i, b = a + s, c = (j + s) * cols + i, d = c + s;
          idx.push(a, c, b, b, c, d);
        }
      }
      if (s > 1) {
        for (let i = 0; i + s <= cols - 1; i += s) {
          const A = j0 * cols + i, B = j0 * cols + i + s;
          for (let k = i; k < i + s; k++) idx.push(k, A, k + 1);
          idx.push(i + s, A, B);
          const C = j1 * cols + i, D = j1 * cols + i + s;
          const f = last * cols;
          for (let k = i; k < i + s; k++) idx.push(C, f + k, f + k + 1);
          idx.push(C, f + i + s, D);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', posAttr);
      g.setAttribute('normal', nrmAttr);
      g.setAttribute('uv', uvAttr);
      g.setIndex(idx);
      g.boundingSphere = new THREE.Sphere(
        new THREE.Vector3((minX + maxX) * 0.5, 0, -(rows - 1) * ROW * 0.5),
        Math.hypot(maxX - minX, (rows - 1) * ROW) * 0.5 + 30,
      );
      geos.push(g);
    }
    return { geos, origin: new THREE.Vector3(cxMid, WORLD.waterLevel, z0) };
  }

  updateLOD(camPos) {
    for (const c of this.chunks) {
      const d = Math.hypot(camPos.x - c.xMid, camPos.z - c.zMid);
      const want = d > LOD_DIST[1] ? 2 : d > LOD_DIST[0] ? 1 : 0;
      if (want === c.lod) continue;
      c.meshes[c.lod].visible = false;
      c.meshes[want].visible = true;
      c.lod = want;
    }
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}
