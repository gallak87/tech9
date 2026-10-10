export function createInput(onCommand, onBlur) {
  const keys = new Set(),
    touch = new Map(),
    abort = new AbortController();
  let gamepadPresent = false,
    enabled = true;
  const codes = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ShiftLeft',
    'ShiftRight',
    'Space',
  ];
  const clear = () => {
    keys.clear();
    touch.clear();
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (!enabled) return;
      if (e.target.matches('input,select')) return;
      if (e.code === 'Space' && e.target.matches('button')) return;
      if (codes.includes(e.code)) {
        e.preventDefault();
        keys.add(e.code);
      }
      if (!e.repeat) {
        const commands = {
          Escape: 'pause',
          KeyR: 'restart',
          KeyI: 'inspection',
          Enter: 'start',
          KeyC: 'camera',
        };
        if (
          commands[e.code] &&
          !(e.code === 'Enter' && e.target.matches('button'))
        )
          onCommand(commands[e.code]);
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener('keyup', (e) => keys.delete(e.code), {
    signal: abort.signal,
  });
  window.addEventListener(
    'blur',
    () => {
      clear();
      onBlur();
    },
    { signal: abort.signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        clear();
        onBlur();
      }
    },
    { signal: abort.signal },
  );
  const down = (...k) => k.some((v) => keys.has(v));
  return {
    clear,
    setEnabled(value) {
      enabled = value;
      if (!value) clear();
    },
    get gamepadPresent() {
      return gamepadPresent;
    },
    sample() {
      const t = [...touch.values()];
      const has = (a) => t.includes(a);
      let i = {
        throttle: down('ArrowUp', 'KeyW') || has('throttle') ? 1 : 0,
        brake: down('ArrowDown', 'KeyS') || has('brake') ? 1 : 0,
        steer:
          (down('ArrowRight', 'KeyD') || has('right') ? 1 : 0) -
          (down('ArrowLeft', 'KeyA') || has('left') ? 1 : 0),
        boost: down('ShiftLeft', 'ShiftRight') || has('boost'),
        airbrake: down('Space') || has('airbrake'),
      };
      let pad;
      try {
        pad = [...navigator.getGamepads()].find((p) => p?.connected);
      } catch {
        /* Gamepad capability is optional. */
      }
      gamepadPresent = !!pad;
      if (pad) {
        const x = pad.axes[0] || 0;
        if (Math.abs(x) > 0.15)
          i.steer = ((Math.abs(x) - 0.15) / 0.85) * Math.sign(x);
        i.throttle = Math.max(i.throttle, pad.buttons[7]?.value || 0);
        i.brake = Math.max(i.brake, pad.buttons[6]?.value || 0);
        i.boost ||= !!pad.buttons[0]?.pressed;
        i.airbrake ||= !!pad.buttons[1]?.pressed;
      }
      return i;
    },
    bindTouch(root) {
      root.querySelectorAll('[data-drive]').forEach((b) => {
        b.addEventListener(
          'pointerdown',
          (e) => {
            e.preventDefault();
            b.setPointerCapture(e.pointerId);
            touch.set(e.pointerId, b.dataset.drive);
          },
          { signal: abort.signal },
        );
        for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture'])
          b.addEventListener(kind, (e) => touch.delete(e.pointerId), {
            signal: abort.signal,
          });
      });
    },
    dispose() {
      clear();
      abort.abort();
    },
  };
}
