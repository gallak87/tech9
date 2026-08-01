// ─────────────────────────────────────────────────────────────────────────────
// Dev panel — a DOM overlay of playtest shortcuts.
//
// Deliberately NOT drawn on the HUD canvas. The HUD is a game object that gets
// screenshotted, reviewed against a rubric and shipped; this is scaffolding.
// Keeping it in the DOM means it can never leak into a capture by accident, it
// costs nothing per frame, and it can be styled in ten lines instead of drawn.
//
// Hidden by default and toggled with backquote. That is not tidiness — the
// screenshot harness drives the same dev server the owner plays on, and it never
// touches the keyboard, so "hidden until a key is pressed" is exactly the
// guarantee that review frames stay clean. `?dev=1` opens it on load.
//
// Everything here talks to the game through `window.__VULPINE__` only. No
// imports from the sim, so nothing in here can change how the game behaves when
// the panel is closed.
// ─────────────────────────────────────────────────────────────────────────────

const CSS = `
.vdev {
  position: fixed; right: 12px; bottom: 12px; z-index: 50;
  display: none; flex-direction: column; gap: 5px; width: 186px;
  padding: 9px; border-radius: 7px;
  background: rgba(6,12,20,0.88); border: 1px solid rgba(120,200,255,0.28);
  box-shadow: 0 6px 22px rgba(0,0,0,0.5);
  font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #cfe6f7; user-select: none;
}
.vdev.open { display: flex; }
.vdev h6 {
  margin: 0 0 2px; font-size: 9px; letter-spacing: 1.6px; font-weight: 600;
  color: #ffb454; text-transform: uppercase;
}
.vdev button {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 6px 7px; cursor: pointer; text-align: left;
  font: inherit; color: #cfe6f7;
  background: rgba(20,38,56,0.9); border: 1px solid rgba(120,200,255,0.22);
  border-radius: 4px;
}
.vdev button:hover { background: rgba(32,58,84,0.95); border-color: rgba(120,200,255,0.45); }
.vdev button:active { transform: translateY(1px); }
.vdev button[data-on="1"] { background: rgba(30,74,52,0.95); border-color: rgba(120,255,180,0.5); color: #d6ffe8; }
.vdev button[disabled] { opacity: 0.45; cursor: default; }
.vdev kbd {
  flex: none; min-width: 15px; padding: 1px 4px; text-align: center;
  font: inherit; font-size: 10px; color: #9fd0ff;
  background: rgba(0,0,0,0.45); border: 1px solid rgba(120,200,255,0.3);
  border-radius: 3px;
}
.vdev .vdev-hint { font-size: 9px; color: #6f8ba3; letter-spacing: 0.4px; }
`;

export function installDevPanel(api) {
  if (typeof document === 'undefined' || document.querySelector('.vdev')) return null;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'vdev';

  let infiniteBombs = false;
  let busy = false;

  /* ── tools ──────────────────────────────────────────────────────────────── */

  /**
   * Run the sim forward until the carrier exists.
   *
   * `seekTo` only ever steps FORWARD (`while simTime < target`), so seeking to a
   * fixed time is a no-op once you are past it — hence the range guard and the
   * top-up loop. Replaying the sim rather than teleporting the rail is the whole
   * point: waves fire off `flight.railZ` crossings, so jumping the position
   * would leave `firedWaves` behind and dump seventeen backlogged waves into one
   * tick the moment the update loop caught up.
   */
  function skipToBoss(btn) {
    if (busy) return;
    if (api.combat.boss) { flash(btn, 'already'); return; }
    busy = true;
    setLabel(btn, 'seeking…');
    // Let the label paint before we block the thread for a few thousand steps.
    requestAnimationFrame(() => {
      try {
        api.seek(48);                         // ~z -8300 at 175 m/s
        let guard = 0;
        while (!api.combat.boss && guard++ < 400) api.step(30);
      } finally {
        busy = false;
        render();
        if (!api.combat.boss) flash(btn, 'no boss?');
      }
    });
  }

  function toggleBombs() { infiniteBombs = !infiniteBombs; render(); }

  const TOOLS = [
    { id: 'boss', label: 'Skip to boss', tag: '1', code: 'Digit1', run: skipToBoss },
    { id: 'bombs', label: 'Infinite bombs', tag: '2', code: 'Digit2', run: toggleBombs, on: () => infiniteBombs },
  ];

  /* ── dom ────────────────────────────────────────────────────────────────── */

  const head = document.createElement('h6');
  head.textContent = 'dev';
  root.appendChild(head);

  const buttons = new Map();
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    const name = document.createElement('span');
    name.textContent = t.label;
    const kbd = document.createElement('kbd');
    kbd.textContent = t.tag;
    b.append(name, kbd);
    b.addEventListener('click', () => {
      t.run(b);
      // A focused button eats the next Space as a re-click, and Space is the
      // fire key — without this, one click on a tool permanently rebinds the
      // player's trigger to that tool.
      b.blur();
    });
    root.appendChild(b);
    buttons.set(t.id, { el: b, name, tool: t });
  }

  const hint = document.createElement('div');
  hint.className = 'vdev-hint';
  hint.textContent = '` to hide';
  root.appendChild(hint);
  document.body.appendChild(root);

  function setLabel(btn, text) {
    for (const { el, name, tool } of buttons.values()) if (el === btn) name.textContent = text || tool.label;
  }

  function flash(btn, text) {
    setLabel(btn, text);
    setTimeout(() => setLabel(btn, null), 900);
  }

  function render() {
    for (const { el, name, tool } of buttons.values()) {
      if (tool.on) el.dataset.on = tool.on() ? '1' : '0';
      if (!busy) name.textContent = tool.label;
    }
    buttons.get('boss').el.disabled = busy || !!api.combat.boss;
  }

  /* ── keys ───────────────────────────────────────────────────────────────── */

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Backquote') { root.classList.toggle('open'); e.preventDefault(); return; }
    if (!root.classList.contains('open')) return;
    const t = TOOLS.find(x => x.code === e.code);
    if (!t) return;
    e.preventDefault();
    t.run(buttons.get(t.id).el);
  });

  /* ── the one thing that needs a tick ────────────────────────────────────── */
  // Bombs are spent inside the fixed step; topping the rack up once per frame
  // from out here is enough, and it keeps the sim ignorant of the panel.
  const tick = () => {
    requestAnimationFrame(tick);
    if (infiniteBombs && api.state) api.state.bombs = 3;
  };
  requestAnimationFrame(tick);

  try {
    if (new URLSearchParams(location.search).get('dev')) root.classList.add('open');
  } catch { /* non-browser host */ }

  render();
  return { root, open: () => root.classList.add('open'), close: () => root.classList.remove('open') };
}
