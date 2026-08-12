import * as THREE from 'three';
import { buildComposer } from '../render/postfx.js';

// ─────────────────────────────────────────────────────────────────────────────
// Engine — owns the renderer, the camera, the HDR frame graph and the clock.
// Everything else is handed `engine` and reads from it. Nothing else creates a
// WebGLRenderer or touches the composer chain directly.
// ─────────────────────────────────────────────────────────────────────────────

// `bloom`, `dof` and `motionBlur` are off by owner call (live-tuned 2026-08-11 on
// an M1 in Chrome, at `high`). They are the same at every tier on purpose: a tier
// should scale *cost*, not change what the game looks like, so a look decision
// that only applied at `high` would mean the review harness — which defaults to
// `ultra` — captured a look the owner had rejected.
//
// God rays and the lens flare are *not* switched off here even though the owner
// turned them off too: both passes early-out on zero intensity, so zeroing them in
// `environment.js` is already free, and leaving the passes enabled keeps their dev
// knobs live. Bloom gets a flag instead because `BloomPass` has no such early-out —
// it runs the whole 6-level pyramid at any strength, including 0.
//
// SMAA stays on wherever TAA is off. TAA is gated on `ao`, so at low/medium there
// is no other antialiasing and dropping SMAA would leave those tiers with none.
export const QUALITY = {
  low:    { pixelRatio: 1.0,  shadowMap: 1024, shadows: true,  ao: false, dof: false, godrays: false, motionBlur: false, smaa: true,  bloom: false, bloomRes: 0.5,  aniso: 4 },
  medium: { pixelRatio: 1.0,  shadowMap: 2048, shadows: true,  ao: false, dof: false, godrays: true,  motionBlur: false, smaa: true,  bloom: false, bloomRes: 0.5,  aniso: 8 },
  high:   { pixelRatio: 1.25, shadowMap: 3072, shadows: true,  ao: true,  dof: false, godrays: true,  motionBlur: false, smaa: false, bloom: false, bloomRes: 0.75, aniso: 16 },
  ultra:  { pixelRatio: 1.5,  shadowMap: 4096, shadows: true,  ao: true,  dof: false, godrays: true,  motionBlur: false, smaa: false, bloom: false, bloomRes: 1.0,  aniso: 16 },
};

export class Engine {
  constructor({ quality = 'high', maxPixelRatio = 2 } = {}) {
    this.qualityName = quality;
    this.q = { ...QUALITY[quality] };
    this.maxPixelRatio = maxPixelRatio;

    const canvasHost = document.getElementById('stage') || document.body;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,            // SMAA in post — cheaper and plays nice with HDR
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // capture harness reads pixels
    });
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;   // OutputPass does ACES
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    canvasHost.appendChild(this.renderer.domElement);

    this.maxAniso = Math.min(this.q.aniso, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.35, 22000);
    this.camera.position.set(0, 6, 20);

    this.clock = new THREE.Clock();
    this.time = 0;
    this.frame = 0;
    this.dt = 1 / 60;

    // frame-rate smoothing for adaptive quality
    this._ftBuf = new Float32Array(45);
    this._ftIdx = 0;
    this.avgFrameMs = 16.7;

    this.size = new THREE.Vector2(1, 1);
    this.composer = null;
    this._resizeRAF = 0;
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

  setPixelRatio(r) {
    this.q.pixelRatio = r;
    this.resize();
  }

  resize() {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.q.pixelRatio;
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
    if (dt > 0.1) dt = 0.1;            // tab-out guard
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
    this.renderer.dispose();
  }
}
