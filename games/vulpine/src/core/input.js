// Unified input: keyboard + mouse + gamepad -> one normalized state object.
// The flight model only ever reads `Input.state`; nothing else touches events.

const KEYMAP = {
  up:      ['ArrowUp', 'KeyW'],
  down:    ['ArrowDown', 'KeyS'],
  left:    ['ArrowLeft', 'KeyA'],
  right:   ['ArrowRight', 'KeyD'],
  fire:    ['Space', 'KeyJ'],
  bomb:    ['KeyB', 'KeyK'],
  boost:   ['ShiftLeft', 'ShiftRight', 'KeyE'],
  brake:   ['ControlLeft', 'KeyQ'],
  rollL:   ['KeyZ', 'Comma'],
  rollR:   ['KeyC', 'Period'],
  somersault: ['KeyX'],
  uturn:   ['KeyV'],
  pause:   ['Escape', 'KeyP'],
  view:    ['KeyF'],
};

export const Input = {
  state: {
    pitch: 0, yaw: 0,          // -1..1 analog stick
    fire: false, firePressed: false,
    bomb: false, bombPressed: false,
    boost: 0, brake: 0,        // 0..1 analog triggers
    rollL: false, rollR: false,
    rollLPressed: false, rollRPressed: false,
    somersaultPressed: false, uturnPressed: false,
    pausePressed: false, viewPressed: false,
    anyPressed: false,
    usingMouse: false, usingPad: false,
  },

  _down: new Set(),
  _pressed: new Set(),
  _mouse: { x: 0, y: 0, active: false, b0: false, b2: false },
  _padIndex: null,
  _scripted: null,   // capture harness override

  init(el = window) {
    this._el = el;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Tab' || e.code === 'F5') return;
      this._down.add(e.code); this._pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this._down.delete(e.code));
    window.addEventListener('blur', () => { this._down.clear(); });

    const stage = document.getElementById('stage') || document.body;
    stage.addEventListener('mousemove', (e) => {
      const r = stage.getBoundingClientRect();
      this._mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this._mouse.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      this._mouse.active = true;
      this.state.usingMouse = true;
    });
    stage.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._mouse.b0 = true;
      if (e.button === 2) this._mouse.b2 = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._mouse.b0 = false;
      if (e.button === 2) this._mouse.b2 = false;
    });
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', (e) => { this._padIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this._padIndex = null; });
  },

  /** Capture harness drives input without real devices. */
  script(fn) { this._scripted = fn; },

  held(action) { return KEYMAP[action].some(c => this._down.has(c)); },
  hit(action) { return KEYMAP[action].some(c => this._pressed.has(c)); },

  update(t) {
    const s = this.state;
    const prevFire = s.fire, prevBomb = s.bomb, prevRL = s.rollL, prevRR = s.rollR;

    let pitch = 0, yaw = 0, boost = 0, brake = 0;
    let fire = false, bomb = false, rollL = false, rollR = false;
    let somer = false, uturn = false;

    // ── keyboard
    if (this.held('up')) pitch -= 1;
    if (this.held('down')) pitch += 1;
    if (this.held('left')) yaw -= 1;
    if (this.held('right')) yaw += 1;
    if (this.held('boost')) boost = 1;
    if (this.held('brake')) brake = 1;
    fire = this.held('fire');
    bomb = this.held('bomb');
    rollL = this.held('rollL');
    rollR = this.held('rollR');
    somer = this.hit('somersault');
    uturn = this.hit('uturn');

    // ── mouse (aim overrides stick when moved recently)
    if (this._mouse.active && !pitch && !yaw) {
      yaw = clamp(this._mouse.x * 1.25, -1, 1);
      pitch = clamp(this._mouse.y * 1.25, -1, 1);
    }
    if (this._mouse.b0) fire = true;
    if (this._mouse.b2) bomb = true;

    // ── gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = this._padIndex != null ? pads[this._padIndex] : (pads && pads[0]);
    if (pad && pad.connected) {
      s.usingPad = true;
      const ax = dz(pad.axes[0]), ay = dz(pad.axes[1]);
      if (ax || ay) { yaw = ax; pitch = ay; }
      if (pad.buttons[0]?.pressed) fire = true;
      if (pad.buttons[2]?.pressed) bomb = true;
      boost = Math.max(boost, pad.buttons[7]?.value || 0);
      brake = Math.max(brake, pad.buttons[6]?.value || 0);
      if (pad.buttons[5]?.pressed) rollR = true;
      if (pad.buttons[4]?.pressed) rollL = true;
    }

    s.pitch = pitch; s.yaw = yaw;
    s.boost = boost; s.brake = brake;
    s.fire = fire; s.bomb = bomb;
    s.rollL = rollL; s.rollR = rollR;
    s.firePressed = fire && !prevFire;
    s.bombPressed = bomb && !prevBomb;
    s.rollLPressed = rollL && !prevRL;
    s.rollRPressed = rollR && !prevRR;
    s.somersaultPressed = somer;
    s.uturnPressed = uturn;
    s.pausePressed = this.hit('pause');
    s.viewPressed = this.hit('view');
    s.anyPressed = this._pressed.size > 0 || s.firePressed;

    if (this._scripted) this._scripted(s, t);

    this._pressed.clear();
  },
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dz(v, d = 0.16) {
  if (v == null) return 0;
  const a = Math.abs(v);
  if (a < d) return 0;
  return Math.sign(v) * ((a - d) / (1 - d)) ** 1.35;
}
