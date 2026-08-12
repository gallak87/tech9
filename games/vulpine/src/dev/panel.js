// ─────────────────────────────────────────────────────────────────────────────
// Dev panel — DOM overlay of playtest shortcuts.
//
// DOM rather than the HUD canvas so it can never land in a capture. Hidden
// until backquote for the same reason: the screenshot harness drives the same
// dev server and never presses keys. `?dev=1` opens it on load.
//
// Talks to the game only through `window.__VULPINE__`, so nothing here can
// change behaviour while the panel is closed. Add tools to `TOOLS`.
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
   * Replays rather than teleporting the rail: waves trigger on `flight.railZ`
   * crossings, so jumping the position dumps every backlogged wave into one
   * tick. `seek` only steps forward, hence the guard and the top-up loop.
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

  /** Step the tap gun up one tier, without flying to the pre-boss grants. */
  function upgradeWeapon(btn) {
    const w = api.state && api.state.weapon;
    if (w && w.tier >= w.tiers - 1) { flash(btn, 'maxed'); return; }
    api.combat.grantWeapon();
    render();
  }

  const TOOLS = [
    { id: 'boss', label: 'Skip to boss', tag: '1', code: 'Digit1', run: skipToBoss },
    { id: 'bombs', label: 'Infinite bombs', tag: '2', code: 'Digit2', run: toggleBombs, on: () => infiniteBombs },
    {
      id: 'wpn', tag: '3', code: 'Digit3', run: upgradeWeapon,
      label: 'Weapon +1',
      // The label carries the live tier, so the panel doubles as the readout
      // when the HUD is hidden for a capture.
      live: () => {
        const w = api.state && api.state.weapon;
        return w ? `Weapon +1 (${w.label})` : 'Weapon +1';
      },
    },
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
      // a focused button eats the next Space, which is the fire key
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
    for (const { el, name, tool } of buttons.values()) {
      if (el === btn) name.textContent = text || (tool.live ? tool.live() : tool.label);
    }
  }

  function flash(btn, text) {
    setLabel(btn, text);
    setTimeout(() => setLabel(btn, null), 900);
  }

  function render() {
    for (const { el, name, tool } of buttons.values()) {
      if (tool.on) el.dataset.on = tool.on() ? '1' : '0';
      if (!busy) name.textContent = tool.live ? tool.live() : tool.label;
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

  // Bombs are spent inside the fixed step; refilling once per frame is enough.
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
