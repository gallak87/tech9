import { Euler, Vector3 } from 'three';
import { EYE_HEIGHT, PLAYER_RADIUS } from './mission.js';

export const WALK_SPEED = 3.5;
export const JOG_SPEED = 6.2;
export const LOOK_SENSITIVITY = 0.002;

/** Small swept substeps stop tunneling; circle projection permits sliding. */
export function moveGrounded(
  position,
  dx,
  dz,
  colliders,
  bounds,
  radius = PLAYER_RADIUS,
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.5)));
  let { x, z } = position;
  for (let step = 0; step < steps; step++) {
    x += dx / steps;
    z += dz / steps;
    for (let pass = 0; pass < 3; pass++) {
      for (const circle of colliders) {
        const cx = x - circle.x;
        const cz = z - circle.z;
        const separation = Math.hypot(cx, cz);
        const minimum = circle.radius + radius;
        if (separation < minimum) {
          if (separation < 0.00001) {
            x = circle.x + minimum;
            z = circle.z;
          } else {
            x = circle.x + (cx / separation) * minimum;
            z = circle.z + (cz / separation) * minimum;
          }
        }
      }
    }
    x = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, x));
    z = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, z));
  }
  return { x, z };
}

export class WalkingController {
  constructor({ camera, canvas, bounds, groundHeight, colliders, onPause }) {
    Object.assign(this, {
      camera,
      canvas,
      bounds,
      groundHeight,
      colliders,
      onPause,
    });
    this.keys = new Set();
    this.enabled = false;
    this.speed = 0;
    this.dragging = false;
    this.wasLocked = false;
    this.rotation = new Euler(0, 0, 0, 'YXZ');
    this.forward = new Vector3();
    this.right = new Vector3();
    this.direction = new Vector3();
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          !this.enabled ||
          /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)
        )
          return;
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          this.onPause('Mission paused');
          return;
        }
        if (
          [
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'KeyE',
            'ShiftLeft',
            'ShiftRight',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
          ].includes(event.code)
        ) {
          event.preventDefault();
          this.keys.add(event.code);
        }
      },
      options,
    );
    window.addEventListener(
      'keyup',
      (event) => this.keys.delete(event.code),
      options,
    );
    window.addEventListener(
      'blur',
      () => {
        this.resetMotion();
        this.onPause('Window focus changed');
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.resetMotion();
          this.onPause('Tab was hidden');
        }
      },
      options,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        const locked = document.pointerLockElement === canvas;
        const released = this.wasLocked && !locked;
        this.wasLocked = locked;
        this.resetMotion();
        if (released && this.enabled) this.onPause('Mouse released');
      },
      options,
    );
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (this.enabled && event.button === 0) {
          this.dragging = true;
          canvas.focus();
        }
      },
      options,
    );
    window.addEventListener(
      'pointerup',
      () => {
        this.dragging = false;
      },
      options,
    );
    window.addEventListener(
      'mousemove',
      (event) => {
        if (
          !this.enabled ||
          (document.pointerLockElement !== canvas && !this.dragging)
        )
          return;
        this.rotation.setFromQuaternion(camera.quaternion);
        this.rotation.y -= event.movementX * LOOK_SENSITIVITY;
        this.rotation.x = Math.max(
          -1.35,
          Math.min(1.35, this.rotation.x - event.movementY * LOOK_SENSITIVITY),
        );
        camera.quaternion.setFromEuler(this.rotation);
      },
      options,
    );
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    this.resetMotion();
    if (!enabled && document.pointerLockElement === this.canvas)
      document.exitPointerLock();
  }
  lock() {
    if (!this.enabled) return;
    this.canvas.focus();
    try {
      const result = this.canvas.requestPointerLock();
      result?.catch(() => {});
    } catch {
      /* Browsers without capture can still drag to look. */
    }
  }
  update(dt) {
    if (!this.enabled) return;
    const key = (code) => (this.keys.has(code) ? 1 : 0);
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    this.direction
      .set(0, 0, 0)
      .addScaledVector(
        this.forward,
        key('KeyW') + key('ArrowUp') - key('KeyS') - key('ArrowDown'),
      )
      .addScaledVector(
        this.right,
        key('KeyD') + key('ArrowRight') - key('KeyA') - key('ArrowLeft'),
      )
      .clampLength(0, 1);
    this.speed =
      this.direction.length() *
      (key('ShiftLeft') || key('ShiftRight') ? JOG_SPEED : WALK_SPEED);
    const p = this.camera.position;
    const next = moveGrounded(
      p,
      this.direction.x * this.speed * dt,
      this.direction.z * this.speed * dt,
      this.colliders,
      this.bounds,
    );
    p.set(next.x, this.groundHeight(next.x, next.z) + EYE_HEIGHT, next.z);
  }
  resetMotion() {
    this.keys.clear();
    this.speed = 0;
    this.dragging = false;
  }
  snapshot() {
    return {
      enabled: this.enabled,
      locked: document.pointerLockElement === this.canvas,
      eyeHeight: EYE_HEIGHT,
      playerRadius: PLAYER_RADIUS,
      speed: this.speed,
    };
  }
  dispose() {
    this.setEnabled(false);
    this.abort.abort();
  }
}
