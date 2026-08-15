import * as THREE from 'three';
import {
  WORLD, PALETTE, spacing, smooth, clamp, centrelineX, centrelineDX,
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
// Hard ceiling on the lateral hem. A heightfield has no underside, so a skirt
// that drops further than the seam actually needs does not hide inside the
// neighbouring tier — it hangs in open air below the surface and is visible as
// a fin from any camera under the rim. That is what made the canyon read as
// hanging sheets. Now that both tiers band-limit identically at the shared
// boundary column (see profile.js:heightAtU) the only crack left is the
// 6 m/30 m z-resolution mismatch, which is a few metres, not fifty.
const SKIRT = 10;

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
// colours. Anything that reads as "a different material" has to come from the
// DNA's palette or the whole canyon is one shade of brown.
//
// The masks themselves are not per-world: height above the waterline, slope,
// concavity and sky visibility mean the same thing on every planet. What the
// DNA moves is which colour each mask lands on, and how far each one goes —
// `amount.veg = 0` is how an ice world has no scrub without a second code path.

let C_ROCK, C_SAND, C_SCRUB, C_DRY, C_PALE, C_URBAN, C_MOSS, C_AMT;

/** Snapshot the active palette. Called once per build, not per vertex. */
function usePalette() {
  const p = PALETTE;
  C_ROCK = p.rock; C_SAND = p.sand; C_SCRUB = p.scrub; C_DRY = p.dry;
  C_PALE = p.pale; C_URBAN = p.urban; C_MOSS = p.moss; C_AMT = p.amount;
}

/**
 * @param cav  0 = a knife-edge ridge, 0.5 = flat, 1 = the bottom of a gully.
 * @param sky  fraction of the hemisphere this vertex can see.
 */
function tintAt(h, ny, z, cav, sky, out, o) {
  const slope = 1 - ny;
  let r = C_ROCK[0], g = C_ROCK[1], b = C_ROCK[2];

  // The high shoulders are sun-bleached, not white — a neutral plateau is most
  // of what makes a level read as paper.
  const pale = smooth(150, 430, h) * (1 - smooth(0.42, 0.72, slope)) * C_AMT.pale;
  r = lerp(r, C_PALE[0], pale); g = lerp(g, C_PALE[1], pale); b = lerp(b, C_PALE[2], pale);

  // dry grass on the shoulders
  const dry = clamp((1 - smooth(0.26, 0.55, slope)) * smooth(14, 40, h) * (1 - smooth(190, 340, h)), 0, 1) * C_AMT.dry;
  r = lerp(r, C_DRY[0], dry); g = lerp(g, C_DRY[1], dry); b = lerp(b, C_DRY[2], dry);

  // Scrub follows water, and water follows the gullies — so the vegetation mask
  // is driven by concavity as much as by slope. Straight slope masking is what
  // makes procedural terrain read as a contour map with a green filter on it.
  const wet = smooth(0.52, 0.86, cav);
  const veg = clamp((1 - smooth(0.16, 0.44, slope)) * smooth(9, 30, h) * (1 - smooth(150, 300, h))
    * (0.35 + 0.9 * wet), 0, 1) * C_AMT.veg;
  r = lerp(r, C_SCRUB[0], veg); g = lerp(g, C_SCRUB[1], veg); b = lerp(b, C_SCRUB[2], veg);

  // moss and lichen creep up the shaded crevices of the wall itself
  const moss = clamp(wet * smooth(0.40, 0.78, slope) * (1 - sky) * 1.5 * (1 - smooth(180, 320, h)), 0, C_AMT.moss);
  r = lerp(r, C_MOSS[0], moss); g = lerp(g, C_MOSS[1], moss); b = lerp(b, C_MOSS[2], moss);

  // beach sand — only on the shallow ground either side of the waterline
  const sand = clamp((1 - smooth(0.10, 0.34, slope)) * (1 - smooth(3.5, 15, h)) * smooth(-9, -2.5, h), 0, 1) * C_AMT.sand;
  r = lerp(r, C_SAND[0], sand); g = lerp(g, C_SAND[1], sand); b = lerp(b, C_SAND[2], sand);

  const urban = cityWeight(z) * (1 - smooth(0.30, 0.60, slope)) * smooth(12, 40, h) * (1 - smooth(150, 260, h)) * C_AMT.urban;
  r = lerp(r, C_URBAN[0], urban); g = lerp(g, C_URBAN[1], urban); b = lerp(b, C_URBAN[2], urban);

  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}

/* ── sky visibility ───────────────────────────────────────────────────────── */
//
// Without an occlusion term a canyon has no depth: the floor of a 300 m gorge
// receives exactly as much sky as the rim above it, so both render at the same
// value and the whole thing flattens into a grey sheet. This walks outward from
// each vertex along the two grid axes, finds the highest elevation angle to the
// surrounding terrain, and turns that into a hemisphere-visibility scalar that
// scales *indirect* light only — direct sun still lands wherever it lands.
//
// Costs nothing at runtime: it is a handful of array reads per vertex, once.

const HOR = [1, 2, 3, 5, 8, 12, 18, 26, 38, 54];

function skyView(hs, usP, W, H, i, j, dz) {
  const c = j * W + i;
  const h = hs[c];
  let occ = 0;
  for (const s of HOR) {
    const iA = i + s, iB = i - s;
    if (iA < W) {
      const d = usP[iA] - usP[i];
      if (d > 1) { const a = (hs[j * W + iA] - h) / d; if (a > occ) occ = a; }
    }
    if (iB >= 0) {
      const d = usP[i] - usP[iB];
      if (d > 1) { const a = (hs[j * W + iB] - h) / d; if (a > occ) occ = a; }
    }
    const jA = j + s, jB = j - s;
    const d = s * dz;
    if (jA < H) { const a = (hs[jA * W + i] - h) / d; if (a > occ) occ = a; }
    if (jB >= 0) { const a = (hs[jB * W + i] - h) / d; if (a > occ) occ = a; }
  }
  // tan(elevation) → visible fraction. 45° of blockage on one side ≈ 0.7.
  return clamp(1 - smooth(0.05, 1.5, occ) * 0.88, 0.10, 1);
}

/** Separable box blur, `r` cells each way, clamped at the edges. In place. */
function blur2D(a, w, h, r) {
  const tmp = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let j = 0; j < h; j++) {
    const row = j * w;
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + clamp(i + k, 0, w - 1)];
      tmp[row + i] = s / n;
    }
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[clamp(j + k, 0, h - 1) * w + i];
      a[j * w + i] = s / n;
    }
  }
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

  // ── pass 1: the two scalar fields, on their own grid ──────────────────────
  // Both are sampled from a discrete neighbourhood, so both are noisy at the
  // vertex spacing. Written straight to vertices that noise renders as a grid
  // of blotches one quad across — which is exactly what the first build did on
  // every plateau. Blur them first; they are lighting terms, not geometry, and
  // nothing about them wants to be sharp.
  const cavF = new Float32Array(cols * rows);
  const skyF = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const rowU = (j + 1) * W;
    for (let i = 0; i < cols; i++) {
      const h = hs[rowU + i + 1];
      const cU = (hs[rowU + i] + hs[rowU + i + 2] - 2 * h) / (usP[i + 2] - usP[i]);
      const cZ = (hs[j * W + i + 1] + hs[(j + 2) * W + i + 1] - 2 * h) / (2 * dz);
      cavF[j * cols + i] = smooth(-0.34, 0.34, (cU + cZ) * 0.5);
      skyF[j * cols + i] = skyView(hs, usP, W, H, i + 1, j + 1, dz);
    }
  }
  blur2D(cavF, cols, rows, 1);
  blur2D(skyF, cols, rows, 2);

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
      // Second difference along both grid axes → concave (gully, ledge foot) vs
      // convex (rim, buttress edge). This is what the eye reads as "rock has
      // been eroded", and it is the one cue a normal map cannot fake at 300 m.
      const cav = cavF[k];
      const sky = skyF[k];

      pos[k * 3] = cx + u - cxMid; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z - z0;
      nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
      tintAt(h, ny, z, cav, sky, col, k * 3);
      // The terrain shader is fully triplanar, so the UV channel is free: it
      // carries the two fields the fragment stage cannot derive for itself.
      uv[k * 2] = cav; uv[k * 2 + 1] = sky;
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
  //
  // How DEEP the hem goes matters as much as where it is. The lateral seam
  // joins tiers with different Z steps (6 m near, 30 m far), so the worst crack
  // it can open is however far the ground falls across one coarse span — a few
  // centimetres on a plateau, tens of metres down a cliff. A single fixed drop
  // cannot be right for both: at 55 m it hung a visible curtain off every rim
  // in the level, which is most of why the canyon read as stacked paper.
  // So each skirt vertex drops to the lowest surface height within one coarse
  // span of it: exactly deep enough to cover the seam, ~0 on flat ground.
  const seamSpan = Math.max(1, Math.ceil(WORLD.farResZ / dz));
  const hemDepth = (i, j) => {
    const y0 = pos[(j * cols + i) * 3 + 1];
    let lo = y0;
    for (let d = -seamSpan; d <= seamSpan; d++) {
      const jj = j + d;
      if (jj < 0 || jj >= rows) continue;
      const y = pos[(jj * cols + i) * 3 + 1];
      if (y < lo) lo = y;
    }
    return Math.min(SKIRT, y0 - lo + 1.5);
  };

  const skirtOf = new Int32Array(nv).fill(-1);
  let sp = nv;
  const addSkirt = (i, j) => {
    const k = j * cols + i;
    skirtOf[k] = sp;
    pos[sp * 3] = pos[k * 3]; pos[sp * 3 + 1] = pos[k * 3 + 1] - hemDepth(i, j); pos[sp * 3 + 2] = pos[k * 3 + 2];
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
  // ── winding ───────────────────────────────────────────────────────────────
  // Every triangle below is emitted so that (b-a)×(c-a) points the same way as
  // the shading normal — i.e. counter-clockwise seen from the sky. Get this
  // backwards and the surface still *shades* correctly (the normals are written
  // analytically and never derived from the winding), so nothing looks obviously
  // inverted; what happens instead is that back-face culling throws away every
  // face turned toward the camera and keeps the ones turned away. The level then
  // renders as a hollow shell: near walls vanish, the far bank shows through
  // them, everything below eye height disappears, and the sliver of far wall
  // that still faces you hangs in open air as a tapering ribbon. That is exactly
  // the "fin" artefact, and the reason it survived every geometry test ever run
  // against it — the vertices were always in the right place. Only the index
  // order was wrong.
  //
  // Grid layout the orderings below depend on: +i steps toward +X, +j steps
  // toward -Z. So with a=(i,j), b=(i+s,j), c=(i,j+s), d=(i+s,j+s), the
  // sky-facing pair is (a,b,c) and (b,d,c).
  for (const s of lods) {
    const idx = [];
    // interior at the requested stride, leaving one full band at each end
    const j0 = s === 1 ? 0 : s;
    const j1 = s === 1 ? last : last - s;
    for (let j = j0; j + s <= j1; j += s) {
      for (let i = 0; i + s <= cols - 1; i += s) {
        const a = j * cols + i, b = a + s, c = (j + s) * cols + i, d = c + s;
        idx.push(a, b, c, b, d, c);
      }
    }
    if (s > 1) {
      // stitch the full-resolution boundary rows to the decimated interior
      for (let i = 0; i + s <= cols - 1; i += s) {
        const A = j0 * cols + i, B = j0 * cols + i + s;       // coarse, far side
        for (let k = i; k < i + s; k++) idx.push(k + 1, A, k);
        idx.push(B, A, i + s);

        const C = j1 * cols + i, D = j1 * cols + i + s;       // coarse, near side
        const f = last * cols;
        for (let k = i; k < i + s; k++) idx.push(f + k + 1, f + k, C);
        idx.push(D, f + i + s, C);
      }
    }
    // Lateral skirts, walking the same stride so their tops sit on the edge.
    // These face *outward* — away from the strip — for the same culling reason.
    for (let j = 0; j + s <= last; j += s) {
      const l0 = j * cols, l1 = (j + s) * cols;
      idx.push(l1, skirtOf[l0], l0, skirtOf[l1], skirtOf[l0], l1);
      const r0 = j * cols + cols - 1, r1 = (j + s) * cols + cols - 1;
      idx.push(r0, skirtOf[r1], r1, skirtOf[r0], skirtOf[r1], r0);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geoBase.position);
    g.setAttribute('normal', geoBase.normal);
    g.setAttribute('color', geoBase.color);
    g.setAttribute('uv', geoBase.uv);
    g.setIndex(idx);
    // Shape metadata for tools/fins.mjs: it needs to tell a surface triangle
    // (whose facet normal must agree with the shading normal) from a hem
    // (whose facet normal is horizontal and must instead face outward), and
    // there is no way to recover that from the buffers alone.
    g.userData.grid = { cols, rows, surfaceVerts: nv };
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
  /**
   * Nothing is meshed here. The constructor only lays out the tiers and returns
   * a queue of independent per-chunk jobs, because a mid-flight world swap has
   * to fit inside a frame budget and a chunk is the coarsest unit that already
   * shares no state with its neighbours.
   */
  constructor(root, material) {
    this.material = material;
    this.chunks = [];
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    root.add(this.group);

    usePalette();
    this.jobs = [];

    const us = nearColumns();
    const rows = WORLD.chunkLen / WORLD.resZ + 1;
    const n = Math.round((WORLD.zStart - WORLD.zEnd) / WORLD.chunkLen);
    for (let c = 0; c < n; c++) this.jobs.push(() => this._near(us, rows, c));

    // far tier: the ridgelines beyond the canyon rim, one strip per bank
    const farRows = WORLD.farChunkLen / WORLD.farResZ + 1;
    const nFar = Math.ceil((WORLD.zStart - WORLD.zEnd) / WORLD.farChunkLen);
    for (const sign of [-1, 1]) {
      const fus = farColumns(sign);
      for (let c = 0; c < nFar; c++) this.jobs.push(() => this._far(fus, farRows, sign, c));
    }
  }

  _near(us, rows, c) {
    const z0 = WORLD.zStart - c * WORLD.chunkLen;
    const { geos, origin } = buildStrip(us, z0, rows, WORLD.resZ, LOD_STEPS);
    const meshes = geos.map((g, li) => {
      const m = new THREE.Mesh(g, this.material);
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

  _far(fus, farRows, sign, c) {
    const z0 = WORLD.zStart - c * WORLD.farChunkLen;
    const { geos, origin } = buildStrip(fus, z0, farRows, WORLD.farResZ, [1]);
    const m = new THREE.Mesh(geos[0], this.material);
    m.position.copy(origin);
    m.receiveShadow = false;
    m.castShadow = false;
    m.name = `ridge-${sign > 0 ? 'r' : 'l'}-${c}`;
    this.group.add(m);
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
    // Detaching matters as much as disposing: a rebuild that leaves the old
    // meshes parented keeps every buffer alive through the group's reference,
    // and the GPU counters never come back to baseline.
    this.group.clear();
    this.group.removeFromParent();
    this.chunks.length = 0;
    this.jobs = [];
  }
}
