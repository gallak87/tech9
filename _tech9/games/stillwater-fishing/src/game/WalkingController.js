import { Euler } from 'three';

const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.68;
const PITCH_LIMIT = 1.2;
const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);
const LOOK_KEYS = new Set(['KeyJ', 'KeyL', 'KeyI', 'KeyK']);

/** The sole camera owner: grounded movement, authored collisions and look input. */
export class WalkingController {
  constructor(
    { camera, canvas, bounds, groundHeight, definition },
    {
      canMove = () => true,
      canLook = () => true,
      onPause = () => {},
      isWalkable = () => true,
    } = {},
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.bounds = bounds;
    this.groundHeight = groundHeight;
    this.colliders = definition?.getColliders?.() ?? [];
    this.canMove = canMove;
    this.canLook = canLook;
    this.onPause = onPause;
    this.isWalkable = isWalkable;
    this.keys = new Set();
    this.rotation = new Euler(0, 0, 0, 'YXZ');
    this.dragging = false;
    this.disposed = false;
    this.wasLocked = document.pointerLockElement === canvas;
    this.abort = new AbortController();
    camera.rotation.reorder('YXZ');
    this.resetMotion();
    const options = { signal: this.abort.signal };

    window.addEventListener(
      'keydown',
      (event) => {
        const target = event.target;
        if (
          target?.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName)
        )
          return;
        if (!MOVE_KEYS.has(event.code) && !LOOK_KEYS.has(event.code)) return;
        event.preventDefault();
        if (
          (MOVE_KEYS.has(event.code) && this.canMove()) ||
          (LOOK_KEYS.has(event.code) && this.canLook())
        )
          this.keys.add(event.code);
      },
      options,
    );
    window.addEventListener(
      'keyup',
      (event) => this.keys.delete(event.code),
      options,
    );
    canvas.addEventListener(
      'contextmenu',
      (event) => event.preventDefault(),
      options,
    );
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 2 || !this.canLook()) return;
        event.preventDefault();
        this.dragging = true;
        this.dragX = event.clientX;
        this.dragY = event.clientY;
      },
      options,
    );
    const endDrag = () => {
      this.dragging = false;
    };
    window.addEventListener('pointerup', endDrag, options);
    window.addEventListener('pointercancel', endDrag, options);
    window.addEventListener(
      'pointermove',
      (event) => {
        if (!this.canLook()) {
          this.dragging = false;
          return;
        }
        if (document.pointerLockElement !== canvas && !this.dragging) return;
        const locked = document.pointerLockElement === canvas;
        const dx = locked ? event.movementX : event.clientX - this.dragX;
        const dy = locked ? event.movementY : event.clientY - this.dragY;
        this.dragX = event.clientX;
        this.dragY = event.clientY;
        this.look(-dx * 0.0018, -dy * 0.0018);
      },
      options,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        const locked = document.pointerLockElement === canvas;
        const exited = this.wasLocked && !locked;
        this.wasLocked = locked;
        this.resetMotion();
        if (exited) this.onPause('pointer-lock');
      },
      options,
    );
    window.addEventListener('blur', () => this.pause('blur'), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.pause('hidden');
      },
      options,
    );
  }

  pause(reason) {
    if (this.disposed) return;
    this.resetMotion();
    this.onPause(reason);
  }

  /** Call from a user click; construction and update never capture the pointer. */
  async lock() {
    if (this.disposed || !this.canLook()) return false;
    try {
      await this.canvas.requestPointerLock();
      return document.pointerLockElement === this.canvas;
    } catch {
      // Right-button dragging and keyboard aiming remain available.
      return false;
    }
  }

  look(yaw, pitch) {
    if (yaw === 0 && pitch === 0) return;
    this.rotation.y += yaw;
    this.rotation.x = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, this.rotation.x + pitch),
    );
    this.camera.quaternion.setFromEuler(this.rotation);
  }

  canStand(x, z) {
    const r = PLAYER_RADIUS;
    if (
      !this.isWalkable(x, z) ||
      !this.isWalkable(x - r, z) ||
      !this.isWalkable(x + r, z) ||
      !this.isWalkable(x, z - r) ||
      !this.isWalkable(x, z + r)
    )
      return false;
    return !this.colliders.some((circle) => {
      const radius = circle.radius + r;
      return (x - circle.x) ** 2 + (z - circle.z) ** 2 < radius * radius;
    });
  }

  move(dx, dz) {
    const p = this.camera.position;
    const x = Math.max(
      this.bounds.minX + PLAYER_RADIUS,
      Math.min(this.bounds.maxX - PLAYER_RADIUS, p.x + dx),
    );
    const z = Math.max(
      this.bounds.minZ + PLAYER_RADIUS,
      Math.min(this.bounds.maxZ - PLAYER_RADIUS, p.z + dz),
    );
    if (this.canStand(x, z)) {
      p.x = x;
      p.z = z;
      return;
    }
    // Resolve axes separately so the player slides along trees and shorelines.
    if (this.canStand(x, p.z)) p.x = x;
    if (this.canStand(p.x, z)) p.z = z;
  }

  update(dt) {
    if (this.disposed) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    const key = (code) => Number(this.keys.has(code));
    if (this.canLook()) {
      this.look(
        (key('KeyJ') - key('KeyL')) * step * 1.15,
        (key('KeyI') - key('KeyK')) * step * 0.9,
      );
    } else {
      for (const code of LOOK_KEYS) this.keys.delete(code);
      this.dragging = false;
    }
    if (this.canMove()) {
      const forward =
        key('KeyW') + key('ArrowUp') - key('KeyS') - key('ArrowDown');
      const right =
        key('KeyD') + key('ArrowRight') - key('KeyA') - key('ArrowLeft');
      const length = Math.hypot(forward, right);
      if (length > 0) {
        const speed = key('ShiftLeft') || key('ShiftRight') ? 4 : 2.6;
        const distance = speed * step;
        const yaw = this.rotation.y;
        const dx =
          ((-Math.sin(yaw) * forward + Math.cos(yaw) * right) / length) *
          distance;
        const dz =
          ((-Math.cos(yaw) * forward - Math.sin(yaw) * right) / length) *
          distance;
        const count = Math.max(1, Math.ceil(distance / 0.12));
        for (let i = 0; i < count; i++) this.move(dx / count, dz / count);
      }
    } else {
      for (const code of MOVE_KEYS) this.keys.delete(code);
    }
    const p = this.camera.position;
    p.y = this.groundHeight(p.x, p.z) + EYE_HEIGHT;
  }

  resetMotion() {
    this.keys.clear();
    this.dragging = false;
    this.rotation.setFromQuaternion(this.camera.quaternion, 'YXZ');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resetMotion();
    this.abort.abort();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }
}
