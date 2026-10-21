const DEFAULT_BINDINGS = Object.freeze({
  pitchUp: ['ArrowDown'],
  pitchDown: ['ArrowUp'],
  rollLeft: ['ArrowLeft'],
  rollRight: ['ArrowRight'],
  yawLeft: ['KeyA'],
  yawRight: ['KeyD'],
  throttleUp: ['KeyW'],
  throttleDown: ['KeyS'],
  brake: ['KeyB'],
  level: ['Space'],
});
const editable = (element) =>
  !!element &&
  (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(element.tagName) ||
    element.isContentEditable ||
    !!element.closest?.(
      'input,select,textarea,button,[contenteditable]:not([contenteditable="false"])',
    ));

/** Owns keyboard listeners and held state. The consumer owns pause and actions. */
export class FlightInput {
  constructor({
    enabled = false,
    onPause = () => {},
    onAction = () => {},
    actions = {},
    pauseKeys = ['KeyP', 'Escape', 'Tab'],
    bindings = {},
    window: inputWindow = globalThis.window,
    document: inputDocument = globalThis.document,
  } = {}) {
    if (!inputWindow?.addEventListener || !inputDocument?.addEventListener)
      throw new TypeError('Input requires window and document event targets.');
    this.window = inputWindow;
    this.document = inputDocument;
    this.keys = new Set();
    this.enabled = !!enabled;
    this.disposed = false;
    this.bindings = {};
    for (const key of Object.keys(bindings))
      if (!Object.hasOwn(DEFAULT_BINDINGS, key))
        throw new TypeError(`Unknown binding: ${key}`);
    for (const name of Object.keys(DEFAULT_BINDINGS)) {
      const codes = bindings[name] ?? DEFAULT_BINDINGS[name];
      if (
        !Array.isArray(codes) ||
        !codes.every((code) => typeof code === 'string')
      )
        throw new TypeError(`Invalid ${name} bindings.`);
      this.bindings[name] = [...codes];
    }
    const motion = new Set(Object.values(this.bindings).flat()),
      actionMap = { ...actions },
      pauses = new Set(pauseKeys);
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
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
      pitch: Number(held('pitchUp')) - Number(held('pitchDown')),
      roll: Number(held('rollRight')) - Number(held('rollLeft')),
      yaw: Number(held('yawRight')) - Number(held('yawLeft')),
      throttle: Number(held('throttleUp')) - Number(held('throttleDown')),
      brake: held('brake'),
      level: held('level'),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.setEnabled(false);
    this.disposed = true;
    this.abort.abort();
  }
}
