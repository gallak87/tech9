const DEFAULT_BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  reverse: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
});
const editable = (element) =>
  !!element &&
  (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(element.tagName) ||
    element.isContentEditable ||
    !!element.closest?.(
      'input,select,textarea,button,[contenteditable]:not([contenteditable="false"])',
    ));

/** Input lifetime only. The consumer owns pause/resume/reset and game state. */
export class BoatInput {
  constructor({
    enabled = false,
    onPause = () => {},
    onAction = () => {},
    actions = {},
    pauseKeys = ['KeyP', 'Escape', 'Tab'],
    bindings = DEFAULT_BINDINGS,
    canvas,
    window: inputWindow = window,
    document: inputDocument = document,
  } = {}) {
    this.window = inputWindow;
    this.document = inputDocument;
    this.canvas = canvas;
    this.keys = new Set();
    this.enabled = !!enabled;
    this.disposed = false;
    this.bindings = {};
    for (const name of Object.keys(DEFAULT_BINDINGS)) {
      const codes = bindings[name];
      if (
        !Array.isArray(codes) ||
        !codes.every((code) => typeof code === 'string')
      )
        throw new TypeError(`Invalid ${name} bindings.`);
      this.bindings[name] = [...codes];
    }
    const motion = new Set(Object.values(this.bindings).flat());
    const actionMap = { ...actions },
      pauses = new Set(pauseKeys);
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    this._ownedLock = !!canvas && inputDocument.pointerLockElement === canvas;
    const pause = (reason) => {
      const active = this.enabled;
      this.setEnabled(false);
      if (active) onPause(reason);
    };
    inputWindow.addEventListener(
      'keydown',
      (event) => {
        if (
          !this.enabled ||
          editable(event.target) ||
          editable(inputDocument.activeElement)
        ) {
          this.clear();
          return;
        }
        if (pauses.has(event.code)) {
          event.preventDefault();
          if (!event.repeat) pause('keyboard');
        } else if (motion.has(event.code)) {
          event.preventDefault();
          if (!event.repeat) this.keys.add(event.code);
        } else if (!event.repeat && Object.hasOwn(actionMap, event.code)) {
          event.preventDefault();
          this.clear();
          onAction(actionMap[event.code]);
        }
      },
      options,
    );
    inputWindow.addEventListener(
      'keyup',
      (event) => this.keys.delete(event.code),
      options,
    );
    inputWindow.addEventListener('blur', () => pause('blur'), options);
    inputDocument.addEventListener(
      'focusin',
      (event) => {
        if (editable(event.target)) this.clear();
      },
      options,
    );
    inputDocument.addEventListener(
      'visibilitychange',
      () => {
        if (inputDocument.hidden) pause('hidden');
      },
      options,
    );
    if (canvas)
      inputDocument.addEventListener(
        'pointerlockchange',
        () => {
          const owned = inputDocument.pointerLockElement === canvas;
          if (this._ownedLock && !owned) pause('pointer-lock');
          this._ownedLock = owned;
        },
        options,
      );
  }

  setEnabled(value) {
    this.clear();
    this.enabled = !this.disposed && !!value;
  }
  clear() {
    this.keys.clear();
  }
  sample() {
    if (!this.enabled || editable(this.document.activeElement)) this.clear();
    const held = (name) =>
      this.bindings[name].some((code) => this.keys.has(code));
    return {
      throttle: Number(held('forward')) - Number(held('reverse')),
      steer: Number(held('right')) - Number(held('left')),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.setEnabled(false);
    this.disposed = true;
    this.abort.abort();
  }
}
