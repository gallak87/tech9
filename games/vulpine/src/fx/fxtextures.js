import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { fbm2D, worley2D } from '../render/textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// FX sprite atlas.
//
// Every particle family in the game samples ONE texture, so the whole additive
// pass is a single draw call and the whole alpha pass is a second one. Cells are
// laid out 4×2 at 256 px each (1024×512).
//
// Invariant that makes the atlas safe under mipmapping: **every cell is white
// RGB with the shape carried entirely in alpha, and every cell fades to alpha 0
// at its border.** Colour bleed between neighbouring cells at coarse mips is
// therefore a no-op, and tinting is done per-particle instead of per-texel.
// ─────────────────────────────────────────────────────────────────────────────

export const CELL = {
  smoke: 0,     // soft billowing puff — rolling smoke, dust, vapour
  fire: 1,      // denser puff with internal structure — fireball body
  flare: 2,     // hot core + halo + faint 4-point star — flashes, bolt heads
  streak: 3,    // anisotropic bar — sparks, laser cores, speed lines
  scorch: 4,    // irregular soot blob with ragged edge — decals
  ring: 5,      // thin bright annulus — shock ripples, water rings
  dot: 6,       // tiny hard point with a soft halo — embers, debris glints
  wisp: 7,      // elongated soft filament — vortices, wake threads
};

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;

function smooth01(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Bake the 4×2 atlas. `alpha` per cell is computed in cell-local UV space where
 * (0.5, 0.5) is the cell centre.
 */
export function bakeFxAtlas({ cellSize = 256 } = {}) {
  const W = cellSize * ATLAS_COLS;
  const H = cellSize * ATLAS_ROWS;
  const data = new Uint8Array(W * H * 4);

  const r = new RNG('fx.atlas');
  const soft = fbm2D(r, { octaves: 5, base: 4, gain: 0.58 });
  const rough = fbm2D(r, { octaves: 6, base: 6, gain: 0.55 });
  const curl = fbm2D(r, { octaves: 4, base: 3, gain: 0.62 });
  const cellsF1 = worley2D(r, 6);
  const soot = fbm2D(r, { octaves: 5, base: 5, gain: 0.6 });

  const fns = [];

  // ── 0: soft smoke puff ─────────────────────────────────────────────────────
  fns[CELL.smoke] = (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    // billow: warp the radius by low-frequency noise so the silhouette is lumpy
    const n = soft(u, v);
    const warp = (n - 0.5) * 0.62;
    let a = 1 - smooth01(d + warp, 0.18, 1.0);
    // interior density variation keeps big puffs from reading as a flat disc
    a *= 0.62 + 0.38 * curl(u * 1.3 + 0.11, v * 1.3 + 0.37);
    return Math.pow(Math.max(0, a), 1.25);
  };

  // ── 1: fireball puff — tighter core, turbulent edge ────────────────────────
  fns[CELL.fire] = (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const n = rough(u, v);
    const warp = (n - 0.5) * 0.85;
    let a = 1 - smooth01(d + warp, 0.05, 0.98);
    // cauliflower: worley cells punched into the interior read as rolling lobes
    const lobes = 0.55 + 0.45 * (1 - cellsF1(u, v));
    a *= lobes;
    a *= 1 - smooth01(d, 0.72, 1.02);       // hard-ish outer clamp, zero at edge
    return Math.pow(Math.max(0, a), 1.05);
  };

  // ── 2: flare — hot core, wide halo, subtle star ────────────────────────────
  fns[CELL.flare] = (u, v) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const d = Math.min(1, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    const core = Math.pow(1 - d, 7.0);
    const halo = Math.pow(1 - d, 2.1) * 0.40;
    const star = Math.pow(Math.abs(Math.cos(ang * 2)), 30) * Math.pow(1 - d, 1.25) * 0.55
               + Math.pow(Math.abs(Math.cos(ang * 2 + Math.PI / 4)), 60) * Math.pow(1 - d, 1.4) * 0.22;
    return Math.min(1, core + halo + star);
  };

  // ── 3: spark streak — bright bar with hot centreline ───────────────────────
  fns[CELL.streak] = (u, v) => {
    const across = Math.abs(v - 0.5) * 2;
    const along = Math.abs(u - 0.5) * 2;
    const body = Math.pow(Math.max(0, 1 - across), 3.4);
    const head = Math.pow(Math.max(0, 1 - along), 0.9);
    const tip = Math.pow(Math.max(0, 1 - Math.hypot((u - 0.72) * 3.6, (v - 0.5) * 3.6)), 2.2) * 0.8;
    return Math.min(1, body * head + tip * body);
  };

  // ── 4: scorch — ragged soot blob ───────────────────────────────────────────
  fns[CELL.scorch] = (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const n = soot(u, v);
    const warp = (n - 0.5) * 0.75;
    let a = 1 - smooth01(d + warp, 0.0, 0.92);
    a *= 0.55 + 0.45 * rough(u * 2.1 + 0.7, v * 2.1 + 0.2);
    a *= 1 - smooth01(d, 0.80, 1.0);
    return Math.pow(Math.max(0, a), 0.85);
  };

  // ── 5: ring — thin annulus, soft outside, sharp inside ─────────────────────
  fns[CELL.ring] = (u, v) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const d = Math.hypot(dx, dy);
    if (d > 1) return 0;
    const rr = 0.80;
    const t = Math.abs(d - rr);
    let a = Math.pow(Math.max(0, 1 - t / 0.22), 2.6);
    // faint inner wash so the ring reads as a pressure front, not a hoop
    a += Math.pow(Math.max(0, 1 - Math.abs(d - rr * 0.55) / 0.55), 3.2) * 0.10;
    a *= 1 - smooth01(d, 0.93, 1.0);
    return Math.min(1, a);
  };

  // ── 6: ember dot ───────────────────────────────────────────────────────────
  fns[CELL.dot] = (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    return Math.min(1, Math.pow(Math.max(0, 1 - d / 0.30), 1.6) + Math.pow(Math.max(0, 1 - d), 4.0) * 0.35);
  };

  // ── 7: wisp — soft filament, thicker in the middle ─────────────────────────
  fns[CELL.wisp] = (u, v) => {
    const along = u;
    const halfW = 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, along))), 0.75);
    const across = Math.abs(v - 0.5) / Math.max(1e-3, halfW);
    let a = Math.pow(Math.max(0, 1 - across), 2.2);
    a *= 0.6 + 0.4 * soft(u * 1.7 + 0.31, v * 1.7 + 0.83);
    a *= smooth01(along, 0.0, 0.10) * (1 - smooth01(along, 0.86, 1.0));
    return Math.max(0, a);
  };

  for (let cy = 0; cy < ATLAS_ROWS; cy++) {
    for (let cx = 0; cx < ATLAS_COLS; cx++) {
      const idx = cy * ATLAS_COLS + cx;
      const fn = fns[idx];
      if (!fn) continue;
      for (let y = 0; y < cellSize; y++) {
        for (let x = 0; x < cellSize; x++) {
          const u = (x + 0.5) / cellSize;
          const v = (y + 0.5) / cellSize;
          // guarantee a transparent gutter so mip bleed cannot leak a shape
          const gut = Math.min(
            smooth01(u, 0.0, 0.02), smooth01(1 - u, 0.0, 0.02),
            smooth01(v, 0.0, 0.02), smooth01(1 - v, 0.0, 0.02));
          const a = Math.max(0, Math.min(1, fn(u, v))) * gut;
          const px = cx * cellSize + x;
          const py = cy * cellSize + y;
          const o = (py * W + px) * 4;
          data[o] = 255; data[o + 1] = 255; data[o + 2] = 255;
          data[o + 3] = (a * 255) | 0;
        }
      }
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

let _atlas = null;
export function fxAtlas() {
  if (!_atlas) _atlas = bakeFxAtlas();
  return _atlas;
}
