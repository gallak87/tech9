// ─────────────────────────────────────────────────────────────────────────────
// Game mode: title → playing ⇄ paused, plus the end-of-mission states.
//
// This is deliberately the only thing in the project that can stop the
// simulation. Everything else — flight, combat, fx, audio — stays ignorant of
// whether the game is running; they simply do not get ticked. That keeps pause
// from becoming a special case every subsystem has to remember to honour.
//
// Two details that matter more than they look:
//
//   1. INPUT IS SAMPLED OUTSIDE THE SIM.  `Input.update()` used to run inside
//      the fixed step, which meant a paused game stopped reading the keyboard
//      and could never be un-paused. main.js now samples input once per frame
//      and this module runs on that, not on sim time.
//   2. THE MENU RUNS ON REAL TIME.  Its animation uses frame dt, because sim
//      time is frozen exactly when the menu is on screen.
// ─────────────────────────────────────────────────────────────────────────────

export const MODE = {
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
};

const PAUSE_ITEMS = [
  { id: 'resume', label: 'RESUME' },
  { id: 'restart', label: 'RESTART MISSION' },
  { id: 'controls', label: 'CONTROLS' },
];

export function installMode(ctx, { startPaused = true } = {}) {
  const state = {
    mode: startPaused ? MODE.TITLE : MODE.PLAYING,
    index: 0,
    items: PAUSE_ITEMS,
    t: 0,              // real seconds in the current mode, for menu animation
    everStarted: !startPaused,
    fade: startPaused ? 1 : 0,
  };

  function enter(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    state.t = 0;
    state.index = 0;
  }

  function activate(id) {
    switch (id) {
      case 'resume':
        enter(MODE.PLAYING);
        break;
      case 'restart':
        // A full, honest reset. Re-deriving initial conditions for flight,
        // combat, fx and audio by hand is a bug farm for a feature nobody
        // presses twice a session; the level is deterministic, so a reload
        // lands in exactly the same place.
        location.reload();
        break;
      case 'controls':
        ctx.ui?.legend?.toggle();
        break;
      default:
        break;
    }
  }

  /** Called once per rendered frame with real (not sim) dt, before the sim. */
  function update(dt) {
    const s = ctx.input.state;
    state.t += dt;

    // Fade the menu scrim in/out so title↔play is not a hard cut.
    const want = state.mode === MODE.PLAYING ? 0 : 1;
    state.fade += (want - state.fade) * Math.min(1, dt * 9);

    if (state.mode === MODE.TITLE) {
      if (s.confirmPressed || s.pausePressed) {
        state.everStarted = true;
        enter(MODE.PLAYING);
      }
      return;
    }

    if (state.mode === MODE.PLAYING) {
      if (s.pausePressed) enter(MODE.PAUSED);
      return;
    }

    // paused
    if (s.pausePressed) { enter(MODE.PLAYING); return; }
    const n = state.items.length;
    if (s.upPressed) state.index = (state.index + n - 1) % n;
    if (s.downPressed) state.index = (state.index + 1) % n;
    if (s.confirmPressed) activate(state.items[state.index].id);
  }

  return {
    get mode() { return state.mode; },
    get index() { return state.index; },
    get items() { return state.items; },
    get t() { return state.t; },
    get fade() { return state.fade; },
    get everStarted() { return state.everStarted; },
    /** The one question main.js asks. */
    get simActive() { return state.mode === MODE.PLAYING; },
    set(mode) { enter(mode); },
    update,
  };
}
