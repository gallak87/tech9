import * as THREE from 'three';
import { buildComposer } from '../render/postfx.js';
import { BUDGET, CAMERA_FOV_DEG } from './const.js';

export { BUDGET };

// ─────────────────────────────────────────────────────────────────────────────
// Engine — owns the WebGLRenderer, the camera, the HDR frame graph and the
// clock. Nothing else in the codebase constructs a renderer or touches the
// composer chain directly; every lane is handed `engine` and reads from it.
//
// UNITS: metres, +Y up, right-handed. One world tile is 2 m. A hero is 1.7 m.
// Anything authored in "tiles" converts at the boundary and never leaks in.
//
// The quality tiers scale COST, not LOOK. A pass that only runs at `ultra`
// would mean the review harness (which defaults to ultra) captures a frame no
// player sees, which makes every critic score meaningless. Tiers move render
// scale and shadow resolution; they do not remove a look decision.
// ─────────────────────────────────────────────────────────────────────────────

// FIVE notches, cheapest first. `potato` exists because of a lesson from a
// prior Three.js build that was tuned so far up it took several sessions to
// tune back down: if the game does not read at the cheapest notch, the look is
// carrying cost it has not earned. Sweeping this lever against the fps readout
// is how that stays honest.
// `ultra` must keep its name — tools/shot.mjs defaults to it.
export const QUALITY_ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];

export const QUALITY = {
  potato: { renderScale: 0.45, shadowMap: 512,  shadows: true, bloom: false, bloomRes: 0.5,  smaa: false, aniso: 1  },
  low:    { renderScale: 0.60, shadowMap: 1024, shadows: true, bloom: true, bloomRes: 0.5,  smaa: true, aniso: 4  },
  medium: { renderScale: 0.80, shadowMap: 2048, shadows: true, bloom: true, bloomRes: 0.5,  smaa: true, aniso: 8  },
  high:   { renderScale: 1.00, shadowMap: 3072, shadows: true, bloom: true, bloomRes: 0.75, smaa: true, aniso: 16 },
  ultra:  { renderScale: 1.00, shadowMap: 4096, shadows: true, bloom: true, bloomRes: 1.0,  smaa: true, aniso: 16 },
};

export class Engine {
  constructor({ quality = 'high', maxPixelRatio = 2 } = {}) {
    this.qualityName = QUALITY[quality] ? quality : 'high';
    this.q = { ...QUALITY[this.qualityName] };
    this.maxPixelRatio = maxPixelRatio;
    this.renderScale = this.q.renderScale;

    const host = document.getElementById('stage') || document.body;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,             // SMAA in post: cheaper, and correct in HDR
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,  // the capture harness reads pixels back
    });
    // Leave this ON. Switching it off is what turns a failed shader compile into
    // a wrong frame and an empty console — the single most expensive class of
    // bug in a procedural renderer.
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;  // the grade pass tonemaps
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    host.appendChild(this.renderer.domElement);

    this.maxAniso = Math.min(this.q.aniso, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();

    // A narrow-FOV perspective camera high above the party. The projection
    // choice and the 55° pitch behind it are argued in core/const.js and
    // ARCHITECTURE.md §Camera; the rig that drives it lives in render/camera.js.
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 16 / 9, 0.5, 4000);
    this.camera.position.set(0, 40, 40);

    this.clock = new THREE.Clock();
    this.time = 0;
    this.frame = 0;
    this.dt = 1 / 60;

    this._ftBuf = new Float32Array(45);
    this._ftIdx = 0;
    this.avgFrameMs = 16.7;

    this.size = new THREE.Vector2(1, 1);
    this.composer = null;
    this.post = null;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  /** Called once the scene graph exists so post passes can bind to it. */
  buildPost(opts = {}) {
    this.post = buildComposer(this, opts);
    this.composer = this.post.composer;
    this.resize();
    return this.post;
  }

  get width() { return this.size.x; }
  get height() { return this.size.y; }
  /** Megapixels rasterised per frame — the number that predicts fill cost. */
  get megapixels() { return (this.size.x * this.dpr * this.size.y * this.dpr) / 1e6; }

  setRenderScale(r) { this.renderScale = r; this.resize(); }

  /**
   * Switch quality notch live. renderScale and the post chain re-size
   * immediately; the shadow map has to be re-allocated, which the environment
   * owns — it listens for 'engine:quality' and calls its own applyQuality.
   * Persisted so a reload, and any gameplay probe, uses what the human chose.
   */
  setQuality(name) {
    if (!QUALITY[name] || name === this.qualityName) return this.qualityName;
    this.qualityName = name;
    this.q = { ...QUALITY[name] };
    this.setRenderScale(this.q.renderScale);
    try { localStorage.setItem('dawn.quality', name); } catch { /* private mode */ }
    this.bus?.emit('engine:quality', { quality: name, q: this.q });
    return name;
  }

  resize() {
    const w = window.innerWidth || 1920;
    const h = window.innerHeight || 1080;
    // Two separate quantities, deliberately not collapsed: `deviceDpr` is a
    // property of the display (clamped, so a 3× panel cannot demand 9× the
    // pixels), `renderScale` is the quality decision.
    this.deviceDpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    const dpr = this.deviceDpr * this.renderScale;
    this.size.set(w, h);
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h, dpr);
    if (this.onResize) this.onResize(w, h);
  }

  tick() {
    let dt = this.clock.getDelta();
    if (dt > 0.1) dt = 0.1;          // tab-out guard: never integrate a 4 s step
    if (dt <= 0) dt = 1 / 120;
    this.dt = dt;
    this.time += dt;
    this.frame++;
    this._ftBuf[this._ftIdx = (this._ftIdx + 1) % this._ftBuf.length] = dt * 1000;
    let s = 0;
    for (let i = 0; i < this._ftBuf.length; i++) s += this._ftBuf[i] || 16.7;
    this.avgFrameMs = s / this._ftBuf.length;
    return dt;
  }

  render() {
    this.renderer.info.reset();
    if (this.post) this.post.render(this.dt);
    else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.post?.dispose?.();
    this.renderer.dispose();
  }
}

/** Free every geometry/material/texture under a subtree. Lanes MUST call this
 *  when they replace content — `stats()` shows the counts, and a leak here is
 *  the usual cause of a slow drift into the frame budget. */
export function disposeTree(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (o.geometry) { o.geometry.dispose(); n++; }
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose(); n++;
    }
  });
  root.parent?.remove(root);
  return n;
}
