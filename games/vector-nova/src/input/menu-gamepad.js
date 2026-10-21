import { readGamepad } from './gamepad.js';

// Controller navigation uses the same menu actions as keyboard/mouse.
// Racing remains owned by createInput; no synthetic throttle/steering here.
export function menuIntent(pad, { stickNavigation = true } = {}) {
  const pressed = (i) => !!pad?.buttons[i]?.pressed;
  return {
    accept: pressed(0),
    back: pressed(1),
    pause: pressed(9),
    music: pressed(8),
    camera: pressed(2),
    x: pressed(14)
      ? -1
      : pressed(15)
        ? 1
        : stickNavigation && Math.abs(pad?.axes[0] ?? 0) > 0.55
          ? Math.sign(pad.axes[0])
          : 0,
    y: pressed(12)
      ? -1
      : pressed(13)
        ? 1
        : stickNavigation && Math.abs(pad?.axes[1] ?? 0) > 0.55
          ? Math.sign(pad.axes[1])
          : 0,
  };
}
export function bindMenuGamepad(signal, { toggleMusic = () => {} } = {}) {
  let previous = {},
    direction = '',
    nextRepeat = 0,
    connected = false,
    padIdentity = null,
    frame;
  const visible = (element) =>
    element &&
    element.getClientRects().length &&
    !element.closest('[hidden], .hidden, [inert]');
  const menuRoot = () => {
    const music = document.querySelector(
      '[data-music-player][data-menu-active]',
    );
    if (visible(music)) return music;
    const front = document.querySelector('#front-shell');
    if (visible(front)) return front;
    const inspector = document.querySelector('#inspector-host');
    if (visible(inspector)) return inspector;
    const pause = document.querySelector('#pause-panel');
    return visible(pause) ? pause : null;
  };
  function key(value, code = value) {
    const target =
      value === 'Escape'
        ? (menuRoot() ?? document.body)
        : (document.activeElement ?? document.body);
    return !target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        code,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  function navigate(root, x, y) {
    const controls = [
      ...root.querySelectorAll('button, select, input, [tabindex]'),
    ].filter(
      (el) =>
        !el.disabled && el.tabIndex >= 0 && visible(el) && el.type !== 'hidden',
    );
    let target = document.activeElement;
    if (!controls.includes(target)) {
      controls[0]?.focus();
      return;
    }
    if (x && target.matches('input[type="range"], select')) {
      if (target.tagName === 'SELECT')
        target.selectedIndex = Math.max(
          0,
          Math.min(target.options.length - 1, target.selectedIndex + x),
        );
      else
        target.value = String(
          Math.max(
            Number(target.min),
            Math.min(
              Number(target.max),
              target.valueAsNumber + x * Number(target.step || 1),
            ),
          ),
        );
      if (target.matches('input[type="range"]'))
        target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // Existing grid/list handlers retain their own spatial navigation.
    if (
      target.matches('button') &&
      root.id !== 'pause-panel' &&
      key(
        x
          ? x < 0
            ? 'ArrowLeft'
            : 'ArrowRight'
          : y < 0
            ? 'ArrowUp'
            : 'ArrowDown',
      ) &&
      document.activeElement !== target
    )
      return;
    // A spatial handler at an edge may leave focus unchanged. Continue through
    // the root's native controls so header/global actions remain reachable.
    const index = controls.indexOf(target);
    controls[(index + (x || y) + controls.length) % controls.length]?.focus();
  }
  function poll(now) {
    if (signal.aborted) return;
    const pad = readGamepad();
    const root = menuRoot();
    if (connected && !pad && !root) key('Escape');
    connected = !!pad;
    // Calibration must not edit its own value while the player tests full lock.
    // D-pad navigation remains available throughout the controller section.
    const intent = menuIntent(pad, {
      stickNavigation: !document.activeElement?.closest('.controller-settings'),
    });
    const identity = pad ? `${pad.index}:${pad.id}` : null;
    if (identity !== padIdentity) {
      // Connecting with A/Start held must not activate or resume a menu.
      previous = intent;
      direction = '';
      nextRepeat = 0;
      padIdentity = identity;
    }
    if (!document.hidden) {
      if (intent.music && !previous.music) toggleMusic();
      if (intent.pause && !previous.pause) key('Escape');
      else if (root) {
        if (intent.back && !previous.back) key('Escape');
        if (intent.accept && !previous.accept) {
          const target = document.activeElement;
          if (root.contains(target) && visible(target)) target.click();
          else navigate(root, 0, 1);
        }
        const current = `${intent.x},${intent.y}`;
        if (
          (intent.x || intent.y) &&
          (current !== direction || now >= nextRepeat)
        ) {
          navigate(root, intent.x, intent.y);
          nextRepeat = now + (current !== direction ? 350 : 140);
        }
        direction = current;
      } else if (intent.camera && !previous.camera) key('c', 'KeyC');
    }
    previous = intent;
    frame = requestAnimationFrame(poll);
  }
  frame = requestAnimationFrame(poll);
  signal.addEventListener('abort', () => cancelAnimationFrame(frame), {
    once: true,
  });
}
