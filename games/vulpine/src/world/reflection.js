import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Planar reflection for the water plane. The scene is drawn a second time from
// the camera mirrored about y = 0 and sampled projectively in the water shader,
// so the river carries the canyon walls instead of only the sky probe.
//
//   • half resolution, capped — the wave normals smear it anyway.
//   • the sky is not drawn into it. Cleared to alpha 0, geometry writes 1, and
//     the shader keeps its existing IBL wherever alpha is 0.
//   • an oblique near plane (Lengyel) clips at the waterline, avoiding a global
//     `renderer.clippingPlanes` — which would recompile every material.
//
// Driven from Corneria's sentinel probe. Reentry is guarded: the nested render
// walks the same scene and would otherwise re-enter forever.
// ─────────────────────────────────────────────────────────────────────────────

const _rot = new THREE.Matrix4();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _up = new THREE.Vector3();
const _size = new THREE.Vector2();
const _plane = new THREE.Plane();
const _pt = new THREE.Vector3();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _clearCol = new THREE.Color();
const NORMAL = new THREE.Vector3(0, 1, 0);

const BIAS = new THREE.Matrix4().set(
  0.5, 0.0, 0.0, 0.5,
  0.0, 0.5, 0.0, 0.5,
  0.0, 0.0, 0.5, 0.5,
  0.0, 0.0, 0.0, 1.0,
);

export class PlanarReflection {
  constructor(scene, {
    planeY = 0, scale = 0.5, maxWidth = 960, maxHeight = 544, clipBias = 0.0,
  } = {}) {
    this.scene = scene;
    this.planeY = planeY;
    this.scale = scale;
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
    this.clipBias = clipBias;
    this.enabled = true;

    // How much of the mirrored buffer survives into the water. Below 1 the
    // shader keeps that share of the sky probe instead — the fallback path the
    // edge and sky-miss cases already take, so this is a blend toward a look
    // that is known to work rather than a new code path. A perfect mirror reads
    // as CG; a river is not a mirror.
    this.strength = 0.72;

    /** Objects hidden for the duration of the pass — the water itself, the sky. */
    this.hide = [];

    this._busy = false;
    this._w = 0;
    this._h = 0;
    this._hidden = [];

    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();

    this.target = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.name = 'water.planar';

    // Shared uniform objects: every water material references these by
    // identity, so the per-frame update happens once, here.
    this.uniforms = {
      uReflTex: { value: this.target.texture },
      uReflMat: { value: this.textureMatrix },
      uReflOn: { value: 0 },
    };
  }

  /**
   * Render the mirrored scene. Call from something that fires once per frame,
   * before the rest of the scene is drawn.
   * @returns {boolean} true if the buffer was refreshed this call
   */
  render(renderer, camera) {
    if (this._busy || !this.enabled) return false;
    // Under the surface there is nothing to mirror, and the oblique projection
    // degenerates. Fall back to the sky IBL.
    if (camera.position.y <= this.planeY + 0.25) {
      this.uniforms.uReflOn.value = 0;
      return false;
    }
    this._busy = true;
    try {
      this._draw(renderer, camera);
      this.uniforms.uReflOn.value = this.strength;
    } finally {
      this._busy = false;
    }
    return true;
  }

  _resize(renderer) {
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(64, Math.min(this.maxWidth, Math.round(_size.x * this.scale)));
    const h = Math.max(64, Math.min(this.maxHeight, Math.round(_size.y * this.scale)));
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.target.setSize(w, h);
  }

  _mirrorCamera(camera) {
    const cam = this.camera;
    const y0 = this.planeY;

    cam.fov = camera.fov;
    cam.aspect = camera.aspect;
    cam.near = camera.near;
    cam.far = camera.far;
    cam.position.set(camera.position.x, 2 * y0 - camera.position.y, camera.position.z);

    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(camera.position);
    _target.set(_look.x, 2 * y0 - _look.y, _look.z);

    // The mirrored up vector keeps the roll of the chase camera in the
    // reflection; without it a barrel roll leaves the river standing still.
    _up.set(0, 1, 0).applyMatrix4(_rot);
    cam.up.set(_up.x, -_up.y, _up.z);
    cam.lookAt(_target);
    cam.updateMatrixWorld(true);
    cam.projectionMatrix.copy(camera.projectionMatrix);

    // ── texture matrix ───────────────────────────────────────────────────
    // Built before the oblique hack on purpose: that hack only rewrites row 2
    // of the projection (clip-space z), and a projective texture read uses
    // rows 0, 1 and 3. Doing it here keeps the two independent.
    this.textureMatrix.copy(BIAS)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);

    // ── oblique near plane ───────────────────────────────────────────────
    // Lengyel's construction: replace the near plane of the projection with
    // the water plane, so everything below the waterline is clipped by the
    // rasteriser for free. http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
    _plane.setFromNormalAndCoplanarPoint(NORMAL, _pt.set(0, y0, 0));
    _plane.applyMatrix4(cam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);

    const p = cam.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + p.elements[8]) / p.elements[0];
    _q.y = (Math.sign(_clip.y) + p.elements[9]) / p.elements[5];
    _q.z = -1.0;
    _q.w = (1.0 + p.elements[10]) / p.elements[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    p.elements[2] = _clip.x;
    p.elements[6] = _clip.y;
    p.elements[10] = _clip.z + 1.0 - this.clipBias;
    p.elements[14] = _clip.w;

    return cam;
  }

  _draw(renderer, camera) {
    this._resize(renderer);
    const cam = this._mirrorCamera(camera);

    const hidden = this._hidden;
    hidden.length = 0;
    for (const o of this.hide) {
      if (!o || !o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }

    const prevTarget = renderer.getRenderTarget();
    const prevActiveCube = renderer.getActiveCubeFace();
    const prevActiveMip = renderer.getActiveMipmapLevel();
    const prevXr = renderer.xr.enabled;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_clearCol);

    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;   // the main pass already did them

    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    // Alpha 0 is load-bearing: it is how the water shader tells "this ray hit
    // rock" from "this ray went to sky", and the second case must keep the IBL.
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(this.scene, cam);

    renderer.setClearColor(_clearCol, prevAlpha);
    renderer.setRenderTarget(prevTarget, prevActiveCube, prevActiveMip);
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadowAuto;

    for (const o of hidden) o.visible = true;
    hidden.length = 0;
  }

  dispose() {
    this.target.dispose();
  }
}
