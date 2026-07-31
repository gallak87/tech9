import * as THREE from 'three';
import {
  WORLD, spacing, smooth, clamp, centrelineX, centrelineDX,
  profileAt, heightAtU, cityWeight,
} from './profile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Terrain meshing.
//
// The grid is river-aligned: rows march down -Z, columns step sideways from the
// centreline at `spacing(d)`. That buys three things at once — the canyon walls
// stay perpendicular to the flight path however the river meanders, the tessel-
// lation is dense exactly where the player is, and the sample rate is a known
// function of distance so the height field can band-limit itself.
//
// Each chunk carries three index buffers over one shared vertex buffer (step 1,
// 2 and 4) and swaps between them by distance from the camera, plus a perimeter
// skirt that hides the sub-metre cracks an LOD switch leaves behind.
// ─────────────────────────────────────────────────────────────────────────────

const LOD_STEPS = [1, 2, 4];
const LOD_DIST = [1500, 3000];      // metres at which to drop to the next step
const SKIRT = 55;

const lerp = (a, b, t) => a + (b - a) * t;

/** Column offsets for the near tier: symmetric, dense in the middle. */
function nearColumns() {
  const half = [0];
  let d = 0;
  while (d < WORLD.nearHalf) { d += spacing(d); half.push(Math.min(d, WORLD.nearHalf)); }
  // the LOD index buffers stride by 4, so the span must divide evenly
  while ((half.length - 1) % 2 !== 0) half.push(half[half.length - 1] + spacing(WORLD.nearHalf));
  const us = [];
  for (let i = half.length - 1; i > 0; i--) us.push(-half[i]);
  for (let i = 0; i < half.length; i++) us.push(half[i]);
  return us;
}

/** Column offsets for one bank of the far tier. */
function farColumns(sign) {
  const out = [];
  let d = WORLD.nearHalf;
  while (d < WORLD.farHalf) { out.push(d); d += spacing(d) * 2.6; }
  out.push(WORLD.farHalf);
  while ((out.length - 1) % 4 !== 0) out.push(out[out.length - 1] + 600);
  return sign > 0 ? out : out.map(v => -v).reverse();
}

/* ── surface tint ─────────────────────────────────────────────────────────── */
// Multiplies the triplanar rock albedo, so these are ratios around 1, not
// colours. Anything that reads as "a different material" has to come from here
// or the whole canyon is one shade of brown.

const C_ROCK = [1.00, 0.95, 0.88];
const C_SAND = [1.45, 1.28, 0.94];
const C_SCRUB = [0.58, 0.86, 0.40];
const C_DRY = [1.16, 1.04, 0.70];
const C_PALE = [1.20, 1.18, 1.12];
const C_URBAN = [0.96, 0.96, 0.98];

function tintAt(h, ny, z, out, o) {
  const slope = 1 - ny;
  let r = C_ROCK[0], g = C_ROCK[1], b = C_ROCK[2];

  const pale = smooth(150, 430, h) * (1 - smooth(0.42, 0.72, slope));
  r = lerp(r, C_PALE[0], pale); g = lerp(g, C_PALE[1], pale); b = lerp(b, C_PALE[2], pale);

  // dry grass on the shoulders
  const dry = clamp((1 - smooth(0.26, 0.55, slope)) * smooth(14, 40, h) * (1 - smooth(190, 340, h)), 0, 1) * 0.8;
  r = lerp(r, C_DRY[0], dry); g = lerp(g, C_DRY[1], dry); b = lerp(b, C_DRY[2], dry);

  // scrub in the gullies and on the terraces
  const veg = clamp((1 - smooth(0.16, 0.40, slope)) * smooth(9, 30, h) * (1 - smooth(150, 300, h)), 0, 1);
  r = lerp(r, C_SCRUB[0], veg); g = lerp(g, C_SCRUB[1], veg); b = lerp(b, C_SCRUB[2], veg);

  // beach sand — only on the shallow ground either side of the waterline
  const sand = clamp((1 - smooth(0.10, 0.34, slope)) * (1 - smooth(3.5, 15, h)) * smooth(-9, -2.5, h), 0, 1);
  r = lerp(r, C_SAND[0], sand); g = lerp(g, C_SAND[1], sand); b = lerp(b, C_SAND[2], sand);

  const urban = cityWeight(z) * (1 - smooth(0.30, 0.60, slope)) * smooth(12, 40, h) * (1 - smooth(150, 260, h)) * 0.75;
  r = lerp(r, C_URBAN[0], urban); g = lerp(g, C_URBAN[1], urban); b = lerp(b, C_URBAN[2], urban);

  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}

/* ── strip meshing ────────────────────────────────────────────────────────── */

function buildStrip(us, z0, rows, dz, lods) {
  const cols = us.length;
  const W = cols + 2, H = rows + 2;
  const usP = new Float32Array(W);
  usP[0] = us[0] - (us[1] - us[0]);
  for (let i = 0; i < cols; i++) usP[i + 1] = us[i];
  usP[W - 1] = us[cols - 1] + (us[cols - 1] - us[cols - 2]);

  const hs = new Float32Array(W * H);
  const P = {};
  for (let j = 0; j < H; j++) {
    const z = z0 - (j - 1) * dz;
    profileAt(z, P);
    const base = j * W;
    for (let i = 0; i < W; i++) hs[base + i] = heightAtU(usP[i], z, P);
  }

  const nv = cols * rows;
  const perim = 2 * rows;             // skirt runs down the two lateral edges only
  const total = nv + perim;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);

  const cxMid = centrelineX(z0 - (rows - 1) * dz * 0.5);
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;

  for (let j = 0; j < rows; j++) {
    const z = z0 - j * dz;
    const cx = centrelineX(z);
    const cdx = centrelineDX(z);
    const rowU = (j + 1) * W;
    for (let i = 0; i < cols; i++) {
      const u = us[i];
      const h = hs[rowU + i + 1];
      const hu = (hs[rowU + i + 2] - hs[rowU + i]) / (usP[i + 2] - usP[i]);
      const hz = (hs[(j + 2) * W + i + 1] - hs[j * W + i + 1]) / (-2 * dz);
      let nx = -hu, ny = 1, nz = cdx * hu - hz;
      const il = 1 / Math.hypot(nx, ny, nz);
      nx *= il; ny *= il; nz *= il;

      const k = j * cols + i;
      pos[k * 3] = cx + u - cxMid; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z - z0;
      nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
      tintAt(h, ny, z, col, k * 3);
      uv[k * 2] = u * 0.01; uv[k * 2 + 1] = z * 0.01;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
      const lx = cx + u - cxMid;
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
    }
  }

  // Skirt only where this strip meets a *different* tier — the two lateral
  // edges. Chunk-to-chunk seams along Z need no skirt: neighbours share the
  // exact same boundary row, and the LOD index buffers below keep that row at
  // full resolution so a coarse chunk can never crack against a fine one.
  // (A skirt on those seams is what turned the first build into curtains: a
  // vertical flap dropped from a 70° cliff is a wall, not a hem.)
  const skirtOf = new Int32Array(nv).fill(-1);
  let sp = nv;
  const addSkirt = (i, j) => {
    const k = j * cols + i;
    skirtOf[k] = sp;
    pos[sp * 3] = pos[k * 3]; pos[sp * 3 + 1] = pos[k * 3 + 1] - SKIRT; pos[sp * 3 + 2] = pos[k * 3 + 2];
    nrm[sp * 3] = nrm[k * 3]; nrm[sp * 3 + 1] = nrm[k * 3 + 1]; nrm[sp * 3 + 2] = nrm[k * 3 + 2];
    col[sp * 3] = col[k * 3]; col[sp * 3 + 1] = col[k * 3 + 1]; col[sp * 3 + 2] = col[k * 3 + 2];
    uv[sp * 2] = uv[k * 2]; uv[sp * 2 + 1] = uv[k * 2 + 1];
    sp++;
  };
  for (let j = 0; j < rows; j++) { addSkirt(0, j); addSkirt(cols - 1, j); }

  const geoBase = {
    position: new THREE.BufferAttribute(pos, 3),
    normal: new THREE.BufferAttribute(nrm, 3),
    color: new THREE.BufferAttribute(col, 3),
    uv: new THREE.BufferAttribute(uv, 2),
  };

  const last = rows - 1;
  const out = [];
  for (const s of lods) {
    const idx = [];
    // interior at the requested stride, leaving one full band at each end
    const j0 = s === 1 ? 0 : s;
    const j1 = s === 1 ? last : last - s;
    for (let j = j0; j + s <= j1; j += s) {
      for (let i = 0; i + s <= cols - 1; i += s) {
        const a = j * cols + i, b = a + s, c = (j + s) * cols + i, d = c + s;
        idx.push(a, c, b, b, c, d);
      }
    }
    if (s > 1) {
      // stitch the full-resolution boundary rows to the decimated interior
      for (let i = 0; i + s <= cols - 1; i += s) {
        const A = j0 * cols + i, B = j0 * cols + i + s;       // coarse, far side
        for (let k = i; k < i + s; k++) idx.push(k, A, k + 1);
        idx.push(i + s, A, B);

        const C = j1 * cols + i, D = j1 * cols + i + s;       // coarse, near side
        const f = last * cols;
        for (let k = i; k < i + s; k++) idx.push(C, f + k, f + k + 1);
        idx.push(C, f + i + s, D);
      }
    }
    // lateral skirts, walking the same stride so their tops sit on the edge
    for (let j = 0; j + s <= last; j += s) {
      const l0 = j * cols, l1 = (j + s) * cols;
      idx.push(l0, skirtOf[l0], l1, l1, skirtOf[l0], skirtOf[l1]);
      const r0 = j * cols + cols - 1, r1 = (j + s) * cols + cols - 1;
      idx.push(r1, skirtOf[r1], r0, r0, skirtOf[r1], skirtOf[r0]);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geoBase.position);
    g.setAttribute('normal', geoBase.normal);
    g.setAttribute('color', geoBase.color);
    g.setAttribute('uv', geoBase.uv);
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(
      new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, -(rows - 1) * dz * 0.5),
      Math.hypot(maxX - minX, (rows - 1) * dz, maxY - minY + SKIRT) * 0.5 + 1,
    );
    out.push(g);
  }
  return { geos: out, origin: new THREE.Vector3(cxMid, 0, z0) };
}

/* ── the terrain object ───────────────────────────────────────────────────── */

export class Terrain {
  constructor(root, material) {
    this.material = material;
    this.chunks = [];
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    root.add(this.group);

    const us = nearColumns();
    const rows = WORLD.chunkLen / WORLD.resZ + 1;
    const n = Math.round((WORLD.zStart - WORLD.zEnd) / WORLD.chunkLen);

    for (let c = 0; c < n; c++) {
      const z0 = WORLD.zStart - c * WORLD.chunkLen;
      const { geos, origin } = buildStrip(us, z0, rows, WORLD.resZ, LOD_STEPS);
      const meshes = geos.map((g, li) => {
        const m = new THREE.Mesh(g, material);
        m.position.copy(origin);
        m.receiveShadow = true;
        // A heightfield this large self-shadows into acne long before a single
        // cascade can resolve it; cliff shadows wait for CSM.
        m.castShadow = false;
        m.visible = li === 0;
        m.name = `terrain-${c}-lod${li}`;
        this.group.add(m);
        return m;
      });
      this.chunks.push({ meshes, zMid: z0 - WORLD.chunkLen * 0.5, xMid: origin.x, lod: 0 });
    }

    // far tier: the ridgelines beyond the canyon rim, one strip per bank
    const farRows = WORLD.farChunkLen / WORLD.farResZ + 1;
    const nFar = Math.ceil((WORLD.zStart - WORLD.zEnd) / WORLD.farChunkLen);
    for (const sign of [-1, 1]) {
      const fus = farColumns(sign);
      for (let c = 0; c < nFar; c++) {
        const z0 = WORLD.zStart - c * WORLD.farChunkLen;
        const { geos, origin } = buildStrip(fus, z0, farRows, WORLD.farResZ, [1]);
        const m = new THREE.Mesh(geos[0], material);
        m.position.copy(origin);
        m.receiveShadow = false;
        m.castShadow = false;
        m.name = `ridge-${sign > 0 ? 'r' : 'l'}-${c}`;
        this.group.add(m);
      }
    }
  }

  /** Swap index buffers by distance — the only per-frame cost is a visibility flip. */
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
