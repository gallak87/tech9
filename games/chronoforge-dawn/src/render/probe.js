import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ─────────────────────────────────────────────────────────────────────────────
// The linear-light probe.
//
// Reads the HDR scene buffer back to the CPU at low resolution so exposure,
// clipping and contrast can be MEASURED. Eyeballing a tone curve from PNGs is
// how a project ends up shipping a white screen and arguing about it for a
// week. When you are fighting the look, probe first.
//
// A whole-frame histogram is necessary but not sufficient: a frame that is half
// dark rock and half blown sky has a perfectly healthy median. So the probe also
// reports `whitePct` — the share of pixels whose DIMMEST channel is already past
// the point where the curve has nothing left to give, i.e. pixels that land on
// flat achromatic white — plus a coarse tile map saying where they are. That
// pair is what catches "looking into the dawn sun washes the frame out".
//
// Healthy dawn frame, measured on the exposed tap:
//   median 0.05–0.16   p90 < 1.2   whitePct < 1.5   blackPct < 14
// ─────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const COPY = /* glsl */`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

export class HDRProbe {
  constructor(renderer, w = 160, h = 90) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.buf = new Uint16Array(w * h * 4);
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VERT, fragmentShader: COPY,
      depthTest: false, depthWrite: false,
    }));
  }

  /**
   * @param texture  HDR source to read back
   * @param exposure gain applied before measuring
   * @param whiteAt  linear value at which the tone curve is visually white.
   *                 A pixel whose MINIMUM channel is past this has no colour and
   *                 no gradient left — it is a hole in the picture, not a
   *                 highlight.
   */
  sample(texture, exposure = 1, whiteAt = 1.6) {
    const { renderer, rt, buf } = this;
    const prev = renderer.getRenderTarget();
    this.quad.material.uniforms.tDiffuse.value = texture;
    renderer.setRenderTarget(rt);
    renderer.clear();
    this.quad.render(renderer);
    renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
    renderer.setRenderTarget(prev);

    const W = rt.width, H = rt.height, n = W * H;
    const lum = new Float64Array(n);
    const TC = 16, TR = 9;
    const tSum = new Float64Array(TC * TR);
    const tWhite = new Float64Array(TC * TR);
    const tN = new Float64Array(TC * TR);
    let clipped = 0, black = 0, nan = 0, sum = 0, white = 0;

    for (let i = 0; i < n; i++) {
      const r = halfToFloat(buf[i * 4]) * exposure;
      const g = halfToFloat(buf[i * 4 + 1]) * exposure;
      const b = halfToFloat(buf[i * 4 + 2]) * exposure;
      if (!Number.isFinite(r + g + b)) { nan++; lum[i] = 0; continue; }
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lum[i] = l;
      sum += l;
      if (l > 3.0) clipped++;
      if (l < 0.004) black++;
      const isWhite = Math.min(r, g, b) >= whiteAt ? 1 : 0;
      white += isWhite;
      // Readback is bottom-up; flip so tile row 0 is the TOP of the frame.
      const px = i % W, py = H - 1 - ((i / W) | 0);
      const ti = ((py * TR / H) | 0) * TC + ((px * TC / W) | 0);
      tSum[ti] += l; tWhite[ti] += isWhite; tN[ti]++;
    }

    lum.sort();
    const q = (p) => lum[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
    const tiles = { cols: TC, rows: TR, mean: new Array(TC * TR), whitePct: new Array(TC * TR) };
    for (let t = 0; t < TC * TR; t++) {
      const c = Math.max(1, tN[t]);
      tiles.mean[t] = tSum[t] / c;
      tiles.whitePct[t] = (tWhite[t] / c) * 100;
    }

    return {
      mean: sum / n,
      p05: q(0.05), median: q(0.5), p90: q(0.90), p99: q(0.99), max: lum[n - 1],
      clippedPct: (clipped / n) * 100,
      blackPct: (black / n) * 100,
      whitePct: (white / n) * 100,
      whiteAt, nan, tiles,
    };
  }

  dispose() { this.rt.dispose(); this.quad.dispose(); }
}
