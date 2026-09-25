import { Euler } from 'three';
import { resolveMovement } from './rules.js';
export class Walker {
  constructor({ camera, canvas, bounds, groundHeight }, colliders, actions) {
    Object.assign(this, {
      camera,
      canvas,
      bounds,
      groundHeight,
      colliders,
      actions,
    });
    this.keys = new Set();
    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
    this.moving = false;
    this.quiet = false;
    this.aiming = false;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        if (
          [
            'Space',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'Tab',
          ].includes(e.code)
        )
          e.preventDefault();
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (!e.repeat) actions.pause();
          return;
        }
        if (!this.enabled || e.repeat) return;
        this.keys.add(e.code);
        if (e.code === 'Space' && !e.repeat) actions.draw();
        if (e.code === 'KeyE' && !e.repeat) actions.retrieve();
      },
      options,
    );
    window.addEventListener(
      'keyup',
      (e) => {
        this.keys.delete(e.code);
        if (e.code === 'Space' && this.enabled) actions.release();
      },
      options,
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), options);
    canvas.addEventListener(
      'mousedown',
      (e) => {
        if (!this.enabled) return;
        if (document.pointerLockElement !== canvas) {
          this.lock();
        }
        if (e.button === 2) this.keys.add('MouseRight');
        if (e.button === 0) actions.draw();
      },
      options,
    );
    window.addEventListener(
      'mouseup',
      (e) => {
        if (e.button === 2) this.keys.delete('MouseRight');
        if (e.button === 0 && this.enabled) actions.release();
      },
      options,
    );
    window.addEventListener(
      'mousemove',
      (e) => {
        if (!this.enabled || document.pointerLockElement !== canvas) return;
        this.yaw -= e.movementX * 0.002;
        this.pitch -= e.movementY * 0.002;
        this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
      },
      options,
    );
    window.addEventListener('blur', () => actions.pause(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) actions.pause();
      },
      options,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (!document.pointerLockElement && this.enabled) actions.pause();
      },
      options,
    );
  }
  lock() {
    this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }
  reset(x, z) {
    this.resetMotion();
    this.yaw = 0;
    this.pitch = -0.025;
    this.camera.position.set(x, this.groundHeight(x, z) + 1.68, z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
  resetMotion() {
    this.keys.clear();
    this.moving = false;
    this.quiet = false;
    this.aiming = false;
  }
  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    this.yaw +=
      ((k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0)) *
      dt *
      0.75;
    this.pitch = Math.max(
      -1.2,
      Math.min(
        1.2,
        this.pitch +
          ((k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0)) *
            dt *
            0.55,
      ),
    );
    this.camera.quaternion.setFromEuler(
      new Euler(this.pitch, this.yaw, 0, 'YXZ'),
    );
    this.quiet = k.has('ShiftLeft') || k.has('ShiftRight');
    this.aiming = k.has('KeyQ') || k.has('MouseRight');
    let forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const length = Math.hypot(forward, side);
    this.moving = length > 0;
    if (length) {
      forward /= length;
      side /= length;
    }
    const speed = (this.quiet ? 1.25 : 3.5) * (this.aiming ? 0.55 : 1);
    const dx =
      (side * Math.cos(this.yaw) - forward * Math.sin(this.yaw)) * speed * dt;
    const dz =
      (-forward * Math.cos(this.yaw) - side * Math.sin(this.yaw)) * speed * dt;
    const p = resolveMovement(
      this.camera.position,
      dx,
      dz,
      this.colliders,
      this.bounds,
    );
    this.camera.position.set(
      p.x,
      this.groundHeight(p.x, p.z) + (this.quiet ? 1.4 : 1.68),
      p.z,
    );
    const fov = this.aiming ? 43 : 58;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
  }
  dispose() {
    this.abort.abort();
    this.resetMotion();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
}
