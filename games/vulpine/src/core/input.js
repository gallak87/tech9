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
  help:    ['KeyH', 'Slash'],
  // Menu-only bindings. Separate from the flight controls on purpose: the menu
  // wants discrete presses, and `up`/`down` are a ramped analogue stick.
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  back:    ['Escape', 'Backspace'],
};

/** Human-readable control map — the on-screen legend renders straight from this. */
export const CONTROLS = [
  { keys: ['W', 'A', 'S', 'D'], alt: '↑ ← ↓ →', label: 'Steer' },
  { keys: ['SHIFT'], label: 'Boost' },
  { keys: ['CTRL'], alt: 'Q', label: 'Brake' },
  { keys: ['SPACE'], label: 'Fire' },
  { keys: ['B'], label: 'Bomb' },
  { keys: ['Z', 'C'], label: 'Barrel roll' },
  { keys: ['X'], label: 'Somersault' },
  { keys: ['H'], label: 'Hide controls' },
  { keys: ['ESC'], label: 'Pause' },
];

// Keyboard steering is digital, but the flight model wants an analogue stick.
// Ramping a virtual stick toward the held direction — and letting it self-centre
// faster than it deflects — is what makes key steering feel flown rather than
// switched.
const STICK_RISE = 7.2;    // full deflection in ~0.14 s
const STICK_FALL = 11.0;   // recentres in ~0.09 s

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
    helpPressed: false,
    confirmPressed: false, upPressed: false, downPressed: false,
    anyPressed: false,
    usingPad: false,
  },

  _stick: { x: 0, y: 0 },

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

    // Deliberately no mousemove steering: an absolute-position mouse never
    // returns to centre, so the ship drifts whenever the player lets go of the
    // keys. Steering is keyboard and gamepad only. Mouse buttons still fire.
    const stage = document.getElementById('stage') || document.body;
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

  update(dt, t) {
    const s = this.state;
    const prevFire = s.fire, prevBomb = s.bomb, prevRL = s.rollL, prevRR = s.rollR;

    let boost = 0, brake = 0;
    let fire = false, bomb = false, rollL = false, rollR = false;
    let somer = false, uturn = false;

    // ── keyboard → virtual analogue stick
    let tx = 0, ty = 0;
    if (this.held('up')) ty -= 1;
    if (this.held('down')) ty += 1;
    if (this.held('left')) tx -= 1;
    if (this.held('right')) tx += 1;
    // diagonals shouldn't be 1.41× faster than cardinals
    if (tx && ty) { const inv = Math.SQRT1_2; tx *= inv; ty *= inv; }

    const st = this._stick;
    const step = (cur, target) => {
      const rate = target === 0 ? STICK_FALL : STICK_RISE;
      const k = 1 - Math.exp(-rate * (dt || 1 / 60));
      return cur + (target - cur) * k;
    };
    st.x = step(st.x, tx);
    st.y = step(st.y, ty);
    if (Math.abs(st.x) < 1e-3) st.x = 0;
    if (Math.abs(st.y) < 1e-3) st.y = 0;

    let yaw = clamp(st.x, -1, 1);
    let pitch = clamp(st.y, -1, 1);

    if (this.held('boost')) boost = 1;
    if (this.held('brake')) brake = 1;
    fire = this.held('fire');
    bomb = this.held('bomb');
    rollL = this.held('rollL');
    rollR = this.held('rollR');
    somer = this.hit('somersault');
    uturn = this.hit('uturn');

    if (this._mouse.b0) fire = true;
    if (this._mouse.b2) bomb = true;

    // ── gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = this._padIndex != null ? pads[this._padIndex] : (pads && pads[0]);
    if (pad && pad.connected) {
      s.usingPad = true;
      const ax = dz(pad.axes[0]), ay = dz(pad.axes[1]);
      // A real stick outranks the ramped virtual one whenever it is deflected.
      if (ax || ay) { yaw = ax; pitch = ay; st.x = ax; st.y = ay; }
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
    s.helpPressed = this.hit('help');
    s.confirmPressed = this.hit('confirm');
    s.upPressed = this.hit('up');
    s.downPressed = this.hit('down');
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
