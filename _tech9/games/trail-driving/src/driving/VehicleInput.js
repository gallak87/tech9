const MOVEMENT = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);
const ACTIONS = { KeyC: 'camera', KeyR: 'recover', KeyT: 'restart' };
const isMenu = (element) =>
  element?.isContentEditable ||
  /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(element?.tagName) ||
  Boolean(element?.closest?.('[role="dialog"], [data-driving-menu]'));

/** Owns only keyboard listeners and held state; menus and gameplay own actions. */
export class VehicleInput {
  constructor({
    target = globalThis.window,
    onAction = () => {},
    onPause = () => {},
  } = {}) {
    if (!target?.addEventListener)
      throw new TypeError('VehicleInput target must be an EventTarget.');
    this.target = target;
    this.document =
      target.document ?? target.ownerDocument ?? globalThis.document;
    this.onAction = onAction;
    this.onPause = onPause;
    this.keys = new Set();
    this._enabled = false;
    this.disposed = false;
    this.listeners = [];
    const listen = (owner, type, callback) => {
      if (!owner?.addEventListener) return;
      owner.addEventListener(type, callback);
      this.listeners.push(() => owner.removeEventListener(type, callback));
    };
    listen(target, 'keydown', (event) => {
      if (
        this.disposed ||
        !this._enabled ||
        isMenu(event.target) ||
        isMenu(this.document?.activeElement)
      )
        return;
      if (
        MOVEMENT.has(event.code) ||
        ACTIONS[event.code] ||
        ['Escape', 'KeyP', 'Tab'].includes(event.code)
      )
        event.preventDefault();
      // Repeats after blur, pause or recovery cannot restore a held throttle.
      if (event.repeat) return;
      if (['Escape', 'KeyP', 'Tab'].includes(event.code))
        this.pause('keyboard');
      else if (ACTIONS[event.code]) {
        if (ACTIONS[event.code] !== 'camera') this.clear();
        this.onAction(ACTIONS[event.code]);
      } else if (MOVEMENT.has(event.code)) this.keys.add(event.code);
    });
    listen(target, 'keyup', (event) => this.keys.delete(event.code));
    listen(target, 'blur', () => this.pause('blur'));
    listen(this.document, 'visibilitychange', () => {
      if (this.document.hidden) this.pause('hidden');
    });
    listen(this.document, 'focusin', (event) => {
      if (isMenu(event.target)) this.pause('menu');
    });
  }

  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    this.setEnabled(value);
  }

  setEnabled(value) {
    if (this.disposed) return;
    this._enabled = Boolean(value);
    this.clear();
  }

  clear() {
    this.keys.clear();
  }

  pause(reason) {
    this.clear();
    if (this.disposed || !this._enabled) return;
    this._enabled = false;
    this.onPause(reason);
  }

  sample() {
    if (isMenu(this.document?.activeElement)) this.pause('menu');
    if (!this._enabled || this.disposed)
      return { throttle: 0, steer: 0, brake: 0 };
    const any = (...keys) => Number(keys.some((key) => this.keys.has(key)));
    return {
      throttle: any('KeyW', 'ArrowUp') - any('KeyS', 'ArrowDown'),
      steer: any('KeyD', 'ArrowRight') - any('KeyA', 'ArrowLeft'),
      brake: any('Space'),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this._enabled = false;
    this.disposed = true;
    this.listeners.splice(0).forEach((remove) => remove());
  }
}
