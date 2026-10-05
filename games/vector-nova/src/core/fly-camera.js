import * as T from 'three';

const FLY_SPEED = 200;

/** Shared inspection controls. Simulation ownership stays in core/main. */
export function createFlyCamera(camera, canvas, { toggle, exit } = {}) {
  const abort = new AbortController();
  const keys = new Set();
  const touches = new Map();
  const orientation = new T.Euler(0, 0, 0, 'YXZ');
  const movement = new T.Vector3();
  const forward = new T.Vector3();
  const right = new T.Vector3();
  const worldUp = new T.Vector3(0, 1, 0);
  let active = false,
    saved,
    pointer = null,
    pointerX = 0,
    pointerY = 0;
  const motionKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
  ]);
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, {
      ...options,
      signal: abort.signal,
    });
  function releaseLook() {
    if (pointer !== null && canvas.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
    pointer = null;
  }
  function clear() {
    keys.clear();
    touches.clear();
    releaseLook();
  }
  listen(
    window,
    'keydown',
    (event) => {
      if (active && event.code === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) exit?.();
        return;
      }
      if (
        event.target.closest?.(
          'input, select, textarea, [contenteditable="true"]',
        )
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'KeyF') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) toggle?.();
        return;
      }
      if (!active) return;
      if (motionKeys.has(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        keys.add(event.code);
      } else if (
        ['KeyR', 'KeyI', 'KeyC'].includes(event.code) ||
        (['Enter', 'Space'].includes(event.code) &&
          !event.target.closest?.('button'))
      ) {
        // Driving shortcuts cannot alter the frozen session during inspection.
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
  listen(window, 'keyup', (event) => keys.delete(event.code));
  listen(window, 'blur', clear);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) clear();
  });
  listen(canvas, 'pointerdown', (event) => {
    if (!active || event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(pointer);
  });
  listen(canvas, 'pointermove', (event) => {
    if (!active || event.pointerId !== pointer) return;
    orientation.y -= (event.clientX - pointerX) * 0.003;
    orientation.x = T.MathUtils.clamp(
      orientation.x - (event.clientY - pointerY) * 0.003,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );
    camera.quaternion.setFromEuler(orientation);
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    listen(canvas, type, (event) => {
      if (event.pointerId === pointer) releaseLook();
    });
  const down = (...codes) =>
    codes.some(
      (code) => keys.has(code) || [...touches.values()].includes(code),
    );
  return {
    get active() {
      return active;
    },
    enter() {
      if (active) return;
      saved = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        up: camera.up.clone(),
        fov: camera.fov,
      };
      clear();
      active = true;
      orientation.setFromQuaternion(camera.quaternion, 'YXZ');
      orientation.z = 0;
      camera.quaternion.setFromEuler(orientation);
      camera.up.copy(worldUp);
      camera.fov = 64;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      canvas.classList.add('fly-camera-active');
    },
    leave() {
      if (!active) return;
      active = false;
      clear();
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.up.copy(saved.up);
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      canvas.classList.remove('fly-camera-active');
    },
    update(dt) {
      if (!active) return;
      camera.getWorldDirection(forward);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      movement
        .copy(forward)
        .multiplyScalar(
          Number(down('KeyW', 'ArrowUp')) - Number(down('KeyS', 'ArrowDown')),
        );
      movement.addScaledVector(
        right,
        Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft')),
      );
      movement.addScaledVector(
        worldUp,
        Number(down('KeyE')) - Number(down('KeyQ')),
      );
      if (movement.lengthSq() > 0)
        camera.position.addScaledVector(
          movement.normalize(),
          Math.min(Math.max(dt, 0), 0.1) * FLY_SPEED,
        );
    },
    bindControls(root) {
      root.querySelectorAll('[data-fly]').forEach((button) => {
        listen(button, 'pointerdown', (event) => {
          if (!active) return;
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          touches.set(event.pointerId, button.dataset.fly);
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
          listen(button, type, (event) => touches.delete(event.pointerId));
      });
    },
    dispose() {
      this.leave();
      clear();
      abort.abort();
    },
  };
}
