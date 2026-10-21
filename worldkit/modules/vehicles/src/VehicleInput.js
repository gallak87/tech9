export const DEFAULT_BINDINGS = Object.freeze({
  forward: Object.freeze(['KeyW', 'ArrowUp']),
  reverse: Object.freeze(['KeyS', 'ArrowDown']),
  left: Object.freeze(['KeyA', 'ArrowLeft']),
  right: Object.freeze(['KeyD', 'ArrowRight']),
  brake: Object.freeze(['Space']),
});
const DEFAULT_ACTIONS = Object.freeze({
  KeyC: 'camera',
  KeyR: 'recover',
  KeyT: 'restart',
});
const codes = (value, name) => {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    !value.every(
      (code) =>
        typeof code === 'string' && code.length > 0 && code.length <= 64,
    )
  )
    throw new TypeError(
      `${name} must be an array of up to 32 nonempty key codes.`,
    );
  return Object.freeze([...value]);
};
const isMenu = (element) =>
  element?.isContentEditable ||
  /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(element?.tagName) ||
  Boolean(element?.closest?.('[role="dialog"], [data-vehicle-input-block]'));

/** Owns only keyboard listeners and held state; menus and gameplay own actions. */
export class VehicleInput {
  constructor({
    target = globalThis.window,
    onAction = () => {},
    onPause = () => {},
    bindings = {},
    pauseKeys = ['Escape', 'KeyP', 'Tab'],
    actions = DEFAULT_ACTIONS,
    clearActions = ['recover', 'restart'],
  } = {}) {
    if (!target?.addEventListener || !target?.removeEventListener)
      throw new TypeError('VehicleInput target must be an EventTarget.');
    if (typeof onAction !== 'function' || typeof onPause !== 'function')
      throw new TypeError('VehicleInput callbacks must be functions.');
    if (
      !bindings ||
      typeof bindings !== 'object' ||
      Array.isArray(bindings) ||
      Object.keys(bindings).some(
        (name) => !Object.hasOwn(DEFAULT_BINDINGS, name),
      )
    )
      throw new TypeError(
        'bindings accepts forward, reverse, left, right and brake arrays.',
      );
    const mapped = Object.freeze(
      Object.fromEntries(
        Object.entries(DEFAULT_BINDINGS).map(([name, defaults]) => [
          name,
          codes(bindings[name] ?? defaults, `bindings.${name}`),
        ]),
      ),
    );
    const pauseCodes = codes(pauseKeys, 'pauseKeys');
    const clearing = new Set(codes(clearActions, 'clearActions'));
    if (
      !actions ||
      typeof actions !== 'object' ||
      Array.isArray(actions) ||
      Object.keys(actions).length > 32
    )
      throw new TypeError(
        'actions must map up to 32 key codes to nonempty action names.',
      );
    const actionMap = Object.freeze(
      Object.fromEntries(
        Object.entries(actions).map(([code, name]) => {
          if (
            !code ||
            code.length > 64 ||
            typeof name !== 'string' ||
            !name ||
            name.length > 64
          )
            throw new TypeError(
              'actions must map key codes to nonempty action names of at most 64 characters.',
            );
          return [code, name];
        }),
      ),
    );
    const all = [
      ...Object.values(mapped).flat(),
      ...pauseCodes,
      ...Object.keys(actionMap),
    ];
    if (new Set(all).size !== all.length)
      throw new TypeError(
        'Each key code must belong to exactly one binding, pause or action.',
      );
    const movement = new Set(Object.values(mapped).flat());
    const pauses = new Set(pauseCodes);
    Object.defineProperty(this, 'bindings', {
      value: mapped,
      enumerable: true,
    });
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
      if (!owner?.addEventListener || !owner?.removeEventListener) return;
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
        movement.has(event.code) ||
        Object.hasOwn(actionMap, event.code) ||
        pauses.has(event.code)
      )
        event.preventDefault();
      // Repeats after blur, pause or recovery cannot restore a held throttle.
      if (event.repeat) return;
      if (pauses.has(event.code)) this.pause('keyboard');
      else if (Object.hasOwn(actionMap, event.code)) {
        if (clearing.has(actionMap[event.code])) this.clear();
        this.onAction(actionMap[event.code]);
      } else if (movement.has(event.code)) this.keys.add(event.code);
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
    const any = (name) =>
      Number(this.bindings[name].some((key) => this.keys.has(key)));
    return {
      throttle: any('forward') - any('reverse'),
      steer: any('right') - any('left'),
      brake: any('brake'),
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
