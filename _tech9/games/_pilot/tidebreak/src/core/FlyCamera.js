import { Euler, Vector3 } from 'three';

export class FlyCamera {
  constructor(camera, canvas, bounds, groundHeight) {
    this.camera = camera;
    this.canvas = canvas;
    this.bounds = bounds;
    this.groundHeight = groundHeight;
    this.keys = new Set();
    this.velocity = new Vector3();
    this.direction = new Vector3();
    this.forward = new Vector3();
    this.right = new Vector3();
    this.rotation = new Euler(0, 0, 0, 'YXZ');
    this.dragging = false;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)
        )
          return;
        if (
          [
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'KeyQ',
            'KeyE',
            'ShiftLeft',
            'ShiftRight',
            'Space',
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
        this.keys.clear();
        this.dragging = false;
      },
      options,
    );
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button === 0) this.dragging = true;
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
    document.addEventListener(
      'pointerlockchange',
      () => {
        this.keys.clear();
        this.dragging = false;
      },
      options,
    );
    window.addEventListener(
      'mousemove',
      (event) => {
        if (document.pointerLockElement !== canvas && !this.dragging) return;
        this.rotation.setFromQuaternion(camera.quaternion);
        this.rotation.y -= event.movementX * 0.0018;
        this.rotation.x = Math.max(
          -1.45,
          Math.min(1.45, this.rotation.x - event.movementY * 0.0018),
        );
        camera.quaternion.setFromEuler(this.rotation);
      },
      options,
    );
  }
  async lock() {
    try {
      await this.canvas.requestPointerLock();
    } catch {
      /* Drag-to-look remains available when pointer lock is unavailable. */
    }
  }
  update(dt) {
    const key = (code) => (this.keys.has(code) ? 1 : 0);
    this.camera.getWorldDirection(this.forward);
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
      );
    this.direction.y += key('KeyE') + key('Space') - key('KeyQ');
    this.direction
      .clampLength(0, 1)
      .multiplyScalar(key('ShiftLeft') || key('ShiftRight') ? 15 : 5);
    this.velocity.lerp(this.direction, 1 - Math.exp(-dt * 9));
    this.camera.position.addScaledVector(this.velocity, dt);
    const p = this.camera.position;
    p.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, p.x));
    p.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, p.z));
    p.y = Math.max(
      this.bounds.minY,
      this.groundHeight(p.x, p.z) + 0.85,
      Math.min(this.bounds.maxY, p.y),
    );
  }
  resetMotion() {
    this.keys.clear();
    this.velocity.set(0, 0, 0);
  }
  dispose() {
    this.abort.abort();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
}
