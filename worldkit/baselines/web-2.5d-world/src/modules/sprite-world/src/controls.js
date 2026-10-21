import { TouchMovement } from './touch-input.js';
export function mountControls({
  surface,
  container,
  touch = 'auto',
  onInteract = () => {},
  onPoint = () => {},
  onPause = () => {},
  canMove = () => true,
} = {}) {
  const abort = new AbortController(),
    keys = new Set(),
    stick = new TouchMovement();
  let enabled = true,
    active = false;
  const root = document.createElement('nav');
  root.className = 'sprite-controls';
  root.setAttribute('aria-label', 'Exploration controls');
  root.innerHTML =
    '<div class="sprite-stick" role="group" aria-label="Movement stick"><span class="sprite-stick-knob"></span><span class="sprite-stick-label">Move</span></div><button class="sprite-action" type="button" data-action="run" aria-pressed="false">Walk</button><button class="sprite-action" type="button" data-action="interact" disabled>Interact</button>';
  (container || surface.parentElement).append(root);
  const pad = root.querySelector('.sprite-stick'),
    knob = root.querySelector('.sprite-stick-knob'),
    run = root.querySelector('[data-action="run"]'),
    interact = root.querySelector('[data-action="interact"]');
  pad.style.touchAction = 'none';
  surface.tabIndex = 0;
  surface.style.touchAction = 'none';
  const visible =
    touch === true ||
    (touch === 'auto' &&
      (matchMedia('(pointer: coarse)').matches ||
        navigator.maxTouchPoints > 0));
  root.hidden = !visible;
  const listen = (element, event, handler) =>
    element.addEventListener(event, handler, { signal: abort.signal });
  const paint = () => {
    knob.style.transform = `translate(calc(-50% + ${stick.x * 32}px),calc(-50% + ${stick.y * 32}px))`;
    run.textContent = stick.run ? 'Run' : 'Walk';
    run.setAttribute('aria-pressed', String(stick.run));
  };
  const clear = () => {
    keys.clear();
    const pointer = stick.pointer;
    stick.reset();
    if (pointer !== null && pad.hasPointerCapture(pointer))
      pad.releasePointerCapture(pointer);
    paint();
  };
  const allowed = () => enabled && canMove();
  listen(pad, 'pointerdown', (event) => {
    if (!allowed() || event.button > 0) return;
    const rect = pad.getBoundingClientRect();
    if (
      !stick.begin(
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
        {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          radius: rect.width * 0.37,
        },
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    active = true;
    pad.setPointerCapture(event.pointerId);
    onPoint(null);
    paint();
  });
  listen(pad, 'pointermove', (event) => {
    if (stick.update(event.pointerId, event.clientX, event.clientY)) {
      event.preventDefault();
      paint();
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    listen(pad, type, (event) => {
      stick.end(event.pointerId, event.timeStamp, type !== 'pointerup');
      paint();
    });
  listen(run, 'click', () => {
    if (allowed()) {
      stick.run = !stick.run;
      paint();
    }
  });
  listen(interact, 'click', () => {
    if (allowed()) onInteract();
  });
  listen(surface, 'pointerdown', (event) => {
    if (event.button > 0 || !allowed()) return;
    active = true;
    surface.focus({ preventScroll: true });
    onPoint({ x: event.clientX, y: event.clientY });
  });
  listen(surface, 'focus', () => {
    active = true;
  });
  listen(document, 'pointerdown', (event) => {
    if (
      !surface.parentElement?.contains(event.target) &&
      !root.contains(event.target)
    ) {
      active = false;
      clear();
    }
  });
  listen(window, 'keydown', (event) => {
    if (
      !active ||
      (event.repeat && event.key === 'Escape') ||
      /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(event.target?.tagName || '') ||
      event.target?.isContentEditable
    )
      return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      clear();
      onPause();
      return;
    }
    if (!allowed()) return;
    if (
      [
        'arrowleft',
        'arrowright',
        'arrowup',
        'arrowdown',
        'w',
        'a',
        's',
        'd',
        'shift',
      ].includes(key)
    ) {
      event.preventDefault();
      keys.add(key);
      onPoint(null);
    } else if (
      (key === 'f' || key === 'e' || key === 'enter') &&
      !event.repeat &&
      event.target === surface
    ) {
      event.preventDefault();
      onInteract();
    }
  });
  listen(window, 'keyup', (event) => keys.delete(event.key.toLowerCase()));
  listen(window, 'blur', () => {
    active = false;
    clear();
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) clear();
  });
  return {
    root,
    touchVisible: visible,
    clear,
    focus() {
      active = true;
      surface.focus({ preventScroll: true });
    },
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) clear();
      pad.setAttribute('aria-disabled', String(!enabled));
      run.disabled = !enabled;
    },
    setInteraction(object) {
      interact.disabled = !object || !enabled;
      interact.textContent = object?.interact?.label || 'Interact';
    },
    get movement() {
      if (!allowed()) return { x: 0, y: 0, run: false };
      let x =
          Number(keys.has('d') || keys.has('arrowright')) -
          Number(keys.has('a') || keys.has('arrowleft')),
        y =
          Number(keys.has('s') || keys.has('arrowdown')) -
          Number(keys.has('w') || keys.has('arrowup'));
      const length = Math.hypot(x, y);
      if (length)
        return { x: x / length, y: y / length, run: keys.has('shift') };
      return { ...stick.movement };
    },
    dispose() {
      clear();
      abort.abort();
      root.remove();
    },
  };
}
