const KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyB',
  'Space',
]);
export class FlightInput {
  constructor({
    onAction,
    onBlur,
    target = window,
    documentTarget = document,
  }) {
    this.keys = new Set();
    this.target = target;
    this.documentTarget = documentTarget;
    this.down = (event) => {
      if (/INPUT|SELECT|TEXTAREA/.test(event.target?.tagName)) return;
      if (KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
      if (
        !event.repeat &&
        ['KeyP', 'Escape', 'KeyR', 'KeyC', 'KeyM'].includes(event.code)
      ) {
        event.preventDefault();
        onAction(event.code);
      }
    };
    this.up = (event) => {
      this.keys.delete(event.code);
    };
    this.blur = () => {
      this.reset();
      onBlur();
    };
    this.visibility = () => {
      if (documentTarget.hidden) this.blur();
    };
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.blur);
    documentTarget.addEventListener('visibilitychange', this.visibility);
  }
  sample() {
    const k = this.keys;
    return {
      pitch: Number(k.has('ArrowDown')) - Number(k.has('ArrowUp')),
      roll: Number(k.has('ArrowRight')) - Number(k.has('ArrowLeft')),
      yaw: Number(k.has('KeyD')) - Number(k.has('KeyA')),
      throttle: Number(k.has('KeyW')) - Number(k.has('KeyS')),
      brake: k.has('KeyB'),
      level: k.has('Space'),
    };
  }
  reset() {
    this.keys.clear();
  }
  dispose() {
    this.reset();
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.blur);
    this.documentTarget.removeEventListener(
      'visibilitychange',
      this.visibility,
    );
  }
}
