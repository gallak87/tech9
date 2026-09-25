import { moveGrounded } from '../../placement-collisions/src/placementCollisions.js';

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
const LOOK_KEYS = new Set(['KeyI', 'KeyJ', 'KeyK', 'KeyL']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP', 'Tab']);
const editable = (target) =>
  target?.isContentEditable ||
  /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target?.tagName);

/** Desktop camera owner. Game rules, menus and scene composition stay outside. */
export class WalkingController {
  constructor(
    { camera, canvas, bounds, groundHeight, definition },
    {
      enabled = false,
      speed = 2.6,
      boostSpeed = 4,
      playerRadius = 0.3,
      eyeHeight = 1.68,
      isWalkable = () => true,
      canMove = () => true,
      canLook = () => true,
      onPause = () => {},
    } = {},
  ) {
    for (const [name, value] of Object.entries({
      speed,
      boostSpeed,
      playerRadius,
      eyeHeight,
    })) {
      if (!Number.isFinite(value) || value <= 0)
        throw new TypeError(`${name} must be positive and finite.`);
    }
    Object.assign(this, {
      camera,
      canvas,
      bounds,
      groundHeight,
      speed,
      boostSpeed,
      playerRadius,
      eyeHeight,
      isWalkable,
      canMove,
      canLook,
      onPause,
    });
    this.colliders = definition?.getColliders?.() ?? [];
    this.document = canvas.ownerDocument ?? globalThis.document;
    this.window = this.document.defaultView ?? globalThis.window;
    this.keys = new Set();
    this.enabled = Boolean(enabled);
    this.disposed = false;
    this.dragging = false;
    this.wasLocked = this.document.pointerLockElement === canvas;
    this.lockGeneration = 0;
    camera.rotation.reorder?.('YXZ');
    const Abort = this.window.AbortController ?? globalThis.AbortController;
    this.abort = new Abort();
    const options = { signal: this.abort.signal };

    this.window.addEventListener(
      'keydown',
      (event) => {
        if (
          !this.enabled ||
          this.disposed ||
          editable(event.target) ||
          editable(this.document.activeElement)
        )
          return;
        if (PAUSE_KEYS.has(event.code)) {
          event.preventDefault();
          if (!event.repeat)
            this.pause(event.code === 'Tab' ? 'tuning' : 'keyboard');
          return;
        }
        if (
          (MOVE_KEYS.has(event.code) && this.canMove()) ||
          (LOOK_KEYS.has(event.code) && this.canLook())
        ) {
          event.preventDefault();
          this.keys.add(event.code);
        }
      },
      options,
    );
    this.window.addEventListener(
      'keyup',
      (event) => this.keys.delete(event.code),
      options,
    );
    this.document.addEventListener(
      'focusin',
      (event) => {
        if (editable(event.target)) this.resetMotion();
      },
      options,
    );
    canvas.addEventListener(
      'contextmenu',
      (event) => {
        if (this.enabled && this.canLook()) event.preventDefault();
      },
      options,
    );
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.enabled || event.button !== 2 || !this.canLook()) return;
        event.preventDefault();
        canvas.focus?.();
        this.dragging = true;
        this.dragX = event.clientX;
        this.dragY = event.clientY;
      },
      options,
    );
    const endDrag = () => {
      this.dragging = false;
    };
    this.window.addEventListener('pointerup', endDrag, options);
    this.window.addEventListener('pointercancel', endDrag, options);
    this.window.addEventListener(
      'pointermove',
      (event) => {
        if (!this.enabled || !this.canLook()) {
          this.dragging = false;
          return;
        }
        const locked = this.document.pointerLockElement === canvas;
        if (!locked && !this.dragging) return;
        const dx = locked ? event.movementX : event.clientX - this.dragX;
        const dy = locked ? event.movementY : event.clientY - this.dragY;
        this.dragX = event.clientX;
        this.dragY = event.clientY;
        this.look(-dx * 0.0018, -dy * 0.0018);
      },
      options,
    );
    this.document.addEventListener(
      'pointerlockchange',
      () => {
        const locked = this.document.pointerLockElement === canvas;
        const exited = this.wasLocked && !locked;
        this.wasLocked = locked;
        this.resetMotion();
        if (locked && !this.enabled) this.document.exitPointerLock?.();
        if (exited) this.pause('pointer-lock');
      },
      options,
    );
    this.window.addEventListener('blur', () => this.pause('blur'), options);
    this.document.addEventListener(
      'visibilitychange',
      () => {
        if (this.document.hidden) this.pause('hidden');
      },
      options,
    );
  }

  setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = Boolean(enabled);
    this.resetMotion();
    if (!this.enabled) {
      this.lockGeneration++;
      if (this.document.pointerLockElement === this.canvas)
        this.document.exitPointerLock?.();
    }
  }

  pause(reason) {
    this.resetMotion();
    if (!this.enabled || this.disposed) return;
    this.setEnabled(false);
    this.onPause(reason);
  }

  /** Only call from a user gesture. Failure leaves drag + keyboard look usable. */
  async lock() {
    if (this.disposed || !this.enabled || !this.canLook()) return false;
    const generation = this.lockGeneration;
    this.canvas.focus?.();
    try {
      await this.canvas.requestPointerLock?.();
      if (
        this.disposed ||
        !this.enabled ||
        generation !== this.lockGeneration
      ) {
        if (this.document.pointerLockElement === this.canvas)
          this.document.exitPointerLock?.();
        return false;
      }
      return this.document.pointerLockElement === this.canvas;
    } catch {
      return false;
    }
  }

  look(yaw, pitch) {
    if (![yaw, pitch].every(Number.isFinite)) return;
    this.camera.rotation.y += yaw;
    this.camera.rotation.x = Math.max(
      -1.2,
      Math.min(1.2, this.camera.rotation.x + pitch),
    );
    this.camera.rotation.z = 0;
  }

  update(dt) {
    if (this.disposed || !this.enabled) return;
    if (editable(this.document.activeElement)) this.resetMotion();
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
        const speed =
          key('ShiftLeft') || key('ShiftRight') ? this.boostSpeed : this.speed;
        const yaw = this.camera.rotation.y;
        const distance = speed * step;
        const dx =
          ((-Math.sin(yaw) * forward + Math.cos(yaw) * right) / length) *
          distance;
        const dz =
          ((-Math.cos(yaw) * forward - Math.sin(yaw) * right) / length) *
          distance;
        const next = moveGrounded(this.camera.position, dx, dz, this);
        this.camera.position.x = next.x;
        this.camera.position.z = next.z;
      }
    } else {
      for (const code of MOVE_KEYS) this.keys.delete(code);
    }
    const p = this.camera.position;
    p.y = this.groundHeight(p.x, p.z) + this.eyeHeight;
  }

  resetMotion() {
    this.keys.clear();
    this.dragging = false;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      locked: this.document.pointerLockElement === this.canvas,
      eyeHeight: this.eyeHeight,
      playerRadius: this.playerRadius,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.setEnabled(false);
    this.disposed = true;
    this.abort.abort();
  }
}
