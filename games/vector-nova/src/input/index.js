import { createTouchControls } from './touch.js';

export function createInput(onCommand, onBlur) {
  const keys = new Set(),
    abort = new AbortController();
  let gamepadPresent = false,
    enabled = true;
  const touch = createTouchControls(abort.signal, () => enabled);
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
      if (!enabled || e.defaultPrevented) return;
      if (e.target.closest('input,select,textarea,summary')) return;
      if (e.code === 'Space' && e.target.matches('button')) return;
      if (codes.includes(e.code)) {
        e.preventDefault();
        keys.add(e.code);
      }
      if (!e.repeat) {
        const commands = {
          Escape: 'pause',
          KeyR: 'restart',
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
  window.addEventListener('resize', () => touch.clear(), {
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
      const t = touch.sample();
      let i = {
        throttle: down('ArrowUp', 'KeyW') ? 1 : t.throttle,
        brake: down('ArrowDown', 'KeyS') ? 1 : t.brake,
        steer:
          Number(down('ArrowRight', 'KeyD')) -
            Number(down('ArrowLeft', 'KeyA')) || t.steer,
        boost: down('ShiftLeft', 'ShiftRight') || t.boost,
        airbrake: down('Space') || t.airbrake,
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
      touch.bind(root);
    },
    dispose() {
      clear();
      abort.abort();
    },
  };
}
