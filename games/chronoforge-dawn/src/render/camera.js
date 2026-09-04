import * as THREE from 'three';
import {
  LOCKED_PITCH_DEG, LOCKED_YAW_DEG, FRAME_HEIGHT_M, CAMERA_FOV_DEG,
} from '../core/const.js';

// ─────────────────────────────────────────────────────────────────────────────
// The camera rig.
//
// CONCEPT.md locks the exploration camera: 55° pitch, no player rotation, no
// player zoom, trailing the party with damping. Battle inherits the same pitch —
// it may swing laterally and push in, nothing else. The single licensed
// exception is a combo finisher: a scripted 2–3 s cut that may break pitch,
// framing and time scale and MUST put them back.
//
// `assertLocked()` is the check that keeps that promise honest, and `stage.mjs`
// will call it after every finisher. A rig that comes back off-pitch is a bug
// the probe can see; a rig that comes back off-pitch and nobody checks is the
// slow death of an art-directed camera.
// ─────────────────────────────────────────────────────────────────────────────

const _off = new THREE.Vector3();
const _tgt = new THREE.Vector3();

export class CameraRig {
  constructor() {
    this.pitchDeg = LOCKED_PITCH_DEG;
    this.yawDeg = LOCKED_YAW_DEG;
    /** The deferred "orthographic scale", in metres of world at the focus
     *  plane. Zoom is not a player control; this is a tuning knob only. */
    this.frameHeight = FRAME_HEIGHT_M;
    this.fovDeg = CAMERA_FOV_DEG;
    /** Damping half-life in seconds — how long the camera takes to close half
     *  the distance to the party. Traversal tunes this; 0 snaps. */
    this.halfLife = 0.16;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.cinematicDepth = 0;
    this._locked = { pitch: this.pitchDeg, yaw: this.yawDeg, frame: this.frameHeight };
    this._init = false;
  }

  /** Distance from focus implied by the frame height and the lens. */
  get distance() {
    return (this.frameHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.fovDeg) * 0.5);
  }

  /** Camera offset from the focus point, in metres. */
  offset(out = _off) {
    const y = THREE.MathUtils.degToRad(this.yawDeg);
    const p = THREE.MathUtils.degToRad(this.pitchDeg);
    return out.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p))
      .multiplyScalar(this.distance);
  }

  /** Snap the camera to frame `target` this instant. Used by shots and seek. */
  apply(camera, target) {
    _tgt.copy(target);
    this.target.copy(_tgt);
    this.pos.copy(_tgt).add(this.offset());
    camera.position.copy(this.pos);
    camera.fov = this.fovDeg;
    camera.near = Math.max(0.5, this.distance * 0.05);
    camera.far = Math.max(1500, this.distance * 60);
    camera.updateProjectionMatrix();
    camera.lookAt(_tgt);
    this._init = true;
    return camera;
  }

  /**
   * Damped follow. Frame-rate independent: the smoothing is expressed as a
   * half-life, so a 30 fps frame and two 60 fps frames land in the same place.
   * A raw `lerp(a, b, 0.1)` does not, and the difference shows up as camera
   * jitter in `walk.mjs` the moment the frame rate wobbles.
   */
  follow(camera, target, dt) {
    if (!this._init || this.halfLife <= 0) return this.apply(camera, target);
    const k = 1 - Math.pow(0.5, dt / this.halfLife);
    this.target.lerp(target, k);
    return this.apply(camera, this.target);
  }

  /** Force the next follow() to snap — after a teleport or a door transition. */
  reset(target) { this._init = false; if (target) this.target.copy(target); }

  /* ── the licensed exception ─────────────────────────────────────────────
     A finisher cut wraps its camera work in begin/end. Nesting is counted so a
     crit inside a combo cannot end the outer cut early.                      */
  beginCinematic() { this.cinematicDepth++; }
  endCinematic() {
    this.cinematicDepth = Math.max(0, this.cinematicDepth - 1);
    if (this.cinematicDepth === 0) {
      this.pitchDeg = this._locked.pitch;
      this.yawDeg = this._locked.yaw;
      this.frameHeight = this._locked.frame;
      this._init = false;
    }
  }

  /** True when the rig is on its locked framing. `stage.mjs` asserts this
   *  after every finisher; `stats()` reports it every frame. */
  assertLocked() {
    return this.cinematicDepth === 0
      && Math.abs(this.pitchDeg - this._locked.pitch) < 1e-6
      && Math.abs(this.yawDeg - this._locked.yaw) < 1e-6;
  }

  /** Re-baseline the locked framing. Core-change territory: only the
   *  integrator should ever call this, and only from a CONCEPT.md change. */
  relock({ pitch, yaw, frameHeight } = {}) {
    if (pitch != null) this.pitchDeg = this._locked.pitch = pitch;
    if (yaw != null) this.yawDeg = this._locked.yaw = yaw;
    if (frameHeight != null) this.frameHeight = this._locked.frame = frameHeight;
    this._init = false;
  }

  /** Metres of ground visible, for framing maths in other lanes. */
  get groundExtent() {
    const p = THREE.MathUtils.degToRad(this.pitchDeg);
    return { depth: this.frameHeight / Math.sin(p), width: this.frameHeight * (16 / 9) };
  }
}
